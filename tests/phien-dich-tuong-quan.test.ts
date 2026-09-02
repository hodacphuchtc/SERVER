import { describe, expect, it } from "vitest";
import { LUAT, chonNguyenNhanGoc, xepUuTien } from "../src/phien-dich/luat-tuong-quan";
import { docCauHinhPhienDich } from "../src/phien-dich/doc-cau-hinh";
import type { AnhChup, PhatHien } from "../src/phien-dich/kieu";

const CFG = docCauHinhPhienDich();

/**
 * Ảnh chụp THẬT của MacBook Air M1 này lúc 18:55 ngày 01/09/2026 — gõ tay kiểm được bằng
 * `df -k`, `sysctl -n vm.swapusage hw.memsize hw.ncpu`, `iostat -c 2`, `pmset -g batt`.
 */
const MAY_NAY: AnhChup = {
  host_id: "m1", ten_nghiep_vu: "MacBook của tôi", he_dieu_hanh: "macos",
  muc_quan_trong: "song_con",
  so_phut_im_lang: 0.5,
  cpu_phan_tram: 17, cpu_hang_doi: 2.82, cpu_ranh: 75, so_nhan: 8,
  ram_phan_tram: 80.2, ram_tong_mb: 8192, ram_con_lai_mb: 190,
  swap_dung_mb: 6293, swap_tong_mb: 7168, swap_ra_moi_giay: 3_801_088,
  ap_luc_bo_nho: "critical",
  dia_ten: "/", dia_con_lai_gb: 3.9, dia_phan_tram_dung: 98.3,
  dia_vm_dung_gb: 8, dia_tps: 1516, snapshot_cuc_bo: 0,
  nguon_dien: "pin", pin_phan_tram: 50, pin_con_phut: 295, gioi_han_toc_do_cpu: 100,
  so_tien_trinh: 437, so_thread: 3588, tran_tien_trinh: 2048, tran_thread: 10240,
  tien_trinh_top: [
    { ten: "chrome-headless-shell", cpu: 41, ram_mb: 500, phut_song: 90 },
    { ten: "chrome-headless-shell", cpu: 27, ram_mb: 420, phut_song: 90 },
    { ten: "chrome-headless-shell", cpu: 15, ram_mb: 380, phut_song: 90 },
  ],
  cong_ra_ngoai: [3000, 59787], dich_vu_loi: ["com.apple.Siri.agent", "com.adobe.X", "com.apple.Y"],
  so_phut_dia_thap: 45, so_phut_swap_cao: 45, so_phut_tai_cao_cpu_ranh: 20,
  so_canh_bao_dang_mo: 3, co_nghiem_trong_chua_nhan: true,
};

/**
 * Bốn triệu chứng mà engine đang báo rời rạc cho cùng một sự cố.
 *
 * Mỗi cái nằm ở TRỤ THẬT của nó — swap và áp lực bộ nhớ thuộc trụ bộ nhớ, tải thuộc trụ
 * bộ xử lý. Không gán bừa hết vào trụ lưu trữ cho vừa luật: luật phải khai báo được nó
 * vắt qua trụ nào, chứ không phải dữ liệu bị bóp méo cho khớp luật.
 */
const TRIEU_CHUNG: PhatHien[] = [
  { ma: "swap_cao", chi_so: "swap_dung_ty_le", gia_tri: 0.878, nguong: 0.8,
    muc: "nghiem_trong", tru: "bo_nho", cau: "Vùng nhớ tạm đã dùng 87,8%." },
  { ma: "ap_luc_bo_nho", chi_so: "ap_luc_bo_nho", gia_tri: 2, nguong: 2,
    muc: "nghiem_trong", tru: "bo_nho", cau: "Bộ nhớ đã cạn." },
  { ma: "dia_phan_tram", chi_so: "dia_phan_tram_dung", gia_tri: 98.3, nguong: 90,
    muc: "nghiem_trong", tru: "cho_luu_tru", cau: "Ổ đĩa đã dùng 98,3%." },
  { ma: "tai_cao", chi_so: "cpu_hang_doi", gia_tri: 2.82, nguong: null,
    muc: "canh_cao", tru: "bo_xu_ly", cau: "Có 2,8 việc đang xếp hàng chờ." },
];

const chon = (f: AnhChup, ph: PhatHien[] = TRIEU_CHUNG) => chonNguyenNhanGoc(f, ph, CFG);

describe("1.3 — luật tương quan: bốn triệu chứng là MỘT sự cố", () => {
  it("🔴 CA MÁY THẬT: ra đúng MỘT nguyên nhân gốc là ổ đĩa, độ tin cậy chắc chắn", () => {
    const kq = chon(MAY_NAY);
    expect(kq.goc).not.toBeNull();
    expect(kq.goc!.ma).toBe("dia-day-keo-sup-bo-nho");
    // Cả ba điều kiện củng cố đều khớp: tải cao mà CPU rảnh · vùng nhớ ảo 8 GB · RAM cạn.
    expect(kq.goc!.do_tin_cay).toBe("chac_chan");
    expect(kq.goc!.cau_nhan_dinh).toMatch(/Ổ đĩa chỉ còn 3\.9 GB/);
    expect(kq.goc!.nguyen_nhan).toMatch(/hệ quả, không phải nguyên nhân riêng/);
  });

  it("bốn triệu chứng bị hạ xuống thành BẰNG CHỨNG, không còn báo ngang hàng", () => {
    const kq = chon(MAY_NAY);
    const maBangChung = kq.goc!.bang_chung.map((b) => b.ma).sort();
    expect(maBangChung).toEqual(["ap_luc_bo_nho", "dia_phan_tram", "swap_cao", "tai_cao"]);
    // Và chúng KHÔNG được xuất hiện lại ở danh sách nhận định khác.
    for (const ma of maBangChung) {
      expect(kq.khac.some((n) => n.ma === ma)).toBe(false);
    }
    expect(kq.da_gop).toHaveLength(1);
    expect(kq.da_gop[0]!.ma_luat).toBe("dia-day-keo-sup-bo-nho");
    expect([...kq.da_gop[0]!.nuot].sort()).toEqual(maBangChung);
  });

  it("toàn báo cáo chỉ còn ĐÚNG MỘT nhận định mức nghiêm trọng", () => {
    const kq = chon(MAY_NAY);
    const nghiemTrong = [kq.goc!, ...kq.khac].filter((n) => n.muc === "nghiem_trong");
    expect(nghiemTrong).toHaveLength(1);
  });

  it("🔴 CHỐT ④: 'đĩa đầy' KHÔNG được nuốt 'sao lưu thất bại' — khác trụ", () => {
    // Không có chốt này, một luật ưu tiên cao sẽ dần nuốt hết mọi thứ và hệ thống lại im lặng.
    const backup: PhatHien = {
      ma: "backup_tre", chi_so: "cong_viec:backup", gia_tri: 30, nguong: 28,
      muc: "nghiem_trong", tru: "sao_luu", cau: "Sao lưu đã trễ 30 giờ.",
    };
    const kq = chon(MAY_NAY, [...TRIEU_CHUNG, backup]);
    expect(kq.goc!.bang_chung.some((b) => b.ma === "backup_tre")).toBe(false);
    expect(kq.khac.some((n) => n.ma === "backup_tre")).toBe(true);
  });

  it("🔴 CHỐT ③: KHÔNG BAO GIỜ nuốt 'mất liên lạc' — máy im lặng luôn phải báo riêng", () => {
    const matLienLac: PhatHien = {
      ma: "mat_lien_lac", chi_so: "mat_lien_lac", gia_tri: 12, nguong: 3,
      muc: "nghiem_trong", tru: "bo_nho", cau: "Máy đã ngừng gửi số liệu 12 phút.",
    };
    // Cố tình đặt CÙNG TRỤ với gốc và thêm vào danh sách nuốt để chứng minh chốt ③ chặn
    // được kể cả khi ba chốt kia đều cho qua.
    const luatCoTinhSai = LUAT.map((l) =>
      l.ma === "dia-day-keo-sup-bo-nho" ? { ...l, nuot: [...l.nuot, "mat_lien_lac"] } : l);
    const kq = chonNguyenNhanGoc(MAY_NAY, [...TRIEU_CHUNG, matLienLac], CFG, luatCoTinhSai);
    expect(kq.goc!.bang_chung.some((b) => b.ma === "mat_lien_lac")).toBe(false);
    expect(kq.khac.some((n) => n.ma === "mat_lien_lac")).toBe(true);
  });

  it("🔴 CHỐT ②: chưa đủ điều kiện củng cố → 'phỏng đoán' → KHÔNG nuốt gì cả", () => {
    // Đĩa đầy và swap cao (đủ điều kiện bắt buộc) nhưng không dấu hiệu củng cố nào:
    // CPU không rảnh, vùng nhớ ảo nhỏ, RAM còn nhiều. Giả thuyết chưa đủ vững để gom
    // triệu chứng — gom lúc này là dẫn người ta đi sai đường.
    const yeu: AnhChup = {
      ...MAY_NAY, cpu_ranh: 5, dia_vm_dung_gb: 0.2, ram_con_lai_mb: 4000,
    };
    const kq = chon(yeu);
    expect(kq.goc!.do_tin_cay).toBe("phong_doan");
    expect(kq.goc!.bang_chung).toHaveLength(0);
    expect(kq.da_gop).toHaveLength(0);
    // Mọi triệu chứng phải được báo riêng.
    for (const p of TRIEU_CHUNG) expect(kq.khac.some((n) => n.ma === p.ma)).toBe(true);
  });

  it("luật THUA vẫn góp việc cần làm — một gốc để BÁO, nhiều đòn bẩy để LÀM", () => {
    // 6 tiến trình trình duyệt sót thua luật đĩa, nhưng đóng chúng vẫn trả lại ~1,3 GB
    // bộ nhớ nên việc đó phải nằm trong danh sách của nguyên nhân gốc.
    const kq = chon(MAY_NAY);
    expect(kq.goc!.hanh_dong.some((h) => h.ma === "dong-tien-trinh-sot")).toBe(true);
    expect(kq.goc!.hanh_dong.some((h) => h.ma === "khoi-dong-lai-may")).toBe(true);
  });

  it("đĩa còn RỘNG nhưng swap cao → gốc chuyển sang 'bộ nhớ thiếu thật'", () => {
    const rongDia: AnhChup = { ...MAY_NAY, dia_con_lai_gb: 120, dia_phan_tram_dung: 40 };
    const kq = chon(rongDia);
    expect(kq.goc!.ma).toBe("bo-nho-thieu-that");
    expect(kq.goc!.cau_nhan_dinh).toMatch(/trong khi ổ đĩa vẫn còn rộng/);
  });

  it("máy khoẻ → không có nguyên nhân gốc nào", () => {
    const khoe: AnhChup = {
      ...MAY_NAY,
      dia_con_lai_gb: 120, dia_phan_tram_dung: 40, dia_vm_dung_gb: 1,
      swap_dung_mb: 100, swap_ra_moi_giay: 0, ap_luc_bo_nho: "normal",
      ram_con_lai_mb: 4000, cpu_hang_doi: 0.3, cpu_ranh: 95,
      nguon_dien: "dien", tien_trinh_top: [], cong_ra_ngoai: [], dich_vu_loi: [],
      so_phut_dia_thap: 0, so_phut_swap_cao: 0, so_phut_tai_cao_cpu_ranh: 0,
    };
    expect(chon(khoe, []).goc).toBeNull();
  });

  it("máy chạy PIN vẫn báo riêng — khác trụ nên không bị luật đĩa nuốt", () => {
    const kq = chon(MAY_NAY);
    expect(kq.khac.some((n) => n.ma === "may-chu-chay-bang-pin")).toBe(true);
    const pin = kq.khac.find((n) => n.ma === "may-chu-chay-bang-pin")!;
    expect(pin.cau_nhan_dinh).toMatch(/sống còn nhưng đang chạy bằng pin/);
    expect(pin.thoi_gian_con_lai!.cau).toMatch(/4 giờ 55 phút/);
  });

  it("thứ tự hành động: hiệu quả cao trước, rủi ro thấp trước, nhanh trước — không trùng", () => {
    const ds = xepUuTien([
      { ma: "a", viec: "a", rui_ro: "khong", giai_thich_rui_ro: "", phut_uoc_tinh: 10,
        hieu_qua: "", hieu_qua_uoc_luong: 5, can_khoi_dong_lai: false },
      { ma: "b", viec: "b", rui_ro: "khong", giai_thich_rui_ro: "", phut_uoc_tinh: 1,
        hieu_qua: "", hieu_qua_uoc_luong: 20, can_khoi_dong_lai: false },
      { ma: "c", viec: "c", rui_ro: "can_can_nhac", giai_thich_rui_ro: "", phut_uoc_tinh: 1,
        hieu_qua: "", hieu_qua_uoc_luong: 20, can_khoi_dong_lai: false },
      { ma: "b", viec: "b trùng", rui_ro: "khong", giai_thich_rui_ro: "", phut_uoc_tinh: 1,
        hieu_qua: "", hieu_qua_uoc_luong: 20, can_khoi_dong_lai: false },
    ]);
    expect(ds.map((h) => h.ma)).toEqual(["b", "c", "a"]);
  });

  it("MỌI nhận định gốc đều có hành động và có hệ quả — cấm nhận định không dẫn tới việc gì", () => {
    for (const f of [MAY_NAY, { ...MAY_NAY, dia_con_lai_gb: 120, dia_phan_tram_dung: 40 }]) {
      const kq = chon(f);
      expect(kq.goc!.hanh_dong.length).toBeGreaterThan(0);
      expect(kq.goc!.neu_khong_lam_gi.length).toBeGreaterThan(20);
    }
  });

  it("tắt một luật trong config thì nó không còn được chọn", () => {
    const tat = { ...CFG, luatTuongQuan: {
      ...CFG.luatTuongQuan,
      "dia-day-keo-sup-bo-nho": { ...CFG.luatTuongQuan["dia-day-keo-sup-bo-nho"]!, bat: false },
    } };
    const kq = chonNguyenNhanGoc(MAY_NAY, TRIEU_CHUNG, tat);
    expect(kq.goc!.ma).not.toBe("dia-day-keo-sup-bo-nho");
  });
});

describe("thứ tự việc cần làm — hiệu quả trên mỗi phút, không phải hiệu quả thô", () => {
  it("🔴 việc 2 phút phải đứng TRƯỚC việc 8 tiếng, dù hiệu quả tuyệt đối nhỏ hơn", () => {
    // Đo trên máy thật: sắp theo hiệu quả thô cho ra "Cân nhắc nâng dung lượng bộ nhớ
    // (~480 phút, cần duyệt chi)" đứng trước "Đóng bớt ứng dụng (~2 phút)". Người đang
    // xử lý sự cố cần việc làm được NGAY ở đầu danh sách.
    const ds = xepUuTien([
      { ma: "nang-bo-nho", viec: "Nâng bộ nhớ", rui_ro: "can_can_nhac",
        giai_thich_rui_ro: "", phut_uoc_tinh: 480, hieu_qua: "", hieu_qua_uoc_luong: 50,
        can_khoi_dong_lai: false },
      { ma: "dong-ung-dung", viec: "Đóng bớt ứng dụng", rui_ro: "thap",
        giai_thich_rui_ro: "", phut_uoc_tinh: 2, hieu_qua: "", hieu_qua_uoc_luong: 3,
        can_khoi_dong_lai: false },
    ]);
    expect(ds.map((h) => h.ma)).toEqual(["dong-ung-dung", "nang-bo-nho"]);
  });

  it("việc cần duyệt chi luôn nằm CUỐI danh sách của nguyên nhân gốc", () => {
    const kq = chon(MAY_NAY);
    const ds = kq.goc!.hanh_dong;
    const iThemO = ds.findIndex((h) => h.rui_ro === "can_can_nhac");
    if (iThemO >= 0) expect(iThemO).toBe(ds.length - 1);
  });
});
