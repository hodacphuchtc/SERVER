import Link from "next/link";
import { danhSachMay, nhatKyCanhBao } from "../../db/nguon-du-lieu";
import { Nhan } from "../trang-thai";

export const dynamic = "force-dynamic";

/**
 * Trang cho lãnh đạo — bản xem nhanh, KHÔNG phải kênh chính.
 *
 * Kênh chính tới lãnh đạo ở v1 là EMAIL định kỳ (`src/email/soan-cho-lanh-dao.ts`): không
 * ai có thói quen mở một trang web để nghe tin tốt. Trang này tồn tại như nơi bấm vào TỪ
 * email đó, và để trả lời khi ai đó hỏi "hệ thống dạo này thế nào".
 *
 * Ba kỷ luật, giống hệt bên email:
 *  1. Không một thuật ngữ kỹ thuật nào — không tên máy dạng SRV-01, không "CPU", không "p95".
 *  2. Mọi con số có mốc so sánh và một câu diễn giải. Con số trần trụi bị cấm.
 *  3. Ba màu, luôn kèm biểu tượng và chữ; đọc được cả khi in đen trắng.
 */
export default async function TrangLanhDao() {
  const [may, canhBao] = await Promise.all([danhSachMay(), nhatKyCanhBao(200)]);

  const dangCoSuCo = may.filter((m) => m.so_canh_bao_dang_mo > 0);
  const binhThuong = may.length - dangCoSuCo.length;
  const chuaAiNhan = canhBao.filter((c) => !c.ket_thuc_luc && !c.tiep_nhan_boi).length;
  const dangXuLy = canhBao.filter((c) => !c.ket_thuc_luc && c.tiep_nhan_boi).length;

  const ketLuan =
    dangCoSuCo.length === 0
      ? "Toàn bộ hệ thống đang hoạt động bình thường."
      : dangCoSuCo.length === 1
        ? "Có 1 phần của hệ thống đang gặp sự cố, đội kỹ thuật đã được báo."
        : `Có ${dangCoSuCo.length} phần của hệ thống đang gặp sự cố, đội kỹ thuật đã được báo.`;

  const mucTong = dangCoSuCo.length === 0 ? "on" : chuaAiNhan > 0 ? "khan" : "chu-y";

  return (
    <>
      <h1>Tình hình hệ thống</h1>
      <p className="phu">
        Cập nhật lúc {new Date().toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
      </p>

      {/* Khối 1 — trả lời "ngay lúc này có gì cháy không" trong một giây. */}
      <div className="the" style={{ padding: "22px 24px" }}>
        <Nhan muc={mucTong} />
        <div style={{ fontSize: 22, fontWeight: 650, marginTop: 10, lineHeight: 1.35 }}>{ketLuan}</div>
        <div className="moc" style={{ marginTop: 8 }}>
          {binhThuong} trên {may.length} phần đang chạy bình thường
          {chuaAiNhan > 0 && ` · ${chuaAiNhan} việc chưa có người tiếp nhận`}
          {dangXuLy > 0 && ` · ${dangXuLy} việc đang được xử lý`}
        </div>
      </div>

      {/* Khối 2 — sức khoẻ theo DỊCH VỤ NGHIỆP VỤ, không theo máy chủ. */}
      <h2>Từng phần của hệ thống</h2>
      <table>
        <tbody>
          {may.map((m) => (
            <tr key={m.id}>
              <td style={{ width: "45%" }}>{m.ten_nghiep_vu}</td>
              <td>
                <Nhan
                  muc={m.so_canh_bao_dang_mo > 0 ? "khan" : "on"}
                  chu={m.so_canh_bao_dang_mo > 0 ? "Đang có sự cố" : "Bình thường"}
                />
              </td>
              <td className="moc">
                {m.so_canh_bao_dang_mo > 0
                  ? "Đội kỹ thuật đã nhận được cảnh báo tự động."
                  : "Không có gì cần chú ý."}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Khối 3 — thứ tạo giá trị lớn nhất: cái gì sắp hỏng mà còn kịp duyệt tiền để ngăn. */}
      <h2>Việc cần quyết</h2>
      <div className="the">
        {chuaAiNhan > 0 ? (
          <p style={{ margin: 0 }}>
            Có <strong>{chuaAiNhan}</strong> sự cố chưa có người tiếp nhận. Nếu sau 30 phút vẫn
            chưa ai nhận, hệ thống sẽ tự gửi thư báo tới ban lãnh đạo.
          </p>
        ) : (
          <p style={{ margin: 0 }}>Hiện không có việc gì cần anh/chị quyết.</p>
        )}
      </div>

      <p className="phu" style={{ marginTop: 28 }}>
        <Link href="/">Xem chi tiết kỹ thuật →</Link>
      </p>
    </>
  );
}
