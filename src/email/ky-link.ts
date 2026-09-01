import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Ký link "Đã tiếp nhận" trong email cảnh báo.
 *
 * Vì sao phải ký: link được bấm mà KHÔNG cần đăng nhập (người trực đang xử lý sự cố lúc
 * nửa đêm, bắt họ đăng nhập là bắt họ bỏ qua). Không ký thì ai đoán được id cảnh báo cũng
 * bấm hộ được, và sự cố nghiêm trọng sẽ không bao giờ leo thang lên lãnh đạo — đúng thứ
 * cơ chế leo thang sinh ra để chống.
 */
export function kyLink(canhBaoId: string, khoa: string): string {
  return createHmac("sha256", khoa).update(canhBaoId).digest("hex").slice(0, 32);
}

/** So sánh theo thời gian hằng định để không rò rỉ chữ ký qua thời gian phản hồi. */
export function chuKyHopLe(canhBaoId: string, chuKy: string, khoa: string): boolean {
  const dung = Buffer.from(kyLink(canhBaoId, khoa), "utf8");
  const nhan = Buffer.from(chuKy, "utf8");
  if (dung.length !== nhan.length) return false;
  return timingSafeEqual(dung, nhan);
}

export function taoLinkTiepNhan(goc: string, canhBaoId: string, khoa: string): string {
  return `${goc}/api/tiep-nhan?id=${canhBaoId}&chu_ky=${kyLink(canhBaoId, khoa)}`;
}
