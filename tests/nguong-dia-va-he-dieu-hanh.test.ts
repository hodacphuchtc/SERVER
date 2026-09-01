import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { napMigration, taoPartitionNgay } from "../src/db/nap-migration";
import { napCauHinhNguong } from "../src/db/nap-cau-hinh";

const TOKEN_WIN = "token-may-windows-0123456789abcdefghij";
const TOKEN_MAC = "token-may-macos-0123456789abcdefghijkl";
const MOC = new Date("2026-09-01T10:00:00Z");

describe("1.2 — engine đọc nốt các ngưỡng đã khai từ lâu", () => {
  let db: PGlite;

  beforeEach(async () => {
    db = new PGlite();
    await napMigration(db);
    await napCauHinhNguong(db);
    await taoPartitionNgay(db, MOC);
    await db.exec(`
      insert into public.hosts (ten_nghiep_vu, he_dieu_hanh, muc_quan_trong, token_bam, lan_day_du_lieu_cuoi)
      values ('máy windows','windows','song_con',
              encode(sha256(convert_to('${TOKEN_WIN}','utf8')),'hex'), '${MOC.toISOString()}'),
             ('máy mac','macos','song_con',
              encode(sha256(convert_to('${TOKEN_MAC}','utf8')),'hex'), '${MOC.toISOString()}');
    `);
  });

  /** Ghi `n` nhịp giống nhau, nhịp cuối tại MOC — đủ dài để qua cửa duration. */
  async function ghi(token: string, n: number, payload: Record<string, unknown>) {
    for (let i = 0; i < n; i++) {
      const t = new Date(MOC.getTime() - (n - 1 - i) * 60_000);
      await db.query(`select public.ghi_metric($1, $2::jsonb)`,
        [token, JSON.stringify({ thoi_diem: t.toISOString(), ...payload })]);
    }
  }

  const danhGia = async (chiSo: string) => (await db.query<{
    ten_may: string; hanh_dong: string; muc_moi: string | null; gia_tri_hien_tai: number;
  }>(`select * from public.danh_gia_nguong($1, $2::timestamptz)`,
    [chiSo, MOC.toISOString()])).rows;

  const canhBao = async () => (await db.query<{
    chi_so: string; muc: string; gia_tri: number; nguong: number; dien_giai: string; anh_huong: string;
  }>(`select chi_so, muc, gia_tri, nguong, dien_giai, anh_huong from public.alerts
       where ket_thuc_luc is null order by chi_so`)).rows;

  const dia = (conLaiGb: number, phanTram: number) =>
    [{ ten: "/", tong_gb: 200, con_lai_gb: conLaiGb, phan_tram_dung: phanTram }];

  it("🔴 ĐĨA CÒN ÍT GB: trước đây engine hoàn toàn mù, nay bắn nghiêm trọng", async () => {
    // Đúng tình trạng máy thật: 3,9 GB trống. Ngưỡng nghiêm trọng trong config là 10 GB.
    // `dia` là jsonb nên nhánh CASE cũ (chỉ đọc cột số) không thấy nó — đó là lý do một
    // ngưỡng khai từ ngày đầu chưa bao giờ có tác dụng.
    await ghi(TOKEN_MAC, 16, { dia: dia(3.9, 98.3) });
    const kq = await danhGia("dia_con_lai_gb");
    expect(kq.find((r) => r.ten_may === "máy mac")!.hanh_dong).toBe("mo_canh_bao");

    const cb = (await canhBao()).find((c) => c.chi_so === "dia_con_lai_gb")!;
    expect(cb.muc).toBe("nghiem_trong");
    expect(cb.nguong).toBe(10);
    // Cảnh báo phải mang theo câu tiếng Việt, không chỉ con số.
    expect(cb.dien_giai).toMatch(/Ổ đĩa chỉ còn 3\.9 GB trống/);
    expect(cb.anh_huong).toMatch(/không khởi động lại được/);
  });

  it("ĐĨA THEO PHẦN TRĂM: bắt được ổ nhỏ sắp đầy mà số GB tuyệt đối chưa báo", async () => {
    // Ổ 200 GB dùng 92% vẫn còn 25 GB — trên CẢ ngưỡng cảnh cáo 20 GB nên chỉ số GB im
    // lặng. Góc nhìn phần trăm mới bắt được. Đây là lý do giữ CẢ HAI chỉ số.
    await ghi(TOKEN_MAC, 16, { dia: dia(25, 92) });
    expect((await danhGia("dia_con_lai_gb")).find((r) => r.ten_may === "máy mac")!.hanh_dong)
      .toBe("binh_thuong");
    expect((await danhGia("dia_phan_tram_dung")).find((r) => r.ten_may === "máy mac")!.hanh_dong)
      .toBe("mo_canh_bao");
  });

  it("lấy ổ TỆ NHẤT khi máy có nhiều ổ, không lấy ổ đầu tiên", async () => {
    await ghi(TOKEN_MAC, 16, {
      dia: [
        { ten: "/", tong_gb: 200, con_lai_gb: 150, phan_tram_dung: 25 },
        { ten: "/Data", tong_gb: 500, con_lai_gb: 2, phan_tram_dung: 99 },
      ],
    });
    const r = (await danhGia("dia_con_lai_gb")).find((x) => x.ten_may === "máy mac")!;
    expect(r.hanh_dong).toBe("mo_canh_bao");
    expect(r.gia_tri_hien_tai).toBeCloseTo(2, 1);
  });

  it("🔴 RAM 92% trên máy Mac KHÔNG báo, trên máy Windows thì CÓ", async () => {
    // Tài liệu của chính dự án (metric-2-nen-tang.md §2.1): "90% RAM đã dùng trên máy Mac
    // là bình thường" — macOS dùng RAM rỗi làm cache rất hung và trả lại ngay khi cần.
    // Áp chung một ngưỡng cho hai nền tảng là tự tạo báo động giả thường trực.
    await ghi(TOKEN_MAC, 6, { ram_phan_tram: 92 });
    await ghi(TOKEN_WIN, 6, { ram_phan_tram: 92 });

    const kq = await danhGia("ram_phan_tram");
    expect(kq.find((r) => r.ten_may === "máy windows")!.hanh_dong).toBe("mo_canh_bao");
    // Máy Mac không được xuất hiện trong kết quả: nó bị lọc khỏi cửa sổ mẫu.
    expect(kq.find((r) => r.ten_may === "máy mac")).toBeUndefined();

    const cb = await canhBao();
    expect(cb.filter((c) => c.chi_so === "ram_phan_tram")).toHaveLength(1);
  });

  it("SWAP theo TỶ LỆ, không theo số tuyệt đối — chỉ áp cho máy Mac", async () => {
    // 4 GB swap trên máy 8 GB là nguy cấp; trên máy 128 GB là bình thường. So số tuyệt đối
    // là không mang sang máy khác được.
    await ghi(TOKEN_MAC, 6, { swap_dung_mb: 6300, swap_tong_mb: 7168 }); // 87,9%
    const kq = await danhGia("swap_dung_ty_le");
    const mac = kq.find((r) => r.ten_may === "máy mac")!;
    expect(mac.hanh_dong).toBe("mo_canh_bao");
    expect(mac.muc_moi).toBe("nghiem_trong");
    expect((await canhBao()).find((c) => c.chi_so === "swap_dung_ty_le")!.dien_giai)
      .toMatch(/mượn ổ cứng làm bộ nhớ/);
  });

  it("mọi ngưỡng nạp vào đều CÓ nhánh trong engine — không có ngưỡng chết", async () => {
    // Chống đúng cái lỗi mà hạng mục này sinh ra để sửa: khai ngưỡng ở một nơi mà quên
    // nhánh CASE ở nơi kia, rồi không ai biết là nó chưa bao giờ chạy.
    const ds = (await db.query<{ chi_so: string }>(
      `select chi_so from public.cau_hinh_nguong order by chi_so`)).rows;
    expect(ds.length).toBeGreaterThanOrEqual(6);
    for (const { chi_so } of ds) {
      // Gọi được mà không ném CHUA_KHAI_NGUONG, và không ném lỗi kiểu.
      await expect(danhGia(chi_so)).resolves.toBeDefined();
    }
  });

  it("đổi ngưỡng trong config thì hành vi đổi theo — không có số nào nằm cứng trong SQL", async () => {
    await ghi(TOKEN_MAC, 16, { dia: dia(25, 50) });
    // 25 GB trên cả ngưỡng cảnh cáo 20 GB → im lặng.
    expect((await danhGia("dia_con_lai_gb")).find((r) => r.ten_may === "máy mac")!.hanh_dong)
      .toBe("binh_thuong");

    // Nâng ngưỡng lên 20 GB (mô phỏng sửa config) → chính dữ liệu đó thành cảnh báo.
    await db.query(`update public.cau_hinh_nguong set nghiem_trong = 30, canh_cao = 40
                     where chi_so = 'dia_con_lai_gb'`);
    expect((await danhGia("dia_con_lai_gb")).find((r) => r.ten_may === "máy mac")!.hanh_dong)
      .toBe("mo_canh_bao");
  });
});

describe("1.2 — dự báo đầy đĩa cuối cùng cũng thành cảnh báo", () => {
  let db: PGlite;

  beforeEach(async () => {
    db = new PGlite();
    await napMigration(db);
    await napCauHinhNguong(db);
    // Dự báo cần ít nhất 3 NGÀY dữ liệu, nên phải có partition cho từng ngày.
    for (let i = 0; i <= 8; i++) {
      await taoPartitionNgay(db, new Date(MOC.getTime() - i * 86_400_000));
    }
    await db.exec(`
      insert into public.hosts (ten_nghiep_vu, he_dieu_hanh, muc_quan_trong, token_bam, lan_day_du_lieu_cuoi)
      values ('máy mac','macos','song_con',
              encode(sha256(convert_to('${TOKEN_MAC}','utf8')),'hex'), '${MOC.toISOString()}');
    `);
  });

  /** Ổ tụt đều `gbMoiNgay` GB mỗi ngày trong 7 ngày, kết thúc ở `conLaiCuoi`. */
  async function oTutDan(conLaiCuoi: number, gbMoiNgay: number) {
    for (let ngay = 6; ngay >= 0; ngay--) {
      const t = new Date(MOC.getTime() - ngay * 86_400_000);
      const conLai = conLaiCuoi + ngay * gbMoiNgay;
      await db.query(`select public.ghi_metric($1, $2::jsonb)`, [TOKEN_MAC, JSON.stringify({
        thoi_diem: t.toISOString(),
        dia: [{ ten: "/", tong_gb: 200, con_lai_gb: conLai, phan_tram_dung: 100 - conLai / 2 }],
      })]);
    }
  }

  const ghiDuBao = async (canhCao = 14, nghiemTrong = 7) => (await db.query<{
    ten_may: string; ten_o: string; hanh_dong: string;
  }>(`select * from public.ghi_canh_bao_du_bao_dia($1, $2, 7, $3::timestamptz)`,
    [canhCao, nghiemTrong, MOC.toISOString()])).rows;

  it("🔴 ổ sắp đầy trong ~6 ngày → cảnh báo NGHIÊM TRỌNG, kèm câu đếm ngược", async () => {
    // 30 GB còn lại, tụt 5 GB/ngày → còn 6 ngày. Dưới ngưỡng nghiêm trọng 7 ngày.
    await oTutDan(30, 5);
    expect((await ghiDuBao())[0]!.hanh_dong).toBe("mo_canh_bao");

    const cb = (await db.query<{ chi_so: string; muc: string; dien_giai: string; gia_tri: number }>(
      `select chi_so, muc, dien_giai, gia_tri from public.alerts where ket_thuc_luc is null`)).rows[0]!;
    expect(cb.chi_so).toBe("du_bao_day_dia:/");
    expect(cb.muc).toBe("nghiem_trong");
    expect(cb.gia_tri).toBeCloseTo(6, 0);
    // Đây là câu biến giám sát thành PHÒNG NGỪA: người đọc biết còn bao lâu để xoay xở.
    expect(cb.dien_giai).toMatch(/sắp hết chỗ lưu — còn khoảng 6 ngày/);
  });

  it("dung lượng ỔN ĐỊNH thì không báo — thà im lặng còn hơn doạ nhầm", async () => {
    await oTutDan(30, 0);
    expect((await ghiDuBao())[0]!.hanh_dong).toBe("binh_thuong");
    const cb = await db.query(`select 1 from public.alerts where ket_thuc_luc is null`);
    expect(cb.rows).toHaveLength(0);
  });

  it("còn 12 ngày → mức CẢNH CÁO, chưa phải nghiêm trọng", async () => {
    await oTutDan(24, 2); // 24 / 2 = 12 ngày
    expect((await ghiDuBao())[0]!.hanh_dong).toBe("mo_canh_bao");
    const cb = (await db.query<{ muc: string }>(
      `select muc from public.alerts where ket_thuc_luc is null`)).rows[0]!;
    expect(cb.muc).toBe("canh_cao");
  });

  it("dọn đĩa xong thì cảnh báo TỰ ĐÓNG", async () => {
    await oTutDan(30, 5);
    await ghiDuBao();
    expect((await db.query(`select 1 from public.alerts where ket_thuc_luc is null`)).rows)
      .toHaveLength(1);

    // Người dùng dọn đĩa: xu hướng đảo chiều, dung lượng tăng lại.
    await db.query(`delete from public.metrics_raw`);
    await oTutDan(150, -10);
    await ghiDuBao();
    expect((await db.query(`select 1 from public.alerts where ket_thuc_luc is null`)).rows)
      .toHaveLength(0);
  });
});
