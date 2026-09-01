/**
 * Cloudflare Worker — ĐỒNG HỒ của hệ thống cảnh báo (ADR-003).
 *
 * Vì sao đồng hồ đặt ở cloud chứ không trong mạng công ty: mất điện văn phòng không được
 * làm mất luôn khả năng biết mình đang mất điện. Collector chết thì nó không thể tự báo
 * mình đã chết — phải có một con mắt bên ngoài.
 *
 * 🔴 RÀNG BUỘC ĐỊNH HÌNH FILE NÀY: gói Workers miễn phí giới hạn **10ms CPU mỗi lần gọi**.
 * Vì thế Worker KHÔNG chứa logic đánh giá — nó chỉ gọi lần lượt các hàm SQL trong Postgres
 * rồi gửi email. Thời gian chờ mạng không tính vào CPU time, nên cách này sống được trong
 * 10ms; viết logic bằng TypeScript ở đây thì gần như chắc chắn đâm tường.
 *
 * Worker không mở được kết nối TCP tới Postgres, nên mọi lệnh đi qua PostgREST của Supabase
 * (`/rest/v1/rpc/<tên hàm>`).
 */

export type Env = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  RESEND_API_KEY: string;
  EMAIL_NGUOI_GUI: string;
  HOP_THU_QUAN_TRI: string;
  HOP_THU_LANH_DAO: string;
};

/** Trình tự gọi. Xem `src/engine/vong-danh-gia.ts` để biết vì sao thứ tự này bắt buộc. */
const BUOC = [
  { ten: "mat_lien_lac", rpc: "soat_mat_lien_lac", tham_so: () => ({ p_im_lang_phut: 3 }) },
  { ten: "dich_vu", rpc: "soat_dich_vu", tham_so: () => ({}) },
  { ten: "cong_viec", rpc: "ghi_canh_bao_cong_viec", tham_so: () => ({}) },
  { ten: "csdl", rpc: "ghi_canh_bao_csdl", tham_so: () => ({}) },
  { ten: "thong_bao", rpc: "soan_thong_bao", tham_so: () => ({}) },
  { ten: "leo_thang", rpc: "soat_leo_thang", tham_so: () => ({}) },
] as const;

async function goiRpc(env: Env, ten: string, than: unknown): Promise<unknown> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${ten}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: env.SUPABASE_ANON_KEY,
      authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(than ?? {}),
  });
  if (!res.ok) throw new Error(`${ten} trả mã ${res.status}`);
  return res.json();
}

/**
 * Chạy một vòng.
 *
 * Mỗi bước được bọc try/catch RIÊNG: một hàm SQL hỏng không được làm chết cả vòng, vì các
 * bước sau vẫn có thể phát hiện chuyện quan trọng hơn. Lỗi được gom lại trả về để hiện
 * trong log của Cloudflare — im lặng nuốt lỗi ở một hệ cảnh báo là điều tệ nhất.
 */
export async function chayVongQuaHttp(env: Env): Promise<{ loi: string[]; buoc: number }> {
  const loi: string[] = [];
  let xong = 0;

  // Ngưỡng đọc từ bảng cấu hình, không hardcode trong Worker.
  let chiSo: string[] = [];
  try {
    const r = (await goiRpc(env, "danh_sach_chi_so_nguong", {})) as Array<{ chi_so: string }>;
    chiSo = r.map((x) => x.chi_so);
  } catch {
    // Chưa có hàm liệt kê thì dùng bộ mặc định — thà đánh giá thiếu còn hơn không đánh giá.
    chiSo = ["cpu_phan_tram", "ram_phan_tram"];
  }

  try {
    await goiRpc(env, BUOC[0].rpc, BUOC[0].tham_so());
    xong++;
  } catch (e) {
    loi.push(`${BUOC[0].ten}: ${e instanceof Error ? e.message : String(e)}`);
  }

  for (const cs of chiSo) {
    try {
      await goiRpc(env, "danh_gia_nguong", { p_chi_so: cs });
      xong++;
    } catch (e) {
      loi.push(`nguong:${cs}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  for (const b of BUOC.slice(1)) {
    try {
      await goiRpc(env, b.rpc, b.tham_so());
      xong++;
    } catch (e) {
      loi.push(`${b.ten}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { loi, buoc: xong };
}

export default {
  async scheduled(_su_kien: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    ctx.waitUntil(
      chayVongQuaHttp(env).then((kq) => {
        // Log gọn: đọc một dòng là biết vòng vừa rồi có làm gì không.
        if (kq.loi.length) console.error(`vòng lỗi ${kq.loi.length}/${kq.buoc}:`, kq.loi.join(" · "));
        else console.log(`vòng xong ${kq.buoc} bước`);
      }),
    );
  },

  /** Cửa kiểm tra bằng tay: mở URL của Worker để chạy một vòng ngay, không chờ cron. */
  async fetch(_req: Request, env: Env): Promise<Response> {
    const kq = await chayVongQuaHttp(env);
    return new Response(JSON.stringify(kq, null, 2), {
      status: kq.loi.length ? 500 : 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  },
};
