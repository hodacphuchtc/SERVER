import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

// fileURLToPath chứ KHÔNG phải .pathname: .pathname giữ nguyên mã hoá phần trăm, nên
// đường dẫn có dấu cách ("VIBE CODE") biến thành "VIBE%20CODE" và readdirSync không thấy
// thư mục. Test đã bắt được đúng lỗi này.
const THU_MUC_MIGRATION = fileURLToPath(new URL("../../supabase/migrations", import.meta.url));

/** Nạp toàn bộ migration theo thứ tự tên file. Dùng chung cho test và cho script dựng DB. */
export async function napMigration(db: PGlite): Promise<string[]> {
  const files = readdirSync(THU_MUC_MIGRATION)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    await db.exec(readFileSync(join(THU_MUC_MIGRATION, f), "utf8"));
  }
  return files;
}

/**
 * Tạo partition theo NGÀY cho metrics_raw.
 *
 * Vì sao phải có hàm này thay vì để Postgres tự lo: bảng partition-by-range KHÔNG tự sinh
 * partition con — ghi vào một ngày chưa có partition là lỗi ngay. Trên môi trường thật,
 * hàm này được gọi trước mỗi ngày; dọn dữ liệu cũ thì DROP partition chứ không DELETE
 * (ADR-002).
 */
export async function taoPartitionNgay(db: PGlite, ngay: Date): Promise<string> {
  const d = new Date(Date.UTC(ngay.getUTCFullYear(), ngay.getUTCMonth(), ngay.getUTCDate()));
  const sau = new Date(d.getTime() + 24 * 60 * 60 * 1000);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  const ten = `metrics_raw_${iso(d).replace(/-/g, "")}`;
  await db.exec(
    `create table if not exists public.${ten}
       partition of public.metrics_raw
       for values from ('${iso(d)}') to ('${iso(sau)}');`,
  );
  return ten;
}

/** Băm token đúng cách hệ thống lưu — dùng khi tạo máy trong test và trong script quản trị. */
export async function bamToken(db: PGlite, token: string): Promise<string> {
  const r = await db.query<{ bam: string }>(
    `select encode(sha256(convert_to($1, 'utf8')), 'hex') as bam`,
    [token],
  );
  return r.rows[0]!.bam;
}
