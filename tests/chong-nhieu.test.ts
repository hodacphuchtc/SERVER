import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { napMigration, taoPartitionNgay } from "../src/db/nap-migration.js";

type Ket = { loai: string; so_canh_bao: number; khoa: string | null };

/**
 * Bốn cơ chế này là điều kiện sống của dự án. Test ở đây KHÔNG đếm số cảnh báo mà đếm
 * SỐ EMAIL — vì thứ giết chết hệ giám sát không phải là nhiều sự cố, mà là nhiều email.
 */
describe("chống nhiễu — gom nhóm, ức chế, giới hạn, cầu dao", () => {
  let db: PGlite;

  beforeEach(async () => {
    db = new PGlite();
    await napMigration(db);
    await taoPartitionNgay(db, new Date());
    for (let i = 1; i <= 12; i++) {
      await db.query(
        `insert into public.hosts (ten_nghiep_vu, he_dieu_hanh, token_bam) values ($1,'windows',$2)`,
        [`máy ${i}`, `bam-${i}`],
      );
    }
  });

  const moCanhBao = (tenMay: string, chiSo: string, muc = "canh_cao") =>
    db.query(
      `insert into public.alerts (host_id, chi_so, muc, gia_tri)
       select id, $2, $3, 91 from public.hosts where ten_nghiep_vu = $1`,
      [tenMay, chiSo, muc],
    );

  const soan = async () =>
    (await db.query<Ket>(`select * from public.soan_thong_bao()`)).rows;

  const soEmail = async () =>
    (await db.query(`select 1 from public.alert_notifications`)).rows.length;

  it("GOM NHÓM: 10 máy cùng lỗi sinh ĐÚNG 1 email, không phải 10", async () => {
    for (let i = 1; i <= 10; i++) await moCanhBao(`máy ${i}`, "cpu_phan_tram");
    const r = await soan();
    expect(r[0]!.loai).toBe("canh_bao");
    expect(r[0]!.so_canh_bao).toBe(10);
    expect(await soEmail()).toBe(1);

    const n = await db.query<{ tieu_de: string; than_thu: string }>(
      `select tieu_de, than_thu from public.alert_notifications`);
    expect(n.rows[0]!.tieu_de).toMatch(/10 cảnh báo trên 10 máy/);
    expect(n.rows[0]!.than_thu.split("\n")).toHaveLength(10);
  });

  it("chạy soạn nhiều lần: KHÔNG gửi lại cảnh báo đã đưa vào outbox", async () => {
    await moCanhBao("máy 1", "cpu_phan_tram");
    await soan();
    expect(await soEmail()).toBe(1);
    await soan();
    await soan();
    expect(await soEmail()).toBe(1);
  });

  it("ỨC CHẾ: máy mất liên lạc thì nuốt mọi cảnh báo con của chính nó", async () => {
    await moCanhBao("máy 1", "mat_lien_lac", "nghiem_trong");
    await moCanhBao("máy 1", "cpu_phan_tram");
    await moCanhBao("máy 1", "ram_phan_tram");
    const r = await soan();
    // Chỉ cảnh báo mất liên lạc được báo; hai cảnh báo con bị nuốt.
    expect(r[0]!.so_canh_bao).toBe(1);
    const n = await db.query<{ than_thu: string }>(`select than_thu from public.alert_notifications`);
    expect(n.rows[0]!.than_thu).toMatch(/mat_lien_lac/);
    expect(n.rows[0]!.than_thu).not.toMatch(/cpu_phan_tram/);
  });

  it("ức chế KHÔNG lan sang máy khác", async () => {
    await moCanhBao("máy 1", "mat_lien_lac", "nghiem_trong");
    await moCanhBao("máy 2", "cpu_phan_tram");
    const r = await soan();
    expect(r[0]!.so_canh_bao).toBe(2);
  });

  it("CẦU DAO: từ 20 cảnh báo trở lên chỉ gửi 1 email SỰ CỐ DIỆN RỘNG", async () => {
    for (let i = 1; i <= 12; i++) {
      await moCanhBao(`máy ${i}`, "cpu_phan_tram");
      await moCanhBao(`máy ${i}`, "ram_phan_tram");
    }
    const r = await soan();
    expect(r[0]!.loai).toBe("dien_rong");
    expect(r[0]!.so_canh_bao).toBe(24);
    expect(await soEmail()).toBe(1);

    const n = await db.query<{ tieu_de: string }>(`select tieu_de from public.alert_notifications`);
    expect(n.rows[0]!.tieu_de).toMatch(/SỰ CỐ DIỆN RỘNG — 24 cảnh báo/);
  });

  it("GIỚI HẠN TỐC ĐỘ: đã gửi 10 email trong 5 phút thì lượt sau bị chặn", async () => {
    for (let i = 0; i < 10; i++) {
      await db.query(
        `insert into public.alert_notifications (khoa_idempotency, loai, nguoi_nhan, tieu_de, than_thu)
         values ($1,'canh_bao',array['quan_tri'],'cũ','cũ')`, [`cu-${i}`]);
    }
    await moCanhBao("máy 1", "cpu_phan_tram");
    const r = await soan();
    expect(r[0]!.loai).toBe("bi_gioi_han");
    expect(await soEmail()).toBe(10); // không thêm email mới
  });

  it("không có cảnh báo nào thì không sinh email rỗng", async () => {
    expect(await soan()).toHaveLength(0);
    expect(await soEmail()).toBe(0);
  });

  it("khoá idempotency chặn ghi trùng cùng một chùm cảnh báo", async () => {
    await moCanhBao("máy 1", "cpu_phan_tram");
    const r1 = await soan();
    await db.query(`update public.alerts set da_dua_vao_outbox = false`);
    const r2 = await soan();
    expect(r2[0]!.khoa).toBe(r1[0]!.khoa);
    expect(await soEmail()).toBe(1); // vẫn 1, không nhân đôi
  });
});
