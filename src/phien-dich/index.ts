/**
 * Cửa duy nhất của lớp phiên dịch.
 *
 * `phienDich()` là hàm THUẦN: ảnh chụp + cảnh báo đang mở + cấu hình → báo cáo. Không I/O,
 * không đọc giờ hệ thống. Nhờ vậy giao diện và email dùng CHUNG một nguồn văn bản, và test
 * nó là test số học chạy trong mili-giây.
 */

import type { AnhChup, BaoCaoPhienDich } from "./kieu";
import { type DongCanhBao, thanhPhatHien, tuAnhChupSql } from "./phat-hien";
import { type CauHinhPhienDich, chonNguyenNhanGoc } from "./luat-tuong-quan";

export type { AnhChup, BaoCaoPhienDich, NhanDinh, HanhDong } from "./kieu";
export type { DongCanhBao } from "./phat-hien";
export { tuAnhChupSql } from "./phat-hien";
export type { CauHinhPhienDich } from "./luat-tuong-quan";
export { docCauHinhPhienDich } from "./doc-cau-hinh";
export { soanThanThu, soanTieuDe } from "./soan-thu";
export { chonNguyenNhanGoc, LUAT } from "./luat-tuong-quan";

/** Các chỉ số mà "không có số" là điều đáng nói, chứ không phải chuyện bình thường. */
const CAN_DO_DUOC: Array<[keyof AnhChup, string]> = [
  ["dia_con_lai_gb", "dung lượng ổ đĩa"],
  ["ram_con_lai_mb", "bộ nhớ còn trống"],
  ["cpu_phan_tram", "mức dùng bộ xử lý"],
  ["nguon_dien", "nguồn điện"],
];

export function phienDich(
  anhChup: AnhChup,
  canhBaoDangMo: DongCanhBao[],
  cauHinh: CauHinhPhienDich,
): BaoCaoPhienDich {
  const phatHien = thanhPhatHien(canhBaoDangMo);
  const { goc, khac, da_gop } = chonNguyenNhanGoc(anhChup, phatHien, cauHinh);

  // "Chưa đo được" phải lộ ra. Im lặng ở đây bị người đọc hiểu là "bình thường", và đó
  // đúng là cách một hệ giám sát tự khen mình trong khi đang mù.
  const chuaDo = CAN_DO_DUOC
    .filter(([k]) => anhChup[k] === null || anhChup[k] === undefined)
    .map(([, ten]) => ten);

  const cauMotDong = goc
    ? goc.cau_nhan_dinh
    : khac.length
      ? `${khac.length} việc cần chú ý, không có việc nào ở mức khẩn cấp.`
      : "Mọi thứ đang bình thường.";

  return {
    may_id: anhChup.host_id,
    ten_may: anhChup.ten_nghiep_vu,
    cau_mot_dong: cauMotDong,
    nhan_dinh_chinh: goc,
    nhan_dinh_khac: khac,
    da_gop,
    chua_do_duoc: chuaDo,
  };
}
