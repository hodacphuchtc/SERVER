import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { napMigration, taoPartitionNgay } from "../src/db/nap-migration.js";

type Dong = { may_id: string; ten_may: string; im_lang_phut: number; hanh_dong: string };

describe("dead-man's switch — phát hiện máy ngừng gửi số liệu", () => {
  let db: PGlite;

  beforeEach(async () => {
    db = new PGlite();
    await napMigration(db);
    await taoPartitionNgay(db, new Date());
    await db.exec(`insert into public.hosts (ten_nghiep_vu, he_dieu_hanh, token_bam)
      values ('máy chủ kế toán','windows','a'), ('máy chủ bán hàng','macos','b');`);
  });

  const datMocGuiCuoi = (ten: string, phutTruoc: number) =>
    db.query(`update public.hosts set lan_day_du_lieu_cuoi = now() - ($1 || ' minutes')::interval
              where ten_nghiep_vu = $2`, [String(phutTruoc), ten]);

  const soat = async (nguong = 3) =>
    (await db.query<Dong>(`select * from public.soat_mat_lien_lac($1)`, [nguong])).rows;

  const hanhDong = (rows: Dong[], ten: string) => rows.find((r) => r.ten_may === ten)!.hanh_dong;

  it("máy gửi cách đây 1 phút: bình thường, không sinh cảnh báo", async () => {
    await datMocGuiCuoi("máy chủ kế toán", 1);
    await datMocGuiCuoi("máy chủ bán hàng", 1);
    expect(hanhDong(await soat(), "máy chủ kế toán")).toBe("binh_thuong");
    const a = await db.query(`select 1 from public.alerts`);
    expect(a.rows).toHaveLength(0);
  });

  it("máy im lặng 4 phút: mở đúng MỘT cảnh báo nghiêm trọng", async () => {
    await datMocGuiCuoi("máy chủ kế toán", 4);
    await datMocGuiCuoi("máy chủ bán hàng", 1);
    expect(hanhDong(await soat(), "máy chủ kế toán")).toBe("mo_canh_bao");

    const a = await db.query<{ muc: string; chi_so: string }>(
      `select muc, chi_so from public.alerts where ket_thuc_luc is null`);
    expect(a.rows).toHaveLength(1);
    expect(a.rows[0]).toMatchObject({ muc: "nghiem_trong", chi_so: "mat_lien_lac" });
  });

  it("soát nhiều lần khi vẫn mất liên lạc: KHÔNG nhân bản cảnh báo", async () => {
    await datMocGuiCuoi("máy chủ kế toán", 10);
    await soat();
    const lan2 = await soat();
    const lan3 = await soat();
    expect(hanhDong(lan2, "máy chủ kế toán")).toBe("van_dang_mat_lien_lac");
    expect(hanhDong(lan3, "máy chủ kế toán")).toBe("van_dang_mat_lien_lac");

    const a = await db.query(`select 1 from public.alerts where ket_thuc_luc is null`);
    expect(a.rows).toHaveLength(1);
  });

  it("máy gửi lại được: đóng cảnh báo", async () => {
    await datMocGuiCuoi("máy chủ kế toán", 5);
    await soat();
    await datMocGuiCuoi("máy chủ kế toán", 0);
    expect(hanhDong(await soat(), "máy chủ kế toán")).toBe("dong_canh_bao");

    const dangMo = await db.query(`select 1 from public.alerts where ket_thuc_luc is null`);
    expect(dangMo.rows).toHaveLength(0);
    const daDong = await db.query(`select 1 from public.alerts where ket_thuc_luc is not null`);
    expect(daDong.rows).toHaveLength(1);
  });

  it("máy đã tắt theo dõi thì không bị soát (tránh báo động về máy cố tình dừng)", async () => {
    await db.exec(`update public.hosts set dang_theo_doi = false where ten_nghiep_vu = 'máy chủ bán hàng'`);
    await datMocGuiCuoi("máy chủ kế toán", 1);
    const rows = await soat();
    expect(rows.map((r) => r.ten_may)).toEqual(["máy chủ kế toán"]);
  });

  it("máy chưa bao giờ gửi dữ liệu cũng bị báo (không im lặng bỏ qua)", async () => {
    await db.exec(`update public.hosts set tao_luc = now() - interval '30 minutes'`);
    const rows = await soat();
    expect(rows.every((r) => r.hanh_dong === "mo_canh_bao")).toBe(true);
  });
});
