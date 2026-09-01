import { describe, expect, it, vi } from "vitest";
import { chayVongQuaHttp, type Env } from "../worker/index";

const ENV: Env = {
  SUPABASE_URL: "https://vi-du.supabase.co",
  SUPABASE_ANON_KEY: "anon-key",
  RESEND_API_KEY: "re_key",
  EMAIL_NGUOI_GUI: "Giám sát <canh-bao@alerts.congty.vn>",
  HOP_THU_QUAN_TRI: "it@congty.vn",
  HOP_THU_LANH_DAO: "ceo@congty.vn",
};

/** Bắt tên hàm RPC từ URL để khẳng định TRÌNH TỰ gọi, không chỉ khẳng định "có gọi". */
const tenRpc = (url: string) => url.split("/rpc/")[1]!;

function gaFetch(kichBan: (ten: string) => { ok: boolean; body?: unknown }) {
  const daGoi: string[] = [];
  const f = vi.fn(async (url: string | URL, _init?: RequestInit) => {
    const ten = tenRpc(String(url));
    daGoi.push(ten);
    const kq = kichBan(ten);
    return {
      ok: kq.ok,
      status: kq.ok ? 200 : 500,
      json: async () => kq.body ?? [],
    } as unknown as Response;
  });
  return { f, daGoi };
}

describe("Cloudflare Worker — đồng hồ cảnh báo", () => {
  it("gọi các hàm SQL đúng TRÌNH TỰ, mất liên lạc đứng đầu và soạn thông báo đứng sau", async () => {
    const { f, daGoi } = gaFetch((ten) =>
      ten === "danh_sach_chi_so_nguong"
        ? { ok: true, body: [{ chi_so: "cpu_phan_tram" }, { chi_so: "ram_phan_tram" }] }
        : { ok: true },
    );
    vi.stubGlobal("fetch", f);

    const kq = await chayVongQuaHttp(ENV);

    expect(kq.loi).toEqual([]);
    expect(daGoi).toEqual([
      "danh_sach_chi_so_nguong",
      "soat_mat_lien_lac",
      "danh_gia_nguong",
      "danh_gia_nguong",
      "soat_dich_vu",
      "ghi_canh_bao_cong_viec",
      "ghi_canh_bao_csdl",
      "soan_thong_bao",
      "soat_leo_thang",
    ]);
    // Mất liên lạc PHẢI trước soạn thông báo, nếu không ức chế không nuốt được cảnh báo con.
    expect(daGoi.indexOf("soat_mat_lien_lac")).toBeLessThan(daGoi.indexOf("soan_thong_bao"));
    vi.unstubAllGlobals();
  });

  it("KHÔNG hardcode chỉ số: lấy danh sách từ bảng cấu hình", async () => {
    const { f, daGoi } = gaFetch((ten) =>
      ten === "danh_sach_chi_so_nguong"
        ? { ok: true, body: [{ chi_so: "dia_phan_tram" }] }
        : { ok: true },
    );
    vi.stubGlobal("fetch", f);
    await chayVongQuaHttp(ENV);
    expect(daGoi.filter((x) => x === "danh_gia_nguong")).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it("một bước hỏng KHÔNG làm chết cả vòng — các bước sau vẫn chạy", async () => {
    // Bước sau có thể phát hiện chuyện quan trọng hơn bước vừa hỏng.
    const { f, daGoi } = gaFetch((ten) => ({ ok: ten !== "soat_dich_vu" }));
    vi.stubGlobal("fetch", f);

    const kq = await chayVongQuaHttp(ENV);

    expect(kq.loi).toHaveLength(1);
    expect(kq.loi[0]).toMatch(/dich_vu.*500/);
    expect(daGoi).toContain("soan_thong_bao");
    expect(daGoi).toContain("soat_leo_thang");
    vi.unstubAllGlobals();
  });

  it("Supabase chết hoàn toàn: gom đủ lỗi, không ném ra ngoài để cron sau còn chạy", async () => {
    const { f } = gaFetch(() => ({ ok: false }));
    vi.stubGlobal("fetch", f);
    const kq = await chayVongQuaHttp(ENV);
    expect(kq.buoc).toBe(0);
    expect(kq.loi.length).toBeGreaterThan(5);
    vi.unstubAllGlobals();
  });

  it("không lấy được danh sách chỉ số thì dùng bộ mặc định — thà đánh giá thiếu còn hơn không đánh giá", async () => {
    const { f, daGoi } = gaFetch((ten) => ({ ok: ten !== "danh_sach_chi_so_nguong" }));
    vi.stubGlobal("fetch", f);
    await chayVongQuaHttp(ENV);
    expect(daGoi.filter((x) => x === "danh_gia_nguong")).toHaveLength(2);
    vi.unstubAllGlobals();
  });

  it("gửi kèm khoá anon ở cả apikey lẫn authorization — PostgREST đòi cả hai", async () => {
    const goi: RequestInit[] = [];
    const f = vi.fn(async (_u: string | URL, init?: RequestInit) => {
      goi.push(init!);
      return { ok: true, status: 200, json: async () => [] } as unknown as Response;
    });
    vi.stubGlobal("fetch", f);
    await chayVongQuaHttp(ENV);
    const h = goi[0]!.headers as Record<string, string>;
    expect(h.apikey).toBe("anon-key");
    expect(h.authorization).toBe("Bearer anon-key");
    vi.unstubAllGlobals();
  });
});
