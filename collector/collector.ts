/**
 * Collector — mảnh duy nhất phải tự viết ở phía máy khách hàng (ADR-001).
 *
 * Vòng đời: mỗi 60 giây quét tất cả exporter đã khai → gộp thành MỘT dòng rộng cho mỗi
 * máy → POST một request duy nhất lên hàm ghi_metric của Supabase.
 *
 * Ba ràng buộc thiết kế, đều có lý do cụ thể:
 *
 *  1. **Chỉ gọi ra ngoài, không mở cổng vào.** Cloud không bao giờ khởi tạo kết nối vào
 *     mạng nội bộ, nên không phải mở cổng nào trên firewall công ty.
 *  2. **Chỉ cầm token của đúng một máy, không bao giờ cầm service_role.** Máy chạy
 *     collector bị xâm nhập thì kẻ tấn công chỉ ghi được số liệu của đúng máy đó
 *     (BRD §7.2 ②).
 *  3. **Hàng đợi tại chỗ khi mất mạng.** Mất mạng 5 phút không được làm mất 5 phút dữ
 *     liệu — đó chính là quãng thời gian người ta cần nhìn lại nhất sau sự cố.
 *
 * HTTP được tiêm vào (tham số `guiHttp`) chứ không gọi fetch trực tiếp: nhờ vậy test
 * chạy được toàn bộ vòng đời mà không cần mạng, không cần tài khoản Supabase.
 */

import {
  chuyenMacos,
  chuyenWindows,
  docPrometheus,
  type DongRong,
  type LanQuet,
} from "./doc-metric";

export type CauHinhMay = {
  ten_nghiep_vu: string;
  he_dieu_hanh: "windows" | "macos";
  url_exporter: string;
  token: string;
};

export type CauHinhCollector = {
  may: CauHinhMay[];
  url_ghi_metric: string;
  /** Số nhịp giữ trong hàng đợi khi mất mạng. Mặc định 30 (≈30 phút ở nhịp 60 giây). */
  toi_da_hang_doi?: number;
};

export type GuiHttp = (url: string, than: unknown) => Promise<{ ok: boolean; trang_thai: number }>;
export type LayMetric = (url: string) => Promise<string>;

type BanGhi = { ten_nghiep_vu: string; token: string; than: Record<string, unknown> };

export type KetQuaNhip = {
  da_gui: number;
  vao_hang_doi: number;
  hang_doi_hien_tai: number;
  loi: Array<{ may: string; ly_do: string }>;
};

export class Collector {
  #cauHinh: CauHinhCollector;
  #layMetric: LayMetric;
  #guiHttp: GuiHttp;
  /** Lần quét trước của từng máy — cần để tính hiệu số bộ đếm tích lũy. */
  #quetTruoc = new Map<string, LanQuet>();
  #hangDoi: BanGhi[] = [];

  constructor(cauHinh: CauHinhCollector, layMetric: LayMetric, guiHttp: GuiHttp) {
    this.#cauHinh = cauHinh;
    this.#layMetric = layMetric;
    this.#guiHttp = guiHttp;
  }

  get soTrongHangDoi(): number {
    return this.#hangDoi.length;
  }

  /** Chạy một nhịp: quét mọi máy, gộp, rồi đẩy (kèm cả hàng đợi tồn đọng). */
  async chayMotNhip(bayGio: Date = new Date()): Promise<KetQuaNhip> {
    const loi: Array<{ may: string; ly_do: string }> = [];
    const canGui: BanGhi[] = [];

    for (const may of this.#cauHinh.may) {
      try {
        const noiDung = await this.#layMetric(may.url_exporter);
        const quetNay: LanQuet = { luc: bayGio, mau: docPrometheus(noiDung) };
        const truoc = this.#quetTruoc.get(may.ten_nghiep_vu);
        this.#quetTruoc.set(may.ten_nghiep_vu, quetNay);

        // Nhịp ĐẦU TIÊN sau khi khởi động chưa có mốc so sánh nên chưa tính được các chỉ
        // số dạng hiệu số. Bỏ qua nhịp này thay vì đẩy lên một dòng toàn null.
        if (!truoc) continue;

        const dong = may.he_dieu_hanh === "windows"
          ? chuyenWindows(truoc, quetNay)
          : chuyenMacos(truoc, quetNay);

        canGui.push({
          ten_nghiep_vu: may.ten_nghiep_vu,
          token: may.token,
          than: { thoi_diem: bayGio.toISOString(), ...(dong as unknown as Record<string, unknown>) },
        });
      } catch (e) {
        // Một máy chết không được làm sập cả nhịp: các máy còn lại vẫn phải được đẩy.
        // Và bản thân việc máy đó im lặng sẽ được cloud phát hiện bằng dead-man's switch.
        loi.push({ may: may.ten_nghiep_vu, ly_do: e instanceof Error ? e.message : String(e) });
      }
    }

    // Hàng đợi cũ đi TRƯỚC để giữ đúng thứ tự thời gian khi mạng trở lại.
    const tatCa = [...this.#hangDoi, ...canGui];
    this.#hangDoi = [];

    let daGui = 0;
    let vaoHangDoi = 0;
    for (let i = 0; i < tatCa.length; i++) {
      const bg = tatCa[i]!;
      try {
        const r = await this.#guiHttp(this.#cauHinh.url_ghi_metric, {
          p_token: bg.token,
          p_so_lieu: bg.than,
        });
        if (r.ok) {
          daGui++;
        } else if (r.trang_thai >= 500 || r.trang_thai === 429) {
          // Lỗi phía máy chủ hoặc bị chặn tốc độ → còn cứu được, giữ lại thử sau.
          this.#xepHangDoi(tatCa.slice(i));
          vaoHangDoi += tatCa.length - i;
          break;
        } else {
          // 4xx khác: token sai, dữ liệu sai. Thử lại bao nhiêu lần cũng vẫn hỏng —
          // giữ trong hàng đợi chỉ làm nghẽn dữ liệu tốt phía sau.
          loi.push({ may: bg.ten_nghiep_vu, ly_do: `bị từ chối, mã ${r.trang_thai}` });
        }
      } catch (e) {
        this.#xepHangDoi(tatCa.slice(i));
        vaoHangDoi += tatCa.length - i;
        loi.push({
          may: bg.ten_nghiep_vu,
          ly_do: e instanceof Error ? e.message : String(e),
        });
        break;
      }
    }

    return { da_gui: daGui, vao_hang_doi: vaoHangDoi, hang_doi_hien_tai: this.#hangDoi.length, loi };
  }

  /**
   * Giữ hàng đợi trong giới hạn, BỎ BẢN CŨ NHẤT khi tràn.
   *
   * Cố ý bỏ cũ chứ không bỏ mới: sau một sự cố dài, thứ người ta cần xem là diễn biến
   * gần nhất. Và hàng đợi không có trần thì mất mạng qua đêm sẽ ăn hết RAM của máy chủ
   * đang được giám sát — hệ giám sát tự gây ra sự cố là điều tệ nhất có thể xảy ra.
   */
  #xepHangDoi(them: BanGhi[]): void {
    const tran = this.#cauHinh.toi_da_hang_doi ?? 30 * Math.max(1, this.#cauHinh.may.length);
    this.#hangDoi.push(...them);
    if (this.#hangDoi.length > tran) {
      this.#hangDoi = this.#hangDoi.slice(this.#hangDoi.length - tran);
    }
  }
}

/** Dùng ở môi trường thật: fetch có timeout, chỉ gọi ra ngoài. */
export const layMetricThat: LayMetric = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`exporter trả mã ${res.status}`);
  return res.text();
};

export function taoGuiHttpThat(khoaAnon: string): GuiHttp {
  return async (url, than) => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: khoaAnon,
        authorization: `Bearer ${khoaAnon}`,
      },
      body: JSON.stringify(than),
      signal: AbortSignal.timeout(15_000),
    });
    return { ok: res.ok, trang_thai: res.status };
  };
}

export type { DongRong };
