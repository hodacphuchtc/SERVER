import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { napMigration, taoPartitionNgay } from "../src/db/nap-migration";
import { napCauHinhNguong } from "../src/db/nap-cau-hinh";
import { chayMotVong, tomTatMotDong } from "../src/engine/vong-danh-gia";
import type { Transport } from "../src/email/gui-email";

const TOKEN_A = "token-may-ke-toan-0123456789abcdefghij";
const TOKEN_B = "token-may-ban-hang-0123456789abcdefghij";
const MOC = new Date("2026-09-01T10:00:00Z");
const phutSau = (n: number) => new Date(MOC.getTime() + n * 60_000);

/**
 * Bộ test NỐI HAI ĐẦU. Nó bắt đúng loại lỗi mà các bộ test riêng lẻ không bắt được: mọi bộ
 * phận xanh nhưng không ai gọi chúng theo trình tự, hoặc gọi sai thứ tự.
 */
describe("vòng đánh giá — nối các mảnh thành hệ thống", () => {
  let db: PGlite;
  let daGui: Array<{ tieu_de: string; than_thu: string; nguoi_nhan: string[] }>;
  let transport: Transport;
  let transportHong = false;

  beforeEach(async () => {
    db = new PGlite();
    await napMigration(db);
    await napCauHinhNguong(db);
    for (let i = 0; i <= 2; i++) await taoPartitionNgay(db, phutSau(i * 1440));
    await db.exec(`
      insert into public.hosts (ten_nghiep_vu, he_dieu_hanh, muc_quan_trong, token_bam, lan_day_du_lieu_cuoi)
      values ('máy chủ kế toán','windows','song_con',
              encode(sha256(convert_to('${TOKEN_A}','utf8')),'hex'), '${MOC.toISOString()}'),
             ('máy chủ bán hàng','windows','quan_trong',
              encode(sha256(convert_to('${TOKEN_B}','utf8')),'hex'), '${MOC.toISOString()}');
    `);
    daGui = [];
    transportHong = false;
    transport = async (t) => {
      if (transportHong) return { ok: false, loi: "resend trả mã 500" };
      daGui.push({ tieu_de: t.tieu_de, than_thu: t.than_thu, nguoi_nhan: t.nguoi_nhan });
      return { ok: true, ma: `re_${daGui.length}` };
    };
  });

  /** Ghi một chuỗi mẫu CPU, mẫu cuối tại `moc`. */
  async function ghiCpu(token: string, giaTri: number[], moc: Date) {
    for (let i = 0; i < giaTri.length; i++) {
      const t = new Date(moc.getTime() - (giaTri.length - 1 - i) * 60_000);
      await db.query(`select public.ghi_metric($1, $2::jsonb)`, [
        token, JSON.stringify({ thoi_diem: t.toISOString(), cpu_phan_tram: giaTri[i], ram_phan_tram: 30 }),
      ]);
    }
  }

  /** Giữ nhịp gửi của một máy luôn mới để nó không bị coi là mất liên lạc. */
  const moiTinh = (ten: string, moc: Date) =>
    db.query(`update public.hosts set lan_day_du_lieu_cuoi = $1::timestamptz where ten_nghiep_vu = $2`,
      [moc.toISOString(), ten]);

  const vong = (moc: Date) => chayMotVong(db, { bayGio: moc, transport });

  it("KỊCH BẢN ĐẦY ĐỦ: CPU 97% suốt 6 phút → đúng 1 email tới quản trị, có tên nghiệp vụ", async () => {
    await ghiCpu(TOKEN_A, [97, 97, 97, 97, 97, 97], MOC);
    await moiTinh("máy chủ bán hàng", MOC);

    const t = await vong(MOC);

    expect(t.nguong.mo).toBe(1);
    expect(t.email.da_gui).toBe(1);
    expect(daGui).toHaveLength(1);
    expect(daGui[0]!.nguoi_nhan).toEqual(["quan_tri"]);
    expect(daGui[0]!.than_thu).toMatch(/máy chủ kế toán/);
    // SỬA 01/09/2026 (hạng mục 1.2) — trước đây đòi mã kỹ thuật `cpu_phan_tram` xuất hiện
    // trong thư. Nay engine sinh câu tiếng Việt kèm cả hệ quả nếu không xử lý.
    expect(daGui[0]!.than_thu).toMatch(/Bộ xử lý đang chạy ở mức/);
    expect(daGui[0]!.than_thu).toMatch(/Nếu không xử lý:/);
    expect(daGui[0]!.than_thu).not.toMatch(/cpu_phan_tram/);
  });

  it("ỨC CHẾ XUYÊN BƯỚC: máy mất liên lạc VÀ CPU cao → chỉ báo mất liên lạc", async () => {
    // Đây là phép kiểm chứng minh THỨ TỰ bước 1 → bước 6 đúng. Nếu soạn thông báo chạy
    // trước khi phát hiện mất liên lạc, cảnh báo "mất liên lạc" chưa tồn tại lúc ức chế
    // xét, và người trực nhận thêm một mớ cảnh báo con cho một máy vừa mất điện.
    await ghiCpu(TOKEN_A, [97, 97, 97, 97, 97, 97], MOC);
    await db.query(
      `update public.hosts set lan_day_du_lieu_cuoi = $1::timestamptz where ten_nghiep_vu = 'máy chủ kế toán'`,
      [new Date(MOC.getTime() - 10 * 60_000).toISOString()],
    );
    await moiTinh("máy chủ bán hàng", MOC);

    await vong(MOC);

    expect(daGui).toHaveLength(1);
    expect(daGui[0]!.than_thu).toMatch(/ngừng gửi số liệu/);
    expect(daGui[0]!.than_thu).not.toMatch(/cpu_phan_tram/);
    expect(daGui[0]!.than_thu).not.toMatch(/mat_lien_lac/);
  });

  it("CHẠY LẶP khi tình hình không đổi: vòng 2 và 3 KHÔNG sinh thêm email nào", async () => {
    // Phép kiểm bảo vệ chỉ tiêu nghiệm thu "dưới 5 cảnh báo/tuần". Worker chạy mỗi phút,
    // nên một cảnh báo kéo dài 2 giờ mà mỗi vòng đẻ một email là 120 email cho một sự cố.
    await ghiCpu(TOKEN_A, [97, 97, 97, 97, 97, 97], MOC);
    await moiTinh("máy chủ bán hàng", MOC);

    await vong(MOC);
    expect(daGui).toHaveLength(1);

    await moiTinh("máy chủ kế toán", phutSau(1));
    await moiTinh("máy chủ bán hàng", phutSau(1));
    await vong(phutSau(1));
    await moiTinh("máy chủ kế toán", phutSau(2));
    await moiTinh("máy chủ bán hàng", phutSau(2));
    await vong(phutSau(2));

    expect(daGui).toHaveLength(1);
  });

  it("MÁY HỒI PHỤC: cảnh báo đóng lại sau khi số liệu về bình thường", async () => {
    await ghiCpu(TOKEN_A, [97, 97, 97, 97, 97, 97], MOC);
    await moiTinh("máy chủ bán hàng", MOC);
    await vong(MOC);

    await ghiCpu(TOKEN_A, [40, 40, 40, 40, 40, 40], phutSau(6));
    await moiTinh("máy chủ bán hàng", phutSau(6));
    const t = await vong(phutSau(6));

    expect(t.nguong.dong).toBe(1);
    const conMo = await db.query(`select 1 from public.alerts where ket_thuc_luc is null`);
    expect(conMo.rows).toHaveLength(0);
  });

  it("TRANSPORT HỎNG: thư ở lại outbox, vòng sau gửi đúng MỘT lần, không nhân đôi", async () => {
    await ghiCpu(TOKEN_A, [97, 97, 97, 97, 97, 97], MOC);
    await moiTinh("máy chủ bán hàng", MOC);

    transportHong = true;
    const t1 = await vong(MOC);
    expect(t1.email.that_bai).toBe(1);
    expect(daGui).toHaveLength(0);

    const chuaGui = await db.query<{ loi: string }>(
      `select loi from public.alert_notifications where gui_luc is null`);
    expect(chuaGui.rows).toHaveLength(1);
    expect(chuaGui.rows[0]!.loi).toMatch(/500/);

    transportHong = false;
    await moiTinh("máy chủ kế toán", phutSau(1));
    await moiTinh("máy chủ bán hàng", phutSau(1));
    const t2 = await vong(phutSau(1));

    expect(t2.email.da_gui).toBe(1);
    expect(daGui).toHaveLength(1);

    // Và vòng thứ ba không gửi lại lần nữa.
    await moiTinh("máy chủ kế toán", phutSau(2));
    await moiTinh("máy chủ bán hàng", phutSau(2));
    await vong(phutSau(2));
    expect(daGui).toHaveLength(1);
  });

  it("hệ thống yên bình: chạy vòng không sinh email nào, tóm tắt nói rõ không có gì đổi", async () => {
    await ghiCpu(TOKEN_A, [20, 20, 20, 20, 20, 20], MOC);
    await moiTinh("máy chủ bán hàng", MOC);

    const t = await vong(MOC);

    expect(t.email.da_gui).toBe(0);
    expect(daGui).toHaveLength(0);
    expect(tomTatMotDong(t)).toMatch(/không có gì thay đổi/);
  });

  it("backup trễ cũng thành email — trước đây soat_cong_viec chỉ báo cáo rồi rơi vào hư không", async () => {
    await ghiCpu(TOKEN_A, [20, 20, 20, 20, 20, 20], MOC);
    await moiTinh("máy chủ bán hàng", MOC);
    await db.exec(`
      insert into public.cong_viec_dinh_ky (host_id, ma, ten_de_hieu, loai, chu_ky_gio, grace_gio)
      select id, 'backup-ke-toan', 'sao lưu dữ liệu kế toán', 'backup', 24, 4
      from public.hosts where ten_nghiep_vu = 'máy chủ kế toán';
    `);

    const t = await vong(MOC);

    expect(t.cong_viec.mo).toBe(1);
    expect(daGui).toHaveLength(1);

    // SỬA 01/09/2026 (hạng mục 1.1) — test này TRƯỚC ĐÂY đòi thân thư chứa mã kỹ thuật
    // `cong_viec:backup-ke-toan`. Đó chính là thứ phải bỏ: người trực đọc email lúc 2 giờ
    // sáng cần một câu tiếng Việt, không cần tên khoá trong cơ sở dữ liệu.
    const than = daGui[0]!.than_thu;
    expect(than).toMatch(/sao lưu dữ liệu kế toán/);
    expect(than).toMatch(/Nếu không xử lý:/);
    expect(than).toMatch(/Cần làm:/);
    // 🔴 Yêu cầu thật của hạng mục: KHÔNG một mã snake_case nào lọt ra người đọc.
    expect(than).not.toMatch(/cong_viec:/);
    expect(than).not.toMatch(/[a-z]+_[a-z]+/);
  });

  it("tóm tắt một dòng nêu rõ khi gửi email THẤT BẠI, không im lặng", async () => {
    await ghiCpu(TOKEN_A, [97, 97, 97, 97, 97, 97], MOC);
    await moiTinh("máy chủ bán hàng", MOC);
    transportHong = true;
    const t = await vong(MOC);
    expect(tomTatMotDong(t)).toMatch(/LỖI GỬI 1/);
  });
});
