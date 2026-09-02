/**
 * Soạn thân thư từ một `BaoCaoPhienDich`.
 *
 * Đây là chỗ lớp phiên dịch gặp người đọc. Kỷ luật của BRD §7.6 áp dụng nguyên vẹn:
 * không thuật ngữ kỹ thuật thô, mọi con số có mốc so sánh, và mọi nhận định phải dẫn tới
 * một việc làm được.
 *
 * Thứ tự cố ý theo kim tự tháp ngược: KẾT LUẬN trước → vì sao → nếu không xử lý → việc cần
 * làm → bằng chứng (thụt vào, ai muốn soi thì soi). Người đọc dừng ở bất kỳ dòng nào cũng
 * đã có câu trả lời đúng cho mức độ quan tâm của mình.
 */

import type { BaoCaoPhienDich, NhanDinh } from "./kieu";

const NHAN_MUC: Record<string, string> = {
  nghiem_trong: "KHẨN CẤP",
  canh_cao: "Cần chú ý",
  binh_thuong: "Bình thường",
};

function khoiNhanDinh(n: NhanDinh, tenMay: string, dayDu: boolean): string {
  const dong: string[] = [`• ${tenMay} — ${n.cau_nhan_dinh}`];

  if (dayDu) {
    if (n.nguyen_nhan) dong.push(`  Vì sao: ${n.nguyen_nhan}`);
    if (n.neu_khong_lam_gi) dong.push(`  Nếu không xử lý: ${n.neu_khong_lam_gi}`);

    if (n.hanh_dong.length) {
      dong.push("  Cần làm, theo thứ tự:");
      n.hanh_dong.forEach((h, i) => {
        // `lenh` cố ý KHÔNG bao giờ vào email — nó chỉ hiện ở trang kỹ thuật.
        const phu = [h.hieu_qua, h.phut_uoc_tinh ? `~${h.phut_uoc_tinh} phút` : ""]
          .filter(Boolean).join(", ");
        dong.push(`    ${i + 1}. ${h.viec}${phu ? ` — ${phu}` : ""}`);
        if (h.cach_lam) dong.push(`       ${h.cach_lam}`);
      });
    }

    if (n.thoi_gian_con_lai?.cau) dong.push(`  ${n.thoi_gian_con_lai.cau}`);

    // Bằng chứng để CUỐI và thụt vào: nó giải trình cho kết luận, không tranh chỗ với nó.
    // Vẫn phải hiện ra — người vận hành có quyền hỏi "sao không báo mấy cái kia".
    if (n.bang_chung.length) {
      dong.push(`  Các dấu hiệu đi kèm (đều là hệ quả của cùng nguyên nhân trên):`);
      for (const b of n.bang_chung) dong.push(`    · ${b.cau}`);
    }
  }
  return dong.join("\n");
}

export function soanTieuDe(bc: BaoCaoPhienDich): string {
  if (!bc.nhan_dinh_chinh) {
    return bc.nhan_dinh_khac.length
      ? `${bc.ten_may} — ${bc.nhan_dinh_khac.length} việc cần chú ý`
      : `${bc.ten_may} — bình thường`;
  }
  const them = bc.nhan_dinh_khac.length ? ` (+${bc.nhan_dinh_khac.length} việc khác)` : "";
  // Cắt ở dấu kết câu THẬT (chấm + khoảng trắng), không cắt ở dấu chấm thập phân —
  // "90.2%" từng làm tiêu đề đứt ngang thành "...mượn ổ cứng làm bộ nhớ (90".
  const cau = bc.nhan_dinh_chinh.cau_nhan_dinh;
  const het = cau.search(/[.!?](\s|$)/);
  const dau = (het > 0 ? cau.slice(0, het) : cau).trim();
  const gon = dau.length > 90 ? dau.slice(0, 87).trimEnd() + "…" : dau;
  return `${NHAN_MUC[bc.nhan_dinh_chinh.muc] ?? ""}: ${bc.ten_may} — ${gon}${them}`;
}

export function soanThanThu(bc: BaoCaoPhienDich): string {
  const phan: string[] = [];

  if (bc.nhan_dinh_chinh) {
    phan.push(khoiNhanDinh(bc.nhan_dinh_chinh, bc.ten_may, true));
  }

  if (bc.nhan_dinh_khac.length) {
    phan.push(
      "Việc khác, không cùng nguyên nhân với việc trên:\n" +
      bc.nhan_dinh_khac.map((n) => khoiNhanDinh(n, bc.ten_may, false)).join("\n"),
    );
  }

  // "Không đo được" KHÁC với "khoẻ" — phải nói ra, nếu không im lặng bị hiểu là ổn.
  if (bc.chua_do_duoc.length) {
    phan.push(`Chưa đo được: ${bc.chua_do_duoc.join(", ")}. ` +
      `Không đo được không có nghĩa là bình thường.`);
  }

  return phan.join("\n\n");
}
