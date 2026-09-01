/**
 * Soạn email cho lãnh đạo — kênh CHÍNH đưa thông tin tới ban lãnh đạo ở v1.
 *
 * Vì sao là email chứ không phải dashboard: không ai có thói quen mở một trang web để
 * nghe tin tốt. Một CEO của công ty vài máy chủ sẽ mở dashboard đúng ba lần — hôm bàn
 * giao, hôm có sự cố lớn, và hôm có khách tới thăm. Thứ đến được với lãnh đạo là thứ tự
 * tìm đến họ.
 *
 * BA KỶ LUẬT BẮT BUỘC (test canh cả ba, không phải lời dặn suông):
 *  1. Không một thuật ngữ kỹ thuật nào — kể cả tên máy thật, chỉ dùng tên nghiệp vụ.
 *  2. Mọi con số phải có mốc so sánh và một câu diễn giải. Con số trần trụi bị cấm.
 *  3. Luôn kết bằng "cần bạn quyết gì" — thông tin không dẫn tới hành động là nhiễu.
 */

/** Từ cấm xuất hiện trong bất cứ thứ gì gửi tới lãnh đạo. */
export const TU_CAM = [
  "p95", "p99", "5xx", "4xx", "swap", "exporter", "collector", "RLS", "CPU", "RAM",
  "host_id", "jsonb", "partition", "hysteresis", "SQL", "API", "endpoint", "latency",
  "uptime", "SLO", "SLA", "cron", "webhook", "payload",
];

export type SuCo = {
  ten_nghiep_vu: string;
  bat_dau_luc: Date;
  ket_thuc_luc: Date | null;
  muc: "canh_cao" | "nghiem_trong";
  chi_so: string;
};

export type RuiRoSapToi = {
  /** Câu tiếng Việt đã viết sẵn, ví dụ "Máy chủ kế toán sắp hết chỗ lưu — còn khoảng 6 ngày". */
  dien_giai: string;
  con_bao_nhieu_ngay: number | null;
};

export type SoLieuTuan = {
  tu_ngay: Date;
  den_ngay: Date;
  so_may: number;
  phut_ngung_phuc_vu: number;
  phut_ngung_tuan_truoc: number | null;
  so_nhan_vien_bi_chan: number;
  su_co: SuCo[];
  rui_ro: RuiRoSapToi[];
};

const ngay = (d: Date) =>
  `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/**
 * Đổi số phút thành cách nói của người thường.
 *
 * "78 phút" đúng nhưng không gợi được cảm giác; "1 giờ 18 phút" thì có. Đây là loại chi
 * tiết quyết định email có được đọc hết hay không.
 */
export function noiThoiGian(phut: number): string {
  if (phut <= 0) return "không phút nào";
  if (phut < 60) return `${Math.round(phut)} phút`;
  const gio = Math.floor(phut / 60);
  const du = Math.round(phut % 60);
  return du === 0 ? `${gio} giờ` : `${gio} giờ ${du} phút`;
}

/** So sánh với kỳ trước. Không có kỳ trước thì nói thẳng là chưa có, không bịa xu hướng. */
export function soSanhKyTruoc(nay: number, truoc: number | null): string {
  if (truoc === null) return "chưa có tuần trước để so sánh";
  if (truoc === 0 && nay === 0) return "bằng tuần trước, cùng không có gián đoạn nào";
  if (truoc === 0) return "tuần trước không có gián đoạn nào";
  const lech = Math.round(((nay - truoc) / truoc) * 100);
  if (Math.abs(lech) < 5) return "gần như bằng tuần trước";
  return lech > 0 ? `nhiều hơn tuần trước ${lech}%` : `ít hơn tuần trước ${Math.abs(lech)}%`;
}

/** Kết luận một câu, đặt ngay đầu email để đọc 5 giây là biết. */
export function cauKetLuan(s: SoLieuTuan): string {
  const nghiemTrong = s.su_co.filter((x) => x.muc === "nghiem_trong").length;
  const ruiRoGap = s.rui_ro.filter((r) => r.con_bao_nhieu_ngay !== null && r.con_bao_nhieu_ngay <= 14);

  if (nghiemTrong === 0 && s.phut_ngung_phuc_vu === 0 && ruiRoGap.length === 0) {
    return "Tuần qua hệ thống hoạt động ổn định, không có gián đoạn nào.";
  }
  if (ruiRoGap.length > 0 && nghiemTrong === 0) {
    return "Tuần qua hệ thống chạy ổn, nhưng có việc cần xử lý trước khi nó thành sự cố.";
  }
  if (nghiemTrong > 0) {
    return `Tuần qua có ${nghiemTrong} sự cố nghiêm trọng, tổng cộng ${noiThoiGian(s.phut_ngung_phuc_vu)} ngừng phục vụ.`;
  }
  return `Tuần qua có gián đoạn nhẹ, tổng cộng ${noiThoiGian(s.phut_ngung_phuc_vu)}.`;
}

/** Khối "cần bạn quyết gì" — không có việc cần quyết thì nói thẳng là không có. */
export function canQuyetGi(s: SoLieuTuan): string {
  const gap = s.rui_ro.filter((r) => r.con_bao_nhieu_ngay !== null && r.con_bao_nhieu_ngay <= 14);
  if (gap.length === 0) return "Tuần này không có việc gì cần anh/chị quyết.";
  const dong = gap.map((r) => `• ${r.dien_giai}`).join("\n");
  return `Cần anh/chị duyệt để xử lý trước khi thành sự cố:\n${dong}`;
}

export function soanEmailTuan(s: SoLieuTuan): { tieu_de: string; than_thu: string } {
  const tieu_de = `Tình hình hệ thống tuần ${ngay(s.tu_ngay)}–${ngay(s.den_ngay)}`;

  const khoiSuCo = s.su_co.length === 0
    ? "Không có sự cố nào trong tuần."
    : s.su_co
        .slice(0, 5)
        .map((x) => {
          const dai = x.ket_thuc_luc
            ? noiThoiGian((x.ket_thuc_luc.getTime() - x.bat_dau_luc.getTime()) / 60000)
            : "vẫn đang xảy ra";
          return `• ${x.ten_nghiep_vu} — ngày ${ngay(x.bat_dau_luc)}, kéo dài ${dai}`;
        })
        .join("\n");

  const khoiRuiRo = s.rui_ro.length === 0
    ? "Chưa thấy nguy cơ nào trong thời gian tới."
    : s.rui_ro.map((r) => `• ${r.dien_giai}`).join("\n");

  const than_thu = [
    cauKetLuan(s),
    "",
    `1. Thời gian ngừng phục vụ: ${noiThoiGian(s.phut_ngung_phuc_vu)} — ${soSanhKyTruoc(s.phut_ngung_phuc_vu, s.phut_ngung_tuan_truoc)}.`,
    "",
    `2. Số người bị gián đoạn công việc: ${s.so_nhan_vien_bi_chan} người.`,
    "",
    "3. Những gì đã xảy ra:",
    khoiSuCo,
    "",
    "4. Những gì sắp xảy ra:",
    khoiRuiRo,
    "",
    `5. ${canQuyetGi(s)}`,
    "",
    `— Báo cáo tự động, theo dõi ${s.so_may} máy chủ. Bấm vào đây để xem chi tiết kỹ thuật.`,
  ].join("\n");

  return { tieu_de, than_thu };
}

export type SoLieuDigest = {
  ngay_hom_qua: Date;
  so_may_tong: number;
  so_may_binh_thuong: number;
  canh_bao: Array<{ ten_nghiep_vu: string; mo_ta: string }>;
  backup: Array<{ ten_nghiep_vu: string; thanh_cong: boolean; luc: Date | null }>;
};

/**
 * Digest hằng ngày — BẮT BUỘC gửi kể cả khi mọi thứ bình thường.
 *
 * Đây không phải thừa thãi mà là cơ chế sống còn: im lặng tuyệt đối **không phân biệt
 * được** với "hệ thống giám sát đã chết". Nếu chỉ gửi khi có sự cố thì một collector chết
 * âm thầm sẽ trông y hệt một tuần yên bình, và người ta chỉ phát hiện vào đúng ngày cần
 * nó nhất.
 */
export function soanDigestSang(s: SoLieuDigest): { tieu_de: string; than_thu: string } {
  const moiThuOn = s.canh_bao.length === 0 && s.so_may_binh_thuong === s.so_may_tong;
  const tieu_de = moiThuOn
    ? `Mọi thứ bình thường — ${ngay(s.ngay_hom_qua)}`
    : `${s.canh_bao.length} việc cần xem — ${ngay(s.ngay_hom_qua)}`;

  const dongBackup = s.backup.length === 0
    ? "Chưa cấu hình theo dõi sao lưu."
    : s.backup
        .map((b) =>
          b.thanh_cong && b.luc
            ? `• ${b.ten_nghiep_vu}: sao lưu thành công lúc ${String(b.luc.getUTCHours()).padStart(2, "0")}:${String(b.luc.getUTCMinutes()).padStart(2, "0")}`
            : `• ${b.ten_nghiep_vu}: SAO LƯU KHÔNG CHẠY`,
        )
        .join("\n");

  const than_thu = moiThuOn
    ? [
        `Đêm qua ${s.so_may_binh_thuong}/${s.so_may_tong} máy chủ hoạt động bình thường.`,
        "",
        dongBackup,
        "",
        "Không có việc gì cần xử lý.",
      ].join("\n")
    : [
        `Đêm qua ${s.so_may_binh_thuong}/${s.so_may_tong} máy chủ hoạt động bình thường.`,
        "",
        "Cần xem:",
        s.canh_bao.map((c) => `• ${c.ten_nghiep_vu}: ${c.mo_ta}`).join("\n"),
        "",
        dongBackup,
      ].join("\n");

  return { tieu_de, than_thu };
}

/** Soi một đoạn văn xem có rò thuật ngữ kỹ thuật không. Dùng trong test và ở lớp gửi. */
export function timTuCam(van_ban: string): string[] {
  return TU_CAM.filter((t) => new RegExp(`\\b${t}\\b`, "i").test(van_ban));
}
