import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  apLucBoNho,
  catTenTienTrinh,
  chuyenMacos,
  chuyenWindows,
  docPrometheus,
  tinhCpuPhanTram,
  type LanQuet,
} from "../collector/doc-metric.js";

const doc = (ten: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${ten}`, import.meta.url)), "utf8");

const TRUOC = new Date("2026-09-01T10:00:00Z");
const SAU = new Date("2026-09-01T10:01:00Z"); // cách nhau đúng 60 giây

const quet = (ten: string, luc: Date): LanQuet => ({ luc, mau: docPrometheus(doc(ten)) });

describe("đọc định dạng Prometheus", () => {
  it("đọc được metric có nhãn và không nhãn", () => {
    const m = docPrometheus(`# HELP bỏ qua dòng này
metric_khong_nhan 42
metric_co_nhan{a="1",b="hai"} 3.14
`);
    expect(m).toHaveLength(2);
    expect(m[0]).toEqual({ ten: "metric_khong_nhan", nhan: {}, gia_tri: 42 });
    expect(m[1]!.nhan).toEqual({ a: "1", b: "hai" });
    expect(m[1]!.gia_tri).toBeCloseTo(3.14);
  });

  it("đọc được ký hiệu khoa học (exporter dùng rất nhiều)", () => {
    expect(docPrometheus("x 1.7179869184e+10")[0]!.gia_tri).toBe(17179869184);
  });

  it("nhãn chứa dấu phẩy không làm vỡ parser", () => {
    // windows_exporter dùng core="0,0" — tách thô bằng split(",") là hỏng ngay.
    const m = docPrometheus(`windows_cpu_time_total{core="0,0",mode="idle"} 800`);
    expect(m[0]!.nhan).toEqual({ core: "0,0", mode: "idle" });
  });

  it("bỏ qua dòng rỗng, chú thích và dòng hỏng", () => {
    expect(docPrometheus("\n# chú thích\nhong_co_gia_tri\nx khong_phai_so\ny 1")).toHaveLength(1);
  });
});

describe("tính CPU từ hiệu số hai lần quét", () => {
  it("Windows: idle tăng 96/112 giây → CPU ≈ 14%", () => {
    const r = tinhCpuPhanTram(
      quet("windows-exporter.txt", TRUOC),
      quet("windows-exporter-sau.txt", SAU),
      "windows_cpu_time_total",
    );
    expect(r).toBeCloseTo(14.29, 1);
  });

  it("macOS: idle tăng 60/112 giây → CPU ≈ 46%", () => {
    const r = tinhCpuPhanTram(
      quet("node-exporter-darwin.txt", TRUOC),
      quet("node-exporter-darwin-sau.txt", SAU),
      "node_cpu_seconds_total",
    );
    expect(r).toBeCloseTo(46.43, 1);
  });

  it("exporter khởi động lại (bộ đếm tụt): trả null chứ KHÔNG bịa số", () => {
    const truoc = quet("windows-exporter-sau.txt", TRUOC);
    const sau = quet("windows-exporter.txt", SAU); // ngược thứ tự = bộ đếm tụt
    expect(tinhCpuPhanTram(truoc, sau, "windows_cpu_time_total")).toBeNull();
  });

  it("hai lần quét trùng nhau: trả null", () => {
    const q = quet("windows-exporter.txt", TRUOC);
    expect(tinhCpuPhanTram(q, q, "windows_cpu_time_total")).toBeNull();
  });
});

describe("chuyển sang dòng rộng — Windows", () => {
  const d = chuyenWindows(
    quet("windows-exporter.txt", TRUOC),
    quet("windows-exporter-sau.txt", SAU),
  );

  it("mọi chỉ số bắt buộc đều ra số hợp lệ, không NaN không undefined", () => {
    for (const k of ["cpu_phan_tram", "cpu_hang_doi", "ram_phan_tram", "ram_tong_mb",
                     "ram_con_lai_mb", "mang_vao_byte_moi_giay", "uptime_giay"] as const) {
      expect(d[k], `chỉ số ${k}`).not.toBeNull();
      expect(Number.isFinite(d[k] as number), `chỉ số ${k} phải là số`).toBe(true);
    }
  });

  it("RAM: 16GB tổng, còn 4GB → dùng 75%", () => {
    expect(d.ram_tong_mb).toBe(16384);
    expect(d.ram_con_lai_mb).toBe(4096);
    expect(d.ram_phan_tram).toBeCloseTo(75, 1);
  });

  it("đĩa: lấy 2 ổ thật, BỎ phân vùng hệ thống HarddiskVolume", () => {
    expect(d.dia.map((x) => x.ten)).toEqual(["C:", "D:"]);
    expect(d.dia[0]!.phan_tram_dung).toBeCloseTo(90, 1);
  });

  it("mạng: 600.000 byte trong 60 giây → 10.000 byte/giây, BỎ loopback", () => {
    expect(d.mang_vao_byte_moi_giay).toBe(10_000);
    expect(d.mang_ra_byte_moi_giay).toBe(5_000);
  });

  it("dịch vụ: bắt đúng Spooler đang dừng, không bắt nhầm MSSQLSERVER đang chạy", () => {
    expect(d.dich_vu_thieu).toEqual(["Spooler"]);
  });

  it("tải trung bình 15 phút để NULL — Windows không có, thà bỏ trống còn hơn bịa", () => {
    expect(d.tai_trung_binh_15p).toBeNull();
  });
});

describe("chuyển sang dòng rộng — macOS", () => {
  const d = chuyenMacos(
    quet("node-exporter-darwin.txt", TRUOC),
    quet("node-exporter-darwin-sau.txt", SAU),
  );

  it("mọi chỉ số bắt buộc đều ra số hợp lệ", () => {
    for (const k of ["cpu_phan_tram", "cpu_hang_doi", "tai_trung_binh_15p", "ram_tong_mb",
                     "ram_con_lai_mb", "swap_vao_moi_giay", "uptime_giay"] as const) {
      expect(d[k], `chỉ số ${k}`).not.toBeNull();
      expect(Number.isFinite(d[k] as number), `chỉ số ${k} phải là số`).toBe(true);
    }
  });

  it("RAM trống CỘNG cả inactive — không cộng là báo động giả liên tục trên macOS", () => {
    // free 1GB + inactive 2GB = 3GB trên tổng 16GB
    expect(d.ram_con_lai_mb).toBe(3072);
    expect(d.ram_phan_tram).toBeCloseTo(81.3, 1);
  });

  it("có áp lực bộ nhớ và tốc độ swap — hai chỉ số cảnh báo RAM THẬT của macOS", () => {
    expect(d.ap_luc_bo_nho).not.toBeNull();
    // 18.000 trang trong 60 giây × 4096 byte = 1.228.800 byte/giây
    expect(d.swap_vao_moi_giay).toBe(300 * 4096);
  });

  it("đĩa: lấy ổ apfs, BỎ devfs (filesystem ảo luôn gần đầy)", () => {
    expect(d.dia.map((x) => x.ten)).toEqual(["/"]);
    expect(d.dia[0]!.con_lai_gb).toBeCloseTo(40, 0);
  });

  it("mạng: bỏ lo0", () => {
    expect(d.mang_vao_byte_moi_giay).toBe(20_000);
  });

  it("có load average — thứ Windows không có", () => {
    expect(d.cpu_hang_doi).toBeCloseTo(3.2);
    expect(d.tai_trung_binh_15p).toBeCloseTo(2.1);
  });
});

describe("áp lực bộ nhớ macOS", () => {
  const mau = (wired: number, nen: number) =>
    docPrometheus(`node_memory_total_bytes 16000000000
node_memory_wired_bytes ${wired}
node_memory_compressed_bytes ${nen}`);

  it("wired+nén dưới 60% và không swap: bình thường", () => {
    expect(apLucBoNho(mau(4e9, 1e9), 0)).toBe("normal");
  });

  it("wired+nén trên 80%: nghiêm trọng", () => {
    expect(apLucBoNho(mau(1.0e10, 3e9), 0)).toBe("critical");
  });

  it("swap-in trên 10 MB/giây là nghiêm trọng dù wired thấp", () => {
    // Máy đang phải đọc ngược dữ liệu từ đĩa — đây mới là "hết RAM" thật.
    expect(apLucBoNho(mau(2e9, 1e9), 3000)).toBe("critical");
  });

  it("không có metric bộ nhớ: trả null chứ không đoán", () => {
    expect(apLucBoNho([], 0)).toBeNull();
  });
});

describe("cắt tên tiến trình — hàng rào dữ liệu cá nhân ở phía collector", () => {
  it.each([
    ["C:\\Program Files\\app\\sqlservr.exe", "sqlservr.exe"],
    ["/usr/local/bin/postgres", "postgres"],
    ["node server.js --db-password hunter2", "node server.js"],
    ["/Users/nguyen.van.a/Library/app --token abc", "app"],
    ["sqlservr.exe", "sqlservr.exe"],
  ])("%s → %s", (vao, ra) => {
    expect(catTenTienTrinh(vao)).toBe(ra);
  });

  it("kết quả không bao giờ còn dấu gạch chéo hay tham số", () => {
    for (const x of ["C:\\a\\b\\c.exe", "/x/y/z --p 1", "app --user=admin"]) {
      const r = catTenTienTrinh(x);
      expect(r).not.toMatch(/[\\/]/);
      expect(r).not.toMatch(/\s-{1,2}\w/);
    }
  });
});
