/**
 * Kiểu dữ liệu của LỚP PHIÊN DỊCH — thứ biến con số thành nhận định.
 *
 * BRD §1 đặt mệnh đề trung tâm của cả dự án: thứ đang thiếu không phải công cụ vẽ biểu đồ
 * CPU, mà là "một lớp phiên dịch biến hàng chục con số kỹ thuật thành một câu tiếng Việt
 * nói rõ chuyện gì sắp hỏng, ảnh hưởng phần nào, và còn bao lâu để xử lý".
 *
 * Nguyên tắc: một cảnh báo phải trả lời được BỐN câu —
 *   ① Chuyện gì đang xảy ra   ② Vì sao   ③ Nếu không làm gì thì sao   ④ Làm gì bây giờ.
 * Thiếu ④ thì nó chỉ là một con số biết nói. Thiếu ③ thì không ai thấy cần làm.
 */

export type MucNhanDinh = "binh_thuong" | "canh_cao" | "nghiem_trong";

/**
 * Độ tin cậy của một nhận định. Bắt buộc phải có, vì nó quyết định quyền NUỐT:
 * một nhận định mới ở mức phỏng đoán KHÔNG được phép nuốt triệu chứng khác — làm thế là
 * biến lớp tương quan thành lớp giấu cảnh báo.
 */
export type DoTinCay = "chac_chan" | "nhieu_kha_nang" | "phong_doan";

export type RuiRo = "khong" | "thap" | "can_can_nhac" | "khong_hoan_tac_duoc";

/**
 * Trụ sức khoẻ. Dùng cho hai việc: chấm điểm, và làm CHỐT CHẶN nuốt — một nhận định chỉ
 * được nuốt triệu chứng CÙNG TRỤ. "Đĩa đầy" tuyệt đối không được nuốt "sao lưu thất bại".
 */
export type TenTru =
  | "cho_luu_tru" | "bo_nho" | "bo_xu_ly" | "nguon_dien" | "mang_dich_vu" | "sao_luu";

export type HanhDong = {
  /** Khoá ổn định: test bám vào đây, không bám vào câu chữ. Cũng dùng để khử trùng. */
  ma: string;
  /** Việc gì — một mệnh đề, người không chuyên đọc là hiểu. */
  viec: string;
  /** Thao tác thật, mô tả bằng lời. Dùng được cả trong email lẫn trên giao diện. */
  cach_lam?: string;
  /** Lệnh thật. CHỈ hiện ở trang kỹ thuật, KHÔNG BAO GIỜ vào email. */
  lenh?: string;
  rui_ro: RuiRo;
  /** Nói rõ mất gì. Không để người đọc tự đoán rồi ngại không dám làm. */
  giai_thich_rui_ro: string;
  phut_uoc_tinh: number;
  /** Hiệu quả kỳ vọng, bằng lời. */
  hieu_qua: string;
  /**
   * Hiệu quả quy ra số để SẮP XẾP. Không có nó thì "đã sắp theo ưu tiên" chỉ là lời hứa;
   * có nó thì thứ tự là kết quả tính được và test được.
   */
  hieu_qua_uoc_luong: number | null;
  can_khoi_dong_lai: boolean;
  /**
   * true = đã kiểm và loại trừ. Vẫn HIỆN RA dạng "đã kiểm, không áp dụng" thay vì giấu đi:
   * biết một việc không cần làm cũng tiết kiệm thời gian đúng bằng biết việc cần làm.
   */
  da_loai_tru?: boolean;
};

/** Triệu chứng bị gộp vào một nguyên nhân gốc — giữ lại để giải trình, không vứt đi. */
export type BangChung = {
  ma: string;
  chi_so: string;
  gia_tri: number | null;
  /** Một câu đọc được, ví dụ "Vùng nhớ tạm đã dùng 87,8%". */
  cau: string;
};

export type NhanDinh = {
  /** Mã ổn định của luật/phát hiện sinh ra nó. */
  ma: string;
  chi_so: string;
  gia_tri: number | null;
  nguong: number | null;
  muc: MucNhanDinh;
  tru: TenTru;

  /** ① Chuyện gì. Ngôn ngữ quản trị — phải qua được bộ lọc từ cấm. */
  cau_nhan_dinh: string;
  /** ①' Bản kỹ thuật, được phép dùng thuật ngữ. Chỉ hiện ở trang kỹ thuật. */
  cau_ky_thuat?: string;
  /** ② Nguyên nhân có khả năng nhất. */
  nguyen_nhan: string;
  do_tin_cay: DoTinCay;
  /** ④ Việc cần làm, ĐÃ SẮP theo thứ tự ưu tiên. */
  hanh_dong: HanhDong[];
  /** ③ Hệ quả nếu không làm gì. Bắt buộc — đây là thứ tạo ra hành động. */
  neu_khong_lam_gi: string;
  /** ⑤ Còn bao lâu. null = CHƯA ĐỦ SỐ LIỆU, và `cau` phải nói thẳng điều đó. */
  thoi_gian_con_lai: { so_ngay: number | null; cau: string } | null;

  bang_chung: BangChung[];
  /** Truy vết: luật nào sinh ra nhận định này. Không có nó thì không gỡ rối được. */
  nguon_luat: string;
};

/** Một phát hiện thô: chỉ số vượt ngưỡng, chưa qua diễn giải và chưa qua tương quan. */
export type PhatHien = {
  ma: string;
  chi_so: string;
  gia_tri: number | null;
  nguong: number | null;
  muc: MucNhanDinh;
  tru: TenTru;
  cau: string;
};

/**
 * Ảnh chụp sức khoẻ một máy — đầu vào duy nhất của lớp phiên dịch.
 *
 * Tương ứng một dòng của hàm SQL `anh_chup_suc_khoe()`. Mọi trường đều có thể null vì
 * "chưa đo được" là một trạng thái hợp lệ và KHÁC HẲN "bằng 0".
 */
export type AnhChup = {
  host_id: string;
  ten_nghiep_vu: string;
  he_dieu_hanh: "windows" | "macos" | string;
  muc_quan_trong: "song_con" | "quan_trong" | "phu" | string;

  so_phut_im_lang: number | null;
  mat_lien_lac?: boolean;

  cpu_phan_tram: number | null;
  cpu_hang_doi: number | null;
  cpu_ranh: number | null;
  so_nhan: number | null;

  ram_phan_tram: number | null;
  ram_tong_mb: number | null;
  ram_con_lai_mb: number | null;
  swap_dung_mb: number | null;
  swap_tong_mb: number | null;
  swap_ra_moi_giay: number | null;
  ap_luc_bo_nho: "normal" | "warn" | "critical" | null;

  dia_ten: string | null;
  dia_con_lai_gb: number | null;
  dia_phan_tram_dung: number | null;
  dia_vm_dung_gb: number | null;
  dia_tps: number | null;
  snapshot_cuc_bo: number | null;

  nguon_dien: "pin" | "dien" | null;
  pin_phan_tram: number | null;
  pin_con_phut: number | null;
  gioi_han_toc_do_cpu: number | null;

  so_tien_trinh: number | null;
  so_thread: number | null;
  tran_tien_trinh: number | null;
  tran_thread: number | null;

  tien_trinh_top: Array<{ ten: string; cpu: number; ram_mb: number; phut_song?: number }>;
  cong_ra_ngoai: number[];
  dich_vu_loi: string[];

  /** Độ bền bỉ, tính bằng phút (chuỗi liên tục gần nhất). */
  so_phut_dia_thap: number;
  so_phut_swap_cao: number;
  so_phut_tai_cao_cpu_ranh: number;

  /** Bối cảnh cảnh báo đang mở. */
  so_canh_bao_dang_mo: number;
  co_nghiem_trong_chua_nhan: boolean;

  /** Bối cảnh sao lưu — dùng để chứng minh chốt chặn "không nuốt khác trụ". */
  backup_tre_gio?: number | null;
};

export type DaGop = { ma_luat: string; nuot: string[] };

export type BaoCaoPhienDich = {
  may_id: string;
  ten_may: string;
  /** MỘT câu cho dòng đầu trang và cho tiêu đề email. Đọc 5 giây là biết. */
  cau_mot_dong: string;
  /** MỘT nguyên nhân gốc. null = không có gì bất thường. */
  nhan_dinh_chinh: NhanDinh | null;
  /** Các vấn đề ĐỘC LẬP (khác hệ quy chiếu), đã trừ triệu chứng bị nuốt. */
  nhan_dinh_khac: NhanDinh[];
  /** Nhật ký gộp — để test khẳng định, và để người vận hành hỏi được "sao không báo cái kia". */
  da_gop: DaGop[];
  /** Chỉ số KHÔNG đo được. Bắt buộc lộ ra: không đo được KHÁC với khoẻ. */
  chua_do_duoc: string[];
};
