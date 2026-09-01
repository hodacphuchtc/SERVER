import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { napMigration, taoPartitionNgay } from "../src/db/nap-migration.js";

describe("leo thang phân tầng + ghi nhận xử lý", () => {
  let db: PGlite;
  const BAY_GIO = new Date("2026-09-01T12:00:00Z");
  const phutTruoc = (n: number) => new Date(BAY_GIO.getTime() - n * 60_000);

  beforeEach(async () => {
    db = new PGlite();
    await napMigration(db);
    await taoPartitionNgay(db, BAY_GIO);
    await db.exec(`insert into public.hosts (ten_nghiep_vu, he_dieu_hanh, token_bam)
      values ('máy chủ kế toán','windows','bam-1');`);
  });

  async function moCanhBao(muc: string, batDauPhutTruoc: number) {
    const r = await db.query<{ id: string }>(
      `insert into public.alerts (host_id, chi_so, muc, gia_tri, bat_dau_luc)
       select id, 'cpu_phan_tram', $1, 97, $2::timestamptz from public.hosts
       returning id`,
      [muc, phutTruoc(batDauPhutTruoc).toISOString()],
    );
    return r.rows[0]!.id;
  }

  const soatLeoThang = async () =>
    (await db.query<{ canh_bao_id: string; ten_may: string }>(
      `select * from public.soat_leo_thang($1::timestamptz)`, [BAY_GIO.toISOString()])).rows;

  const nguoiNhan = async () =>
    (await db.query<{ nguoi_nhan: string[] }>(
      `select nguoi_nhan from public.alert_notifications`)).rows.map((r) => r.nguoi_nhan);

  it("nghiêm trọng, chưa ai xử lý, quá 30 phút: LÃNH ĐẠO nhận", async () => {
    await moCanhBao("nghiem_trong", 45);
    expect(await soatLeoThang()).toHaveLength(1);
    expect((await nguoiNhan())[0]).toContain("lanh_dao");
  });

  it("nghiêm trọng nhưng mới 10 phút: lãnh đạo KHÔNG nhận gì", async () => {
    await moCanhBao("nghiem_trong", 10);
    expect(await soatLeoThang()).toHaveLength(0);
    expect(await nguoiNhan()).toHaveLength(0);
  });

  it("có người bấm tiếp nhận ở phút thứ 10: lãnh đạo KHÔNG BAO GIỜ nhận", async () => {
    const id = await moCanhBao("nghiem_trong", 10);
    const ok = await db.query<{ tiep_nhan_canh_bao: boolean }>(
      `select public.tiep_nhan_canh_bao($1, 'anh Minh')`, [id]);
    expect(ok.rows[0]!.tiep_nhan_canh_bao).toBe(true);

    // 60 phút sau vẫn không leo thang, vì đã có người nhận việc.
    await db.query(`update public.alerts set bat_dau_luc = $1::timestamptz`,
      [phutTruoc(90).toISOString()]);
    expect(await soatLeoThang()).toHaveLength(0);
    expect(await nguoiNhan()).toHaveLength(0);
  });

  it("mức cảnh cáo KHÔNG bao giờ leo thang tới lãnh đạo, dù để lâu bao nhiêu", async () => {
    await moCanhBao("canh_cao", 600);
    expect(await soatLeoThang()).toHaveLength(0);
  });

  it("soát nhiều lần: chỉ leo thang MỘT lần cho mỗi cảnh báo", async () => {
    await moCanhBao("nghiem_trong", 45);
    await soatLeoThang();
    expect(await soatLeoThang()).toHaveLength(0);
    expect(await nguoiNhan()).toHaveLength(1);
  });

  it("bấm tiếp nhận lần hai không ghi đè người đầu tiên", async () => {
    const id = await moCanhBao("nghiem_trong", 5);
    await db.query(`select public.tiep_nhan_canh_bao($1, 'anh Minh')`, [id]);
    const lan2 = await db.query<{ tiep_nhan_canh_bao: boolean }>(
      `select public.tiep_nhan_canh_bao($1, 'chị Lan')`, [id]);
    expect(lan2.rows[0]!.tiep_nhan_canh_bao).toBe(false);

    const a = await db.query<{ tiep_nhan_boi: string }>(`select tiep_nhan_boi from public.alerts`);
    expect(a.rows[0]!.tiep_nhan_boi).toBe("anh Minh");
  });

  it("bấm link của cảnh báo đã đóng: trả về false, KHÔNG ném lỗi vào mặt người xử lý", async () => {
    const id = await moCanhBao("nghiem_trong", 5);
    await db.query(`update public.alerts set ket_thuc_luc = now() where id = $1`, [id]);
    const r = await db.query<{ tiep_nhan_canh_bao: boolean }>(
      `select public.tiep_nhan_canh_bao($1, 'anh Minh')`, [id]);
    expect(r.rows[0]!.tiep_nhan_canh_bao).toBe(false);
  });

  it("thời gian khắc phục chỉ tính sự cố ĐÃ ĐÓNG", async () => {
    const dong = await moCanhBao("nghiem_trong", 60);
    await db.query(`update public.alerts set ket_thuc_luc = bat_dau_luc + interval '20 minutes'
                    where id = $1`, [dong]);
    await db.query(`insert into public.alerts (host_id, chi_so, muc, bat_dau_luc)
                    select id, 'ram_phan_tram', 'canh_cao', now() from public.hosts`);

    const v = await db.query<{ so_su_co: number; phut_trung_binh: number }>(
      `select so_su_co, phut_trung_binh from public.thoi_gian_khac_phuc`);
    expect(v.rows).toHaveLength(1);
    expect(v.rows[0]!.so_su_co).toBe(1);
    expect(Number(v.rows[0]!.phut_trung_binh)).toBeCloseTo(20, 1);
  });
});
