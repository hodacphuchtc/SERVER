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
  const dia: Dia[] = [];
  const daCo = new Set<string>();
  for (const d of out.split("\n").slice(1)) {
    const c = d.trim().split(/\s+/);
    if (c.length < 9) continue;
    const thietBi = c[0]!;
    const diemGan = c[c.length - 1]!;
    // Bỏ ổ ảo: chúng luôn gần đầy và không nói gì về sức khoẻ máy.
    if (!thietBi.startsWith("/dev/")) continue;
    const container = thietBi.replace(/^\/dev\/(disk\d+).*$/, "$1");
    if (daCo.has(container)) continue;
    if (/^\/(dev|System\/Volumes\/(VM|Preboot|Update|xarts|iSCPreboot|Hardware))/.test(diemGan)) continue;
    daCo.add(container);
    // 🔴 KHÔNG tính phần trăm theo cột "tổng" của df trên APFS. Cột đó là dung lượng cả
    // CONTAINER (239 GB) trong khi "còn trống" là phần volume này thật sự dùng được, nên
    // 1 − còn/tổng ra 99% trong khi Finder và `df -h` đều báo 78%. Một hệ giám sát báo sai
    // lệch 21 điểm phần trăm thì không ai tin nó nữa.
    // macOS tính: đã_dùng / (đã_dùng + còn_trống). Dùng đúng công thức đó để con số trên
    // màn hình khớp với con số người dùng tự kiểm được.
    const daDungKb = so(c[2]);
    const conKb = so(c[3]);
    const dungDuocKb = daDungKb + conKb;
    if (dungDuocKb <= 0) continue;
    dia.push({
      ten: diemGan,
      tong_gb: Math.round((dungDuocKb / 1048576) * 10) / 10,
      con_lai_gb: Math.round((conKb / 1048576) * 10) / 10,
      phan_tram_dung: Math.round((daDungKb / dungDuocKb) * 1000) / 10,
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

export type ThongTinMay = {
  ten_may: string;
  chip: string;
  so_nhan: number;
  ram_tong_mb: number;
};

/** Đọc trọn một ảnh chụp của máy macOS đang chạy. */
export async function docMayNay(): Promise<{ thong_tin: ThongTinMay; so_lieu: DongRong }> {
  const [sc, vm, io, df, net, ps, host] = await Promise.all([
    docSysctl(["hw.memsize", "hw.ncpu", "hw.pagesize", "machdep.cpu.brand_string",
               "vm.loadavg", "kern.boottime", "vm.swapusage"]),
    lenh("/usr/bin/vm_stat", []),
    lenh("/usr/sbin/iostat", ["-c", "2"]),
    lenh("/bin/df", ["-k"]),
    lenh("/usr/sbin/netstat", ["-ib"]),
    lenh("/bin/ps", ["-Ao", "comm,%cpu,rss", "-r"]),
    lenh("/bin/hostname", ["-s"]).catch(() => "máy này"),
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

  const tyLeGhim = ramTongByte > 0 ? khongTheGiaiPhongByte / ramTongByte : 0;
  const apLuc = tyLeGhim > 0.8 ? "critical" : tyLeGhim > 0.6 ? "warn" : "normal";

  // Bộ đếm mạng là TÍCH LŨY từ lúc khởi động. Trả thẳng nó ra dưới cái tên "mỗi giây" là
  // nói dối: máy chạy 5 tiếng sẽ hiện 1,6 GB/giây. Lấy mẫu thứ hai để ra tốc độ thật.
  const mang1 = phanTichNetstat(net);
  await new Promise((r) => setTimeout(r, 1000));
  const mang2 = phanTichNetstat(await lenh("/usr/sbin/netstat", ["-ib"]));
  const mang = {
    vao: Math.max(0, mang2.vao - mang1.vao),
    ra: Math.max(0, mang2.ra - mang1.ra),
    loi: mang2.loi,
    goi: mang2.goi,
  };

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
      // Đây là ảnh chụp một thời điểm nên chưa có hiệu số swap-in; collector thật tính
      // theo hai lần quét liên tiếp.
      swap_vao_moi_giay: null,
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
    },
  };
}
