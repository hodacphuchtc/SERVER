import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { napMigration, taoPartitionNgay } from "../src/db/nap-migration.js";

/** Ngưỡng truyền vào bằng tham số — nguồn sự thật là config/, không phải SQL (rule 4). */
const DIA_GB = 10, SWAP_TY_LE = 0.8, TAI_MOI_NHAN = 2.0, CPU_RANH = 60;
const BAY_GIO = new Date("2026-09-01T18:00:00Z");

async function dungDb() {
  const db = new PGlite();
  await napMigration(db);
  await taoPartitionNgay(db, BAY_GIO);
  await db.exec(`
    insert into public.hosts (ten_nghiep_vu, he_dieu_hanh, muc_quan_trong, token_bam)
    values ('máy mac','macos','song_con','bam1'), ('máy im lặng','macos','phu','bam2');
  `);
  return db;
}

async function idCua(db: PGlite, ten: string) {
  const r = await db.query<{ id: string }>(
    `select id from public.hosts where ten_nghiep_vu = $1`, [ten]);
  return r.rows[0]!.id;
}

/** Ghi một nhịp đo cách `phutTruoc` phút. `dia` = GB còn trống. */
async function ghiNhip(
  db: PGlite, id: string, phutTruoc: number,
  o: { dia?: number; swapDung?: number; tai?: number; cpuRanh?: number } = {},
) {
  const luc = new Date(BAY_GIO.getTime() - phutTruoc * 60_000);
  await db.query(
    `insert into public.metrics_raw
       (thoi_diem, host_id, dia, swap_dung_mb, swap_tong_mb, cpu_hang_doi, cpu_ranh)
     values ($1, $2, $3::jsonb, $4, 1000, $5, $6)`,
    [luc.toISOString(), id,
     JSON.stringify([{ ten: "/", tong_gb: 200, con_lai_gb: o.dia ?? 100, phan_tram_dung: 50 }]),
     o.swapDung ?? 0, o.tai ?? 0.1, o.cpuRanh ?? 95],
  );
}

async function anhChup(db: PGlite, id?: string) {
  const r = await db.query<Record<string, number | string | null>>(
    `select * from public.anh_chup_suc_khoe($1, $2, $3, $4, $5, $6::timestamptz)`,
    [DIA_GB, SWAP_TY_LE, TAI_MOI_NHAN, CPU_RANH, id ?? null, BAY_GIO.toISOString()],
  );
  return r.rows;
}

describe("0013 — ảnh chụp sức khỏe", () => {
  let db: PGlite;
  let mac: string;
  beforeEach(async () => { db = await dungDb(); mac = await idCua(db, "máy mac"); });

  it("trả ĐÚNG MỘT dòng mỗi máy, kể cả máy chưa gửi số liệu bao giờ", async () => {
    // Mất dòng nghĩa là máy biến mất khỏi báo cáo — đúng lúc nó đáng lo nhất.
    const rows = await anhChup(db);
    expect(rows).toHaveLength(2);
    const imLang = rows.find((r) => r.ten_nghiep_vu === "máy im lặng")!;
    expect(imLang.thoi_diem).toBeNull();
    // null = CHƯA BAO GIỜ gửi. Khác hẳn "gửi lâu rồi" — và phải hiện khác nhau.
    expect(imLang.so_phut_im_lang).toBeNull();
  });

  it("ĐỘ BỀN BỈ đếm CHUỖI LIÊN TỤC GẦN NHẤT, không đếm tổng số mẫu vượt ngưỡng", async () => {
    // 10 nhịp xấu (60→51 phút trước) → 1 nhịp TỐT (50) → 5 nhịp xấu (4→0).
    // Đếm tổng sẽ ra 15 phút. Đúng phải là ~4 phút: máy đã bình thường ở phút thứ 50,
    // nên chuỗi hiện tại chỉ bắt đầu từ phút thứ 4.
    for (let p = 60; p >= 51; p--) await ghiNhip(db, mac, p, { dia: 5 });
    await ghiNhip(db, mac, 50, { dia: 100 });
    for (let p = 4; p >= 0; p--) await ghiNhip(db, mac, p, { dia: 5 });

    const r = (await anhChup(db, mac))[0]!;
    expect(Number(r.so_phut_dia_thap)).toBeCloseTo(4, 0);
    expect(Number(r.so_phut_dia_thap)).toBeLessThan(15);
  });

  it("chưa bao giờ tốt trong cửa sổ → đếm từ mẫu xấu đầu tiên, không trả 0", async () => {
    for (let p = 30; p >= 0; p--) await ghiNhip(db, mac, p, { dia: 3 });
    const r = (await anhChup(db, mac))[0]!;
    expect(Number(r.so_phut_dia_thap)).toBeCloseTo(30, 0);
  });

  it("mọi thứ bình thường → độ bền bỉ bằng 0, không phải null", async () => {
    for (let p = 30; p >= 0; p--) await ghiNhip(db, mac, p);
    const r = (await anhChup(db, mac))[0]!;
    expect(Number(r.so_phut_dia_thap)).toBe(0);
    expect(Number(r.so_phut_swap_cao)).toBe(0);
    expect(Number(r.so_phut_tai_cao_cpu_ranh)).toBe(0);
  });

  it("NGHẼN I/O chỉ tính khi tải cao ĐỒNG THỜI CPU rảnh — máy tính toán nặng không bị bắt nhầm", async () => {
    // Tải 3,0 nhưng CPU chỉ rảnh 5% ⇒ máy đang thật sự tính toán, KHÔNG phải nghẽn đĩa.
    for (let p = 20; p >= 0; p--) await ghiNhip(db, mac, p, { tai: 3.0, cpuRanh: 5 });
    expect(Number((await anhChup(db, mac))[0]!.so_phut_tai_cao_cpu_ranh)).toBe(0);

    // Cùng mức tải nhưng CPU rảnh 87% ⇒ việc xếp hàng chờ ĐĨA. Đây là chữ ký thrashing.
    const db2 = await dungDb();
    const m2 = await idCua(db2, "máy mac");
    for (let p = 20; p >= 0; p--) await ghiNhip(db2, m2, p, { tai: 3.0, cpuRanh: 87 });
    const r2 = await db2.query<Record<string, number>>(
      `select * from public.anh_chup_suc_khoe($1,$2,$3,$4,$5,$6::timestamptz)`,
      [DIA_GB, SWAP_TY_LE, TAI_MOI_NHAN, CPU_RANH, m2, BAY_GIO.toISOString()]);
    expect(Number(r2.rows[0]!.so_phut_tai_cao_cpu_ranh)).toBeCloseTo(20, 0);
  });

  it("lấy ổ TỆ NHẤT, không lấy ổ đầu tiên", async () => {
    await db.query(
      `insert into public.metrics_raw (thoi_diem, host_id, dia)
       values ($1, $2, $3::jsonb)`,
      [BAY_GIO.toISOString(), mac, JSON.stringify([
        { ten: "/", tong_gb: 200, con_lai_gb: 150, phan_tram_dung: 25 },
        { ten: "/Data", tong_gb: 500, con_lai_gb: 2, phan_tram_dung: 99 },
      ])],
    );
    const r = (await anhChup(db, mac))[0]!;
    expect(r.dia_ten).toBe("/Data");
    expect(Number(r.dia_con_lai_gb)).toBe(2);
    expect(Number(r.dia_phan_tram_dung)).toBe(99);
  });

  it("ngưỡng thật sự đến từ THAM SỐ — đổi tham số thì kết quả đổi theo", async () => {
    // Chứng minh không có ngưỡng vô hình nào nằm trong SQL (rule 4).
    for (let p = 20; p >= 0; p--) await ghiNhip(db, mac, p, { dia: 15 });
    const chat = await db.query<Record<string, number>>(
      `select so_phut_dia_thap from public.anh_chup_suc_khoe(20,$1,$2,$3,$4,$5::timestamptz)`,
      [SWAP_TY_LE, TAI_MOI_NHAN, CPU_RANH, mac, BAY_GIO.toISOString()]);
    expect(Number(chat.rows[0]!.so_phut_dia_thap)).toBeCloseTo(20, 0);
    // Cùng dữ liệu, ngưỡng 10 GB thì 15 GB là bình thường.
    expect(Number((await anhChup(db, mac))[0]!.so_phut_dia_thap)).toBe(0);
  });
});
