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

/**
 * Gắn nút "Đã tiếp nhận" vào cuối thân thư.
 *
 * 🔴 Vì sao hàm này tồn tại: `taoLinkTiepNhan` trước đây CHỈ được gọi trong test — nghĩa
 * là email cảnh báo chưa bao giờ có nút bấm. Mà cơ chế leo thang lên lãnh đạo sau 30 phút
 * lại dựa vào việc "chưa ai bấm tiếp nhận". Thiếu nút, mọi sự cố nghiêm trọng đều leo
 * thang sau đúng 30 phút dù người trực đang xử lý — và người ta sẽ học cách bỏ qua email.
 *
 * Hàm THUẦN: không I/O, không đọc env. Khoá và địa chỉ gốc do người gọi truyền vào.
 */
export function themNutTiepNhan(
  thanThu: string,
  canhBaoIds: readonly string[],
  goc: string,
  khoa: string,
): string {
  if (canhBaoIds.length === 0) return thanThu;

  const dong = canhBaoIds.map((id, i) =>
    canhBaoIds.length === 1
      ? `Đã xử lý? Bấm vào đây: ${taoLinkTiepNhan(goc, id, khoa)}`
      : `${i + 1}. ${taoLinkTiepNhan(goc, id, khoa)}`);

  const dau = canhBaoIds.length === 1
    ? ""
    : "Đã xử lý việc nào thì bấm link tương ứng (theo đúng thứ tự bên trên):\n";

  return `${thanThu}\n\n${dau}${dong.join("\n")}`;
}
