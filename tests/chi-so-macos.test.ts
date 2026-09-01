import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { napMigration, taoPartitionNgay } from "../src/db/nap-migration.js";

const TOKEN = "token-may-mac-0123456789abcdefghijkl";

async function dungDb() {
  const db = new PGlite();
  await napMigration(db);
  await taoPartitionNgay(db, new Date());
  await db.exec(`
    insert into public.hosts (ten_nghiep_vu, he_dieu_hanh, muc_quan_trong, token_bam)
    values ('máy mac của tôi', 'macos', 'song_con',
            encode(sha256(convert_to('${TOKEN}', 'utf8')), 'hex'));
  `);
  return db;
}

describe("0012 — mười lăm chỉ số macOS còn thiếu", () => {
  let db: PGlite;
  beforeEach(async () => { db = await dungDb(); });

  it("ghi_metric nhận và lưu đủ các chỉ số mới", async () => {
    await db.query(`select public.ghi_metric($1, $2::jsonb)`, [TOKEN, JSON.stringify({
      cpu_phan_tram: 12, ram_phan_tram: 80,
      swap_ra_moi_giay: 3801088, swap_tong_mb: 7168,
      nguon_dien: "pin", pin_phan_tram: 50, pin_con_phut: 295,
      gioi_han_toc_do_cpu: 100,
      so_tien_trinh: 437, so_thread: 3588, tran_tien_trinh: 2048, tran_thread: 10240,
      dia_tps: 1516, dia_kb_moi_lan: 21.59, cpu_ranh: 75,
      dia_vm_dung_gb: 8, snapshot_cuc_bo: 0,
      cong_ra_ngoai: [3000, 5000], cong_trong_may: 8,
      dich_vu_loi: ["com.apple.Siri.agent"],
    })]);

    const r = await db.query<Record<string, unknown>>(
      `select nguon_dien, pin_phan_tram, pin_con_phut, so_thread, tran_thread,
              cpu_ranh, dia_vm_dung_gb, swap_ra_moi_giay, snapshot_cuc_bo, chi_so_them
         from public.metrics_raw limit 1`,
    );
    const d = r.rows[0]!;
    expect(d.nguon_dien).toBe("pin");
    expect(d.pin_con_phut).toBe(295);
    expect(d.dia_vm_dung_gb).toBe(8);
    expect(Number(d.swap_ra_moi_giay)).toBe(3801088);
    // snapshot = 0 là một GIÁ TRỊ có nghĩa ("đĩa đầy thật"), không được lẫn với null.
    expect(d.snapshot_cuc_bo).toBe(0);
    expect(d.chi_so_them).toEqual({
      cong_ra_ngoai: [3000, 5000], cong_trong_may: 8, dich_vu_loi: ["com.apple.Siri.agent"],
    });
  });

  it("số thread LUÔN đi kèm trần — số tuyệt đối không mang sang máy khác được", async () => {
    await db.query(`select public.ghi_metric($1, $2::jsonb)`, [TOKEN,
      JSON.stringify({ so_thread: 3588, tran_thread: 10240 })]);
    const r = await db.query<{ ty_le: number }>(
      `select round(so_thread::numeric / tran_thread * 100) as ty_le from public.metrics_raw limit 1`,
    );
    expect(Number(r.rows[0]!.ty_le)).toBe(35);
  });

  it("CHỐT CHẶN: cổng phải là SỐ — chặn luôn việc đổi sang lsof (Nghị định 13)", async () => {
    // lsof trả về tên người dùng và đường dẫn nhị phân. Ràng buộc "chỉ được là số" khiến
    // một lần đổi công cụ mà quên hệ quả sẽ đỏ ngay tại tầng dữ liệu, không lọt ra ngoài.
    await expect(db.query(
      `insert into public.metrics_raw (thoi_diem, host_id, chi_so_them)
       select now(), id, '{"cong_ra_ngoai": ["3000/node/macbookairm1"]}'::jsonb
         from public.hosts limit 1`,
    )).rejects.toThrow();
  });

  it("CHỐT CHẶN: nhãn dịch vụ không được chứa đường dẫn hay số hiệu người dùng", async () => {
    await expect(db.query(
      `insert into public.metrics_raw (thoi_diem, host_id, chi_so_them)
       select now(), id, '{"dich_vu_loi": ["gui/501/com.rieng.tu"]}'::jsonb
         from public.hosts limit 1`,
    )).rejects.toThrow();

    await expect(db.query(
      `insert into public.metrics_raw (thoi_diem, host_id, chi_so_them)
       select now(), id, '{"dich_vu_loi": ["/Users/ai-do/Library/thu.plist"]}'::jsonb
         from public.hosts limit 1`,
    )).rejects.toThrow();
  });

  it("CHỐT CHẶN: khoá lạ bị từ chối — ai đó đang nhét dữ liệu không qua rà soát", async () => {
    await expect(db.query(
      `insert into public.metrics_raw (thoi_diem, host_id, chi_so_them)
       select now(), id, '{"ten_nguoi_dung": "macbookairm1"}'::jsonb
         from public.hosts limit 1`,
    )).rejects.toThrow();
  });

  it("ghi_metric BỎ khoá lạ thay vì từ chối cả dòng — mất một chỉ số phụ hơn mất cả nhịp đo", async () => {
    await db.query(`select public.ghi_metric($1, $2::jsonb)`, [TOKEN, JSON.stringify({
      cpu_phan_tram: 30,
      cong_ra_ngoai: [22],
      ten_nguoi_dung: "macbookairm1",   // khoá lạ — phải bị bỏ, không được làm hỏng nhịp đo
    })]);
    const r = await db.query<{ cpu_phan_tram: number; chi_so_them: Record<string, unknown> }>(
      `select cpu_phan_tram, chi_so_them from public.metrics_raw limit 1`,
    );
    expect(r.rows[0]!.cpu_phan_tram).toBe(30);
    expect(r.rows[0]!.chi_so_them).toEqual({ cong_ra_ngoai: [22] });
    expect(r.rows[0]!.chi_so_them).not.toHaveProperty("ten_nguoi_dung");
  });
});
