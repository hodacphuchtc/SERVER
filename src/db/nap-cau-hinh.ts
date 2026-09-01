import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";

// Dựng từ thư mục gốc tiến trình, KHÔNG dùng new URL(..., import.meta.url): webpack của
// Next thay lớp URL bằng bản polyfill riêng, nên fileURLToPath nhận một URL "lạ" và ném
// ERR_INVALID_ARG_TYPE ngay lúc build. Đây là lần thứ hai cùng một cạm bẫy trong dự án.
const DUONG_DAN = join(process.cwd(), "config", "nguong-canh-bao.json");

type Nguong = { canhCao: number; nghiemTrong: number; giuTrongPhut?: number };

/**
 * Nạp ngưỡng từ config/ vào bảng cau_hinh_nguong.
 *
 * Ngưỡng là hằng số NGHIỆP VỤ nên nguồn sự thật là file config, không phải bảng (rule 4
 * module-boundaries). Bảng chỉ là bản sao để SQL đọc được — chạy lại hàm này sau mỗi lần
 * sửa config.
 */
/**
 * Ngưỡng dự báo đầy đĩa, tính bằng SỐ NGÀY còn lại.
 *
 * Tách thành hàm riêng vì nó không phải ngưỡng so-với-số-đo (nên không vào bảng
 * `cau_hinh_nguong`) mà là tham số của một phép hồi quy — người gọi truyền thẳng xuống
 * `ghi_canh_bao_du_bao_dia()`.
 */
export function docNguongDuBaoDia(): { canhCaoNgay: number; nghiemTrongNgay: number; cuaSoNgay: number } {
  const cfg = JSON.parse(readFileSync(DUONG_DAN, "utf8")) as {
    phanCung: Record<string, { canhCao: number; nghiemTrong: number; cuaSoHoiQuyNgay?: number }>;
  };
  const n = cfg.phanCung.diaDuBaoDayNgay;
  // KHÔNG có mặc định dự phòng: một `?? 14` nằm im chính là ngưỡng hardcode, và nó hỏng
  // theo kiểu tệ nhất — chạy được, nhưng sửa config không có tác dụng.
  if (!n) throw new Error("config/nguong-canh-bao.json thiếu phanCung.diaDuBaoDayNgay");
  return {
    canhCaoNgay: n.canhCao,
    nghiemTrongNgay: n.nghiemTrong,
    cuaSoNgay: n.cuaSoHoiQuyNgay ?? 7,
  };
}

export async function napCauHinhNguong(db: PGlite): Promise<number> {
  const cfg = JSON.parse(readFileSync(DUONG_DAN, "utf8")) as {
    phanCung: Record<string, Nguong>;
    boNhoMacOS?: Record<string, Nguong>;
    chongNhieu: { hysteresisTatOPhanTramCuaNguong: number; soMauBinhThuongDeTat: number };
  };
  const tyLeTat = cfg.chongNhieu.hysteresisTatOPhanTramCuaNguong / 100;
  const soMau = cfg.chongNhieu.soMauBinhThuongDeTat;

  // Chỉ nạp các chỉ số mà engine đọc được — mỗi dòng ở đây PHẢI có một nhánh CASE tương
  // ứng trong danh_gia_nguong() (0015). Thêm ở một nơi mà quên nơi kia là ngưỡng chết:
  // khai trong config mà engine không đọc, hoặc engine đọc mà không có ngưỡng.
  //
  // Cột thứ 3 = `cao_la_xau`. Cột thứ 4 = hệ điều hành áp dụng (null = mọi máy).
  const anhXa: Array<[string, Nguong, boolean, string | null]> = [
    ["cpu_phan_tram", cfg.phanCung.cpuPhanTram!, true, null],

    // 🔴 ram_phan_tram CHỈ áp cho Windows. Trên macOS, 90% RAM đã dùng là BÌNH THƯỜNG —
    // hệ điều hành dùng RAM rỗi làm cache rất hung và trả lại ngay khi cần
    // (docs/architecture/metric-2-nen-tang.md §2.1). Áp 85% cho máy Mac là tự tạo ra một
    // nguồn báo động giả thường trực. Máy Mac được canh bằng áp lực bộ nhớ và swap.
    ["ram_phan_tram", cfg.phanCung.ramPhanTram!, true, "windows"],

    // Ổ đĩa — hai góc nhìn bổ sung nhau, cố ý giữ CẢ HAI:
    //   · phần trăm bắt được ổ nhỏ sắp đầy (ổ 100 GB dùng 92%);
    //   · GB tuyệt đối bắt được ổ lớn còn ít (ổ 4 TB còn 8 GB vẫn chỉ 99,8%, nhưng 8 GB
    //     là không đủ cho hệ điều hành thở).
    ["dia_phan_tram_dung", cfg.phanCung.diaPhanTramDung!, true, null],
    ["dia_con_lai_gb", cfg.phanCung.diaConLaiGB!, false, null],   // THẤP là xấu
  ];

  // Ngưỡng bộ nhớ macOS nằm ở khối riêng vì chúng chỉ có nghĩa trên macOS.
  if (cfg.boNhoMacOS) {
    anhXa.push(
      ["swap_dung_ty_le", cfg.boNhoMacOS.swapDungTyLe!, true, "macos"],
      ["swap_ra_moi_giay", cfg.boNhoMacOS.swapRaMoiGiayByte!, true, "macos"],
    );
  }

  for (const [chiSo, n, caoLaXau, heDieuHanh] of anhXa) {
    await db.query(
      `insert into public.cau_hinh_nguong
         (chi_so, canh_cao, nghiem_trong, giu_trong_phut, ty_le_tat, so_mau_binh_thuong,
          cao_la_xau, he_dieu_hanh)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (chi_so) do update set
         canh_cao = excluded.canh_cao, nghiem_trong = excluded.nghiem_trong,
         giu_trong_phut = excluded.giu_trong_phut, ty_le_tat = excluded.ty_le_tat,
         so_mau_binh_thuong = excluded.so_mau_binh_thuong, cao_la_xau = excluded.cao_la_xau,
         he_dieu_hanh = excluded.he_dieu_hanh`,
      [chiSo, n.canhCao, n.nghiemTrong, n.giuTrongPhut ?? 5, tyLeTat, soMau, caoLaXau, heDieuHanh],
    );
  }
  return anhXa.length;
}
