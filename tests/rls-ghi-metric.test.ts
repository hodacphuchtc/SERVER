import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { bamToken, napMigration, taoPartitionNgay } from "../src/db/nap-migration.js";

const TOKEN_A = "token-may-ke-toan-0123456789abcdefghij";
const TOKEN_B = "token-may-ban-hang-0123456789abcdefghij";

async function dungDb() {
  const db = new PGlite();
  await napMigration(db);
  await taoPartitionNgay(db, new Date());
  await db.exec(`
    insert into public.hosts (ten_nghiep_vu, he_dieu_hanh, muc_quan_trong, token_bam)
    values ('máy chủ kế toán', 'windows', 'song_con',
            encode(sha256(convert_to('${TOKEN_A}', 'utf8')), 'hex')),
           ('máy chủ bán hàng', 'macos', 'quan_trong',
            encode(sha256(convert_to('${TOKEN_B}', 'utf8')), 'hex'));
  `);
  return db;
}

async function hostId(db: PGlite, ten: string) {
  const r = await db.query<{ id: string }>(
    `select id from public.hosts where ten_nghiep_vu = $1`, [ten],
  );
  return r.rows[0]!.id;
}

describe("ghi_metric — cửa ghi duy nhất", () => {
  let db: PGlite;
  beforeEach(async () => { db = await dungDb(); });

  it("token đúng thì ghi được, và host_id được suy ra từ token", async () => {
    const r = await db.query<{ ghi_metric: string }>(
      `select public.ghi_metric($1, $2::jsonb) as ghi_metric`,
      [TOKEN_A, JSON.stringify({ cpu_phan_tram: 42.5, ram_phan_tram: 61 })],
    );
    expect(r.rows[0]!.ghi_metric).toBe(await hostId(db, "máy chủ kế toán"));

    const d = await db.query<{ cpu_phan_tram: number; host_id: string }>(
      `select cpu_phan_tram, host_id from public.metrics_raw`,
    );
    expect(d.rows).toHaveLength(1);
    expect(d.rows[0]!.cpu_phan_tram).toBeCloseTo(42.5);
  });

  it("token của máy A KHÔNG ghi được cho host_id của máy B", async () => {
    const idB = await hostId(db, "máy chủ bán hàng");
    await expect(
      db.query(`select public.ghi_metric($1, $2::jsonb)`, [
        TOKEN_A, JSON.stringify({ host_id: idB, cpu_phan_tram: 99 }),
      ]),
    ).rejects.toThrow(/TOKEN_KHONG_KHOP_HOST/);

    const d = await db.query(`select 1 from public.metrics_raw`);
    expect(d.rows).toHaveLength(0);
  });

  it("token sai bị từ chối", async () => {
    await expect(
      db.query(`select public.ghi_metric($1, '{}'::jsonb)`, ["token-bia-dat-0123456789abcdefghijkl"]),
    ).rejects.toThrow(/TOKEN_KHONG_HOP_LE/);
  });

  it("token của máy đã tắt theo dõi bị từ chối", async () => {
    await db.exec(`update public.hosts set dang_theo_doi = false where ten_nghiep_vu = 'máy chủ kế toán'`);
    await expect(
      db.query(`select public.ghi_metric($1, '{}'::jsonb)`, [TOKEN_A]),
    ).rejects.toThrow(/TOKEN_KHONG_HOP_LE/);
  });

  it("gửi lại cùng mốc thời gian không tạo dòng trùng (collector đẩy bù sau khi mất mạng)", async () => {
    const t = new Date().toISOString();
    for (let i = 0; i < 3; i++) {
      await db.query(`select public.ghi_metric($1, $2::jsonb)`, [
        TOKEN_A, JSON.stringify({ thoi_diem: t, cpu_phan_tram: 10 }),
      ]);
    }
    const d = await db.query(`select 1 from public.metrics_raw`);
    expect(d.rows).toHaveLength(1);
  });

  it("cập nhật lan_day_du_lieu_cuoi — nguồn cho dead-man's switch", async () => {
    const truoc = await db.query<{ lan_day_du_lieu_cuoi: Date | null }>(
      `select lan_day_du_lieu_cuoi from public.hosts where ten_nghiep_vu = 'máy chủ kế toán'`,
    );
    expect(truoc.rows[0]!.lan_day_du_lieu_cuoi).toBeNull();

    await db.query(`select public.ghi_metric($1, '{}'::jsonb)`, [TOKEN_A]);

    const sau = await db.query<{ lan_day_du_lieu_cuoi: Date | null }>(
      `select lan_day_du_lieu_cuoi from public.hosts where ten_nghiep_vu = 'máy chủ kế toán'`,
    );
    expect(sau.rows[0]!.lan_day_du_lieu_cuoi).not.toBeNull();
  });

  it("xoay token: token cũ chết, token mới sống", async () => {
    const moi = "token-xoay-moi-0123456789abcdefghijkl";
    await db.query(`select public.xoay_token('máy chủ kế toán', $1)`, [moi]);
    await expect(
      db.query(`select public.ghi_metric($1, '{}'::jsonb)`, [TOKEN_A]),
    ).rejects.toThrow(/TOKEN_KHONG_HOP_LE/);
    await expect(
      db.query(`select public.ghi_metric($1, '{}'::jsonb)`, [moi]),
    ).resolves.toBeDefined();
    expect(await bamToken(db, moi)).toHaveLength(64);
  });
});
