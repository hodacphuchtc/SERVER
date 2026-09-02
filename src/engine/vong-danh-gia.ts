/**
 * Vòng đánh giá — thứ biến các mảnh rời rạc thành một hệ thống.
 *
 * Trước khi có file này, mọi bộ phận đều đã xong và đều có test xanh, nhưng KHÔNG CÓ GÌ
 * gọi chúng theo trình tự. Đó là kiểu hỏng nguy hiểm nhất của một hệ giám sát: mọi phép
 * kiểm đều xanh, và hệ thống im lặng tuyệt đối.
 *
 * Cloudflare Worker gọi hàm này mỗi phút (ADR-003). Worker chỉ là đồng hồ — mọi phép nặng
 * nằm trong Postgres để lách trần 10ms CPU của gói miễn phí.
 */

import type { PGlite } from "@electric-sql/pglite";
import {
  xuLyOutbox,
  type CauHinhNutAck,
  type BanGhiOutbox,
  type Transport,
} from "../email/gui-email";

export type TuyChonVong = {
  bayGio?: Date;
  /** Các chỉ số phần cứng cần đánh giá. Mặc định lấy từ bảng cau_hinh_nguong. */
  chiSo?: string[];
  imLangPhut?: number;
  transport: Transport;
  /**
   * Bật nút "Đã tiếp nhận" trong thư. Không truyền thì thư không có nút — và khi đó cơ chế
   * leo thang 30 phút sẽ bắn với MỌI sự cố nghiêm trọng, kể cả khi có người đang xử lý.
   * Cần `goc` (địa chỉ gốc của trang) và `khoa` (khoá ký HMAC, lấy từ biến môi trường).
   */
  nutAck?: CauHinhNutAck;
  /**
   * Ngưỡng dự báo đầy đĩa (số NGÀY còn lại). Không truyền thì bước dự báo bị bỏ qua —
   * giữ tuỳ chọn để các test cũ không phải khai thêm gì.
   * Nguồn sự thật: config/nguong-canh-bao.json → phanCung.diaDuBaoDayNgay.
   */
  duBaoDia?: { canhCaoNgay: number; nghiemTrongNgay: number; cuaSoNgay?: number };
  /**
   * Bật lớp phiên dịch viết đè thân thư (bước 6b). Không truyền thì thư giữ nguyên định
   * dạng do SQL soạn — vẫn đọc được, chỉ là không có nguyên nhân gốc và danh sách hành động.
   */
  phienDich?: {
    cauHinh: import("../phien-dich/luat-tuong-quan").CauHinhPhienDich;
    nguong: { diaConLaiGb: number; swapTyLe: number; taiMoiNhan: number; cpuRanhToiThieu: number };
  };
};

export type TomTatVong = {
  luc: string;
  mat_lien_lac: { mo: number; dong: number };
  nguong: { mo: number; dong: number };
  dich_vu: { mo: number; dong: number };
  cong_viec: { mo: number; dong: number };
  csdl: { mo: number; dong: number };
  du_bao_dia: { mo: number; dong: number };
  thong_bao: { loai: string | null; so_canh_bao: number };
  leo_thang: number;
  email: { da_gui: number; that_bai: number };
  /** Khác null nghĩa là bước 6b hỏng và thư đi ra ở dạng thô — KHÔNG được im lặng. */
  phien_dich_loi: string | null;
};

type CoHanhDong = { hanh_dong: string };

/** Một dòng của anh_chup_suc_khoe() — khớp kiểu AnhChup của lớp phiên dịch. */
type AnhChupRow = Record<string, unknown> & { host_id: string };
type DongCanhBaoRow = {
  id: string; chi_so: string; muc: string;
  gia_tri: number | null; nguong: number | null; dien_giai: string | null;
};

const dem = (rows: CoHanhDong[]) => ({
  mo: rows.filter((r) => r.hanh_dong === "mo_canh_bao").length,
  dong: rows.filter((r) => r.hanh_dong === "dong_canh_bao").length,
});

/**
 * Chạy trọn một chu kỳ.
 *
 * 🔴 THỨ TỰ LÀ MỘT PHẦN CỦA THIẾT KẾ, không phải tuỳ tiện:
 *
 *  • Phát hiện mất liên lạc phải chạy TRƯỚC khi soạn thông báo. Cơ chế ức chế trong
 *    soan_thong_bao() nuốt mọi cảnh báo con của một máy đang mất liên lạc — nếu chạy sau,
 *    cảnh báo "mất liên lạc" chưa tồn tại lúc ức chế xét, và người trực nhận thêm một mớ
 *    "CPU không đo được" cho một máy vừa mất điện.
 *
 *  • Gửi email chạy CUỐI CÙNG, sau khi mọi nguồn cảnh báo đã ghi xong. Gửi ở giữa thì mỗi
 *    nguồn đẻ một email riêng, và cơ chế gom nhóm mất tác dụng.
 *
 *  • Leo thang chạy SAU khi soạn thông báo: nó chỉ quan tâm cảnh báo đã tồn tại đủ lâu mà
 *    chưa ai nhận, không liên quan tới cảnh báo vừa mở trong chính vòng này.
 */
export async function chayMotVong(db: PGlite, tuyChon: TuyChonVong): Promise<TomTatVong> {
  const bayGio = tuyChon.bayGio ?? new Date();
  const moc = bayGio.toISOString();
  const imLang = tuyChon.imLangPhut ?? 3;

  // ── 1. Máy ngừng gửi số liệu. Phải đứng đầu (xem ghi chú trên).
  const matLienLac = await db.query<CoHanhDong>(
    `select hanh_dong from public.soat_mat_lien_lac($1, $2::timestamptz)`, [imLang, moc],
  );

  // ── 2. Ngưỡng phần cứng, lặp theo từng chỉ số đã khai trong config.
  const chiSo = tuyChon.chiSo ?? (
    await db.query<{ chi_so: string }>(`select chi_so from public.cau_hinh_nguong order by chi_so`)
  ).rows.map((r) => r.chi_so);

  const nguongRows: CoHanhDong[] = [];
  for (const cs of chiSo) {
    const r = await db.query<CoHanhDong>(
      `select hanh_dong from public.danh_gia_nguong($1, $2::timestamptz)`, [cs, moc],
    );
    nguongRows.push(...r.rows);
  }

  // ── 3. Dịch vụ bắt buộc đang dừng.
  const dichVu = await db.query<CoHanhDong>(
    `select hanh_dong from public.soat_dich_vu($1::timestamptz)`, [moc],
  );

  // ── 4. Sao lưu và job định kỳ.
  const congViec = await db.query<CoHanhDong>(
    `select hanh_dong from public.ghi_canh_bao_cong_viec($1::timestamptz)`, [moc],
  );

  // ── 5. Cơ sở dữ liệu.
  const csdl = await db.query<CoHanhDong>(
    `select hanh_dong from public.ghi_canh_bao_csdl($1::timestamptz)`, [moc],
  );

  // ── 5b. Dự báo đầy đĩa. Phải chạy TRƯỚC bước gom nhóm để đi chung một thư với các
  // cảnh báo khác — nếu không, "ổ sắp đầy trong 6 ngày" thành một email riêng lẻ.
  //
  // Trước đây du_bao_day_dia() viết xong, có test, chạy đúng, và KHÔNG AI GỌI. Ngưỡng
  // 14/7 ngày khai trong config cũng không có dòng nào so sánh. Đây là mối nối bị thiếu.
  const duBao = tuyChon.duBaoDia
    ? await db.query<CoHanhDong>(
        `select hanh_dong from public.ghi_canh_bao_du_bao_dia($1, $2, $3, $4::timestamptz)`,
        [tuyChon.duBaoDia.canhCaoNgay, tuyChon.duBaoDia.nghiemTrongNgay,
         tuyChon.duBaoDia.cuaSoNgay ?? 7, moc],
      )
    : { rows: [] as CoHanhDong[] };

  // ── 6. Gom nhóm + ức chế + giới hạn tốc độ + cầu dao → ghi vào outbox.
  const thongBao = await db.query<{ loai: string; so_canh_bao: number; khoa: string | null }>(
    `select loai, so_canh_bao, khoa from public.soan_thong_bao($1::timestamptz)`, [moc],
  );
  const thongBaoKhoa = thongBao.rows[0]?.khoa ?? null;

  // ── 6b. LỚP PHIÊN DỊCH viết đè thân thư.
  //
  // Vì sao ĐÈ LÊN thay vì soạn thẳng trong SQL: gom nhóm / ức chế / cầu dao là logic TẬP
  // HỢP, SQL làm tốt và đã có 11 test canh — không đụng vào. Còn viết một câu tiếng Việt
  // có nguyên nhân gốc + hành động thì PL/pgSQL làm rất tệ, và làm ở hai nơi thì chúng sẽ
  // lệch nhau sau đúng một lần sửa.
  //
  // Ba tính chất được giữ nguyên: `khoa_idempotency` không đổi (chống trùng còn nguyên) ·
  // `where gui_luc is null` (chạy lại vô hại) · và bọc try/catch — bước này hỏng thì thư
  // CŨ VẪN GỬI, vì một email thô còn hơn không có email nào.
  let phienDichLoi: string | null = null;
  if (tuyChon.phienDich && thongBao.rows[0]?.loai === "canh_bao") {
    try {
      const { phienDich, soanThanThu, soanTieuDe, tuAnhChupSql } =
        await import("../phien-dich/index.js");
      const { cauHinh, nguong } = tuyChon.phienDich;

      const anhChup = await db.query<AnhChupRow>(
        `select * from public.anh_chup_suc_khoe($1, $2, $3, $4, null, $5::timestamptz)`,
        [nguong.diaConLaiGb, nguong.swapTyLe, nguong.taiMoiNhan, nguong.cpuRanhToiThieu, moc],
      );

      for (const may of anhChup.rows) {
        const canhBao = await db.query<DongCanhBaoRow>(
          `select a.id, a.chi_so, a.muc, a.gia_tri, a.nguong, a.dien_giai
             from public.alerts a
            where a.host_id = $1 and a.ket_thuc_luc is null
            order by a.muc desc, a.chi_so`,
          [may.host_id],
        );
        if (canhBao.rows.length === 0) continue;

        // Chuyển đổi tường minh: hình dạng SQL và TypeScript khác nhau, và ép kiểu
        // thẳng (`as never`) sẽ giấu chỗ khác nhau đó cho tới lúc chạy mới sập.
        const bc = phienDich(tuAnhChupSql(may), canhBao.rows, cauHinh);
        await db.query(
          `update public.alert_notifications
              set tieu_de = $2, than_thu = $3
            where khoa_idempotency = $1 and gui_luc is null`,
          [thongBaoKhoa, soanTieuDe(bc), soanThanThu(bc)],
        );
      }
    } catch (e) {
      // Ghi lại để tóm tắt một dòng nói được là đã SUY GIẢM, chứ không im lặng.
      phienDichLoi = e instanceof Error ? e.message : String(e);
    }
  }

  // ── 7. Leo thang lên lãnh đạo nếu nghiêm trọng mà chưa ai nhận.
  const leoThang = await db.query(
    `select 1 from public.soat_leo_thang($1::timestamptz)`, [moc],
  );

  // ── 8. Gửi email. Chạy cuối để mọi thứ phát hiện trong vòng này đi chung một thư.
  const ketQuaEmail = await xuLyOutbox(
    async () => {
      const r = await db.query<BanGhiOutbox>(
        `select id, khoa_idempotency, nguoi_nhan, tieu_de, than_thu, canh_bao_ids
           from public.alert_notifications
          where gui_luc is null
          order by tao_luc`,
      );
      return r.rows;
    },
    async (id, ma) => {
      await db.query(
        `update public.alert_notifications set gui_luc = now(), loi = null where id = $1`,
        [id],
      );
      void ma;
    },
    async (id, loi) => {
      // KHÔNG đặt gui_luc: vòng sau phải thử lại. Ghi lỗi để người vận hành thấy dây
      // chuyền cảnh báo đang hỏng thay vì im lặng.
      await db.query(`update public.alert_notifications set loi = $2 where id = $1`, [id, loi]);
    },
    tuyChon.transport,
    tuyChon.nutAck,
  );

  return {
    luc: moc,
    mat_lien_lac: dem(matLienLac.rows),
    nguong: dem(nguongRows),
    dich_vu: dem(dichVu.rows),
    cong_viec: dem(congViec.rows),
    csdl: dem(csdl.rows),
    du_bao_dia: dem(duBao.rows),
    thong_bao: {
      loai: thongBao.rows[0]?.loai ?? null,
      so_canh_bao: thongBao.rows[0]?.so_canh_bao ?? 0,
    },
    leo_thang: leoThang.rows.length,
    email: { da_gui: ketQuaEmail.da_gui, that_bai: ketQuaEmail.that_bai },
    phien_dich_loi: phienDichLoi,
  };
}

/** Một dòng log gọn cho Worker — đọc là biết vòng vừa rồi có làm gì không. */
export function tomTatMotDong(t: TomTatVong): string {
  const mo = t.mat_lien_lac.mo + t.nguong.mo + t.dich_vu.mo + t.cong_viec.mo + t.csdl.mo + t.du_bao_dia.mo;
  const dong = t.mat_lien_lac.dong + t.nguong.dong + t.dich_vu.dong + t.cong_viec.dong + t.csdl.dong + t.du_bao_dia.dong;
  if (mo === 0 && dong === 0 && t.email.da_gui === 0 && t.email.that_bai === 0) {
    return `${t.luc} · không có gì thay đổi`;
  }
  return `${t.luc} · mở ${mo} · đóng ${dong} · email gửi ${t.email.da_gui}` +
         (t.phien_dich_loi ? ` · PHIÊN DỊCH HỎNG, thư gửi dạng thô: ${t.phien_dich_loi}` : "") +
         (t.email.that_bai ? ` · LỖI GỬI ${t.email.that_bai}` : "") +
         (t.leo_thang ? ` · leo thang ${t.leo_thang}` : "");
}
