import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { napMigration, taoPartitionNgay } from "../src/db/nap-migration.js";

const TOKEN = "token-may-ke-toan-0123456789abcdefghij";
const BAY_GIO = new Date("2026-09-01T08:00:00Z");
const gioTruoc = (n: number) => new Date(BAY_GIO.getTime() - n * 3_600_000);

async function dungDb() {
  const db = new PGlite();
  await napMigration(db);
  await taoPartitionNgay(db, BAY_GIO);
  await db.exec(`insert into public.hosts (ten_nghiep_vu, he_dieu_hanh, token_bam)
    values ('máy chủ kế toán','windows',
            encode(sha256(convert_to('${TOKEN}','utf8')),'hex'));`);
  return db;
}

describe("4.1 — dịch vụ bắt buộc luôn chạy", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await dungDb();
    await db.exec(`insert into public.dich_vu_bat_buoc (host_id, ten_dich_vu, ten_de_hieu)
      select id, 'MSSQLSERVER', 'phần mềm kế toán' from public.hosts;`);
  });

  const ghiNhip = (thieu: string[], luc = BAY_GIO) =>
    db.query(`select public.ghi_metric($1, $2::jsonb)`, [
      TOKEN, JSON.stringify({ thoi_diem: luc.toISOString(), dich_vu_thieu: thieu }),
    ]);

  const soat = async () =>
    (await db.query<{ dich_vu: string; hanh_dong: string }>(
      `select * from public.soat_dich_vu($1::timestamptz)`, [BAY_GIO.toISOString()])).rows;

  it("dịch vụ đang chạy: không sinh cảnh báo", async () => {
    await ghiNhip([]);
    expect((await soat())[0]!.hanh_dong).toBe("dang_chay");
    expect((await db.query(`select 1 from public.alerts`)).rows).toHaveLength(0);
  });

  it("dịch vụ dừng: báo NGAY, không chờ duration như CPU", async () => {
    await ghiNhip(["MSSQLSERVER"]);
    expect((await soat())[0]!.hanh_dong).toBe("mo_canh_bao");
    const a = await db.query<{ muc: string }>(
      `select muc from public.alerts where ket_thuc_luc is null`);
    expect(a.rows).toHaveLength(1);
    expect(a.rows[0]!.muc).toBe("nghiem_trong");
  });

  it("dùng TÊN DỄ HIỂU trong kết quả, không dùng tên kỹ thuật", async () => {
    await ghiNhip(["MSSQLSERVER"]);
    expect((await soat())[0]!.dich_vu).toBe("phần mềm kế toán");
  });

  it("soát nhiều lần khi vẫn dừng: không nhân bản cảnh báo", async () => {
    await ghiNhip(["MSSQLSERVER"]);
    await soat();
    expect((await soat())[0]!.hanh_dong).toBe("van_dang_dung");
    expect((await db.query(`select 1 from public.alerts where ket_thuc_luc is null`)).rows)
      .toHaveLength(1);
  });

  it("dịch vụ chạy lại: đóng cảnh báo", async () => {
    await ghiNhip(["MSSQLSERVER"], gioTruoc(0.1));
    await soat();
    await ghiNhip([]);
    expect((await soat())[0]!.hanh_dong).toBe("dong_canh_bao");
    expect((await db.query(`select 1 from public.alerts where ket_thuc_luc is null`)).rows)
      .toHaveLength(0);
  });
});

describe("4.2 — sao lưu: dead-man's switch và bản sao lưu rỗng", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await dungDb();
    await db.exec(`insert into public.cong_viec_dinh_ky
        (host_id, ma, ten_de_hieu, loai, chu_ky_gio, grace_gio)
      select id, 'backup-ke-toan', 'sao lưu dữ liệu kế toán', 'backup', 24, 4
      from public.hosts;`);
  });

  const ping = (gioTruocN: number, byte: number | null) =>
    db.query(
      `insert into public.lan_chay_cong_viec (cong_viec_id, luc, kich_thuoc_byte)
       select id, $1::timestamptz, $2 from public.cong_viec_dinh_ky where ma = 'backup-ke-toan'`,
      [gioTruoc(gioTruocN).toISOString(), byte],
    );

  const soat = async () =>
    (await db.query<{ van_de: string; chi_tiet: string }>(
      `select * from public.soat_cong_viec($1::timestamptz)`, [BAY_GIO.toISOString()])).rows[0]!;

  it("chạy đúng giờ, kích thước ổn định: bình thường", async () => {
    for (const h of [96, 72, 48, 24, 2]) await ping(h, 1_000_000_000);
    expect((await soat()).van_de).toBe("binh_thuong");
  });

  it("KHÔNG có tiếng ping quá chu kỳ + grace: báo trễ", async () => {
    await ping(40, 1_000_000_000); // chu kỳ 24h + grace 4h = quá hạn từ giờ thứ 28
    const r = await soat();
    expect(r.van_de).toBe("tre");
    expect(r.chi_tiet).toMatch(/quá hạn/);
  });

  it("chưa bao giờ chạy: báo, không im lặng bỏ qua", async () => {
    const r = await soat();
    expect(r.van_de).toBe("chua_bao_gio_chay");
    expect(r.chi_tiet).toMatch(/chưa chạy lần nào/);
  });

  it("BẪY PHỔ BIẾN NHẤT: chạy thành công nhưng file gần rỗng vẫn bị bắt", async () => {
    // exit code 0, ping đúng giờ, mọi phép kiểm "job có chạy không" đều xanh —
    // chỉ so kích thước với trung vị mới lộ ra.
    for (const h of [96, 72, 48, 24] as const) await ping(h, 1_000_000_000);
    await ping(2, 5_000_000); // còn 0,5% so với thường lệ
    const r = await soat();
    expect(r.van_de).toBe("kich_thuoc_bat_thuong_nghiem_trong");
    expect(r.chi_tiet).toMatch(/có thể bản sao lưu bị rỗng/);
  });

  it("lệch 40% là cảnh cáo, chưa phải nghiêm trọng", async () => {
    for (const h of [96, 72, 48, 24] as const) await ping(h, 1_000_000_000);
    await ping(2, 600_000_000);
    expect((await soat()).van_de).toBe("kich_thuoc_bat_thuong");
  });

  it("dữ liệu tăng đều 10% không bị coi là bất thường", async () => {
    for (const [i, h] of [96, 72, 48, 24].entries()) await ping(h, 1_000_000_000 + i * 20_000_000);
    await ping(2, 1_080_000_000);
    expect((await soat()).van_de).toBe("binh_thuong");
  });

  it("dưới 3 lần chạy thì KHÔNG phán xét kích thước — trung vị chưa đáng tin", async () => {
    await ping(24, 1_000_000_000);
    await ping(2, 1_000);
    expect((await soat()).van_de).toBe("binh_thuong");
  });

  it("ghi_nhan_chay từ chối mã công việc không tồn tại", async () => {
    await expect(db.query(`select public.ghi_nhan_chay('ma-bia-dat', 100)`))
      .rejects.toThrow(/KHONG_TIM_THAY_CONG_VIEC/);
  });

  it("script backup gọi ghi_nhan_chay là ghi được lần chạy", async () => {
    await db.query(`select public.ghi_nhan_chay('backup-ke-toan', 999)`);
    const r = await db.query<{ n: number }>(
      `select count(*)::int as n from public.lan_chay_cong_viec`);
    expect(r.rows[0]!.n).toBe(1);
  });
});

describe("4.3 — cơ sở dữ liệu ở mức cơ bản", () => {
  let db: PGlite;
  beforeEach(async () => { db = await dungDb(); });

  const khai = (ketNoi: boolean, so: number | null, gioiHan: number | null, treGiay = 0) =>
    db.query(
      `insert into public.csdl_theo_doi
         (host_id, ten_de_hieu, ket_noi_duoc, so_ket_noi, gioi_han_ket_noi, cap_nhat_luc)
       select id, 'kho dữ liệu kế toán', $1, $2, $3, $4::timestamptz from public.hosts`,
      [ketNoi, so, gioiHan, new Date(BAY_GIO.getTime() - treGiay * 1000).toISOString()],
    );

  const soat = async () =>
    (await db.query<{ van_de: string; chi_tiet: string }>(
      `select * from public.soat_csdl($1::timestamptz)`, [BAY_GIO.toISOString()])).rows[0]!;

  it("kết nối được, ít kết nối: bình thường", async () => {
    await khai(true, 20, 200);
    expect((await soat()).van_de).toBe("binh_thuong");
  });

  it("không kết nối được: nêu hệ quả nghiệp vụ, không nêu mã lỗi", async () => {
    await khai(false, null, null);
    const r = await soat();
    expect(r.van_de).toBe("khong_ket_noi_duoc");
    expect(r.chi_tiet).toMatch(/các phần mềm dùng nó sẽ ngừng hoạt động/);
  });

  it("dùng 85% số kết nối: cảnh cáo sắp chạm trần", async () => {
    await khai(true, 170, 200);
    expect((await soat()).van_de).toBe("nhieu_ket_noi");
  });

  it("dùng 96% số kết nối: mức nặng hơn", async () => {
    await khai(true, 192, 200);
    expect((await soat()).van_de).toBe("gan_het_ket_noi");
  });

  it("số liệu cũ quá 10 phút: báo KHÔNG ĐO ĐƯỢC, không báo 'bình thường'", async () => {
    // Số liệu cũ bị hiểu nhầm thành "vẫn ổn" là đúng kiểu hỏng im lặng phải tránh.
    await khai(true, 20, 200, 900);
    expect((await soat()).van_de).toBe("khong_do_duoc");
  });
});
