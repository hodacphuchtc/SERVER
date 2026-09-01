/**
 * Nhãn trạng thái — dùng chung mọi nơi.
 *
 * Ba kỷ luật: đúng BA mức (không thang 7 màu), luôn kèm BIỂU TƯỢNG và CHỮ chứ không chỉ
 * màu (WCAG 1.4.1 — màu không được là phương tiện duy nhất), và dùng cam-đỏ / xanh
 * lam-lục thay vì đỏ / xanh lá thuần cho người mù màu đỏ-lục.
 */
export type Muc = "on" | "chu-y" | "khan";

export function mucTheoSo(giaTri: number, canhCao: number, nghiemTrong: number): Muc {
  if (giaTri >= nghiemTrong) return "khan";
  if (giaTri >= canhCao) return "chu-y";
  return "on";
}

const CHU: Record<Muc, string> = { on: "Bình thường", "chu-y": "Cần chú ý", khan: "Khẩn cấp" };
const BIEU_TUONG: Record<Muc, string> = { on: "✔", "chu-y": "▲", khan: "✕" };

export function Nhan({ muc, chu }: { muc: Muc; chu?: string }) {
  return (
    <span className={`nhan ${muc}`}>
      <span aria-hidden>{BIEU_TUONG[muc]}</span>
      {chu ?? CHU[muc]}
    </span>
  );
}
