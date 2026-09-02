/**
 * Đổi các cảnh báo đang mở trong `alerts` thành `PhatHien` để lớp tương quan xét.
 *
 * Vì sao cần lớp trung gian này: `alerts.chi_so` là mã kỹ thuật (`dia_con_lai_gb`,
 * `cong_viec:backup-ke-toan`), còn luật tương quan làm việc với MÃ ỔN ĐỊNH (`dia_con_lai`,
 * `swap_cao`) và TRỤ. Ánh xạ ở một chỗ duy nhất thì thêm chỉ số mới chỉ phải sửa một bảng.
 */

import type { AnhChup, MucNhanDinh, PhatHien, TenTru } from "./kieu";

/** Một dòng `alerts` đang mở, đúng các cột mà `soan_thong_bao` cũng đọc. */
export type DongCanhBao = {
  id: string;
  chi_so: string;
  muc: string;
  gia_tri: number | null;
  nguong: number | null;
  dien_giai: string | null;
};

/**
 * Bảng ánh xạ chỉ số → (mã ổn định, trụ).
 *
 * 🔴 Mã ở đây PHẢI khớp với danh sách `nuot` của các luật trong `luat-tuong-quan.ts`.
 * Lệch một chữ là luật không nuốt được triệu chứng, và hệ thống lại báo rời rạc — hỏng
 * âm thầm, không có lỗi nào bật ra. Test `phien-dich-nối-đầu-ra` canh đúng chỗ này.
 */
const ANH_XA: Record<string, { ma: string; tru: TenTru }> = {
  dia_con_lai_gb:      { ma: "dia_con_lai",   tru: "cho_luu_tru" },
  dia_phan_tram_dung:  { ma: "dia_phan_tram", tru: "cho_luu_tru" },
  swap_dung_ty_le:     { ma: "swap_cao",      tru: "bo_nho" },
  swap_ra_moi_giay:    { ma: "swap_ra_nhanh", tru: "bo_nho" },
  ap_luc_bo_nho:       { ma: "ap_luc_bo_nho", tru: "bo_nho" },
  ram_phan_tram:       { ma: "ram_thap",      tru: "bo_nho" },
  cpu_phan_tram:       { ma: "cpu_cao",       tru: "bo_xu_ly" },
  cpu_hang_doi:        { ma: "tai_cao",       tru: "bo_xu_ly" },
  gioi_han_toc_do_cpu: { ma: "nhiet",         tru: "bo_xu_ly" },
  pin_phan_tram:       { ma: "pin_thap",      tru: "nguon_dien" },
  mat_lien_lac:        { ma: "mat_lien_lac",  tru: "mang_dich_vu" },
};

/** Tiền tố cho các chỉ số động (`cong_viec:<mã>`, `csdl:<tên>`, `du_bao_day_dia:<ổ>`). */
const TIEN_TO: Array<{ dau: string; ma: string; tru: TenTru }> = [
  { dau: "cong_viec:",      ma: "cong_viec_tre", tru: "sao_luu" },
  { dau: "csdl:",           ma: "csdl_loi",      tru: "mang_dich_vu" },
  { dau: "dich_vu:",        ma: "dich_vu_dung",  tru: "mang_dich_vu" },
  { dau: "du_bao_day_dia:", ma: "du_bao_dia",    tru: "cho_luu_tru" },
];

export function phanLoaiChiSo(chiSo: string): { ma: string; tru: TenTru } {
  const thang = ANH_XA[chiSo];
  if (thang) return thang;
  const tt = TIEN_TO.find((t) => chiSo.startsWith(t.dau));
  if (tt) return { ma: tt.ma, tru: tt.tru };
  // Chỉ số chưa khai: trả trụ trung tính và mã = chính chỉ số. KHÔNG ném lỗi — một chỉ số
  // mới không được phép làm chết cả vòng đánh giá. Nó sẽ được báo RIÊNG (không luật nào
  // khai nuốt mã lạ), tức là suy giảm về đúng hành vi cũ chứ không mất cảnh báo.
  return { ma: chiSo, tru: "mang_dich_vu" };
}

/**
 * Đổi một dòng `anh_chup_suc_khoe()` thành `AnhChup`.
 *
 * 🔴 Cần bộ chuyển đổi này vì SQL và TypeScript có hình dạng KHÁC NHAU, và chỗ khác nhau
 * đó không hề lộ ra khi biên dịch:
 *   · SQL gom các danh sách vào MỘT cột `chi_so_them` (jsonb) — TypeScript mong chúng nằm
 *     ở cấp trên. Thiếu bước này thì `f.cong_ra_ngoai.filter(...)` gọi trên `undefined` và
 *     làm sập cả bước 6b;
 *   · mảng jsonb có thể về dạng chuỗi tuỳ driver;
 *   · `so_nhan` chưa có trong ảnh chụp, nên các phép chia cho nó phải chịu được `null`.
 *
 * Mọi mảng đều mặc định RỖNG chứ không để `undefined`: "không có" là một giá trị hợp lệ,
 * còn `undefined` là một quả mìn.
 */
export function tuAnhChupSql(r: Record<string, unknown>): AnhChup {
  const mang = <T>(x: unknown): T[] => {
    if (Array.isArray(x)) return x as T[];
    if (typeof x === "string") { try { const j = JSON.parse(x); return Array.isArray(j) ? j : []; } catch { return []; } }
    return [];
  };
  const doiTuong = (x: unknown): Record<string, unknown> => {
    if (x && typeof x === "object" && !Array.isArray(x)) return x as Record<string, unknown>;
    if (typeof x === "string") { try { const j = JSON.parse(x); return j && typeof j === "object" ? j : {}; } catch { return {}; } }
    return {};
  };
  const so = (x: unknown): number | null => {
    const n = typeof x === "string" ? Number(x) : x;
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  };

  const them = doiTuong(r.chi_so_them);

  return {
    host_id: String(r.host_id),
    ten_nghiep_vu: String(r.ten_nghiep_vu ?? "máy chưa đặt tên"),
    he_dieu_hanh: String(r.he_dieu_hanh ?? ""),
    muc_quan_trong: String(r.muc_quan_trong ?? "phu"),
    so_phut_im_lang: so(r.so_phut_im_lang),
    cpu_phan_tram: so(r.cpu_phan_tram),
    cpu_hang_doi: so(r.cpu_hang_doi),
    cpu_ranh: so(r.cpu_ranh),
    // Chưa có trong ảnh chụp — để null chứ KHÔNG đoán 1, vì đoán sai làm mọi phép
    // "tải trên mỗi nhân" sai theo và luật nhận dạng nhầm tình huống.
    so_nhan: so(r.so_nhan),
    ram_phan_tram: so(r.ram_phan_tram),
    ram_tong_mb: so(r.ram_tong_mb),
    ram_con_lai_mb: so(r.ram_con_lai_mb),
    swap_dung_mb: so(r.swap_dung_mb),
    swap_tong_mb: so(r.swap_tong_mb),
    swap_ra_moi_giay: so(r.swap_ra_moi_giay),
    ap_luc_bo_nho: (r.ap_luc_bo_nho ?? null) as AnhChup["ap_luc_bo_nho"],
    dia_ten: r.dia_ten == null ? null : String(r.dia_ten),
    dia_con_lai_gb: so(r.dia_con_lai_gb),
    dia_phan_tram_dung: so(r.dia_phan_tram_dung),
    dia_vm_dung_gb: so(r.dia_vm_dung_gb),
    dia_tps: so(r.dia_tps),
    snapshot_cuc_bo: so(r.snapshot_cuc_bo),
    nguon_dien: (r.nguon_dien ?? null) as AnhChup["nguon_dien"],
    pin_phan_tram: so(r.pin_phan_tram),
    pin_con_phut: so(r.pin_con_phut),
    gioi_han_toc_do_cpu: so(r.gioi_han_toc_do_cpu),
    so_tien_trinh: so(r.so_tien_trinh),
    so_thread: so(r.so_thread),
    tran_tien_trinh: so(r.tran_tien_trinh),
    tran_thread: so(r.tran_thread),
    tien_trinh_top: mang<AnhChup["tien_trinh_top"][number]>(r.tien_trinh_top),
    cong_ra_ngoai: mang<number>(them.cong_ra_ngoai),
    dich_vu_loi: mang<string>(them.dich_vu_loi),
    so_phut_dia_thap: so(r.so_phut_dia_thap) ?? 0,
    so_phut_swap_cao: so(r.so_phut_swap_cao) ?? 0,
    so_phut_tai_cao_cpu_ranh: so(r.so_phut_tai_cao_cpu_ranh) ?? 0,
    so_canh_bao_dang_mo: so(r.so_canh_bao_dang_mo) ?? 0,
    co_nghiem_trong_chua_nhan: r.co_nghiem_trong_chua_nhan === true,
  };
}

export function thanhPhatHien(ds: DongCanhBao[]): PhatHien[] {
  return ds.map((a) => {
    const { ma, tru } = phanLoaiChiSo(a.chi_so);
    return {
      ma,
      chi_so: a.chi_so,
      gia_tri: a.gia_tri,
      nguong: a.nguong,
      muc: (a.muc === "nghiem_trong" ? "nghiem_trong" : "canh_cao") as MucNhanDinh,
      tru,
      // Ưu tiên câu đã có sẵn trong alerts (do 0015 sinh). Chỉ khi trống mới rơi về mã
      // kỹ thuật — và khi đó vẫn kèm ngưỡng để con số không đứng trần trụi một mình.
      cau: a.dien_giai ??
        `${a.chi_so}: ${a.gia_tri ?? "chưa đo được"}` +
        (a.nguong !== null ? ` (ngưỡng ${a.nguong})` : ""),
    };
  });
}
