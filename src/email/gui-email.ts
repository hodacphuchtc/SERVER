/**
 * Gửi email qua HTTP API của Resend — TUYỆT ĐỐI KHÔNG dùng SMTP.
 *
 * Lý do rất cụ thể và đã được chính Vercel/Cloudflare ghi nhận: môi trường serverless
 * đóng băng mọi tác vụ nền ngay khi hàm trả response. Một lệnh SMTP chưa `await` xong sẽ
 * chết giữa handshake và **không sinh lỗi, không ghi log, không gửi được email** — kiểu
 * hỏng tệ nhất có thể có với một hệ thống cảnh báo, vì nó im lặng.
 *
 * Transport được tiêm vào để test chạy trọn vòng đời mà không cần tài khoản Resend.
 */

export type ThuCanGui = {
  khoa_idempotency: string;
  nguoi_nhan: string[];
  tieu_de: string;
  than_thu: string;
};

export type KetQuaGui = { ok: boolean; ma?: string; loi?: string };
export type Transport = (thu: ThuCanGui) => Promise<KetQuaGui>;

export type CauHinhEmail = {
  /** Nên là subdomain riêng (alerts@congty.vn) để tách uy tín khỏi mail kinh doanh. */
  nguoi_gui: string;
  /** Ánh xạ vai → địa chỉ thật. Giữ ở config, không hardcode trong code gửi. */
  hop_thu: Record<string, string[]>;
};

/**
 * Đổi vai (`quan_tri`, `lanh_dao`) thành địa chỉ thật.
 *
 * Vai chưa khai trong config bị BỎ QUA có chủ đích thay vì ném lỗi: một vai gõ sai không
 * được phép chặn email tới những vai còn lại — đúng lúc đang có sự cố thì gửi được cho
 * một nửa số người vẫn tốt hơn không gửi được cho ai.
 */
export function doiVaiThanhDiaChi(vai: string[], cauHinh: CauHinhEmail): string[] {
  const ds = vai.flatMap((v) => cauHinh.hop_thu[v] ?? []);
  return [...new Set(ds)];
}

export function taoTransportResend(khoaApi: string, cauHinh: CauHinhEmail): Transport {
  return async (thu) => {
    const den = doiVaiThanhDiaChi(thu.nguoi_nhan, cauHinh);
    if (den.length === 0) return { ok: false, loi: "khong_co_dia_chi_nhan" };
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${khoaApi}`,
          "content-type": "application/json",
          // Resend tôn trọng khoá này: gửi lại cùng khoá không tạo email thứ hai. Đây là
          // lớp chống trùng THỨ HAI, sau outbox trong DB.
          "idempotency-key": thu.khoa_idempotency,
        },
        body: JSON.stringify({
          from: cauHinh.nguoi_gui,
          to: den,
          subject: thu.tieu_de,
          text: thu.than_thu,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return { ok: false, loi: `resend trả mã ${res.status}` };
      const j = (await res.json()) as { id?: string };
      return { ok: true, ma: j.id };
    } catch (e) {
      return { ok: false, loi: e instanceof Error ? e.message : String(e) };
    }
  };
}

export type BanGhiOutbox = {
  id: string;
  khoa_idempotency: string;
  nguoi_nhan: string[];
  tieu_de: string;
  than_thu: string;
};

export type KetQuaXuLy = { da_gui: number; that_bai: number; chi_tiet: KetQuaGui[] };

/**
 * Lấy các thư chưa gửi trong outbox và gửi.
 *
 * Thứ tự bắt buộc: gọi transport TRƯỚC, đánh dấu `gui_luc` SAU. Đánh dấu trước rồi mới
 * gửi thì một lần timeout là mất thư vĩnh viễn mà sổ vẫn ghi "đã gửi" — và không ai phát
 * hiện ra. Thà gửi trùng (đã có hai lớp chống trùng) còn hơn mất im lặng.
 */
export async function xuLyOutbox(
  layChuaGui: () => Promise<BanGhiOutbox[]>,
  danhDauDaGui: (id: string, ma: string | undefined) => Promise<void>,
  ghiLoi: (id: string, loi: string) => Promise<void>,
  transport: Transport,
): Promise<KetQuaXuLy> {
  const ds = await layChuaGui();
  const chiTiet: KetQuaGui[] = [];
  let daGui = 0;
  let thatBai = 0;

  for (const bg of ds) {
    const kq = await transport({
      khoa_idempotency: bg.khoa_idempotency,
      nguoi_nhan: bg.nguoi_nhan,
      tieu_de: bg.tieu_de,
      than_thu: bg.than_thu,
    });
    chiTiet.push(kq);
    if (kq.ok) {
      await danhDauDaGui(bg.id, kq.ma);
      daGui++;
    } else {
      // KHÔNG đánh dấu đã gửi → lượt sau thử lại. Ghi lỗi để người vận hành thấy được
      // rằng dây chuyền cảnh báo đang hỏng, thay vì im lặng.
      await ghiLoi(bg.id, kq.loi ?? "khong ro");
      thatBai++;
    }
  }
  return { da_gui: daGui, that_bai: thatBai, chi_tiet: chiTiet };
}
