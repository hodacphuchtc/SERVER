/**
 * Nguồn dữ liệu cho giao diện — MỘT cửa duy nhất, đổi backend không phải sửa trang.
 *
 * Ở chế độ demo, dữ liệu nằm trong PGlite nhúng (Postgres thật chạy trong tiến trình
 * Node) nên `npm run dev` xem được ngay, không cần tài khoản Supabase. Khi có Supabase
 * thật thì chỉ thay phần thân của các hàm này — mọi trang giữ nguyên.
 *
 * 🔴 LUẬT KHÔNG ĐƯỢC PHÁ: trang CHỈ đọc bảng đã gộp (`metrics_5m`, `metrics_1h`), KHÔNG
 * bao giờ query `metrics_raw`. Gói Supabase miễn phí chỉ cho 5 GB băng thông ra mỗi
 * tháng, và một biểu đồ 90 ngày đọc bảng thô sẽ ăn hết trong vài ngày.
 */
import { PGlite } from "@electric-sql/pglite";
import { napMigration, taoPartitionNgay } from "./nap-migration";
import { napCauHinhNguong } from "./nap-cau-hinh";

export type May = {
  id: string;
  ten_nghiep_vu: string;
  he_dieu_hanh: string;
  muc_quan_trong: string;
  lan_day_du_lieu_cuoi: string | null;
  so_canh_bao_dang_mo: number;
};

export type DiemBieuDo = {
  khung_gio: string;
  cpu_avg: number | null;
  cpu_max: number | null;
  ram_avg: number | null;
  dia_phan_tram_max: number | null;
};

export type CanhBao = {
  id: string;
  ten_nghiep_vu: string;
  chi_so: string;
  muc: string;
  bat_dau_luc: string;
  ket_thuc_luc: string | null;
  tiep_nhan_boi: string | null;
};

let db: PGlite | null = null;

/** Khởi tạo một lần cho cả tiến trình. Next.js dev tải lại module nên phải nhớ trạng thái. */
export async function layDb(): Promise<PGlite> {
  if (db) return db;
  const moi = new PGlite();
  await napMigration(moi);
  await napCauHinhNguong(moi);
  await napDuLieuDemo(moi);
  // Chế độ "đo máy này": ngoài 4 máy mẫu, thêm CHÍNH MÁY ĐANG CHẠY với số liệu thật đọc
  // bằng lệnh macOS. Nhờ vậy xem được ứng dụng nói gì về một máy có thật, trước khi cài
  // exporter lên máy chủ. Bật bằng GIAM_SAT_DO_MAY_NAY=1.
  if (process.env.GIAM_SAT_DO_MAY_NAY === "1" && process.platform === "darwin") {
    try {
      await themMayNay(moi);
    } catch (e) {
      // Không được để việc đo máy làm sập cả trang — nó là thứ phụ trợ.
      console.error("Không đo được máy này:", e instanceof Error ? e.message : e);
    }
  }
  db = moi;
  return moi;
}

/**
 * Nạp CHÍNH MÁY ĐANG CHẠY vào cơ sở dữ liệu như một máy chủ được giám sát.
 *
 * Lấy 24 mẫu cách nhau 5 phút cho 2 giờ gần nhất — tất cả cùng một ảnh chụp thật, vì các
 * lệnh macOS chỉ cho biết TRẠNG THÁI HIỆN TẠI chứ không có lịch sử. Biểu đồ vì thế là một
 * đường phẳng; đó là sự thật, không phải lỗi hiển thị.
 */
async function themMayNay(d: PGlite): Promise<void> {
  const { docMayNay } = await import("../../collector/doc-macos-truc-tiep");
  const { thong_tin, so_lieu } = await docMayNay();
  const bayGio = new Date();

  const r = await d.query<{ id: string }>(
    `insert into public.hosts (ten_nghiep_vu, he_dieu_hanh, muc_quan_trong, token_bam, lan_day_du_lieu_cuoi)
     values ($1, 'macos', 'song_con', 'bam-may-nay', now()) returning id`,
    [`${thong_tin.ten_may} (máy đang chạy ứng dụng)`],
  );
  const id = r.rows[0]!.id;
  const oTeNhat = so_lieu.dia.reduce<{ pt: number; gb: number }>(
    (a, x) => (x.phan_tram_dung > a.pt ? { pt: x.phan_tram_dung, gb: x.con_lai_gb } : a),
    { pt: 0, gb: 0 },
  );

  for (let i = 23; i >= 0; i--) {
    const t = new Date(bayGio.getTime() - i * 300_000);
    await d.query(
      `insert into public.metrics_5m
         (khung_gio, host_id, so_mau, cpu_min, cpu_avg, cpu_max, cpu_p95,
          ram_min, ram_avg, ram_max, ram_p95, dia_phan_tram_max, dia_con_lai_gb_min, mang_ra_avg)
       values ($1,$2,1,$3,$3,$3,$3,$4,$4,$4,$4,$5,$6,$7) on conflict do nothing`,
      [t.toISOString(), id, so_lieu.cpu_phan_tram, so_lieu.ram_phan_tram,
       oTeNhat.pt, oTeNhat.gb, so_lieu.mang_ra_byte_moi_giay],
    );
  }

  // Cho engine chấm điểm máy thật này bằng đúng ngưỡng trong config — đây mới là phần
  // trả lời câu hỏi "ứng dụng nói gì về máy của tôi".
  if (oTeNhat.pt >= 90 || oTeNhat.gb <= 10) {
    await d.query(
      `insert into public.alerts (host_id, chi_so, muc, gia_tri, nguong)
       values ($1, 'dia_phan_tram', 'nghiem_trong', $2, 90)`,
      [id, oTeNhat.pt],
    );
  }
  if ((so_lieu.ram_phan_tram ?? 0) >= 85 || so_lieu.ap_luc_bo_nho === "warn") {
    await d.query(
      `insert into public.alerts (host_id, chi_so, muc, gia_tri, nguong)
       values ($1, 'ram_phan_tram', 'canh_cao', $2, 85)`,
      [id, so_lieu.ram_phan_tram],
    );
  }
}

export async function danhSachMay(): Promise<May[]> {
  const d = await layDb();
  const r = await d.query<May>(`
    select h.id, h.ten_nghiep_vu, h.he_dieu_hanh, h.muc_quan_trong,
           h.lan_day_du_lieu_cuoi,
           (select count(*)::int from public.alerts a
             where a.host_id = h.id and a.ket_thuc_luc is null) as so_canh_bao_dang_mo
    from public.hosts h
    where h.dang_theo_doi
    order by
      case h.muc_quan_trong when 'song_con' then 0 when 'quan_trong' then 1 else 2 end,
      h.ten_nghiep_vu`);
  return r.rows;
}

export async function bieuDoTheoMay(hostId: string, soNgay = 7): Promise<DiemBieuDo[]> {
  const d = await layDb();
  // Đọc metrics_5m — KHÔNG đọc metrics_raw (xem ghi chú đầu file).
  const r = await d.query<DiemBieuDo>(
    `select khung_gio, cpu_avg, cpu_max, ram_avg, dia_phan_tram_max
       from public.metrics_5m
      where host_id = $1 and khung_gio > now() - ($2 || ' days')::interval
      order by khung_gio`,
    [hostId, String(soNgay)],
  );
  return r.rows;
}

export async function soSanhCacMay(): Promise<Array<{ ten_nghiep_vu: string; cpu: number; ram: number }>> {
  const d = await layDb();
  const r = await d.query<{ ten_nghiep_vu: string; cpu: number; ram: number }>(`
    select h.ten_nghiep_vu,
           coalesce(round(avg(m.cpu_avg)::numeric, 1), 0)::float8 as cpu,
           coalesce(round(avg(m.ram_avg)::numeric, 1), 0)::float8 as ram
    from public.hosts h
    left join public.metrics_5m m
      on m.host_id = h.id and m.khung_gio > now() - interval '24 hours'
    where h.dang_theo_doi
    group by h.ten_nghiep_vu
    order by cpu desc`);
  return r.rows;
}

export async function nhatKyCanhBao(gioiHan = 50): Promise<CanhBao[]> {
  const d = await layDb();
  const r = await d.query<CanhBao>(
    `select a.id, h.ten_nghiep_vu, a.chi_so, a.muc,
            a.bat_dau_luc, a.ket_thuc_luc, a.tiep_nhan_boi
       from public.alerts a join public.hosts h on h.id = a.host_id
      order by a.ket_thuc_luc is not null, a.bat_dau_luc desc
      limit $1`,
    [gioiHan],
  );
  return r.rows;
}

/**
 * Dữ liệu mẫu để giao diện xem được NGAY, trước khi có máy chủ thật.
 *
 * Cố ý dựng một kịch bản có ý nghĩa chứ không phải số ngẫu nhiên: một máy khoẻ, một máy
 * đang quá tải, một máy sắp đầy đĩa. Nhìn vào là thấy ngay giao diện có phân biệt được
 * ba trạng thái đó không — đó mới là thứ cần nghiệm thu.
 */
export async function napDuLieuDemo(d: PGlite): Promise<void> {
  const bayGio = new Date();
  for (let i = 0; i <= 7; i++) {
    await taoPartitionNgay(d, new Date(bayGio.getTime() - i * 86_400_000));
  }

  const may = [
    { ten: "máy chủ kế toán", os: "windows", muc: "song_con", cpuNen: 35, ramNen: 55, diaBatDau: 120 },
    { ten: "máy chủ bán hàng", os: "windows", muc: "song_con", cpuNen: 88, ramNen: 91, diaBatDau: 300 },
    { ten: "máy chủ thiết kế", os: "macos", muc: "quan_trong", cpuNen: 25, ramNen: 70, diaBatDau: 40 },
    { ten: "máy chủ lưu trữ", os: "macos", muc: "phu", cpuNen: 12, ramNen: 40, diaBatDau: 18 },
  ];

  for (const m of may) {
    const r = await d.query<{ id: string }>(
      `insert into public.hosts (ten_nghiep_vu, he_dieu_hanh, muc_quan_trong, token_bam, lan_day_du_lieu_cuoi)
       values ($1, $2, $3, $4, now()) returning id`,
      [m.ten, m.os, m.muc, `bam-${m.ten}`],
    );
    const id = r.rows[0]!.id;

    // 7 ngày × 288 khung 5 phút. Ghi thẳng vào bảng gộp: đây là thứ giao diện đọc.
    for (let ngay = 6; ngay >= 0; ngay--) {
      for (let k = 0; k < 288; k += 3) {
        const t = new Date(bayGio.getTime() - ngay * 86_400_000 + k * 300_000);
        if (t > bayGio) continue;
        const gio = t.getHours();
        // Giờ hành chính tải cao hơn — để heatmap và biểu đồ có hình dạng thật.
        const nhipNgay = gio >= 8 && gio <= 18 ? 1.25 : 0.75;
        const nhieu = (Math.sin(k * 0.7 + ngay) + 1) * 6;
        const cpu = Math.min(99, m.cpuNen * nhipNgay + nhieu);
        const ram = Math.min(99, m.ramNen * (nhipNgay * 0.5 + 0.6) + nhieu * 0.4);
        const dia = 100 - ((m.diaBatDau - (6 - ngay) * (m.ten === "máy chủ thiết kế" ? 5 : 0.4)) / 500) * 100;

        await d.query(
          `insert into public.metrics_5m
             (khung_gio, host_id, so_mau, cpu_min, cpu_avg, cpu_max, cpu_p95,
              ram_min, ram_avg, ram_max, ram_p95, dia_phan_tram_max, dia_con_lai_gb_min, mang_ra_avg)
           values ($1,$2,5,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           on conflict do nothing`,
          [t.toISOString(), id,
           cpu - 6, cpu, cpu + 8, cpu + 6,
           ram - 4, ram, ram + 5, ram + 4,
           dia, m.diaBatDau - (6 - ngay) * (m.ten === "máy chủ thiết kế" ? 5 : 0.4),
           1_200_000],
        );
      }
    }
  }

  // Ba cảnh báo có ý nghĩa: một đang mở chưa ai nhận, một đang mở đã nhận, một đã đóng.
  await d.exec(`
    insert into public.alerts (host_id, chi_so, muc, gia_tri, nguong, bat_dau_luc)
      select id, 'cpu_phan_tram', 'nghiem_trong', 97, 95, now() - interval '40 minutes'
      from public.hosts where ten_nghiep_vu = 'máy chủ bán hàng';
    insert into public.alerts (host_id, chi_so, muc, gia_tri, nguong, bat_dau_luc, tiep_nhan_luc, tiep_nhan_boi)
      select id, 'ram_phan_tram', 'canh_cao', 91, 85, now() - interval '2 hours', now() - interval '1 hour', 'anh Minh'
      from public.hosts where ten_nghiep_vu = 'máy chủ bán hàng';
    insert into public.alerts (host_id, chi_so, muc, gia_tri, nguong, bat_dau_luc, ket_thuc_luc)
      select id, 'dia_phan_tram', 'canh_cao', 88, 85, now() - interval '2 days', now() - interval '2 days' + interval '35 minutes'
      from public.hosts where ten_nghiep_vu = 'máy chủ thiết kế';
  `);
}
