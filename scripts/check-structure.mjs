#!/usr/bin/env node
/**
 * check-structure.mjs — structure linter TRUNG TÍNH, tái dùng cho mọi dự án.
 *
 * Đọc khai báo từ .claude/scaffold.json của dự án (không hardcode cây thư mục):
 *   {
 *     "requiredDirs":  ["docs/brd", ...],
 *     "requiredFiles": ["CLAUDE.md", "PLAN.md", ...],
 *     "modules":       ["core", "billing", ...],   // [] nếu dự án không dùng module
 *     "adrCount":      0                            // số ADR bắt buộc (ADR-001..N)
 *   }
 *
 * Với mỗi module: bắt buộc modules/<id>/OVERVIEW.md + module.config.(json|ts).
 * Node thuần (node:fs, node:path) — không phụ thuộc package nào. Exit 1 khi thiếu.
 *
 * Chạy: node scripts/check-structure.mjs   (từ gốc dự án)
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const CONFIG_PATH = join(ROOT, ".claude", "scaffold.json");

if (!existsSync(CONFIG_PATH)) {
  console.error("❌ Thiếu .claude/scaffold.json — file khai báo cấu trúc bắt buộc.");
  process.exit(1);
}

let cfg;
try {
  cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
} catch (e) {
  console.error(`❌ .claude/scaffold.json không phải JSON hợp lệ: ${e.message}`);
  process.exit(1);
}

const requiredDirs = cfg.requiredDirs ?? [];
const requiredFiles = cfg.requiredFiles ?? [];
const modules = cfg.modules ?? [];
const adrCount = cfg.adrCount ?? 0;

const errors = [];
const oks = [];

// 1) Thư mục bắt buộc
for (const dir of requiredDirs) {
  if (existsSync(join(ROOT, dir))) oks.push(`thư mục ${dir}`);
  else errors.push(`Thiếu thư mục: ${dir}`);
}

// 2) File bắt buộc
for (const file of requiredFiles) {
  if (existsSync(join(ROOT, file))) oks.push(`file ${file}`);
  else errors.push(`Thiếu file: ${file}`);
}

// 3) Module: mỗi module phải có OVERVIEW.md + module.config.(json|ts)
for (const id of modules) {
  const base = join(ROOT, "modules", id);
  if (!existsSync(base)) {
    errors.push(`Thiếu module: modules/${id}`);
    continue;
  }
  if (!existsSync(join(base, "OVERVIEW.md")))
    errors.push(`Module ${id} thiếu OVERVIEW.md`);
  const hasManifest =
    existsSync(join(base, "module.config.json")) ||
    existsSync(join(base, "module.config.ts"));
  if (!hasManifest)
    errors.push(`Module ${id} thiếu manifest (module.config.json|ts)`);
  if (existsSync(join(base, "OVERVIEW.md")) && hasManifest)
    oks.push(`module ${id} (OVERVIEW + manifest)`);
}

// 4) ADR đủ bộ liên tục: ADR-001..ADR-<adrCount>
if (adrCount > 0) {
  const dir = join(ROOT, "docs", "decisions");
  const files = existsSync(dir) ? readdirSync(dir) : [];
  for (let i = 1; i <= adrCount; i++) {
    const prefix = `ADR-${String(i).padStart(3, "0")}`;
    if (files.some((f) => f.startsWith(prefix))) oks.push(prefix);
    else errors.push(`Thiếu ${prefix} trong docs/decisions/`);
  }
}

// Kết quả
console.log(`Soi cấu trúc theo .claude/scaffold.json — ${ROOT}\n`);
console.log(
  `✅ Đạt: ${oks.length} mục (${requiredDirs.length} thư mục, ${requiredFiles.length} file, ` +
    `${modules.length} module, ${adrCount} ADR khai báo)`,
);
if (errors.length) {
  console.error(`\n❌ Thiếu ${errors.length} mục:`);
  for (const e of errors) console.error(`   ❌ ${e}`);
  process.exit(1);
}
console.log("\n✅ Cấu trúc đầy đủ theo khai báo.");
