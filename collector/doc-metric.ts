/**
 * Đọc định dạng text của Prometheus exporter và chuyển thành một dòng RỘNG cho DB.
 *
 * Triển khai đúng `docs/architecture/metric-2-nen-tang.md`. Sửa file này mà không sửa
 * tài liệu kia là tạo ra hai nguồn sự thật lệch nhau.
 *
 * Không dùng thư viện parser: định dạng text của Prometheus đơn giản tới mức thêm một
 * phụ thuộc chỉ để đọc nó là đánh đổi tồi (mỗi phụ thuộc là một cửa cho supply-chain).
 */

export type Nhan = Record<string, string>;
export type Mau = { ten: string; nhan: Nhan; gia_tri: number };

/** Kết quả quét một exporter tại một thời điểm — dạng thô, chưa tính hiệu số. */
export type LanQuet = { luc: Date; mau: Mau[] };

export type Dia = {
  ten: string;
  tong_gb: number;
  con_lai_gb: number;
  phan_tram_dung: number;
};

export type DongRong = {
  cpu_phan_tram: number | null;
  cpu_hang_doi: number | null;
  tai_trung_binh_15p: number | null;
  ram_phan_tram: number | null;
  ram_tong_mb: number | null;
  ram_con_lai_mb: number | null;
  swap_dung_mb: number | null;
  swap_vao_moi_giay: number | null;
  ap_luc_bo_nho: "normal" | "warn" | "critical" | null;
  dia: Dia[];
  mang_vao_byte_moi_giay: number | null;
  mang_ra_byte_moi_giay: number | null;
  mang_goi_loi: number | null;
  mang_goi_tong: number | null;
  uptime_giay: number | null;
  thoi_diem_khoi_dong: string | null;
  tien_trinh_top: Array<{ ten: string; cpu: number; ram_mb: number }>;
  dich_vu_thieu: string[];
};

const MB = 1024 * 1024;
const GB = 1024 * 1024 * 1024;

/** Filesystem ảo — luôn gần đầy và không nói gì về sức khỏe máy. */
const FS_AO = /^(tmpfs|devfs|autofs|overlay|squashfs|devtmpfs)$/;

/** Phân tích định dạng text của Prometheus. Bỏ qua dòng chú thích và dòng rỗng. */
export function docPrometheus(noiDung: string): Mau[] {
  const ket: Mau[] = [];
  for (const dong of noiDung.split("\n")) {
    const s = dong.trim();
    if (s === "" || s.startsWith("#")) continue;

    const moNgoac = s.indexOf("{");
    let ten: string;
    let nhan: Nhan = {};
    let phanGiaTri: string;

    if (moNgoac === -1) {
      const cach = s.indexOf(" ");
      if (cach === -1) continue;
      ten = s.slice(0, cach);
      phanGiaTri = s.slice(cach + 1);
    } else {
      const dongNgoac = s.lastIndexOf("}");
      if (dongNgoac === -1) continue;
      ten = s.slice(0, moNgoac);
      nhan = docNhan(s.slice(moNgoac + 1, dongNgoac));
      phanGiaTri = s.slice(dongNgoac + 1);
    }

    const gia_tri = Number(phanGiaTri.trim().split(/\s+/)[0]);
    if (!Number.isFinite(gia_tri)) continue;
    ket.push({ ten, nhan, gia_tri });
  }
  return ket;
}

function docNhan(phan: string): Nhan {
  const nhan: Nhan = {};
  // Nhãn Prometheus luôn dạng key="value"; giá trị có thể chứa dấu phẩy nên không tách
  // thô bằng split(",").
  const re = /(\w+)="((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(phan)) !== null) {
    nhan[m[1]!] = m[2]!.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return nhan;
}

const tong = (mau: Mau[], ten: string, loc?: (n: Nhan) => boolean) =>
  mau.filter((m) => m.ten === ten && (!loc || loc(m.nhan)))
     .reduce((a, m) => a + m.gia_tri, 0);

const mot = (mau: Mau[], ten: string): number | null => {
  const m = mau.find((x) => x.ten === ten);
  return m ? m.gia_tri : null;
};

/**
 * Tính phần trăm CPU từ HAI lần quét.
 *
 * Bộ đếm `*_cpu_*_total` là thời gian tích lũy từ lúc máy khởi động, nên đọc một lần rồi
 * chia là ra một con số vô nghĩa (nó phản ánh trung bình từ ngày bật máy). Bắt buộc lấy
 * hiệu số giữa hai lần quét — đây là lỗi kinh điển của agent tự viết.
 */
export function tinhCpuPhanTram(truoc: LanQuet, sau: LanQuet, tenMetric: string): number | null {
  const idleTruoc = tong(truoc.mau, tenMetric, (n) => n.mode === "idle");
  const idleSau = tong(sau.mau, tenMetric, (n) => n.mode === "idle");
  const tongTruoc = tong(truoc.mau, tenMetric);
  const tongSau = tong(sau.mau, tenMetric);

  const dIdle = idleSau - idleTruoc;
  const dTong = tongSau - tongTruoc;
  // Bộ đếm quay vòng hoặc exporter vừa khởi động lại → hiệu số âm. Trả null thay vì một
  // con số bịa.
  if (dTong <= 0 || dIdle < 0) return null;
  return lamTron(100 * (1 - dIdle / dTong));
}

const lamTron = (x: number, so = 2) => Math.round(x * 10 ** so) / 10 ** so;

/** Hiệu số của một bộ đếm tích lũy, quy về mỗi giây. */
function moiGiay(truoc: LanQuet, sau: LanQuet, tinh: (m: Mau[]) => number): number | null {
  const giay = (sau.luc.getTime() - truoc.luc.getTime()) / 1000;
  if (giay <= 0) return null;
  const d = tinh(sau.mau) - tinh(truoc.mau);
  if (d < 0) return null;
  return Math.round(d / giay);
}

export function chuyenWindows(truoc: LanQuet, sau: LanQuet): DongRong {
  const m = sau.mau;
  const ramTong = mot(m, "windows_cs_physical_memory_bytes");
  const ramTrong = mot(m, "windows_os_physical_memory_free_bytes");

  const dia: Dia[] = [];
  for (const x of m.filter((y) => y.ten === "windows_logical_disk_size_bytes")) {
    const vol = x.nhan.volume;
    if (!vol || vol.startsWith("HarddiskVolume")) continue;
    const trong = m.find((y) => y.ten === "windows_logical_disk_free_bytes" && y.nhan.volume === vol);
    if (!trong || x.gia_tri <= 0) continue;
    dia.push({
      ten: vol,
      tong_gb: lamTron(x.gia_tri / GB, 1),
      con_lai_gb: lamTron(trong.gia_tri / GB, 1),
      phan_tram_dung: lamTron(100 * (1 - trong.gia_tri / x.gia_tri), 1),
    });
  }

  const khoiDong = mot(m, "windows_system_system_up_time");

  return {
    cpu_phan_tram: tinhCpuPhanTram(truoc, sau, "windows_cpu_time_total"),
    cpu_hang_doi: mot(m, "windows_system_processor_queue_length"),
    tai_trung_binh_15p: null, // Windows không có load average — thà bỏ trống còn hơn bịa
    ram_phan_tram:
      ramTong && ramTrong !== null ? lamTron(100 * (1 - ramTrong / ramTong), 1) : null,
    ram_tong_mb: ramTong ? Math.round(ramTong / MB) : null,
    ram_con_lai_mb: ramTrong !== null ? Math.round(ramTrong / MB) : null,
    swap_dung_mb: null,
    swap_vao_moi_giay: null,
    ap_luc_bo_nho: null,
    dia,
    mang_vao_byte_moi_giay: moiGiay(truoc, sau, (x) =>
      tong(x, "windows_net_bytes_received_total", (n) => !laLoopback(n.nic))),
    mang_ra_byte_moi_giay: moiGiay(truoc, sau, (x) =>
      tong(x, "windows_net_bytes_sent_total", (n) => !laLoopback(n.nic))),
    mang_goi_loi: moiGiay(truoc, sau, (x) => tong(x, "windows_net_packets_received_errors_total")),
    mang_goi_tong: moiGiay(truoc, sau, (x) => tong(x, "windows_net_packets_received_total")),
    uptime_giay: khoiDong ? Math.round(sau.luc.getTime() / 1000 - khoiDong) : null,
    thoi_diem_khoi_dong: khoiDong ? new Date(khoiDong * 1000).toISOString() : null,
    tien_trinh_top: [],
    dich_vu_thieu: m
      .filter((x) => x.ten === "windows_service_state" && x.gia_tri === 1 && x.nhan.state !== "running")
      .map((x) => x.nhan.name!)
      .filter(Boolean),
  };
}

export function chuyenMacos(truoc: LanQuet, sau: LanQuet): DongRong {
  const m = sau.mau;
  const ramTong = mot(m, "node_memory_total_bytes");
  // macOS coi bộ nhớ inactive là CÓ THỂ LẤY LẠI. Không cộng nó vào phần trống là báo
  // động giả liên tục — xem §2.1 của bảng đối chiếu.
  const ramTrong =
    (mot(m, "node_memory_free_bytes") ?? 0) + (mot(m, "node_memory_inactive_bytes") ?? 0);

  const dia: Dia[] = [];
  for (const x of m.filter((y) => y.ten === "node_filesystem_size_bytes")) {
    const mp = x.nhan.mountpoint;
    if (!mp || FS_AO.test(x.nhan.fstype ?? "")) continue;
    const trong = m.find(
      (y) => y.ten === "node_filesystem_avail_bytes" && y.nhan.mountpoint === mp,
    );
    if (!trong || x.gia_tri <= 0) continue;
    dia.push({
      ten: mp,
      tong_gb: lamTron(x.gia_tri / GB, 1),
      con_lai_gb: lamTron(trong.gia_tri / GB, 1),
      phan_tram_dung: lamTron(100 * (1 - trong.gia_tri / x.gia_tri), 1),
    });
  }

  const swapVao = moiGiay(truoc, sau, (x) => tong(x, "node_memory_swapped_in_pages_total"));
  const khoiDong = mot(m, "node_boot_time_seconds");

  return {
    cpu_phan_tram: tinhCpuPhanTram(truoc, sau, "node_cpu_seconds_total"),
    cpu_hang_doi: mot(m, "node_load1"),
    tai_trung_binh_15p: mot(m, "node_load15"),
    ram_phan_tram: ramTong ? lamTron(100 * (1 - ramTrong / ramTong), 1) : null,
    ram_tong_mb: ramTong ? Math.round(ramTong / MB) : null,
    ram_con_lai_mb: Math.round(ramTrong / MB),
    swap_dung_mb: (() => {
      const s = mot(m, "node_memory_swap_used_bytes");
      return s === null ? null : Math.round(s / MB);
    })(),
    swap_vao_moi_giay: swapVao === null ? null : swapVao * 4096,
    ap_luc_bo_nho: apLucBoNho(m, swapVao),
    dia,
    mang_vao_byte_moi_giay: moiGiay(truoc, sau, (x) =>
      tong(x, "node_network_receive_bytes_total", (n) => !laLoopback(n.device))),
    mang_ra_byte_moi_giay: moiGiay(truoc, sau, (x) =>
      tong(x, "node_network_transmit_bytes_total", (n) => !laLoopback(n.device))),
    mang_goi_loi: moiGiay(truoc, sau, (x) => tong(x, "node_network_receive_errs_total")),
    mang_goi_tong: moiGiay(truoc, sau, (x) => tong(x, "node_network_receive_packets_total")),
    uptime_giay: khoiDong ? Math.round(sau.luc.getTime() / 1000 - khoiDong) : null,
    thoi_diem_khoi_dong: khoiDong ? new Date(khoiDong * 1000).toISOString() : null,
    tien_trinh_top: [],
    dich_vu_thieu: [],
  };
}

const laLoopback = (ten?: string) => !ten || /^lo\d*$|^Loopback/i.test(ten);

/**
 * Áp lực bộ nhớ của macOS — đây mới là chỉ số cảnh báo RAM đúng cho nền tảng này.
 *
 * Máy chỉ thật sự thiếu RAM khi nó phải đọc dữ liệu ngược từ đĩa lên (swap-in), hoặc khi
 * phần bộ nhớ không thể giải phóng (wired + compressed) chiếm quá lớn.
 */
export function apLucBoNho(m: Mau[], swapVaoMoiGiay: number | null): "normal" | "warn" | "critical" | null {
  const tongRam = mot(m, "node_memory_total_bytes");
  if (!tongRam) return null;
  const khongTheGiaiPhong =
    (mot(m, "node_memory_wired_bytes") ?? 0) + (mot(m, "node_memory_compressed_bytes") ?? 0);
  const tyLe = khongTheGiaiPhong / tongRam;
  const swap = swapVaoMoiGiay ?? 0;

  if (tyLe > 0.8 || swap > 2560) return "critical"; // >10 MB/s đọc ngược từ đĩa
  if (tyLe > 0.6 || swap > 256) return "warn";
  return "normal";
}

/** Cắt tên tiến trình về ĐÚNG tên: bỏ đường dẫn và mọi tham số (Nghị định 13 — BRD §8.1). */
export function catTenTienTrinh(raw: string): string {
  const khongThamSo = raw.split(/\s+-{1,2}\w/)[0]!.trim();
  const phan = khongThamSo.split(/[\\/]/);
  return (phan[phan.length - 1] ?? khongThamSo).trim();
}
