import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { napMigration, taoPartitionNgay } from "../src/db/nap-migration.js";

const TOKEN = "token-may-ke-toan-0123456789abcdefghij";

// Nghị định 13/2023/NĐ-CP — BRD §8.1. Hàng rào này đặt ở TẦNG SCHEMA chứ không ở collector:
// lời dặn trong tài liệu sẽ bị quên sau vài tháng, còn CHECK constraint thì không. Nếu ai đó
// viết lại collector và vô tình đẩy tham số dòng lệnh lên, cơ sở dữ liệu từ chối.
describe("chặn dữ liệu cá nhân lọt vào số liệu", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = new PGlite();
    await napMigration(db);
    await taoPartitionNgay(db, new Date());
    await db.exec(`insert into public.hosts (ten_nghiep_vu, he_dieu_hanh, token_bam)
      values ('máy chủ kế toán', 'windows',
              encode(sha256(convert_to('${TOKEN}', 'utf8')), 'hex'));`);
  });

  const ghi = (tienTrinh: unknown) =>
    db.query(`select public.ghi_metric($1, $2::jsonb)`, [
      TOKEN, JSON.stringify({ tien_trinh_top: tienTrinh }),
    ]);

  it("chấp nhận tiến trình chỉ có tên, cpu, ram_mb", async () => {
    await expect(ghi([{ ten: "sqlservr.exe", cpu: 41.2, ram_mb: 2048 }])).resolves.toBeDefined();
  });

  it("TỪ CHỐI khi tên tiến trình mang tham số dòng lệnh", async () => {
    await expect(
      ghi([{ ten: "node server.js --db-password hunter2", cpu: 3, ram_mb: 120 }]),
    ).rejects.toThrow(/tien_trinh_khong_lo_du_lieu_ca_nhan/);
  });

  it("TỪ CHỐI khi tên tiến trình là đường dẫn (có thể chứa tên người dùng)", async () => {
    await expect(
      ghi([{ ten: "C:\\Users\\nguyen.van.a\\app.exe", cpu: 1, ram_mb: 80 }]),
    ).rejects.toThrow(/tien_trinh_khong_lo_du_lieu_ca_nhan/);
    await expect(
      ghi([{ ten: "/Users/tranthib/Library/app", cpu: 1, ram_mb: 80 }]),
    ).rejects.toThrow(/tien_trinh_khong_lo_du_lieu_ca_nhan/);
  });

  it("TỪ CHỐI khoá lạ ngoài ba khoá cho phép", async () => {
    await expect(
      ghi([{ ten: "app.exe", cpu: 1, ram_mb: 80, dong_lenh: "--user=admin --pass=x" }]),
    ).rejects.toThrow(/tien_trinh_khong_lo_du_lieu_ca_nhan/);
  });

  it("danh sách rỗng vẫn hợp lệ", async () => {
    await expect(ghi([])).resolves.toBeDefined();
  });
});
