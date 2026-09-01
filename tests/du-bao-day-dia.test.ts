import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { napMigration, taoPartitionNgay } from "../src/db/nap-migration.js";

const TOKEN = "token-may-ke-toan-0123456789abcdefghij";
type DuBao = {
  ten_may: string; ten_o: string; con_lai_gb: number;
  gb_moi_ngay: string; con_bao_nhieu_ngay: string | null; dien_giai: string;
};

describe("dự báo ngày đầy đĩa", () => {
  let db: PGlite;
  const BAY_GIO = new Date("2026-09-08T00:00:00Z");

  beforeEach(async () => {
    db = new PGlite();
    await napMigration(db);
    await db.exec(`insert into public.hosts (ten_nghiep_vu, he_dieu_hanh, token_bam)
      values ('máy chủ kế toán','windows',
              encode(sha256(convert_to('${TOKEN}','utf8')),'hex'));`);
  });

  /** Ghi `soNgay` mẫu, mỗi ngày một mẫu, dung lượng còn lại theo hàm cho trước. */
  async function ghiChuoiDia(soNgay: number, conLaiGb: (ngay: number) => number) {
    for (let i = 0; i < soNgay; i++) {
      const t = new Date(BAY_GIO.getTime() - (soNgay - 1 - i) * 86_400_000);
      await taoPartitionNgay(db, t);
      await db.query(`select public.ghi_metric($1, $2::jsonb)`, [
        TOKEN, JSON.stringify({
          thoi_diem: t.toISOString(),
          dia: [{ ten: "C:", tong_gb: 500, con_lai_gb: conLaiGb(i) }],
        }),
      ]);
    }
  }

  const duBao = async () =>
    (await db.query<DuBao>(`select * from public.du_bao_day_dia(7, $1::timestamptz)`,
      [BAY_GIO.toISOString()])).rows;

  it("mất đều 1 GB/ngày, còn 6 GB: dự báo còn ~6 ngày", async () => {
    await ghiChuoiDia(7, (ngay) => 12 - ngay); // 12,11,10,9,8,7,6
    const r = await duBao();
    expect(r).toHaveLength(1);
    expect(Number(r[0]!.gb_moi_ngay)).toBeCloseTo(1, 1);
    expect(Number(r[0]!.con_bao_nhieu_ngay)).toBeGreaterThanOrEqual(5);
    expect(Number(r[0]!.con_bao_nhieu_ngay)).toBeLessThanOrEqual(7);
  });

  it("câu diễn giải viết bằng ngôn ngữ quản trị, dùng thẳng được trong email", async () => {
    await ghiChuoiDia(7, (ngay) => 12 - ngay);
    const g = (await duBao())[0]!.dien_giai;
    expect(g).toMatch(/sắp hết chỗ lưu/);
    expect(g).toMatch(/máy chủ kế toán/);
    expect(g).toMatch(/còn khoảng \d+ ngày/);
    // Không được rò thuật ngữ kỹ thuật vào thứ lãnh đạo đọc.
    expect(g).not.toMatch(/regr_slope|host_id|metrics_raw|jsonb/);
  });

  it("mất 3 GB/ngày thì cảnh báo sớm hơn hẳn dù còn nhiều GB hơn", async () => {
    await ghiChuoiDia(7, (ngay) => 40 - ngay * 3); // còn 22 GB nhưng tụt nhanh
    const r = await duBao();
    expect(Number(r[0]!.gb_moi_ngay)).toBeCloseTo(3, 1);
    expect(Number(r[0]!.con_bao_nhieu_ngay)).toBeLessThan(9);
  });

  it("dung lượng ổn định: không có ngày cạn, và nói rõ chưa có nguy cơ", async () => {
    await ghiChuoiDia(7, () => 100);
    const r = await duBao();
    expect(r[0]!.con_bao_nhieu_ngay).toBeNull();
    expect(r[0]!.dien_giai).toMatch(/chưa có nguy cơ/);
  });

  it("đĩa đang được dọn (trống dần): không báo động", async () => {
    await ghiChuoiDia(7, (ngay) => 10 + ngay * 2);
    const r = await duBao();
    expect(r[0]!.con_bao_nhieu_ngay).toBeNull();
  });

  it("dưới 3 mẫu thì KHÔNG dự báo — thà im lặng còn hơn bịa một con số thuyết phục", async () => {
    await ghiChuoiDia(2, (ngay) => 10 - ngay);
    expect(await duBao()).toHaveLength(0);
  });

  it("nhiều ổ trên một máy được dự báo riêng từng ổ", async () => {
    for (let i = 0; i < 5; i++) {
      const t = new Date(BAY_GIO.getTime() - (4 - i) * 86_400_000);
      await taoPartitionNgay(db, t);
      await db.query(`select public.ghi_metric($1, $2::jsonb)`, [
        TOKEN, JSON.stringify({
          thoi_diem: t.toISOString(),
          dia: [
            { ten: "C:", tong_gb: 500, con_lai_gb: 300 },
            { ten: "D:", tong_gb: 500, con_lai_gb: 20 - i * 4 },
          ],
        }),
      ]);
    }
    const r = await duBao();
    expect(r).toHaveLength(2);
    const oD = r.find((x) => x.ten_o === "D:")!;
    const oC = r.find((x) => x.ten_o === "C:")!;
    expect(Number(oD.con_bao_nhieu_ngay)).toBeLessThan(3);
    expect(oC.con_bao_nhieu_ngay).toBeNull();
  });
});
