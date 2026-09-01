import { chuKyHopLe } from "../../../email/ky-link";
import { layDb } from "../../../db/nguon-du-lieu";

export const dynamic = "force-dynamic";

/** Trang trả về cho người vừa bấm nút trong email. Tiếng Việt, không thuật ngữ kỹ thuật. */
function trang(tieuDe: string, than: string, mau: string) {
  return new Response(
    `<!doctype html><html lang="vi"><head><meta charset="utf-8">
     <meta name="viewport" content="width=device-width,initial-scale=1">
     <title>${tieuDe}</title></head>
     <body style="margin:0;font:16px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                  background:#f6f7f9;color:#1b1f24;display:grid;place-items:center;min-height:100vh">
       <div style="background:#fff;border:1px solid #e3e6ea;border-radius:12px;
                   padding:32px 36px;max-width:460px;margin:20px">
         <div style="font-size:22px;font-weight:650;color:${mau};margin-bottom:10px">${tieuDe}</div>
         <p style="margin:0;color:#5c6672">${than}</p>
       </div>
     </body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const chuKy = url.searchParams.get("chu_ky") ?? "";
  const khoa = process.env.KHOA_KY_LINK ?? "";

  if (!khoa) {
    // Không bao giờ rơi về một khoá mặc định nằm trong mã nguồn.
    return trang("Chưa cấu hình", "Hệ thống chưa được cấu hình khoá ký liên kết.", "#b3261e");
  }
  if (!id || !chuKy || !chuKyHopLe(id, chuKy, khoa)) {
    return trang("Liên kết không hợp lệ",
      "Liên kết này không đúng hoặc đã bị sửa. Hãy mở lại từ email gốc.", "#b3261e");
  }

  const db = await layDb();
  const r = await db.query<{ tiep_nhan_canh_bao: boolean }>(
    `select public.tiep_nhan_canh_bao($1, $2)`, [id, "người trực (qua liên kết trong email)"],
  );

  // Trả về false nghĩa là cảnh báo đã có người nhận hoặc đã tự đóng. Đó KHÔNG phải lỗi —
  // và không được hiện như lỗi cho người vừa cố gắng xử lý sự cố.
  return r.rows[0]?.tiep_nhan_canh_bao
    ? trang("Đã ghi nhận",
        "Cảm ơn bạn. Hệ thống đã ghi nhận có người đang xử lý, và sẽ không báo lên ban lãnh đạo nữa.",
        "#0f7b6c")
    : trang("Sự cố này đã được xử lý",
        "Có người khác đã tiếp nhận trước, hoặc sự cố đã tự kết thúc. Bạn không cần làm gì thêm.",
        "#9a6700");
}
