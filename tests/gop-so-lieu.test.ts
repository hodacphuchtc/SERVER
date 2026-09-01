import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { napMigration, taoPartitionNgay } from "../src/db/nap-migration.js";

const TOKEN = "token-may-ke-toan-0123456789abcdefghij";

describe("gộp số liệu ba tầng", () => {
  let db: PGlite;
  const BAT_DAU = new Date("2026-09-01T10:00:00Z");

  beforeEach(async () => {
    db = new PGlite();
    await napMigration(db);
    await taoPartitionNgay(db, BAT_DAU);
    await db.exec(`insert into public.hosts (ten_nghiep_vu, he_dieu_hanh, token_bam)
      values ('máy chủ kế toán','windows',
              encode(sha256(convert_to('${TOKEN}','utf8')),'hex'));`);
  });

  it("60 mẫu của 1 giờ gộp thành đúng 12 khung 5 phút", async () => {
    for (let i = 0; i < 60; i++) {
      await db.query(`select public.ghi_metric($1, $2::jsonb)`, [
        TOKEN, JSON.stringify({
          thoi_diem: new Date(BAT_DAU.getTime() + i * 60_000).toISOString(),
          cpu_phan_tram: 50, ram_phan_tram: 40,
        }),
      ]);
    }
    const n = await db.query<{ gop_5_phut: number }>(
      `select public.gop_5_phut($1::timestamptz, $2::timestamptz)`,
      [BAT_DAU.toISOString(), new Date(BAT_DAU.getTime() + 3_600_000).toISOString()],
    );
    expect(n.rows[0]!.gop_5_phut).toBe(12);

    const d = await db.query<{ so_mau: number }>(`select so_mau from public.metrics_5m`);
    expect(d.rows).toHaveLength(12);
    expect(d.rows.every((r) => r.so_mau === 5)).toBe(true);
  });

  it("giữ min/max/avg/p95 đúng số học — KHÔNG chỉ giữ avg", async () => {
    // Bốn mẫu bình thường và một spike. avg che spike; max và p95 thì không.
    // Đây chính là lý do ADR-002 bắt lưu cả bốn.
    const mau = [10, 10, 10, 10, 100];
    for (let i = 0; i < mau.length; i++) {
      await db.query(`select public.ghi_metric($1, $2::jsonb)`, [
        TOKEN, JSON.stringify({
          thoi_diem: new Date(BAT_DAU.getTime() + i * 60_000).toISOString(),
          cpu_phan_tram: mau[i], ram_phan_tram: 30,
        }),
      ]);
    }
    await db.query(`select public.gop_5_phut($1::timestamptz, $2::timestamptz)`,
      [BAT_DAU.toISOString(), new Date(BAT_DAU.getTime() + 300_000).toISOString()]);

    const r = await db.query<{ cpu_min: number; cpu_avg: number; cpu_max: number; cpu_p95: number }>(
      `select cpu_min, cpu_avg, cpu_max, cpu_p95 from public.metrics_5m`);
    const g = r.rows[0]!;
    expect(g.cpu_min).toBe(10);
    expect(g.cpu_avg).toBeCloseTo(28, 5);   // avg nói "28%" — nghe hoàn toàn bình thường
    expect(g.cpu_max).toBe(100);            // max nói sự thật: đã có lúc chạm 100%
    expect(g.cpu_p95).toBeGreaterThan(80);
  });

  it("gộp lại cùng khoảng là idempotent, không nhân đôi dòng", async () => {
    for (let i = 0; i < 5; i++) {
      await db.query(`select public.ghi_metric($1, $2::jsonb)`, [
        TOKEN, JSON.stringify({
          thoi_diem: new Date(BAT_DAU.getTime() + i * 60_000).toISOString(),
          cpu_phan_tram: 55, ram_phan_tram: 30,
        }),
      ]);
    }
    const den = new Date(BAT_DAU.getTime() + 300_000).toISOString();
    for (let lan = 0; lan < 3; lan++) {
      await db.query(`select public.gop_5_phut($1::timestamptz, $2::timestamptz)`, [BAT_DAU.toISOString(), den]);
    }
    expect((await db.query(`select 1 from public.metrics_5m`)).rows).toHaveLength(1);
  });

  it("lấy ổ đĩa TỆ NHẤT trong nhiều ổ, không lấy trung bình", async () => {
    await db.query(`select public.ghi_metric($1, $2::jsonb)`, [
      TOKEN, JSON.stringify({
        thoi_diem: BAT_DAU.toISOString(), cpu_phan_tram: 10, ram_phan_tram: 10,
        dia: [
          { ten: "C:", phan_tram_dung: 30, con_lai_gb: 300 },
          { ten: "D:", phan_tram_dung: 96, con_lai_gb: 4 },
        ],
      }),
    ]);
    await db.query(`select public.gop_5_phut($1::timestamptz, $2::timestamptz)`,
      [BAT_DAU.toISOString(), new Date(BAT_DAU.getTime() + 300_000).toISOString()]);

    const r = await db.query<{ dia_phan_tram_max: number; dia_con_lai_gb_min: number }>(
      `select dia_phan_tram_max, dia_con_lai_gb_min from public.metrics_5m`);
    expect(r.rows[0]!.dia_phan_tram_max).toBe(96);   // trung bình sẽ là 63 — che mất ổ D sắp đầy
    expect(r.rows[0]!.dia_con_lai_gb_min).toBe(4);
  });

  it("dọn partition cũ hơn N ngày bằng DROP, giữ lại partition trong hạn", async () => {
    const cu = new Date(Date.now() - 30 * 86_400_000);
    const moi = new Date();
    await taoPartitionNgay(db, cu);
    await taoPartitionNgay(db, moi);

    const daBo = await db.query<{ don_partition_cu: string[] }>(
      `select public.don_partition_cu(7)`);
    expect(daBo.rows[0]!.don_partition_cu.length).toBeGreaterThanOrEqual(1);

    const conLai = await db.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_inherits i on i.inhrelid = c.oid
       join pg_class p on p.oid = i.inhparent where p.relname = 'metrics_raw'`);
    const ten = conLai.rows.map((r) => r.relname);
    expect(ten.some((t) => t.endsWith(cu.toISOString().slice(0, 10).replace(/-/g, "")))).toBe(false);
    expect(ten.some((t) => t.endsWith(moi.toISOString().slice(0, 10).replace(/-/g, "")))).toBe(true);
  });
});
