import { describe, expect, it } from "vitest";
import {
  canQuyetGi,
  cauKetLuan,
  noiThoiGian,
  soanDigestSang,
  soanEmailTuan,
  soSanhKyTruoc,
  timTuCam,
  type SoLieuTuan,
} from "../src/email/soan-cho-lanh-dao.js";

const TUAN: SoLieuTuan = {
  tu_ngay: new Date("2026-08-25T00:00:00Z"),
  den_ngay: new Date("2026-08-31T00:00:00Z"),
  so_may: 4,
  phut_ngung_phuc_vu: 78,
  phut_ngung_tuan_truoc: 120,
  so_nhan_vien_bi_chan: 12,
  su_co: [
    { ten_nghiep_vu: "máy chủ kế toán", bat_dau_luc: new Date("2026-08-27T09:00:00Z"),
      ket_thuc_luc: new Date("2026-08-27T10:18:00Z"), muc: "nghiem_trong", chi_so: "cpu_phan_tram" },
  ],
  rui_ro: [
    { dien_giai: "Máy chủ kế toán sắp hết chỗ lưu — còn khoảng 6 ngày.", con_bao_nhieu_ngay: 6 },
  ],
};

describe("kỷ luật ngôn ngữ — không rò thuật ngữ kỹ thuật", () => {
  it("email tuần KHÔNG chứa từ cấm nào", () => {
    const { tieu_de, than_thu } = soanEmailTuan(TUAN);
    expect(timTuCam(tieu_de)).toEqual([]);
    expect(timTuCam(than_thu)).toEqual([]);
  });

  it("digest sáng KHÔNG chứa từ cấm nào", () => {
    const d = soanDigestSang({
      ngay_hom_qua: new Date("2026-09-01T00:00:00Z"),
      so_may_tong: 6, so_may_binh_thuong: 6, canh_bao: [],
      backup: [{ ten_nghiep_vu: "máy chủ kế toán", thanh_cong: true, luc: new Date("2026-09-01T02:14:00Z") }],
    });
    expect(timTuCam(d.tieu_de)).toEqual([]);
    expect(timTuCam(d.than_thu)).toEqual([]);
  });

  it("bộ dò từ cấm hoạt động thật, không phải phép kiểm rỗng", () => {
    // Nếu timTuCam luôn trả mảng rỗng thì ba test trên vô nghĩa.
    expect(timTuCam("CPU đang cao và p95 vượt ngưỡng")).toContain("CPU");
    expect(timTuCam("CPU đang cao và p95 vượt ngưỡng")).toContain("p95");
  });

  it("dùng tên NGHIỆP VỤ, không lộ hostname hay địa chỉ máy", () => {
    const { than_thu } = soanEmailTuan(TUAN);
    expect(than_thu).toMatch(/máy chủ kế toán/);
    expect(than_thu).not.toMatch(/SRV-|\d+\.\d+\.\d+\.\d+/);
  });
});

describe("mọi con số đều có mốc so sánh", () => {
  it("thời gian ngừng phục vụ luôn đi kèm so sánh tuần trước", () => {
    const { than_thu } = soanEmailTuan(TUAN);
    expect(than_thu).toMatch(/1 giờ 18 phút/);
    expect(than_thu).toMatch(/ít hơn tuần trước 35%/);
  });

  it("chưa có tuần trước thì nói thẳng, KHÔNG bịa xu hướng", () => {
    const { than_thu } = soanEmailTuan({ ...TUAN, phut_ngung_tuan_truoc: null });
    expect(than_thu).toMatch(/chưa có tuần trước để so sánh/);
    expect(than_thu).not.toMatch(/nhiều hơn|ít hơn/);
  });

  it("chênh dưới 5% thì nói 'gần như bằng', không khoe con số vô nghĩa", () => {
    expect(soSanhKyTruoc(102, 100)).toBe("gần như bằng tuần trước");
  });

  it("tuần trước bằng 0 không gây chia cho 0", () => {
    expect(soSanhKyTruoc(30, 0)).toBe("tuần trước không có gián đoạn nào");
    expect(soSanhKyTruoc(0, 0)).toMatch(/bằng tuần trước/);
  });
});

describe("nói thời gian theo cách người thường hiểu", () => {
  it.each([
    [0, "không phút nào"],
    [45, "45 phút"],
    [60, "1 giờ"],
    [78, "1 giờ 18 phút"],
    [1440, "24 giờ"],
  ])("%i phút → %s", (p, mong) => {
    expect(noiThoiGian(p)).toBe(mong);
  });
});

describe("câu kết luận đặt ngay đầu — đọc 5 giây là biết", () => {
  it("mọi thứ ổn: nói thẳng là ổn", () => {
    expect(cauKetLuan({ ...TUAN, phut_ngung_phuc_vu: 0, su_co: [], rui_ro: [] }))
      .toMatch(/hoạt động ổn định, không có gián đoạn/);
  });

  it("chạy ổn nhưng có nguy cơ: cảnh báo trước khi thành sự cố", () => {
    expect(cauKetLuan({ ...TUAN, phut_ngung_phuc_vu: 0, su_co: [] }))
      .toMatch(/cần xử lý trước khi nó thành sự cố/);
  });

  it("có sự cố nghiêm trọng: nêu số lượng và tổng thời gian", () => {
    expect(cauKetLuan(TUAN)).toMatch(/1 sự cố nghiêm trọng.*1 giờ 18 phút/);
  });
});

describe("khối 'cần bạn quyết gì' — thông tin phải dẫn tới hành động", () => {
  it("có nguy cơ trong 14 ngày: liệt kê rõ việc cần duyệt", () => {
    expect(canQuyetGi(TUAN)).toMatch(/Cần anh\/chị duyệt.*sắp hết chỗ lưu/s);
  });

  it("không có gì gấp: nói thẳng là không cần quyết gì", () => {
    expect(canQuyetGi({ ...TUAN, rui_ro: [] })).toBe("Tuần này không có việc gì cần anh/chị quyết.");
  });

  it("nguy cơ còn xa (90 ngày) không làm phiền lãnh đạo", () => {
    expect(canQuyetGi({ ...TUAN, rui_ro: [{ dien_giai: "còn xa", con_bao_nhieu_ngay: 90 }] }))
      .toMatch(/không có việc gì cần/);
  });
});

describe("digest sáng — gửi CẢ KHI mọi thứ bình thường", () => {
  const binhThuong = {
    ngay_hom_qua: new Date("2026-09-01T00:00:00Z"),
    so_may_tong: 6, so_may_binh_thuong: 6, canh_bao: [],
    backup: [{ ten_nghiep_vu: "máy chủ kế toán", thanh_cong: true, luc: new Date("2026-09-01T02:14:00Z") }],
  };

  it("ngày yên bình VẪN sinh email — im lặng không phân biệt được với đã chết", () => {
    const d = soanDigestSang(binhThuong);
    expect(d.tieu_de).toMatch(/Mọi thứ bình thường/);
    expect(d.than_thu).toMatch(/6\/6 máy chủ hoạt động bình thường/);
    expect(d.than_thu).toMatch(/sao lưu thành công lúc 02:14/);
    expect(d.than_thu).toMatch(/Không có việc gì cần xử lý/);
  });

  it("sao lưu không chạy được nêu bật, không lẫn vào đám chữ", () => {
    const d = soanDigestSang({
      ...binhThuong,
      backup: [{ ten_nghiep_vu: "máy chủ kế toán", thanh_cong: false, luc: null }],
    });
    expect(d.than_thu).toMatch(/SAO LƯU KHÔNG CHẠY/);
  });

  it("có cảnh báo thì tiêu đề nói rõ số việc cần xem", () => {
    const d = soanDigestSang({
      ...binhThuong, so_may_binh_thuong: 5,
      canh_bao: [{ ten_nghiep_vu: "máy chủ bán hàng", mo_ta: "chạy chậm hơn thường lệ" }],
    });
    expect(d.tieu_de).toMatch(/1 việc cần xem/);
    expect(d.than_thu).toMatch(/máy chủ bán hàng: chạy chậm hơn thường lệ/);
  });
});

describe("email tuần đủ 5 khối theo BRD", () => {
  it("có đủ 5 mục đánh số và câu mời xem chi tiết ở cuối", () => {
    const { than_thu } = soanEmailTuan(TUAN);
    for (const n of ["1.", "2.", "3.", "4.", "5."]) expect(than_thu).toContain(n);
    expect(than_thu).toMatch(/xem chi tiết kỹ thuật/);
  });

  it("không có sự cố thì nói thẳng, không để khối trống gây hoang mang", () => {
    const { than_thu } = soanEmailTuan({ ...TUAN, su_co: [], rui_ro: [] });
    expect(than_thu).toMatch(/Không có sự cố nào trong tuần/);
    expect(than_thu).toMatch(/Chưa thấy nguy cơ nào/);
  });

  it("chỉ liệt kê tối đa 5 sự cố — email dài quá thì không ai đọc hết", () => {
    const nhieu = Array.from({ length: 9 }, (_, i) => ({
      ten_nghiep_vu: `máy ${i}`, bat_dau_luc: new Date("2026-08-27T09:00:00Z"),
      ket_thuc_luc: new Date("2026-08-27T09:30:00Z"), muc: "canh_cao" as const, chi_so: "x",
    }));
    const { than_thu } = soanEmailTuan({ ...TUAN, su_co: nhieu });
    expect((than_thu.match(/^• máy \d/gm) ?? [])).toHaveLength(5);
  });

  it("sự cố chưa kết thúc ghi 'vẫn đang xảy ra', không tính thời lượng giả", () => {
    const { than_thu } = soanEmailTuan({
      ...TUAN,
      su_co: [{ ...TUAN.su_co[0]!, ket_thuc_luc: null }],
    });
    expect(than_thu).toMatch(/vẫn đang xảy ra/);
  });
});
