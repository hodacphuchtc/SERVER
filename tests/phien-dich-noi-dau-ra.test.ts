import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { napMigration, taoPartitionNgay } from "../src/db/nap-migration";
import { napCauHinhNguong } from "../src/db/nap-cau-hinh";
import { chayMotVong } from "../src/engine/vong-danh-gia";
import { docCauHinhPhienDich } from "../src/phien-dich/doc-cau-hinh";
import { LUAT } from "../src/phien-dich/luat-tuong-quan";
import { phanLoaiChiSo } from "../src/phien-dich/phat-hien";
import type { Transport } from "../src/email/gui-email";

const TOKEN = "token-may-mac-0123456789abcdefghijkl";
const MOC = new Date("2026-09-01T10:00:00Z");
const CFG = docCauHinhPhienDich();
const NGUONG = { diaConLaiGb: 10, swapTyLe: 0.8, taiMoiNhan: 0.4, cpuRanhToiThieu: 60 };

describe("1.3 nối vào đầu ra — thư nói bằng NGUYÊN NHÂN GỐC", () => {
  let db: PGlite;
  let daGui: Array<{ tieu_de: string; than_thu: string }>;
  let transport: Transport;

  beforeEach(async () => {
    db = new PGlite();
    await napMigration(db);
    await napCauHinhNguong(db);
    await taoPartitionNgay(db, MOC);
    await db.exec(`
      insert into public.hosts (ten_nghiep_vu, he_dieu_hanh, muc_quan_trong, token_bam, lan_day_du_lieu_cuoi)
      values ('MacBook của tôi','macos','song_con',
              encode(sha256(convert_to('${TOKEN}','utf8')),'hex'), '${MOC.toISOString()}');
    `);
    daGui = [];
    transport = async (t) => { daGui.push({ tieu_de: t.tieu_de, than_thu: t.than_thu }); return { ok: true }; };
  });

  /** Ghi 16 nhịp đúng tình trạng máy thật: đĩa cạn, swap kịch, tải cao mà CPU rảnh. */
  async function ghiCaMayThat() {
    for (let i = 0; i < 16; i++) {
      const t = new Date(MOC.getTime() - (15 - i) * 60_000);
      await db.query(`select public.ghi_metric($1, $2::jsonb)`, [TOKEN, JSON.stringify({
        thoi_diem: t.toISOString(),
        dia: [{ ten: "/", tong_gb: 228, con_lai_gb: 3.9, phan_tram_dung: 98.3 }],
        swap_dung_mb: 6293, swap_tong_mb: 7168, swap_ra_moi_giay: 3_801_088,
        ap_luc_bo_nho: "critical",
        ram_tong_mb: 8192, ram_con_lai_mb: 190, ram_phan_tram: 97.7,
        cpu_phan_tram: 17, cpu_hang_doi: 2.82, cpu_ranh: 75,
        dia_vm_dung_gb: 8, nguon_dien: "pin", pin_phan_tram: 50, pin_con_phut: 295,
      })]);
    }
  }

  const vong = (them: Record<string, unknown> = {}) =>
    chayMotVong(db, { bayGio: MOC, transport, phienDich: { cauHinh: CFG, nguong: NGUONG }, ...them });

  it("🔴 NGHIỆM THU 1.3: một kết luận gốc, các triệu chứng thụt vào làm bằng chứng", async () => {
    await ghiCaMayThat();
    const t = await vong();

    expect(t.phien_dich_loi).toBeNull();
    expect(daGui).toHaveLength(1);
    const thu = daGui[0]!.than_thu;

    // ① Kết luận gốc đứng đầu, nói rõ nguyên nhân là ổ đĩa.
    expect(thu).toMatch(/Ổ đĩa chỉ còn 3\.9 GB trống/);
    expect(thu).toMatch(/Vì sao: Ổ đĩa hết chỗ/);
    // ② Hệ quả nếu không làm gì.
    expect(thu).toMatch(/Nếu không xử lý:.*mất dữ liệu/s);
    // ③ Danh sách việc cần làm, có đánh số.
    expect(thu).toMatch(/Cần làm, theo thứ tự:/);
    expect(thu).toMatch(/1\. /);
    // ④ Triệu chứng bị hạ xuống thành bằng chứng, KHÔNG còn báo ngang hàng.
    expect(thu).toMatch(/Các dấu hiệu đi kèm \(đều là hệ quả của cùng nguyên nhân trên\)/);

    // Và không một mã kỹ thuật nào lọt ra người đọc.
    expect(thu).not.toMatch(/dia_con_lai_gb|swap_dung_ty_le|ap_luc_bo_nho/);
  });

  it("máy chạy PIN vẫn được báo RIÊNG — khác trụ, không bị nuốt", async () => {
    await ghiCaMayThat();
    await vong();
    expect(daGui[0]!.than_thu).toMatch(/Việc khác, không cùng nguyên nhân với việc trên:/);
    expect(daGui[0]!.than_thu).toMatch(/đang chạy bằng pin/);
  });

  it("tiêu đề thư là KẾT LUẬN, không phải tên cột", async () => {
    await ghiCaMayThat();
    await vong();
    expect(daGui[0]!.tieu_de).toMatch(/KHẨN CẤP: MacBook của tôi — Ổ đĩa chỉ còn/);
    expect(daGui[0]!.tieu_de).not.toMatch(/dia_con_lai_gb/);
  });

  it("🔴 SUY GIẢM ÊM: bước 6b hỏng thì thư CŨ VẪN GỬI, và tóm tắt nói rõ đã hỏng", async () => {
    await ghiCaMayThat();
    // Cấu hình thiếu khoá → chonNguyenNhanGoc ném lỗi ngay bên trong bước 6b.
    const t = await chayMotVong(db, {
      bayGio: MOC, transport,
      phienDich: { cauHinh: null as never, nguong: NGUONG },
    });

    expect(t.phien_dich_loi).not.toBeNull();
    // Thư VẪN phải đi — một email thô còn hơn không có email nào.
    expect(daGui).toHaveLength(1);
    expect(daGui[0]!.than_thu.length).toBeGreaterThan(10);
  });

  it("chạy lặp KHÔNG sinh thêm email — bước 6b không phá chống trùng", async () => {
    await ghiCaMayThat();
    await vong();
    expect(daGui).toHaveLength(1);
    await vong();
    await vong();
    expect(daGui).toHaveLength(1);
  });

  it("🔴 CHỐNG LỆCH ÂM THẦM: mọi mã trong `nuot` của luật đều có nguồn sinh ra nó", async () => {
    // Đây là chỗ dễ hỏng nhất và hỏng không có lỗi nào bật ra: bảng ánh xạ chỉ số → mã
    // nằm ở phat-hien.ts, còn danh sách `nuot` nằm ở luat-tuong-quan.ts. Lệch một chữ là
    // luật không nuốt được triệu chứng và hệ thống lại báo rời rạc.
    const maSinhRaDuoc = new Set([
      "dia_con_lai_gb", "dia_phan_tram_dung", "swap_dung_ty_le", "swap_ra_moi_giay",
      "ap_luc_bo_nho", "ram_phan_tram", "cpu_phan_tram", "cpu_hang_doi",
      "gioi_han_toc_do_cpu", "pin_phan_tram", "mat_lien_lac",
      "cong_viec:x", "csdl:x", "dich_vu:x", "du_bao_day_dia:/",
    ].map((cs) => phanLoaiChiSo(cs).ma));

    // `io_cham` và `ram_thap` là mã dự phòng cho chỉ số chưa thu thập — chấp nhận được,
    // nhưng phải liệt kê tường minh ở đây để lần sau ai thêm mã lạ thì test đỏ ngay.
    const chuaCoNguon = new Set(["io_cham"]);

    for (const luat of LUAT) {
      for (const ma of luat.nuot) {
        if (chuaCoNguon.has(ma)) continue;
        expect(maSinhRaDuoc.has(ma),
          `luật "${luat.ma}" khai nuốt mã "${ma}" nhưng không chỉ số nào sinh ra mã đó`,
        ).toBe(true);
      }
    }
  });
});
