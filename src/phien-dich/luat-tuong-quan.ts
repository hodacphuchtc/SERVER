/**
 * LUẬT TƯƠNG QUAN — thứ biến hệ này từ máy đo thành trợ lý quản trị.
 *
 * Vấn đề nó giải: máy MacBook đang đo thật sinh ra BA cảnh báo cùng lúc —
 *   • Ổ đĩa chỉ còn 3,8 GB trống
 *   • Ổ đĩa đã dùng 98,3%
 *   • Vùng nhớ tạm đã dùng 87,8%
 * Ba dòng đó KHÔNG phải ba sự cố. Chúng là một: đĩa hết chỗ → hệ điều hành không nở được
 * vùng nhớ tạm → bộ nhớ cạn → mọi tiến trình xếp hàng chờ ổ đĩa. Báo thành ba khiến người
 * đọc phải tự ghép, và ghép sai thì đi sửa nhầm chỗ.
 *
 * 🔴 RỦI RO LỚN NHẤT CỦA CHÍNH FILE NÀY: nó có thể trở thành lớp GIẤU cảnh báo. Đó là kiểu
 * hỏng tệ nhất vì nó IM LẶNG và trông rất gọn gàng. Bốn chốt chặn ở `chonNguyenNhanGoc`
 * tồn tại vì lý do đó — đừng gỡ cái nào mà không thay bằng thứ tương đương.
 *
 * Ranh giới: HẰNG SỐ ở `config/phien-dich.json`, SỐ HỌC ở đây. Một DSL điều kiện trong
 * JSON thì không typecheck được, không test được, và sẽ thành ngôn ngữ thứ hai không ai
 * bảo trì nổi.
 */

import type {
  AnhChup, BangChung, DaGop, DoTinCay, HanhDong, NhanDinh, PhatHien, RuiRo, TenTru,
} from "./kieu";

export type NguongTuongQuan = {
  taiMoiNhan: number;
  cpuRanhToiThieuDeCoiLaNghenIO: number;
  ramTrongToiThieuPhanTram: number;
  diaPhanTramCoiLaDay: number;
  vungBoNhoAoChiemGB: number;
  tienTrinhSotCpuToiThieu: number;
  tienTrinhSotPhutToiThieu: number;
  soDichVuLoiCanhCao: number;
  pinPhanTramCanhCao: number;
  pinConPhutCanhCao: number;
  choTroiChoCapNhatGB: number;
  soThreadTyLeTranCanhCao: number;
};

export type CauHinhLuat = { bat: boolean; uuTien: number; gopHanhDongVaoGoc: boolean };

export type CauHinhPhienDich = {
  nguongTuongQuan: NguongTuongQuan;
  tienTrinhTamThoi: string[];
  congChoPhepRaNgoai: number[];
  luatTuongQuan: Record<string, CauHinhLuat>;
  tuGiamSat: { tyLeGopToiDa: number };
};

export type LuatTuongQuan = {
  ma: string;
  ap_dung_cho: "macos" | "windows" | "moi";
  /** Phải ĐỦ HẾT thì luật mới nổ. */
  dieu_kien_bat_buoc: (f: AnhChup, c: CauHinhPhienDich) => boolean;
  /** Mỗi cái đúng nâng độ tin cậy một bậc: phỏng đoán → nhiều khả năng → chắc chắn. */
  dieu_kien_cung_co: Array<{ ma: string; kiem: (f: AnhChup, c: CauHinhPhienDich) => boolean }>;
  /** Mã phát hiện bị hạ xuống thành bằng chứng phụ khi luật này thắng. */
  nuot: string[];
  tru: TenTru;
  soan: (f: AnhChup, c: CauHinhPhienDich) => Omit<NhanDinh, "bang_chung" | "do_tin_cay" | "nguon_luat">;
};

/* ── Tiện ích nhỏ ────────────────────────────────────────────────────────────────────── */

const co = (x: number | null | undefined): x is number => typeof x === "number" && Number.isFinite(x);
const so1 = (x: number) => Math.round(x * 10) / 10;

/** Tỷ lệ vùng nhớ tạm đã dùng. null khi máy tắt swap — KHÔNG quy về 0. */
export function tyLeSwap(f: AnhChup): number | null {
  return co(f.swap_dung_mb) && co(f.swap_tong_mb) && f.swap_tong_mb > 0
    ? f.swap_dung_mb / f.swap_tong_mb : null;
}

/** % bộ nhớ còn trống. */
export function ramTrongPhanTram(f: AnhChup): number | null {
  return co(f.ram_con_lai_mb) && co(f.ram_tong_mb) && f.ram_tong_mb > 0
    ? (f.ram_con_lai_mb / f.ram_tong_mb) * 100 : null;
}

/** Tải trên mỗi nhân. Không biết số nhân thì không đoán bừa. */
export function taiMoiNhan(f: AnhChup): number | null {
  return co(f.cpu_hang_doi) && co(f.so_nhan) && f.so_nhan > 0 ? f.cpu_hang_doi / f.so_nhan : null;
}

/** Các tiến trình tạm còn sót lại — ăn tài nguyên mà không ai còn cần chúng. */
export function tienTrinhSot(f: AnhChup, c: CauHinhPhienDich) {
  return f.tien_trinh_top.filter((p) =>
    c.tienTrinhTamThoi.some((t) => p.ten.includes(t)) &&
    (p.phut_song === undefined || p.phut_song >= c.nguongTuongQuan.tienTrinhSotPhutToiThieu));
}

export function congLa(f: AnhChup, c: CauHinhPhienDich): number[] {
  return f.cong_ra_ngoai.filter((p) => !c.congChoPhepRaNgoai.includes(p));
}

const hd = (
  ma: string, viec: string, ruiRo: RuiRo, giaiThich: string, phut: number,
  hieuQua: string, uocLuong: number | null, o: Partial<HanhDong> = {},
): HanhDong => ({
  ma, viec, rui_ro: ruiRo, giai_thich_rui_ro: giaiThich, phut_uoc_tinh: phut,
  hieu_qua: hieuQua, hieu_qua_uoc_luong: uocLuong, can_khoi_dong_lai: false, ...o,
});

/* ── Chín luật ───────────────────────────────────────────────────────────────────────── */

export const LUAT: LuatTuongQuan[] = [
  {
    // L1 — ca của chính máy này.
    ma: "dia-day-keo-sup-bo-nho",
    ap_dung_cho: "macos",
    tru: "cho_luu_tru",
    dieu_kien_bat_buoc: (f, c) => {
      const dayTheoGb = co(f.dia_con_lai_gb) && f.dia_con_lai_gb <= 10;
      const dayTheoPt = co(f.dia_phan_tram_dung) &&
        f.dia_phan_tram_dung >= c.nguongTuongQuan.diaPhanTramCoiLaDay;
      const swap = tyLeSwap(f);
      return (dayTheoGb || dayTheoPt) && swap !== null && swap >= 0.8;
    },
    dieu_kien_cung_co: [
      {
        // Chữ ký kinh điển của thrashing: việc xếp hàng TRONG KHI bộ xử lý đang rảnh.
        ma: "tai-cao-ma-cpu-ranh",
        kiem: (f, c) => {
          const t = taiMoiNhan(f);
          return t !== null && t >= c.nguongTuongQuan.taiMoiNhan &&
            co(f.cpu_ranh) && f.cpu_ranh >= c.nguongTuongQuan.cpuRanhToiThieuDeCoiLaNghenIO;
        },
      },
      {
        ma: "vung-nho-ao-phinh",
        kiem: (f, c) => co(f.dia_vm_dung_gb) &&
          f.dia_vm_dung_gb >= c.nguongTuongQuan.vungBoNhoAoChiemGB,
      },
      {
        ma: "bo-nho-gan-can",
        kiem: (f, c) => {
          const r = ramTrongPhanTram(f);
          return r !== null && r <= c.nguongTuongQuan.ramTrongToiThieuPhanTram;
        },
      },
    ],
    nuot: ["swap_cao", "ap_luc_bo_nho", "ram_thap", "tai_cao", "dia_phan_tram", "io_cham"],
    soan: (f) => {
      const vm = co(f.dia_vm_dung_gb) ? f.dia_vm_dung_gb : 0;
      return {
        ma: "dia-day-keo-sup-bo-nho",
        chi_so: "dia_con_lai_gb",
        gia_tri: f.dia_con_lai_gb,
        nguong: 10,
        muc: "nghiem_trong",
        tru: "cho_luu_tru",
        cau_nhan_dinh:
          `Ổ đĩa chỉ còn ${so1(f.dia_con_lai_gb ?? 0)} GB trống` +
          (co(f.dia_phan_tram_dung) ? ` (đã dùng ${so1(f.dia_phan_tram_dung)}%)` : "") +
          ". Vì hết chỗ, máy không mở rộng được vùng nhớ tạm nên phải liên tục chuyển dữ " +
          "liệu qua lại giữa bộ nhớ và ổ đĩa — đó là lý do máy chậm hẳn.",
        cau_ky_thuat:
          `dia_con_lai_gb=${so1(f.dia_con_lai_gb ?? 0)} · swap=${so1((tyLeSwap(f) ?? 0) * 100)}% · ` +
          `load/nhân=${so1(taiMoiNhan(f) ?? 0)} · cpu_ranh=${f.cpu_ranh}%`,
        nguyen_nhan: "Ổ đĩa hết chỗ. Các dấu hiệu về bộ nhớ đi kèm đều là hệ quả, không phải nguyên nhân riêng.",
        hanh_dong: [
          ...(vm > 0 ? [hd(
            "khoi-dong-lai-may",
            "Khởi động lại máy",
            "thap",
            "Mất những gì chưa lưu. Không ảnh hưởng dữ liệu đã lưu.",
            5,
            `trả lại ngay khoảng ${so1(vm)} GB ổ đĩa mà vùng nhớ tạm đang chiếm`,
            vm,
            { cach_lam: "Lưu hết việc đang làm rồi chọn Khởi động lại trong trình đơn quả táo.", can_khoi_dong_lai: true },
          )] : []),
          hd("don-tep-lon-it-dung", "Chuyển các tệp lớn ít dùng sang ổ ngoài", "thap",
             "Chỉ mất nếu xoá nhầm bản chưa sao lưu ở nơi khác.", 15,
             "thường thu về hàng chục GB", 20,
             { cach_lam: "Sắp xếp thư mục theo dung lượng, xem các tệp lớn nhất còn cần không." }),
          hd("don-cache-lap-trinh", "Dọn dữ liệu tạm của công cụ lập trình", "khong",
             "Không mất gì — chúng tự sinh lại khi cần.", 10,
             "thường thu về 3–15 GB", 8),
          hd("them-o-luu-tru", "Nếu sau các việc trên vẫn dưới 20 GB thì cần thêm ổ lưu trữ", "can_can_nhac",
             "Cần duyệt chi. Nên quyết sớm khi còn thời gian.", 480,
             "giải quyết dứt điểm thay vì dọn đi dọn lại", 100),
        ],
        neu_khong_lam_gi:
          "Khi ổ còn dưới khoảng 2 GB, hệ điều hành không tạo được vùng nhớ tạm: ứng dụng bị " +
          "tắt đột ngột và máy có thể không khởi động lại được. Đây là loại hỏng mất dữ liệu.",
        thoi_gian_con_lai: null,
      };
    },
  },

  {
    // L3 — đọc/ghi ngược liên tục. Ưu tiên cao hơn L2 vì đây là TỐC ĐỘ, không phải mức tồn.
    ma: "doc-nguoc-lien-tuc",
    ap_dung_cho: "macos",
    tru: "bo_nho",
    dieu_kien_bat_buoc: (f) =>
      co(f.swap_ra_moi_giay) && f.swap_ra_moi_giay >= 10 * 1024 * 1024 && f.so_phut_swap_cao >= 2,
    dieu_kien_cung_co: [
      { ma: "cpu-ranh", kiem: (f) => co(f.cpu_ranh) && f.cpu_ranh >= 40 },
      { ma: "dia-tps-cao", kiem: (f) => co(f.dia_tps) && f.dia_tps >= 3000 },
    ],
    nuot: ["tai_cao", "cpu_hang_doi"],
    soan: (f) => ({
      ma: "doc-nguoc-lien-tuc",
      chi_so: "swap_ra_moi_giay",
      gia_tri: f.swap_ra_moi_giay,
      nguong: 10 * 1024 * 1024,
      muc: "nghiem_trong",
      tru: "bo_nho",
      cau_nhan_dinh:
        `Máy đang liên tục đẩy dữ liệu từ bộ nhớ xuống ổ đĩa ` +
        `(${so1((f.swap_ra_moi_giay ?? 0) / 1048576)} MB mỗi giây, đã kéo dài ${Math.round(f.so_phut_swap_cao)} phút).`,
      nguyen_nhan: "Bộ nhớ không đủ cho khối lượng việc đang chạy.",
      hanh_dong: [
        hd("dong-ung-dung-nang", "Đóng bớt ứng dụng đang mở", "thap",
           "Mất việc chưa lưu trong ứng dụng bị đóng.", 2,
           "trả lại bộ nhớ ngay lập tức", 3),
        hd("khoi-dong-lai-may", "Khởi động lại máy", "thap",
           "Mất những gì chưa lưu.", 5, "dọn sạch vùng nhớ tạm", 5,
           { can_khoi_dong_lai: true }),
      ],
      neu_khong_lam_gi:
        "Ổ cứng hao mòn nhanh hơn bình thường, và máy sẽ giật liên tục cho tới lúc gần như không dùng được.",
      thoi_gian_con_lai: null,
    }),
  },

  {
    // L2 — bộ nhớ thiếu thật (đĩa vẫn rộng rãi).
    ma: "bo-nho-thieu-that",
    ap_dung_cho: "moi",
    tru: "bo_nho",
    dieu_kien_bat_buoc: (f) => {
      const swap = tyLeSwap(f);
      return swap !== null && swap >= 0.8 && co(f.dia_con_lai_gb) && f.dia_con_lai_gb > 20;
    },
    dieu_kien_cung_co: [
      { ma: "keo-dai", kiem: (f) => f.so_phut_swap_cao >= 30 },
      {
        ma: "top-an-nhieu-ram",
        kiem: (f) => co(f.ram_tong_mb) &&
          f.tien_trinh_top.reduce((s, p) => s + p.ram_mb, 0) >= 0.6 * f.ram_tong_mb,
      },
    ],
    nuot: ["tai_cao", "ram_thap", "io_cham", "ap_luc_bo_nho"],
    soan: (f) => ({
      ma: "bo-nho-thieu-that",
      chi_so: "swap_dung_ty_le",
      gia_tri: tyLeSwap(f),
      nguong: 0.8,
      muc: "nghiem_trong",
      tru: "bo_nho",
      cau_nhan_dinh:
        `Bộ nhớ không đủ: máy đang phải mượn ổ cứng làm bộ nhớ ` +
        `(${so1((tyLeSwap(f) ?? 0) * 100)}%), trong khi ổ đĩa vẫn còn rộng.`,
      nguyen_nhan: "Khối lượng việc vượt quá dung lượng bộ nhớ của máy — không phải do hết chỗ lưu trữ.",
      hanh_dong: [
        hd("dong-ung-dung-nang", "Đóng bớt ứng dụng đang mở", "thap",
           "Mất việc chưa lưu trong ứng dụng bị đóng.", 2, "trả lại bộ nhớ ngay", 3),
        hd("nang-bo-nho", "Cân nhắc nâng dung lượng bộ nhớ", "can_can_nhac",
           "Cần duyệt chi và có thể phải thay máy nếu bộ nhớ hàn chết.", 480,
           "giải quyết dứt điểm", 50),
      ],
      neu_khong_lam_gi: "Máy sẽ chậm dần cho tới lúc gần như không dùng được, dù bộ xử lý vẫn đang rảnh.",
      thoi_gian_con_lai: null,
    }),
  },

  {
    // L5 — tiến trình tạm còn sót.
    ma: "tien-trinh-sot",
    ap_dung_cho: "moi",
    tru: "bo_xu_ly",
    dieu_kien_bat_buoc: (f, c) => {
      const ds = tienTrinhSot(f, c);
      return ds.length > 0 &&
        ds.reduce((s, p) => s + p.cpu, 0) >= c.nguongTuongQuan.tienTrinhSotCpuToiThieu;
    },
    dieu_kien_cung_co: [
      {
        ma: "an-nhieu-ram",
        kiem: (f, c) => co(f.ram_tong_mb) &&
          tienTrinhSot(f, c).reduce((s, p) => s + p.ram_mb, 0) >= 0.15 * f.ram_tong_mb,
      },
      { ma: "dang-chay-pin", kiem: (f) => f.nguon_dien === "pin" },
    ],
    nuot: ["cpu_cao", "nhiet"],
    soan: (f, c) => {
      const ds = tienTrinhSot(f, c);
      const ram = ds.reduce((s, p) => s + p.ram_mb, 0);
      return {
        ma: "tien-trinh-sot",
        chi_so: "tien_trinh_top",
        gia_tri: ds.length,
        nguong: null,
        muc: "canh_cao",
        tru: "bo_xu_ly",
        cau_nhan_dinh:
          `Có ${ds.length} tiến trình tự động còn sót lại từ lần chạy thử trước, đang chiếm ` +
          `${so1(ds.reduce((s, p) => s + p.cpu, 0))}% bộ xử lý và khoảng ${Math.round(ram)} MB bộ nhớ.`,
        nguyen_nhan: "Công cụ kiểm thử hoặc máy chủ phát triển thoát không sạch, để lại tiến trình con.",
        hanh_dong: [
          hd("dong-tien-trinh-sot", `Đóng ${ds.length} tiến trình còn sót`, "thap",
             "Chỉ ảnh hưởng phiên chạy thử đã kết thúc, không đụng tới dữ liệu.", 1,
             `trả lại khoảng ${Math.round(ram)} MB bộ nhớ và giảm nóng máy`, ram / 1024),
        ],
        neu_khong_lam_gi: "Máy nóng hơn, hao pin nhanh hơn, và chậm hơn mà không rõ lý do.",
        thoi_gian_con_lai: null,
      };
    },
  },

  {
    // L4 — nghẽn nhập/xuất (macOS không có cột iowait nên dùng cặp tải cao + CPU rảnh).
    ma: "nghen-nhap-xuat",
    ap_dung_cho: "moi",
    tru: "cho_luu_tru",
    dieu_kien_bat_buoc: (f, c) => {
      const t = taiMoiNhan(f);
      return t !== null && t >= c.nguongTuongQuan.taiMoiNhan &&
        co(f.cpu_ranh) && f.cpu_ranh >= c.nguongTuongQuan.cpuRanhToiThieuDeCoiLaNghenIO &&
        f.so_phut_tai_cao_cpu_ranh >= 5;
    },
    dieu_kien_cung_co: [
      { ma: "tps-cao", kiem: (f) => co(f.dia_tps) && f.dia_tps >= 3000 },
    ],
    nuot: ["tai_cao", "cpu_hang_doi"],
    soan: (f) => ({
      ma: "nghen-nhap-xuat",
      chi_so: "cpu_hang_doi",
      gia_tri: f.cpu_hang_doi,
      nguong: null,
      muc: "canh_cao",
      tru: "cho_luu_tru",
      cau_nhan_dinh:
        `Có ${so1(f.cpu_hang_doi ?? 0)} việc đang xếp hàng chờ, trong khi bộ xử lý vẫn rảnh ` +
        `${f.cpu_ranh}% — nghĩa là chúng đang chờ Ổ ĐĨA chứ không phải chờ tính toán.`,
      nguyen_nhan: "Ổ đĩa không đáp ứng kịp nhịp đọc ghi.",
      hanh_dong: [
        hd("tim-tien-trinh-doc-ghi", "Xem tiến trình nào đang đọc ghi ổ đĩa nhiều nhất", "khong",
           "Chỉ quan sát, không thay đổi gì.", 5, "biết được thủ phạm để xử lý đúng chỗ", 1),
      ],
      neu_khong_lam_gi: "Người dùng thấy máy \"đơ\" từng lúc dù bộ xử lý không hề bận.",
      thoi_gian_con_lai: null,
    }),
  },

  {
    // L6 — máy chủ chạy bằng pin. KHÁC TRỤ nên không bị luật đĩa/bộ nhớ nuốt.
    ma: "may-chu-chay-bang-pin",
    ap_dung_cho: "moi",
    tru: "nguon_dien",
    dieu_kien_bat_buoc: (f) => f.nguon_dien === "pin" && f.muc_quan_trong === "song_con",
    dieu_kien_cung_co: [
      { ma: "pin-thap", kiem: (f, c) => co(f.pin_phan_tram) && f.pin_phan_tram <= c.nguongTuongQuan.pinPhanTramCanhCao },
      { ma: "sap-het-gio", kiem: (f, c) => co(f.pin_con_phut) && f.pin_con_phut <= c.nguongTuongQuan.pinConPhutCanhCao },
    ],
    nuot: [],
    soan: (f) => ({
      ma: "may-chu-chay-bang-pin",
      chi_so: "nguon_dien",
      gia_tri: f.pin_phan_tram,
      nguong: null,
      muc: "canh_cao",
      tru: "nguon_dien",
      cau_nhan_dinh:
        `Máy này được đánh dấu là sống còn nhưng đang chạy bằng pin` +
        (co(f.pin_phan_tram) ? ` (còn ${f.pin_phan_tram}%` : "") +
        (co(f.pin_con_phut) ? `, khoảng ${Math.floor(f.pin_con_phut / 60)} giờ ${f.pin_con_phut % 60} phút)` :
          co(f.pin_phan_tram) ? ")" : "") + ".",
      nguyen_nhan: "Máy không được cắm nguồn.",
      hanh_dong: [
        hd("cam-sac", "Cắm sạc", "khong", "Không có rủi ro nào.", 1,
           "loại bỏ hoàn toàn nguy cơ tắt đột ngột", 100),
      ],
      neu_khong_lam_gi:
        "Hết pin là máy tắt đột ngột: mọi việc đang chạy dừng giữa chừng và dữ liệu đang ghi có thể hỏng.",
      thoi_gian_con_lai: co(f.pin_con_phut)
        ? { so_ngay: null, cau: `Còn khoảng ${Math.floor(f.pin_con_phut / 60)} giờ ${f.pin_con_phut % 60} phút trước khi hết pin.` }
        : null,
    }),
  },

  {
    // L7 — cổng mở ra toàn mạng.
    ma: "cong-mo-ra-mang-ngoai",
    ap_dung_cho: "moi",
    tru: "mang_dich_vu",
    dieu_kien_bat_buoc: (f, c) => congLa(f, c).length > 0,
    dieu_kien_cung_co: [
      { ma: "cong-cao", kiem: (f, c) => congLa(f, c).some((p) => p > 1024) },
    ],
    nuot: [],
    soan: (f, c) => {
      const ds = congLa(f, c);
      return {
        ma: "cong-mo-ra-mang-ngoai",
        chi_so: "cong_ra_ngoai",
        gia_tri: ds.length,
        nguong: null,
        muc: "canh_cao",
        tru: "mang_dich_vu",
        cau_nhan_dinh:
          `Có ${ds.length} cổng đang mở ra toàn mạng (${ds.join(", ")}) — máy khác trong ` +
          `mạng kết nối vào được.`,
        nguyen_nhan: "Một dịch vụ đang lắng nghe trên mọi địa chỉ thay vì chỉ trong máy.",
        hanh_dong: [
          hd("ra-soat-cong", "Rà soát xem những cổng này có cần mở ra ngoài không", "khong",
             "Chỉ quan sát.", 10,
             "thu hẹp bề mặt tấn công", 2,
             { cach_lam: "Cổng nào chỉ phục vụ chính máy này thì cấu hình cho nó chỉ nghe ở 127.0.0.1." }),
        ],
        neu_khong_lam_gi: "Dịch vụ không định mở ra ngoài có thể bị truy cập từ máy khác trong mạng.",
        thoi_gian_con_lai: null,
      };
    },
  },

  {
    // L8 — dịch vụ hệ thống thoát lỗi lặp lại.
    ma: "dich-vu-he-thong-lap-lai",
    ap_dung_cho: "macos",
    tru: "mang_dich_vu",
    dieu_kien_bat_buoc: (f, c) => f.dich_vu_loi.length >= c.nguongTuongQuan.soDichVuLoiCanhCao,
    dieu_kien_cung_co: [
      { ma: "cpu-con-ranh", kiem: (f) => co(f.cpu_ranh) && f.cpu_ranh >= 40 },
    ],
    nuot: [],
    soan: (f) => ({
      ma: "dich-vu-he-thong-lap-lai",
      chi_so: "dich_vu_loi",
      gia_tri: f.dich_vu_loi.length,
      nguong: null,
      muc: "canh_cao",
      tru: "mang_dich_vu",
      cau_nhan_dinh:
        `Có ${f.dich_vu_loi.length} dịch vụ hệ thống thoát ra với mã lỗi và đang được khởi động lại lặp đi lặp lại.`,
      nguyen_nhan: "Một cấu hình hoặc quyền truy cập bị sai khiến dịch vụ không khởi động được.",
      hanh_dong: [
        hd("xem-nhat-ky-dich-vu", "Xem nhật ký hệ thống của các dịch vụ này", "khong",
           "Chỉ đọc.", 10, "biết vì sao chúng không chạy được", 1),
      ],
      neu_khong_lam_gi: "Vòng khởi động lại ăn pin và bộ nhớ âm thầm, và tính năng phụ thuộc chúng không hoạt động.",
      thoi_gian_con_lai: null,
    }),
  },

  {
    // L9 — không đủ chỗ cho bản cập nhật hệ điều hành.
    ma: "khong-du-cho-cap-nhat",
    ap_dung_cho: "macos",
    tru: "cho_luu_tru",
    dieu_kien_bat_buoc: (f, c) =>
      co(f.dia_con_lai_gb) && f.dia_con_lai_gb < c.nguongTuongQuan.choTroiChoCapNhatGB &&
      f.dia_con_lai_gb > 10,
    dieu_kien_cung_co: [],
    nuot: [],
    soan: (f) => ({
      ma: "khong-du-cho-cap-nhat",
      chi_so: "dia_con_lai_gb",
      gia_tri: f.dia_con_lai_gb,
      nguong: 20,
      muc: "canh_cao",
      tru: "cho_luu_tru",
      cau_nhan_dinh:
        `Ổ đĩa còn ${so1(f.dia_con_lai_gb ?? 0)} GB — chưa nguy cấp, nhưng không đủ chỗ cho một bản cập nhật hệ điều hành.`,
      nguyen_nhan: "Dung lượng trống đang tiệm cận mức tối thiểu mà hệ điều hành cần để tự cập nhật.",
      hanh_dong: [
        hd("don-truoc-khi-gap", "Dọn bớt dung lượng trước khi cần gấp", "thap",
           "Chỉ mất thứ mình chủ động xoá.", 15, "giữ khoảng thở cho hệ điều hành", 10),
      ],
      neu_khong_lam_gi: "Bản vá bảo mật sẽ không cài được, và máy ở lại phiên bản cũ có lỗ hổng.",
      thoi_gian_con_lai: null,
    }),
  },
];

/* ── Chọn MỘT nguyên nhân gốc ────────────────────────────────────────────────────────── */

const BAC_TIN_CAY: DoTinCay[] = ["phong_doan", "nhieu_kha_nang", "chac_chan"];

/** Hiệu quả cao trước · rủi ro thấp trước · nhanh trước. Khử trùng theo `ma`. */
export function xepUuTien(ds: HanhDong[]): HanhDong[] {
  const bac: Record<RuiRo, number> = {
    khong: 0, thap: 1, can_can_nhac: 2, khong_hoan_tac_duoc: 3,
  };
  return [...new Map(ds.map((h) => [h.ma, h])).values()].sort(
    (a, b) =>
      (b.hieu_qua_uoc_luong ?? 0) - (a.hieu_qua_uoc_luong ?? 0) ||
      bac[a.rui_ro] - bac[b.rui_ro] ||
      a.phut_uoc_tinh - b.phut_uoc_tinh,
  );
}

const lamBangChung = (p: PhatHien): BangChung => ({
  ma: p.ma, chi_so: p.chi_so, gia_tri: p.gia_tri, cau: p.cau,
});

const thanhNhanDinh = (p: PhatHien): NhanDinh => ({
  ma: p.ma, chi_so: p.chi_so, gia_tri: p.gia_tri, nguong: p.nguong, muc: p.muc, tru: p.tru,
  cau_nhan_dinh: p.cau,
  nguyen_nhan: "Chưa xác định được nguyên nhân chung với các dấu hiệu khác.",
  do_tin_cay: "phong_doan",
  hanh_dong: [],
  neu_khong_lam_gi: "",
  thoi_gian_con_lai: null,
  bang_chung: [],
  nguon_luat: "phat-hien-truc-tiep",
});

export type KetQuaTuongQuan = {
  goc: NhanDinh | null;
  khac: NhanDinh[];
  da_gop: DaGop[];
};

/**
 * Chọn MỘT nguyên nhân gốc, hạ các triệu chứng cùng gốc xuống thành bằng chứng.
 *
 * 🔴 BỐN CHỐT CHẶN chống nuốt quá tay. Không có chúng, lớp này trở thành lớp GIẤU cảnh
 * báo — hỏng theo kiểu tệ nhất vì nó im lặng và trông rất gọn gàng:
 *
 *   ① Luật phải KHAI BÁO TƯỜNG MINH nó nuốt mã nào. Không có nuốt ngầm.
 *   ② Nhận định mức `phong_doan` chỉ được XẾP HẠNG, không được nuốt. Chưa đủ bằng chứng
 *      mà đã gom hết triệu chứng vào một giả thuyết là dẫn người ta đi sai đường.
 *   ③ KHÔNG BAO GIỜ nuốt `mat_lien_lac`. Máy im lặng luôn phải báo riêng — không đo được
 *      KHÁC với khoẻ.
 *   ④ CHỈ nuốt trong CÙNG MỘT TRỤ. "Đĩa đầy" tuyệt đối không được nuốt "sao lưu thất bại"
 *      hay "chứng chỉ hết hạn" dù chúng cùng xảy ra một lúc.
 */
export function chonNguyenNhanGoc(
  f: AnhChup,
  phatHien: PhatHien[],
  cauHinh: CauHinhPhienDich,
  luat: LuatTuongQuan[] = LUAT,
): KetQuaTuongQuan {
  const ungVien = luat
    .filter((l) => l.ap_dung_cho === "moi" || l.ap_dung_cho === f.he_dieu_hanh)
    .filter((l) => cauHinh.luatTuongQuan[l.ma]?.bat !== false)
    .filter((l) => l.dieu_kien_bat_buoc(f, cauHinh))
    .sort((a, b) =>
      (cauHinh.luatTuongQuan[b.ma]?.uuTien ?? 0) - (cauHinh.luatTuongQuan[a.ma]?.uuTien ?? 0));

  const thang = ungVien[0];
  if (!thang) {
    return { goc: null, khac: phatHien.map(thanhNhanDinh), da_gop: [] };
  }

  const soCungCo = thang.dieu_kien_cung_co.filter((d) => d.kiem(f, cauHinh)).length;
  const doTinCay = BAC_TIN_CAY[Math.min(soCungCo, 2)]!;

  const goc: NhanDinh = {
    ...thang.soan(f, cauHinh),
    do_tin_cay: doTinCay,
    bang_chung: [],
    nguon_luat: thang.ma,
  };

  const duocNuot = (p: PhatHien) =>
    thang.nuot.includes(p.ma) &&        // ① khai báo tường minh
    doTinCay !== "phong_doan" &&        // ② phỏng đoán thì không nuốt
    p.ma !== "mat_lien_lac" &&          // ③ không bao giờ nuốt mất liên lạc
    p.tru === goc.tru;                  // ④ chỉ nuốt trong cùng trụ

  const biNuot = phatHien.filter(duocNuot);
  goc.bang_chung = biNuot.map(lamBangChung);

  // Luật THUA vẫn góp việc cần làm: MỘT gốc để BÁO, NHIỀU đòn bẩy để LÀM.
  const themViec = ungVien.slice(1)
    .filter((l) => cauHinh.luatTuongQuan[l.ma]?.gopHanhDongVaoGoc)
    .flatMap((l) => l.soan(f, cauHinh).hanh_dong);

  goc.hanh_dong = xepUuTien([...goc.hanh_dong, ...themViec]);

  const daNuot = new Set(biNuot.map((b) => b.ma));
  const khac: NhanDinh[] = [
    // Các luật khác trụ vẫn được báo riêng — chúng không phải hệ quả của gốc.
    ...ungVien.slice(1)
      .filter((l) => l.tru !== goc.tru)
      .map((l) => ({
        ...l.soan(f, cauHinh),
        do_tin_cay: "nhieu_kha_nang" as DoTinCay,
        bang_chung: [],
        nguon_luat: l.ma,
      })),
    ...phatHien.filter((p) => !daNuot.has(p.ma) && p.ma !== goc.ma).map(thanhNhanDinh),
  ];

  return {
    goc,
    khac,
    da_gop: biNuot.length ? [{ ma_luat: thang.ma, nuot: biNuot.map((b) => b.ma) }] : [],
  };
}
