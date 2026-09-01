/**
 * plan:phu-thuoc — dựng ĐỒ THỊ PHỤ THUỘC giữa các hạng mục từ dòng `(f) phụ-thuộc:`
 * trong 7 sổ Plan/PLAN_<MODULE>.md, rồi in các LỚP thi công song song.
 *
 * VÌ SAO (11/08/2026): quan hệ "X chặn Y" trước nay là VĂN XUÔI lặp ở 3–4 chỗ, máy không
 * đọc được → không trả lời nổi câu "mở mấy session song song thì an toàn?". Dòng (f) là
 * NGUỒN DUY NHẤT của quan hệ; các bảng NHÓM/CỔNG QUYẾT ĐỊNH chỉ là văn tường thuật.
 *
 * TÁCH RIÊNG khỏi cap-nhat-tien-do-plan.ts (parser % đang chạy ổn — không đụng).
 * Cú pháp (đặt SAU dòng (e), parser % bỏ qua dòng lạ nên tương thích tuyệt đối):
 *   - (f) phụ-thuộc: GIA.0, CO.0        ← danh sách mã, phân cách bằng , hoặc ·
 *   - (f) phụ-thuộc: không              ← khẳng định ĐỘC LẬP (khác với THIẾU dòng f)
 *
 * Luật đọc kết quả:
 *   LỚP 0 = không chờ hạng mục nào — nhóm theo nhãn (e): MÁY = code song song được NGAY;
 *           NGƯỜI/NGOÀI = chờ mở khóa, không phải việc code.
 *   LỚP n = chỉ chờ các lớp trước nó.
 *   CHU TRÌNH hoặc MÃ KHÔNG TỒN TẠI = đỏ (sổ sai — "sổ nhắc mã có sẵn thì đo trên thật").
 *   Hạng mục core luôn được nhắc ƯU TIÊN TRƯỚC (luật "core trước, module sau").
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const GOC = join(import.meta.dirname ?? __dirname, "..");
const PLAN_DIR = join(GOC, "Plan");

type HangMuc = {
  ma: string;
  tieuDe: string;
  file: string;
  daTick: boolean;
  nhanChan: string; // MÁY | NGƯỜI | NGOÀI | CHƯA PHÂN ĐỊNH
  phuThuoc: string[] | null; // null = CHƯA KHAI dòng (f)
};

const dsFile = readdirSync(PLAN_DIR).filter((f) =>
  /^PLAN_[A-Z_]+\.md$/.test(f),
);
const hangMuc = new Map<string, HangMuc>();
const loi: string[] = [];

for (const file of dsFile) {
  const dong = readFileSync(join(PLAN_DIR, file), "utf8").split("\n");
  let hienTai: HangMuc | null = null;
  for (const d of dong) {
    const mo = d.match(
      /^\s*-\s\[([ x])\]\s+\*{0,2}[^\w]*([0-9]{0,2}[A-Z][A-Z0-9]*(?:[.\\-][A-Za-z0-9]+)*)[^\w]*\s*[—–-]\s*(.*)$/u,
    );
    if (mo) {
      hienTai = {
        ma: mo[2],
        tieuDe: mo[3].replace(/\*+/g, "").slice(0, 60).trim(),
        file,
        daTick: mo[1] === "x",
        nhanChan: "CHƯA PHÂN ĐỊNH",
        phuThuoc: null,
      };
      if (hangMuc.has(hienTai.ma)) {
        loi.push(
          `Mã ${hienTai.ma} xuất hiện ở CẢ ${hangMuc.get(hienTai.ma)!.file} lẫn ${file}`,
        );
      } else hangMuc.set(hienTai.ma, hienTai);
      continue;
    }
    if (!hienTai) continue;
    const nhan = d.match(/\(e\)\s*chặn:\s*\**\s*(MÁY|NGƯỜI|NGOÀI)\b/iu);
    if (nhan) hienTai.nhanChan = nhan[1].toUpperCase();
    const pt = d.match(/^\s*-?\s*\(f\)\s*phụ[- ]thuộc:\s*(.+)$/iu);
    if (pt) {
      const gia = pt[1].trim();
      hienTai.phuThuoc = /^không\b/iu.test(gia)
        ? []
        : gia
            .split(/[,·]/)
            .map((s) => s.replace(/[`*_]/g, "").trim())
            .filter(Boolean);
    }
  }
}

// ── Kiểm sổ: mã phụ thuộc phải TỒN TẠI ──────────────────────────────────────
const mo = [...hangMuc.values()].filter((h) => !h.daTick);
for (const h of mo) {
  for (const p of h.phuThuoc ?? []) {
    if (!hangMuc.has(p))
      loi.push(
        `${h.ma} (${h.file}) khai phụ thuộc "${p}" — mã KHÔNG tồn tại trong sổ nào`,
      );
  }
}

// ── Xếp lớp (Kahn) — hạng mục đã tick coi như thoả mãn ──────────────────────
// Đích CHƯA KHAI (f) vẫn dùng được làm mốc: coi như lớp 0 ẨN (nó chắc chắn phải xong
// trước mục chờ nó, dù bản thân nó chưa khai chờ ai) — không có dòng này thì mọi mục
// chờ một đích chưa-khai bị báo oan là "chu trình".
const lop = new Map<string, number>();
const lopAn = new Map<string, number>(); // mốc cho đích chưa khai (không in ra LỚP)
for (const h of mo) if (h.phuThuoc === null) lopAn.set(h.ma, 0);
const lopCua = (ma: string) => lop.get(ma) ?? lopAn.get(ma);
let doiMoi = true;
let vong = 0;
while (doiMoi && vong < 200) {
  doiMoi = false;
  vong++;
  for (const h of mo) {
    if (lop.has(h.ma) || h.phuThuoc === null) continue;
    const cho = h.phuThuoc.filter((p) => {
      const hm = hangMuc.get(p);
      return hm && !hm.daTick; // chỉ chờ hạng mục CHƯA xong
    });
    if (cho.length === 0) {
      lop.set(h.ma, 0);
      doiMoi = true;
    } else if (cho.every((p) => lopCua(p) !== undefined)) {
      lop.set(h.ma, Math.max(...cho.map((p) => lopCua(p)!)) + 1);
      doiMoi = true;
    }
  }
}
const chuaXep = mo.filter((h) => h.phuThuoc !== null && !lop.has(h.ma));
if (chuaXep.length) {
  loi.push(
    `CHU TRÌNH phụ thuộc THẬT (A chờ B, B chờ A): ${chuaXep.map((h) => h.ma).join(" · ")}`,
  );
}

// ── In ──────────────────────────────────────────────────────────────────────
const tenNgan = (f: string) => f.replace(/^PLAN_|\.md$/g, "");
console.log(
  `\n📊 ĐỒ THỊ PHỤ THUỘC — ${mo.length} hạng mục đang mở / ${hangMuc.size} tổng\n`,
);

const soLopMax = Math.max(0, ...[...lop.values()]);
for (let l = 0; l <= soLopMax; l++) {
  const trongLop = mo.filter((h) => lop.get(h.ma) === l);
  if (!trongLop.length) continue;
  console.log(
    l === 0
      ? "━━ LỚP 0 — KHÔNG CHỜ HẠNG MỤC NÀO ━━"
      : `━━ LỚP ${l} — chờ lớp ${l - 1} ━━`,
  );
  for (const nhan of ["MÁY", "NGƯỜI", "NGOÀI", "CHƯA PHÂN ĐỊNH"]) {
    const nhom = trongLop.filter((h) => h.nhanChan === nhan);
    if (!nhom.length) continue;
    const chuThich =
      l === 0 && nhan === "MÁY"
        ? " ← CODE SONG SONG ĐƯỢC NGAY"
        : l === 0 && nhan !== "MÁY"
          ? " (chờ mở khóa, không phải code)"
          : "";
    console.log(`  [${nhan}]${chuThich}`);
    for (const h of nhom) {
      const core = h.file === "PLAN_CORE.md" ? " 🔴CORE-TRƯỚC" : "";
      const cho = h.phuThuoc?.length ? `  ⇐ ${h.phuThuoc.join(", ")}` : "";
      console.log(
        `    ${h.ma}${core} (${tenNgan(h.file)}) — ${h.tieuDe}${cho}`,
      );
    }
  }
}

// Gợi ý phân tuyến: lớp 0 MÁY nhóm theo module (mỗi tuyến 1 module — luật J2)
const tuyenMay = new Map<string, string[]>();
for (const h of mo.filter((x) => lop.get(x.ma) === 0 && x.nhanChan === "MÁY")) {
  const t = tenNgan(h.file);
  tuyenMay.set(t, [...(tuyenMay.get(t) ?? []), h.ma]);
}
if (tuyenMay.size) {
  console.log(
    `\n🛤️  GỢI Ý PHÂN TUYẾN SONG SONG (1 session = 1 module = 1 worktree):`,
  );
  const coCore = tuyenMay.has("CORE");
  for (const [t, ms] of tuyenMay) {
    console.log(
      `  ${t === "CORE" ? "⓪ (làm TRƯỚC, merge rồi mới mở tuyến khác)" : "•"} ${t}: ${ms.join(", ")}`,
    );
  }
  if (!coCore)
    console.log(
      "  (không có việc core lớp 0 — các tuyến mở song song được ngay)",
    );
}

const chuaKhai = mo.filter((h) => h.phuThuoc === null);
if (chuaKhai.length) {
  console.log(
    `\n⚠️  ${chuaKhai.length} hạng mục CHƯA KHAI dòng (f) — chưa vào được đồ thị (khai dần khi đụng tới, hạng mục MỚI thì bắt buộc từ đầu):`,
  );
  const theoFile = new Map<string, number>();
  for (const h of chuaKhai)
    theoFile.set(tenNgan(h.file), (theoFile.get(tenNgan(h.file)) ?? 0) + 1);
  console.log(`   ${[...theoFile].map(([f, n]) => `${f}: ${n}`).join(" · ")}`);
}

if (loi.length) {
  console.log(`\n❌ SỔ CÓ LỖI (${loi.length}):`);
  for (const l of loi) console.log(`   - ${l}`);
  process.exit(1);
}
console.log("");
