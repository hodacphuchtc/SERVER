import Link from "next/link";
import { danhSachMay, nhatKyCanhBao, soSanhCacMay } from "../db/nguon-du-lieu";
import { Nhan } from "./trang-thai";

export const dynamic = "force-dynamic";

const gio = (s: string | null) =>
  s ? new Date(s).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "—";

export default async function TrangKyThuat() {
  const [may, soSanh, canhBao] = await Promise.all([
    danhSachMay(),
    soSanhCacMay(),
    nhatKyCanhBao(12),
  ]);
  const caoNhat = Math.max(1, ...soSanh.map((x) => x.cpu));

  return (
    <>
      <h1>Trang kỹ thuật</h1>
      <p className="phu">
        {may.length} máy chủ đang theo dõi ·{" "}
        <Link href="/lanh-dao">Xem bản dành cho lãnh đạo →</Link>
      </p>

      <div className="luoi">
        {may.map((m) => {
          const muc = m.so_canh_bao_dang_mo > 0 ? "khan" : "on";
          return (
            <Link key={m.id} className="the" href={`/may/${m.id}`}>
              <div className="ten">{m.ten_nghiep_vu}</div>
              <Nhan muc={muc} chu={m.so_canh_bao_dang_mo > 0 ? `${m.so_canh_bao_dang_mo} cảnh báo` : "Bình thường"} />
              <div className="moc" style={{ marginTop: 8 }}>
                {m.he_dieu_hanh === "windows" ? "Windows" : "macOS"} · số liệu mới nhất {gio(m.lan_day_du_lieu_cuoi)}
              </div>
            </Link>
          );
        })}
      </div>

      <h2>So sánh mức tải giữa các máy (trung bình 24 giờ)</h2>
      {/* Cột ngang đã SẮP XẾP — mắt người so được độ dài rất chính xác. Cố ý không dùng
          biểu đồ tròn hay đồng hồ: chúng bắt người ước lượng góc và diện tích. */}
      <table>
        <thead>
          <tr><th style={{ width: "30%" }}>Máy chủ</th><th>Mức sử dụng bộ xử lý</th><th style={{ width: 70 }}>Số</th></tr>
        </thead>
        <tbody>
          {soSanh.map((x) => (
            <tr key={x.ten_nghiep_vu}>
              <td>{x.ten_nghiep_vu}</td>
              <td>
                <div className="thanh">
                  <i style={{
                    width: `${(x.cpu / caoNhat) * 100}%`,
                    background: x.cpu >= 85 ? "var(--khan)" : x.cpu >= 70 ? "var(--chu-y)" : "var(--on)",
                  }} />
                </div>
              </td>
              <td>{x.cpu}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Nhật ký cảnh báo</h2>
      <div className="bang-cuon">
        <table>
          <thead>
            <tr><th>Máy chủ</th><th>Việc</th><th>Mức</th><th>Bắt đầu</th><th>Trạng thái</th></tr>
          </thead>
          <tbody>
            {canhBao.length === 0 && (
              <tr><td colSpan={5} className="moc">Chưa có cảnh báo nào.</td></tr>
            )}
            {canhBao.map((c) => (
              <tr key={c.id}>
                <td>{c.ten_nghiep_vu}</td>
                <td>{c.chi_so}</td>
                <td><Nhan muc={c.muc === "nghiem_trong" ? "khan" : "chu-y"} chu={c.muc === "nghiem_trong" ? "Nghiêm trọng" : "Cảnh cáo"} /></td>
                <td className="moc">{gio(c.bat_dau_luc)}</td>
                <td className="moc">
                  {c.ket_thuc_luc ? "Đã kết thúc"
                    : c.tiep_nhan_boi ? `Đang xử lý — ${c.tiep_nhan_boi}`
                    : "Chưa ai tiếp nhận"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
