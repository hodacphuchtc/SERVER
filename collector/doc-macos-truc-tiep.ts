/**
 * Đọc số liệu macOS TRỰC TIẾP bằng lệnh hệ điều hành, không cần `node_exporter`.
 *
 * Vì sao có file này: bảng đối chiếu `docs/architecture/metric-2-nen-tang.md` §7 đã định
 * sẵn phương án thay cho các chỉ số mà `node_exporter` trên darwin không cấp. Nhưng nó còn
 * một công dụng lớn hơn — **chạy thử trên chính máy đang phát triển mà không phải cài gì**:
 * mở `npm run dev` là thấy số liệu thật của máy mình, thay vì dữ liệu bịa.
 *
 * 🔴 PAGE SIZE KHÔNG PHẢI LÚC NÀO CŨNG 4096. Trên Apple Silicon nó là **16384**. Đọc từ
 * `sysctl hw.pagesize` chứ đừng nhân cứng — nhân cứng 4096 trên máy M1 là sai gấp bốn lần,
 * và sai theo hướng nguy hiểm: báo ít bộ nhớ hơn thực tế nên không bao giờ chạm ngưỡng.
 *
 * Chỉ dùng lệnh CHỈ ĐỌC (`sysctl -n`, `vm_stat`, `df`, `netstat`, `ps`, `iostat`) — không
 * lệnh nào sửa gì trên máy.
 */

import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Dia, DongRong } from "./doc-metric";
import { catTenTienTrinh } from "./doc-metric";

const chay = promisify(execFile);

async function lenh(file: string, tham: string[]): Promise<string> {
  const { stdout } = await chay(file, tham, { timeout: 8000, maxBuffer: 4 * 1024 * 1024 });
  return stdout;
}

const so = (s: string | undefined): number => {
  const n = Number(String(s ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** `sysctl -n` cho nhiều khoá một lần — mỗi khoá một dòng, đúng thứ tự hỏi. */
export async function docSysctl(khoa: string[]): Promise<Record<string, string>> {
  const out = await lenh("/usr/sbin/sysctl", ["-n", ...khoa]);
  const dong = out.trim().split("\n");
  return Object.fromEntries(khoa.map((k, i) => [k, (dong[i] ?? "").trim()]));
}

/** Phân tích `vm_stat` thành số TRANG (chưa nhân page size). */
export function phanTichVmStat(out: string): Record<string, number> {
  const kq: Record<string, number> = {};
  for (const d of out.split("\n")) {
    const m = d.match(/^"?([^":]+)"?:\s+([\d.]+)\.?$/);
    if (m) kq[m[1]!.trim()] = Number(m[2]);
  }
  return kq;
}

/** Phân tích dòng cuối của `iostat -c 2` → phần trăm CPU đang bận (100 − idle). */
export function phanTichIostat(out: string): number | null {
  const dong = out.trim().split("\n").filter((d) => /^\s*[\d.]+\s/.test(d));
  const cuoi = dong[dong.length - 1];
  if (!cuoi) return null;
  const cot = cuoi.trim().split(/\s+/);
  // Thứ tự cột: KB/t tps MB/s us sy id 1m 5m 15m
  const idle = Number(cot[5]);
  return Number.isFinite(idle) ? Math.round((100 - idle) * 100) / 100 : null;
}

/** Phân tích `df -k` → danh sách ổ đĩa thật, bỏ filesystem ảo. */
export function phanTichDf(out: string): Dia[] {
  // Gộp theo CONTAINER, không theo thiết bị và cũng không theo điểm gắn. APFS chia một ổ
  // vật lý thành nhiều volume (/dev/disk3s1s1 cho "/" và /dev/disk3s5 cho
  // "/System/Volumes/Data") — chúng có tên thiết bị KHÁC NHAU nhưng dùng chung dung lượng.
  // Liệt kê cả hai là làm người đọc tưởng máy có hai ổ sắp đầy thay vì một.
  // Điểm gắn KHÔNG đáng hiện riêng thành một "ổ" cho người dùng, nhưng dung lượng chúng
  // chiếm thì VẪN PHẢI TÍNH — `/System/Volumes/VM` chính là file swap, có lúc 6 GB.
  const khongHienRieng = /^\/(dev|System\/Volumes\/(VM|Preboot|Update|xarts|iSCPreboot|Hardware))/;

  type Gom = { daDungKb: number; conKb: number; ten: string | null };
  const theoContainer = new Map<string, Gom>();

  for (const d of out.split("\n").slice(1)) {
    const c = d.trim().split(/\s+/);
    if (c.length < 9) continue;
    const thietBi = c[0]!;
    const diemGan = c[c.length - 1]!;
    // Bỏ filesystem ảo (devfs, map auto_home): chúng luôn gần đầy và không nói gì về máy.
    if (!thietBi.startsWith("/dev/")) continue;
    const container = thietBi.replace(/^\/dev\/(disk\d+).*$/, "$1");

    // 🔴 CỘNG Used của MỌI volume anh em trong cùng container, KHÔNG lấy dòng đầu tiên.
    // Bản trước gộp theo container rồi `if (daCo.has(container)) continue` — tức là giữ
    // đúng dòng ĐẦU, mà dòng đầu là `/dev/disk3s3s1` gắn ở `/`: ảnh chụp hệ thống CHỈ ĐỌC,
    // dùng 11,9 GB. Volume dữ liệu thật `/System/Volumes/Data` (194 GB, 98%) bị bỏ qua.
    // Kết quả: báo 69,8% trong khi `df -h` và Finder đều báo 98% — lệch 28 điểm phần trăm,
    // và lệch theo hướng nguy hiểm nhất: NHẸ hơn thực tế nên không bao giờ chạm ngưỡng.
    //
    // Trên APFS mọi volume anh em DÙNG CHUNG phần trống, nên "còn lại" lấy MỘT lần
    // (max, không cộng), còn "đã dùng" thì cộng hết.
    const g = theoContainer.get(container) ?? { daDungKb: 0, conKb: 0, ten: null };
    g.daDungKb += so(c[2]);
    g.conKb = Math.max(g.conKb, so(c[3]));
    // Tên hiển thị: ưu tiên `/`, sau đó tới volume dữ liệu, cuối cùng là điểm gắn thường.
    if (!khongHienRieng.test(diemGan) && (g.ten === null || diemGan === "/")) g.ten = diemGan;
    theoContainer.set(container, g);
  }

  const dia: Dia[] = [];
  for (const g of theoContainer.values()) {
    // Container không có điểm gắn nào đáng hiện (vd disk1 chỉ có xarts/iSCPreboot/Hardware)
    // thì bỏ hẳn — nó là vùng hệ thống, người dùng không làm gì được với nó.
    if (g.ten === null) continue;
    const dungDuocKb = g.daDungKb + g.conKb;
    if (dungDuocKb <= 0) continue;
    // 🔴 KHÔNG tính phần trăm theo cột "tổng" của df trên APFS. Cột đó là dung lượng cả
    // CONTAINER trong khi "còn trống" là phần thật sự dùng được, nên 1 − còn/tổng cho ra
    // con số lệch hẳn so với Finder. macOS tính: đã_dùng / (đã_dùng + còn_trống) — dùng
    // đúng công thức đó để số trên màn hình khớp với số người dùng tự gõ `df -h` kiểm được.
    dia.push({
      ten: g.ten,
      tong_gb: Math.round((dungDuocKb / 1048576) * 10) / 10,
      con_lai_gb: Math.round((g.conKb / 1048576) * 10) / 10,
      phan_tram_dung: Math.round((g.daDungKb / dungDuocKb) * 1000) / 10,
    });
  }
  return dia;
}

/** Phân tích `netstat -ib` → tổng byte vào/ra, bỏ loopback, mỗi interface đếm một lần. */
export function phanTichNetstat(out: string): { vao: number; ra: number; loi: number; goi: number } {
  let vao = 0, ra = 0, loi = 0, goi = 0;
  const daTinh = new Set<string>();
  for (const d of out.split("\n").slice(1)) {
    const c = d.trim().split(/\s+/);
    if (c.length < 11) continue;
    const ten = c[0]!;
    if (/^lo\d/.test(ten) || daTinh.has(ten)) continue;
    daTinh.add(ten);
    // netstat -ib: Name Mtu Network Address Ipkts Ierrs Ibytes Opkts Oerrs Obytes Coll
    goi += so(c[4]); loi += so(c[5]); vao += so(c[6]); ra += so(c[9]);
  }
  return { vao, ra, loi, goi };
}

/** Phân tích `ps` → tiến trình ăn tài nguyên nhất, CHỈ GIỮ TÊN (Nghị định 13 — BRD §8.1). */
export function phanTichPs(out: string, soLuong = 5): Array<{ ten: string; cpu: number; ram_mb: number }> {
  return out.split("\n").slice(1)
    .map((d) => d.trim().split(/\s+/))
    .filter((c) => c.length >= 3)
    .slice(0, soLuong)
    .map((c) => ({
      ten: catTenTienTrinh(c.slice(0, c.length - 2).join(" ")),
      cpu: so(c[c.length - 2]),
      ram_mb: Math.round(so(c[c.length - 1]) / 1024),
    }))
    .filter((x) => x.ten.length > 0);
}

/* ────────────────────────────────────────────────────────────────────────────────────
   Bảy phép đo bổ sung. Tất cả là hàm THUẦN nhận chuỗi output — test được bằng mẫu thật,
   không cần chạy lệnh. Mọi lệnh nguồn đều CHỈ ĐỌC.
   ──────────────────────────────────────────────────────────────────────────────────── */

export type NguonDien = {
  /** "pin" hay "dien". Một máy chủ chạy bằng pin là một cái hẹn giờ tắt máy. */
  nguon: "pin" | "dien" | null;
  pin_phan_tram: number | null;
  /** Phút còn lại theo ước tính của macOS. null khi đang sạc hoặc chưa tính xong. */
  pin_con_phut: number | null;
};

/** `pmset -g batt` → nguồn điện và pin. */
export function phanTichPmsetBatt(out: string): NguonDien {
  const nguon = /drawing from ['"]?AC Power/i.test(out) ? "dien"
    : /drawing from ['"]?Battery Power/i.test(out) ? "pin" : null;
  const pt = out.match(/(\d{1,3})%/);
  // "4:45 remaining" → 285 phút. macOS ghi "(no estimate)" hoặc "0:00" khi chưa tính được.
  const gio = out.match(/(\d+):(\d{2})\s+remaining/);
  const phut = gio ? Number(gio[1]) * 60 + Number(gio[2]) : null;
  return {
    nguon,
    pin_phan_tram: pt ? Number(pt[1]) : null,
    pin_con_phut: phut && phut > 0 ? phut : null,
  };
}

/**
 * `pmset -g therm` → giới hạn tốc độ CPU (%). 100 = không bị ghìm.
 *
 * Vì sao cần: máy bị ghìm còn 50% hiện "bộ xử lý bận 60%" nhưng thực tế chỉ làm được nửa
 * việc. Thiếu chỉ số này thì mọi kết luận về CPU đều có thể sai một nửa.
 */
export function phanTichPmsetTherm(out: string): number | null {
  const m = out.match(/CPU_Speed_Limit\s*=\s*(\d+)/);
  if (m) return Number(m[1]);
  // "No thermal warning level has been recorded" = máy chưa từng bị ghìm → coi như 100%.
  return /No thermal warning level/i.test(out) ? 100 : null;
}

/**
 * Header của `top -l 1 -n 0` → số tiến trình và số thread ĐANG CHẠY.
 *
 * 🔴 KHÔNG lấy từ `sysctl kern.num_threads`: giá trị đó là TRẦN của hệ thống (10240, đúng
 * bằng `kern.maxfilesperproc`), không phải số đếm. Đọc nhầm nó thành số thread đang chạy
 * là sai gần 3 lần và sai theo hướng luôn luôn báo động.
 */
export function phanTichTopHeader(out: string): { so_tien_trinh: number | null; so_thread: number | null } {
  const m = out.match(/Processes:\s*(\d+)\s+total[^\n]*?(\d+)\s+threads/);
  return m
    ? { so_tien_trinh: Number(m[1]), so_thread: Number(m[2]) }
    : { so_tien_trinh: null, so_thread: null };
}

/**
 * `netstat -an -p tcp` → cổng đang lắng nghe, tách "mở ra ngoài" khỏi "chỉ trong máy".
 *
 * 🔴 Cố ý dùng `netstat` chứ KHÔNG dùng `lsof`: lsof trả về tên người dùng và đường dẫn
 * nhị phân của tiến trình — dữ liệu cá nhân, vi phạm Nghị định 13/2023/NĐ-CP (BRD §8.1).
 * netstat chỉ cho địa chỉ và cổng, đúng vừa đủ thứ cần biết.
 */
export function phanTichCongLangNghe(out: string): { ra_ngoai: number[]; trong_may: number } {
  const raNgoai = new Set<number>();
  let trongMay = 0;
  for (const d of out.split("\n")) {
    if (!/\bLISTEN\b/.test(d)) continue;
    const cot = d.trim().split(/\s+/);
    // Cột địa chỉ cục bộ đứng thứ 4: "*.3000" · "127.0.0.1.32862" · "::1.18789"
    const diaChi = cot[3] ?? "";
    const m = diaChi.match(/^(.*)[.:](\d+)$/);
    if (!m) continue;
    const chu = m[1]!;
    const cong = Number(m[2]);
    // Chỉ nghe trên loopback thì không ai ngoài máy chạm tới được.
    if (chu === "127.0.0.1" || chu === "::1" || chu === "localhost") trongMay++;
    else raNgoai.add(cong);
  }
  return { ra_ngoai: [...raNgoai].sort((a, b) => a - b), trong_may: trongMay };
}

/**
 * `launchctl list` → nhãn dịch vụ THOÁT LỖI THẬT.
 *
 * 🔴 CHỈ lấy mã thoát DƯƠNG. Mã ÂM là số hiệu tín hiệu đã giết tiến trình, và trên macOS
 * `-9` (SIGKILL) là chuyện hoàn toàn bình thường: launchd tự dừng các agent chạy-theo-yêu-cầu
 * khi chúng rảnh. Đo thật trên máy này lúc 18:20 ngày 01/09/2026: 516 nhãn, trong đó
 * **187 nhãn mã -9** nhưng chỉ **2 nhãn** có mã dương (`com.apple.Siri.agent` = 1 và một
 * nhãn Adobe = 111).
 *
 * Nếu coi mã âm là lỗi thì hệ thống đẻ ra 189 báo động giả ngay lượt đo đầu tiên — phá
 * thẳng chỉ tiêu nghiệm thu "dưới 5 cảnh báo/tuần", và tệ hơn là dạy người dùng phản xạ
 * bỏ qua cảnh báo.
 *
 * Chỉ giữ NHÃN, loại nhãn mang số hiệu người dùng (`gui/501/…`) — Nghị định 13.
 */
export function phanTichLaunchctl(out: string): string[] {
  const nhan: string[] = [];
  for (const d of out.split("\n").slice(1)) {
    const c = d.trim().split(/\s+/);
    if (c.length < 3) continue;
    const ma = Number(c[1]);
    const ten = c[2]!;
    if (!Number.isFinite(ma) || ma <= 0) continue;
    if (/\b(gui|user)\/\d+/.test(ten) || /\/\d{3,}\b/.test(ten)) continue;
    nhan.push(ten);
  }
  return nhan;
}

/** Dòng cuối `iostat -c 2` → nhịp và độ vụn của I/O, kèm % CPU đang rảnh. */
export function phanTichIostatChiTiet(
  out: string,
): { tps: number | null; kb_moi_lan: number | null; cpu_ranh: number | null } {
  const dong = out.trim().split("\n").filter((d) => /^\s*[\d.]+\s/.test(d));
  const cuoi = dong[dong.length - 1];
  if (!cuoi) return { tps: null, kb_moi_lan: null, cpu_ranh: null };
  const c = cuoi.trim().split(/\s+/);
  // Thứ tự cột: KB/t tps MB/s us sy id 1m 5m 15m
  const n = (s: string | undefined) => (Number.isFinite(Number(s)) ? Number(s) : null);
  return { kb_moi_lan: n(c[0]), tps: n(c[1]), cpu_ranh: n(c[5]) };
}

/** `tmutil listlocalsnapshots /` → số ảnh chụp cục bộ (nguyên nhân số một của "đĩa đầy ảo"). */
export function phanTichTmutil(out: string): number {
  return out.split("\n").filter((d) => /com\.apple\.TimeMachine\./.test(d)).length;
}

export type NguongMotChieu = { canhCao: number; nghiemTrong: number };
export type NguongBoNhoMacos = {
  ramTrongToiThieuPhanTram: NguongMotChieu;
  swapDungTyLe: NguongMotChieu;
  swapRaMoiGiayByte: NguongMotChieu;
  khongGiaiPhongTyLe: NguongMotChieu;
};

export type SoLieuBoNho = {
  /** % (free + inactive + speculative) / tổng. THẤP là xấu. */
  ram_trong_phan_tram: number;
  /** used / total của `vm.swapusage`. CAO là xấu. null khi máy tắt swap. */
  swap_dung_ty_le: number | null;
  /** Hiệu số `Swapouts` × page size. CAO là xấu. null khi chỉ có một lần đo. */
  swap_ra_moi_giay: number | null;
  /** (wired + compressor) / tổng. CAO là xấu. */
  khong_giai_phong_ty_le: number;
};

/**
 * Áp lực bộ nhớ macOS — BỐN đường vào `critical`, chỉ cần MỘT đường đúng.
 *
 * 🔴 Vì sao không dùng mỗi công thức cũ `(wired + compressor) / tổng > 0.8`: đo trên máy
 * thật lúc 17:36 ngày 01/09/2026, máy đang thrashing nặng (swap 84,8%, bộ nhớ trống 64 MB
 * trên 8 GB, 2,6 triệu swapouts tích luỹ) mà tỷ lệ đó chỉ 58,4% → trả về `normal`. Cùng lúc
 * `ram_phan_tram` ~82,4% cũng dưới ngưỡng 85 → CẢ HAI chỉ số bộ nhớ đều im lặng.
 *
 * Nghịch lý nằm ở chỗ compressor càng nén tốt thì tỷ lệ này càng TỤT XUỐNG đúng vào lúc
 * máy khổ nhất — nó là chỉ số ít nhạy nhất, nên chỉ giữ làm lưới cuối.
 *
 * Hàm THUẦN: không I/O, không đọc giờ. Test được bằng số học.
 */
export function apLucBoNhoMacos(
  f: SoLieuBoNho,
  ng: NguongBoNhoMacos,
): "normal" | "warn" | "critical" {
  // THẤP là xấu → so bằng <=. CAO là xấu → so bằng >=.
  const thap = (gt: number | null, n: NguongMotChieu, muc: "canhCao" | "nghiemTrong") =>
    gt !== null && gt <= n[muc];
  const cao = (gt: number | null, n: NguongMotChieu, muc: "canhCao" | "nghiemTrong") =>
    gt !== null && gt >= n[muc];

  if (
    thap(f.ram_trong_phan_tram, ng.ramTrongToiThieuPhanTram, "nghiemTrong") ||
    cao(f.swap_dung_ty_le, ng.swapDungTyLe, "nghiemTrong") ||
    cao(f.swap_ra_moi_giay, ng.swapRaMoiGiayByte, "nghiemTrong") ||
    cao(f.khong_giai_phong_ty_le, ng.khongGiaiPhongTyLe, "nghiemTrong")
  ) return "critical";

  if (
    thap(f.ram_trong_phan_tram, ng.ramTrongToiThieuPhanTram, "canhCao") ||
    cao(f.swap_dung_ty_le, ng.swapDungTyLe, "canhCao") ||
    cao(f.swap_ra_moi_giay, ng.swapRaMoiGiayByte, "canhCao") ||
    cao(f.khong_giai_phong_ty_le, ng.khongGiaiPhongTyLe, "canhCao")
  ) return "warn";

  return "normal";
}

/**
 * Nạp ngưỡng bộ nhớ từ `config/` — hằng số nghiệp vụ KHÔNG được hardcode (rule 4).
 *
 * Dựng đường dẫn bằng join(process.cwd(), …), KHÔNG dùng new URL(..., import.meta.url):
 * webpack của Next thay lớp URL bằng polyfill riêng nên fileURLToPath ném
 * ERR_INVALID_ARG_TYPE lúc build. Dự án đã mắc bẫy này hai lần.
 */
export function docNguongBoNho(): NguongBoNhoMacos {
  const duongDan = join(process.cwd(), "config", "nguong-canh-bao.json");
  const cfg = JSON.parse(readFileSync(duongDan, "utf8")) as { boNhoMacOS?: NguongBoNhoMacos };
  // KHÔNG có giá trị mặc định dự phòng: một `?? 0.8` nằm im trong code CHÍNH LÀ ngưỡng
  // hardcode, và nó hỏng theo kiểu tệ nhất — chạy được, không ai biết ngưỡng là bao nhiêu,
  // sửa config không có tác dụng.
  const b = cfg.boNhoMacOS;
  if (!b) throw new Error("config/nguong-canh-bao.json thiếu khối 'boNhoMacOS'");
  for (const k of ["ramTrongToiThieuPhanTram", "swapDungTyLe", "swapRaMoiGiayByte", "khongGiaiPhongTyLe"] as const) {
    if (typeof b[k]?.canhCao !== "number" || typeof b[k]?.nghiemTrong !== "number") {
      throw new Error(`config/nguong-canh-bao.json → boNhoMacOS.${k} thiếu canhCao/nghiemTrong`);
    }
  }
  return b;
}

export type ThongTinMay = {
  ten_may: string;
  chip: string;
  so_nhan: number;
  ram_tong_mb: number;
};

/** Đọc trọn một ảnh chụp của máy macOS đang chạy. */
export async function docMayNay(): Promise<{ thong_tin: ThongTinMay; so_lieu: DongRong }> {
  // Lệnh phụ dùng `.catch(() => "")` chứ không để ném: một máy thiếu `tmutil` hay bị từ
  // chối `launchctl` thì chỉ mất ĐÚNG chỉ số đó, không được làm sập cả lượt đo.
  const nhe = (f: string, t: string[]) => lenh(f, t).catch(() => "");
  const [sc, vm, io, df, net, ps, host, batt, therm, top, congOut, launch, tm] = await Promise.all([
    docSysctl(["hw.memsize", "hw.ncpu", "hw.pagesize", "machdep.cpu.brand_string",
               "vm.loadavg", "kern.boottime", "vm.swapusage",
               "kern.num_tasks", "kern.num_threads"]),
    lenh("/usr/bin/vm_stat", []),
    lenh("/usr/sbin/iostat", ["-c", "2"]),
    lenh("/bin/df", ["-k"]),
    lenh("/usr/sbin/netstat", ["-ib"]),
    lenh("/bin/ps", ["-Ao", "comm,%cpu,rss", "-r"]),
    lenh("/bin/hostname", ["-s"]).catch(() => "máy này"),
    nhe("/usr/bin/pmset", ["-g", "batt"]),
    nhe("/usr/bin/pmset", ["-g", "therm"]),
    nhe("/usr/bin/top", ["-l", "1", "-n", "0"]),
    nhe("/usr/sbin/netstat", ["-an", "-p", "tcp"]),
    nhe("/bin/launchctl", ["list"]),
    nhe("/usr/bin/tmutil", ["listlocalsnapshots", "/"]),
  ]);

  // 🔴 Đọc page size từ hệ thống, KHÔNG nhân cứng 4096 (Apple Silicon dùng 16384).
  const pageSize = so(sc["hw.pagesize"]) || 4096;
  const ramTongByte = so(sc["hw.memsize"]);
  const trang = phanTichVmStat(vm);

  // macOS coi bộ nhớ inactive + speculative là CÓ THỂ LẤY LẠI. Không cộng chúng vào phần
  // trống là báo động giả liên tục — xem §2.1 của bảng đối chiếu.
  const trongByte =
    ((trang["Pages free"] ?? 0) + (trang["Pages inactive"] ?? 0) + (trang["Pages speculative"] ?? 0)) * pageSize;
  const khongTheGiaiPhongByte =
    ((trang["Pages wired down"] ?? 0) + (trang["Pages occupied by compressor"] ?? 0)) * pageSize;

  const load = (sc["vm.loadavg"] ?? "").replace(/[{}]/g, "").trim().split(/\s+/).map(Number);
  const bootSec = so((sc["kern.boottime"] ?? "").match(/sec\s*=\s*(\d+)/)?.[1]);
  const swap = sc["vm.swapusage"] ?? "";
  const swapDungMb = so(swap.match(/used\s*=\s*([\d.]+)M/)?.[1]);
  const swapTongMb = so(swap.match(/total\s*=\s*([\d.]+)M/)?.[1]);

  // Bộ đếm mạng là TÍCH LŨY từ lúc khởi động. Trả thẳng nó ra dưới cái tên "mỗi giây" là
  // nói dối: máy chạy 5 tiếng sẽ hiện 1,6 GB/giây. Lấy mẫu thứ hai để ra tốc độ thật.
  // Cùng nhịp nghỉ 1 giây này, lấy luôn vm_stat lần hai để tính tốc độ ghi swap — nó là
  // chỉ số nhạy nhất với thrashing, và trước đây luôn null nên luật swap chưa bao giờ nổ.
  const mang1 = phanTichNetstat(net);
  await new Promise((r) => setTimeout(r, 1000));
  const [net2, vm2] = await Promise.all([
    lenh("/usr/sbin/netstat", ["-ib"]),
    lenh("/usr/bin/vm_stat", []),
  ]);
  const mang2 = phanTichNetstat(net2);
  const mang = {
    vao: Math.max(0, mang2.vao - mang1.vao),
    ra: Math.max(0, mang2.ra - mang1.ra),
    loi: mang2.loi,
    goi: mang2.goi,
  };

  const trangSau = phanTichVmStat(vm2);
  const swapRaMoiGiay = Math.max(0, (trangSau["Swapouts"] ?? 0) - (trang["Swapouts"] ?? 0)) * pageSize;
  const swapVaoMoiGiay = Math.max(0, (trangSau["Swapins"] ?? 0) - (trang["Swapins"] ?? 0)) * pageSize;

  const pin = phanTichPmsetBatt(batt);
  const tienTrinh = phanTichTopHeader(top);
  const ioChiTiet = phanTichIostatChiTiet(io);
  const cong = phanTichCongLangNghe(congOut);
  // Vùng nhớ ảo nằm ở `/System/Volumes/VM` — phanTichDf cố ý không hiện nó thành một "ổ"
  // riêng, nên đọc thẳng từ df ở đây. Nó là mắt xích nối trụ bộ nhớ với trụ chỗ lưu trữ:
  // bộ nhớ thiếu → swap phình → ăn đĩa → đĩa hết chỗ → swap không phình được nữa.
  const dongVM = df.split("\n").find((d) => /\/System\/Volumes\/VM\s*$/.test(d));
  const vmDungGb = dongVM
    ? Math.round((so(dongVM.trim().split(/\s+/)[2]) / 1048576) * 10) / 10
    : null;

  const apLuc = apLucBoNhoMacos(
    {
      ram_trong_phan_tram: ramTongByte > 0 ? (trongByte / ramTongByte) * 100 : 100,
      swap_dung_ty_le: swapTongMb > 0 ? swapDungMb / swapTongMb : null,
      swap_ra_moi_giay: swapRaMoiGiay,
      khong_giai_phong_ty_le: ramTongByte > 0 ? khongTheGiaiPhongByte / ramTongByte : 0,
    },
    docNguongBoNho(),
  );

  return {
    thong_tin: {
      ten_may: host.trim() || "máy này",
      chip: sc["machdep.cpu.brand_string"] ?? "không rõ",
      so_nhan: so(sc["hw.ncpu"]),
      ram_tong_mb: Math.round(ramTongByte / 1048576),
    },
    so_lieu: {
      cpu_phan_tram: phanTichIostat(io),
      cpu_hang_doi: load[0] ?? null,
      tai_trung_binh_15p: load[2] ?? null,
      ram_phan_tram: ramTongByte > 0
        ? Math.round((1 - trongByte / ramTongByte) * 1000) / 10 : null,
      ram_tong_mb: Math.round(ramTongByte / 1048576),
      ram_con_lai_mb: Math.round(trongByte / 1048576),
      // Làm tròn: macOS báo 5602.62 MB nhưng cột trong CSDL là số nguyên.
      swap_dung_mb: Math.round(swapDungMb),
      // Tính bằng hiệu số Swapins giữa hai lần vm_stat cách nhau 1 giây (cùng nhịp với
      // phép đo mạng). Trước đây trả null nên mọi luật về swap chưa bao giờ có dữ liệu.
      swap_vao_moi_giay: swapVaoMoiGiay,
      ap_luc_bo_nho: apLuc,
      dia: phanTichDf(df),
      mang_vao_byte_moi_giay: mang.vao,
      mang_ra_byte_moi_giay: mang.ra,
      mang_goi_loi: mang.loi,
      mang_goi_tong: mang.goi,
      uptime_giay: bootSec ? Math.round(Date.now() / 1000 - bootSec) : null,
      thoi_diem_khoi_dong: bootSec ? new Date(bootSec * 1000).toISOString() : null,
      tien_trinh_top: phanTichPs(ps),
      dich_vu_thieu: [],

      // ── Bảy phép đo bổ sung (hạng mục 0.3) ──
      swap_ra_moi_giay: swapRaMoiGiay,
      swap_tong_mb: Math.round(swapTongMb),
      nguon_dien: pin.nguon,
      pin_phan_tram: pin.pin_phan_tram,
      pin_con_phut: pin.pin_con_phut,
      gioi_han_toc_do_cpu: phanTichPmsetTherm(therm),
      so_tien_trinh: tienTrinh.so_tien_trinh,
      so_thread: tienTrinh.so_thread,
      // Trần đọc từ sysctl — số tuyệt đối vô nghĩa nếu không so được với trần.
      tran_tien_trinh: so(sc["kern.num_tasks"]) || null,
      tran_thread: so(sc["kern.num_threads"]) || null,
      dia_tps: ioChiTiet.tps,
      dia_kb_moi_lan: ioChiTiet.kb_moi_lan,
      cpu_ranh: ioChiTiet.cpu_ranh,
      dia_vm_dung_gb: vmDungGb,
      cong_ra_ngoai: cong.ra_ngoai,
      cong_trong_may: cong.trong_may,
      dich_vu_loi: phanTichLaunchctl(launch),
      snapshot_cuc_bo: phanTichTmutil(tm),
    },
  };
}
