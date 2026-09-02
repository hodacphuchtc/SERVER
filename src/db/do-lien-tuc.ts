/**
 * Chế độ giám sát THẬT chính máy đang chạy ứng dụng.
 *
 * Khác với dữ liệu mẫu (một ảnh chụp tĩnh), chế độ này đo lại mỗi 60 giây rồi chạy trọn
 * vòng đánh giá — đúng nhịp mà Cloudflare Worker sẽ chạy khi lên môi trường thật. Nhờ vậy
 * xem được toàn bộ dây chuyền hoạt động trên một máy có thật, trước khi có tài khoản nào.
 *
 * Email không gửi đi đâu cả: transport ở đây chỉ IN RA MÀN HÌNH. Đó là cố ý — chạy thử
 * trên máy lập trình không được phép làm phiền hộp thư ai.
 */

import type { PGlite } from "@electric-sql/pglite";
import { chayMotVong, tomTatMotDong } from "../engine/vong-danh-gia";
import type { Transport } from "../email/gui-email";
import { taoPartitionNgay } from "./nap-migration";
import { docNguongDuBaoDia } from "./nap-cau-hinh";
import { docCauHinhPhienDich } from "../phien-dich/doc-cau-hinh";

/**
 * Ngưỡng mà hàm SQL `anh_chup_suc_khoe()` cần, lấy từ `config/phien-dich.json`.
 * Truyền bằng THAM SỐ chứ không viết số trong SQL — ngưỡng vô hình trong SQL là thứ sửa
 * config không có tác dụng mà không ai biết.
 */
function nguongTuongQuanChoSql() {
  const n = docCauHinhPhienDich().nguongTuongQuan;
  return {
    diaConLaiGb: 10,
    swapTyLe: 0.8,
    taiMoiNhan: n.taiMoiNhan,
    cpuRanhToiThieu: n.cpuRanhToiThieuDeCoiLaNghenIO,
  };
}

const NHIP_MS = 60_000;

/** Thư được in ra terminal thay vì gửi — thấy đủ nội dung mà không làm phiền ai. */
const transportInRaManHinh: Transport = async (thu) => {
  console.log(
    `\n┌─ THƯ CẢNH BÁO (chế độ thử — KHÔNG gửi đi đâu) ─────────────\n` +
      `│ Tới: ${thu.nguoi_nhan.join(", ")}\n` +
      `│ ${thu.tieu_de}\n` +
      `├────────────────────────────────────────────────────────────\n` +
      thu.than_thu.split("\n").map((d) => `│ ${d}`).join("\n") +
      `\n└────────────────────────────────────────────────────────────\n`,
  );
  return { ok: true, ma: "in-ra-man-hinh" };
};

/**
 * Ghi một nhịp đo của máy này vào cả bảng thô lẫn bảng gộp.
 *
 * Phải ghi vào `metrics_raw` thì engine ngưỡng mới đánh giá được (nó đọc cửa sổ vài phút
 * gần nhất ở bảng thô), và ghi vào `metrics_5m` thì biểu đồ mới vẽ được — giao diện chỉ
 * đọc bảng gộp, không bao giờ đọc bảng thô.
 */
export async function ghiMotNhip(db: PGlite, hostId: string): Promise<void> {
  const { docMayNay } = await import("../../collector/doc-macos-truc-tiep");
  const { so_lieu } = await docMayNay();
  const luc = new Date();
  await taoPartitionNgay(db, luc);

  const oTeNhat = so_lieu.dia.reduce<{ pt: number; gb: number }>(
    (a, x) => (x.phan_tram_dung > a.pt ? { pt: x.phan_tram_dung, gb: x.con_lai_gb } : a),
    { pt: 0, gb: 0 },
  );

  // 🔴 Phải ghi ĐỦ các cột mới, nếu không engine đánh giá swap/pin/nhiệt sẽ không có dữ
  // liệu trên chính máy thật — ngưỡng có, nhánh CASE có, mà cột trống. Đây đúng là kiểu
  // "mọi bộ phận xanh nhưng hệ thống im lặng" mà CLAUDE.md đã ghi làm bài học.
  await db.query(
    `insert into public.metrics_raw
       (thoi_diem, host_id, cpu_phan_tram, cpu_hang_doi, tai_trung_binh_15p,
        ram_phan_tram, ram_tong_mb, ram_con_lai_mb, swap_dung_mb, swap_vao_moi_giay,
        ap_luc_bo_nho, dia, mang_vao_byte_moi_giay, mang_ra_byte_moi_giay,
        uptime_giay, thoi_diem_khoi_dong, tien_trinh_top,
        swap_ra_moi_giay, swap_tong_mb, nguon_dien, pin_phan_tram, pin_con_phut,
        gioi_han_toc_do_cpu, so_tien_trinh, so_thread, tran_tien_trinh, tran_thread,
        dia_tps, dia_kb_moi_lan, cpu_ranh, dia_vm_dung_gb, snapshot_cuc_bo, chi_so_them)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,$17::jsonb,
             $18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33::jsonb)
     on conflict (host_id, thoi_diem) do nothing`,
    [luc.toISOString(), hostId,
     so_lieu.cpu_phan_tram, so_lieu.cpu_hang_doi, so_lieu.tai_trung_binh_15p,
     so_lieu.ram_phan_tram, so_lieu.ram_tong_mb, so_lieu.ram_con_lai_mb,
     so_lieu.swap_dung_mb, so_lieu.swap_vao_moi_giay, so_lieu.ap_luc_bo_nho,
     JSON.stringify(so_lieu.dia), so_lieu.mang_vao_byte_moi_giay, so_lieu.mang_ra_byte_moi_giay,
     so_lieu.uptime_giay, so_lieu.thoi_diem_khoi_dong,
     JSON.stringify(so_lieu.tien_trinh_top),
     so_lieu.swap_ra_moi_giay ?? null, so_lieu.swap_tong_mb ?? null,
     so_lieu.nguon_dien ?? null, so_lieu.pin_phan_tram ?? null, so_lieu.pin_con_phut ?? null,
     so_lieu.gioi_han_toc_do_cpu ?? null,
     so_lieu.so_tien_trinh ?? null, so_lieu.so_thread ?? null,
     so_lieu.tran_tien_trinh ?? null, so_lieu.tran_thread ?? null,
     so_lieu.dia_tps ?? null, so_lieu.dia_kb_moi_lan ?? null, so_lieu.cpu_ranh ?? null,
     so_lieu.dia_vm_dung_gb ?? null, so_lieu.snapshot_cuc_bo ?? null,
     JSON.stringify({
       cong_ra_ngoai: so_lieu.cong_ra_ngoai ?? [],
       cong_trong_may: so_lieu.cong_trong_may ?? 0,
       dich_vu_loi: so_lieu.dich_vu_loi ?? [],
     })],
  );

  await db.query(
    `update public.hosts set lan_day_du_lieu_cuoi = $2::timestamptz where id = $1`,
    [hostId, luc.toISOString()],
  );

  // Khung 5 phút cho biểu đồ.
  const khung = new Date(Math.floor(luc.getTime() / 300_000) * 300_000);
  await db.query(
    `insert into public.metrics_5m
       (khung_gio, host_id, so_mau, cpu_min, cpu_avg, cpu_max, cpu_p95,
        ram_min, ram_avg, ram_max, ram_p95, dia_phan_tram_max, dia_con_lai_gb_min, mang_ra_avg)
     values ($1,$2,1,$3,$3,$3,$3,$4,$4,$4,$4,$5,$6,$7)
     on conflict (host_id, khung_gio) do update set
       so_mau = public.metrics_5m.so_mau + 1,
       cpu_min = least(public.metrics_5m.cpu_min, excluded.cpu_min),
       cpu_avg = excluded.cpu_avg,
       cpu_max = greatest(public.metrics_5m.cpu_max, excluded.cpu_max),
       ram_avg = excluded.ram_avg,
       ram_max = greatest(public.metrics_5m.ram_max, excluded.ram_max),
       dia_phan_tram_max = excluded.dia_phan_tram_max,
       dia_con_lai_gb_min = excluded.dia_con_lai_gb_min`,
    [khung.toISOString(), hostId, so_lieu.cpu_phan_tram, so_lieu.ram_phan_tram,
     oTeNhat.pt, oTeNhat.gb, so_lieu.mang_ra_byte_moi_giay],
  );
}

/**
 * Bật vòng đo + đánh giá chạy nền.
 *
 * Giữ cờ ở `globalThis` chứ không ở biến module: `next dev` nạp lại module mỗi lần sửa
 * code, để ở biến module thì mỗi lần lưu file lại đẻ thêm một bộ đếm giờ, và sau mười lần
 * sửa là mười vòng đo chạy song song trên cùng một cơ sở dữ liệu.
 */
export function batDauDoLienTuc(db: PGlite, hostId: string): void {
  const g = globalThis as unknown as { __giamSatDangChay?: boolean };
  if (g.__giamSatDangChay) return;
  g.__giamSatDangChay = true;

  console.log(`\n🟢 Bắt đầu giám sát máy này — đo lại mỗi ${NHIP_MS / 1000} giây.\n`);

  const motVong = async () => {
    try {
      await ghiMotNhip(db, hostId);
      // 🔴 PHẢI truyền duBaoDia, nếu không bước dự báo bị bỏ qua âm thầm — đúng cái tội
      // mà hạng mục 1.2 sinh ra để sửa (hàm viết xong, có test, và không ai gọi).
      const t = await chayMotVong(db, {
        transport: transportInRaManHinh,
        duBaoDia: docNguongDuBaoDia(),
        // Bật lớp phiên dịch: thư nói bằng NGUYÊN NHÂN GỐC thay vì liệt kê triệu chứng.
        phienDich: { cauHinh: docCauHinhPhienDich(), nguong: nguongTuongQuanChoSql() },
      });
      console.log(`[giám sát] ${tomTatMotDong(t)}`);
    } catch (e) {
      // Một nhịp hỏng không được làm chết vòng đo — nhịp sau vẫn phải chạy.
      console.error("[giám sát] nhịp lỗi:", e instanceof Error ? e.message : e);
    }
  };

  void motVong();
  const dongHo = setInterval(() => void motVong(), NHIP_MS);
  // Không giữ tiến trình sống chỉ vì bộ đếm giờ này.
  if (typeof dongHo.unref === "function") dongHo.unref();
}
