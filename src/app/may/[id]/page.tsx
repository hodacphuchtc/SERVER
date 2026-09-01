import Link from "next/link";
import { bieuDoTheoMay, danhSachMay } from "../../../db/nguon-du-lieu";
import { Nhan, mucTheoSo } from "../../trang-thai";

export const dynamic = "force-dynamic";

/**
 * Biểu đồ ĐƯỜNG vẽ bằng SVG thuần, kèm ĐƯỜNG NGƯỠNG.
 *
 * Không dùng thư viện biểu đồ: bundle phải dưới 3 MB nén (trần Cloudflare Workers Free),
 * và một biểu đồ đường thì SVG thuần là đủ. Mỗi phụ thuộc thêm vào là một cửa
 * supply-chain và một khoản trong ngân sách bundle.
 */
function BieuDoDuong({ diem, nguong, mau }: { diem: number[]; nguong: number; mau: string }) {
  if (diem.length < 2) return <p className="moc">Chưa đủ số liệu để vẽ.</p>;
  const W = 900, H = 180, dem = diem.length;
  const x = (i: number) => (i / (dem - 1)) * W;
  const y = (v: number) => H - (Math.max(0, Math.min(100, v)) / 100) * H;
  const duong = diem.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
         aria-label={`Biểu đồ 7 ngày, ngưỡng cảnh báo ${nguong}%`}>
      {[25, 50, 75].map((g) => (
        <line key={g} x1={0} x2={W} y1={y(g)} y2={y(g)} stroke="#eceff2" strokeWidth={1} />
      ))}
      {/* Đường ngưỡng: không có nó thì người xem không biết bao nhiêu là cao. */}
      <line x1={0} x2={W} y1={y(nguong)} y2={y(nguong)} stroke="var(--khan)"
            strokeWidth={1.5} strokeDasharray="6 4" />
      <text x={6} y={y(nguong) - 6} fontSize={12} fill="var(--khan)">ngưỡng {nguong}%</text>
      <path d={duong} fill="none" stroke={mau} strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

export default async function TrangMay({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const may = (await danhSachMay()).find((m) => m.id === id);
  const diem = await bieuDoTheoMay(id, 7);
  if (!may) return <p>Không tìm thấy máy chủ này. <Link href="/">Quay lại</Link></p>;

  const cpu = diem.map((d) => d.cpu_avg ?? 0);
  const ram = diem.map((d) => d.ram_avg ?? 0);
  const dia = diem.map((d) => d.dia_phan_tram_max ?? 0);
  const cuoi = (a: number[]) => (a.length ? Math.round(a[a.length - 1]!) : 0);

  return (
    <>
      <p className="phu"><Link href="/">← Trang kỹ thuật</Link></p>
      <h1>{may.ten_nghiep_vu}</h1>
      <p className="phu">
        {may.he_dieu_hanh === "windows" ? "Windows Server" : "macOS"} ·{" "}
        mức quan trọng: {may.muc_quan_trong.replace("_", " ")} · {diem.length} điểm đo trong 7 ngày
      </p>

      <div className="luoi">
        {[
          { ten: "Bộ xử lý", so: cuoi(cpu), cc: 85, nt: 95 },
          { ten: "Bộ nhớ", so: cuoi(ram), cc: 85, nt: 95 },
          { ten: "Ổ đĩa đã dùng", so: cuoi(dia), cc: 80, nt: 90 },
        ].map((k) => (
          <div className="the" key={k.ten}>
            <div className="moc">{k.ten}</div>
            <div className="so">{k.so}%</div>
            <Nhan muc={mucTheoSo(k.so, k.cc, k.nt)} />
          </div>
        ))}
      </div>

      <h2>Bộ xử lý — 7 ngày</h2>
      <div className="the"><BieuDoDuong diem={cpu} nguong={85} mau="#2f6feb" /></div>
      <h2>Bộ nhớ — 7 ngày</h2>
      <div className="the"><BieuDoDuong diem={ram} nguong={85} mau="#7a4fd1" /></div>
      <h2>Ổ đĩa — 7 ngày</h2>
      <div className="the"><BieuDoDuong diem={dia} nguong={80} mau="#0f7b6c" /></div>
    </>
  );
}
