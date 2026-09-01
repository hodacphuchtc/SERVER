import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { PGlite } from "@electric-sql/pglite";

const DUONG_DAN = fileURLToPath(
  new URL("../../config/nguong-canh-bao.json", import.meta.url),
);

type Nguong = { canhCao: number; nghiemTrong: number; giuTrongPhut?: number };

/**
 * Nạp ngưỡng từ config/ vào bảng cau_hinh_nguong.
 *
 * Ngưỡng là hằng số NGHIỆP VỤ nên nguồn sự thật là file config, không phải bảng (rule 4
 * module-boundaries). Bảng chỉ là bản sao để SQL đọc được — chạy lại hàm này sau mỗi lần
 * sửa config.
 */
export async function napCauHinhNguong(db: PGlite): Promise<number> {
  const cfg = JSON.parse(readFileSync(DUONG_DAN, "utf8")) as {
    phanCung: Record<string, Nguong>;
    chongNhieu: { hysteresisTatOPhanTramCuaNguong: number; soMauBinhThuongDeTat: number };
  };
  const tyLeTat = cfg.chongNhieu.hysteresisTatOPhanTramCuaNguong / 100;
  const soMau = cfg.chongNhieu.soMauBinhThuongDeTat;

  // Chỉ nạp các chỉ số mà engine đọc được từ cột của metrics_raw. Thêm chỉ số mới thì
  // phải bổ sung cả nhánh CASE trong danh_gia_nguong().
  const anhXa: Array<[string, Nguong, boolean]> = [
    ["cpu_phan_tram", cfg.phanCung.cpuPhanTram!, true],
    ["ram_phan_tram", cfg.phanCung.ramPhanTram!, true],
  ];

  for (const [chiSo, n, caoLaXau] of anhXa) {
    await db.query(
      `insert into public.cau_hinh_nguong
         (chi_so, canh_cao, nghiem_trong, giu_trong_phut, ty_le_tat, so_mau_binh_thuong, cao_la_xau)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (chi_so) do update set
         canh_cao = excluded.canh_cao, nghiem_trong = excluded.nghiem_trong,
         giu_trong_phut = excluded.giu_trong_phut, ty_le_tat = excluded.ty_le_tat,
         so_mau_binh_thuong = excluded.so_mau_binh_thuong, cao_la_xau = excluded.cao_la_xau`,
      [chiSo, n.canhCao, n.nghiemTrong, n.giuTrongPhut ?? 5, tyLeTat, soMau, caoLaXau],
    );
  }
  return anhXa.length;
}
