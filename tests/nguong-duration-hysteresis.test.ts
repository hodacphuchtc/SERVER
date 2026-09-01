import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { napMigration, taoPartitionNgay } from "../src/db/nap-migration.js";
import { napCauHinhNguong } from "../src/db/nap-cau-hinh.js";

const TOKEN = "token-may-ke-toan-0123456789abcdefghij";
type KetQua = { may_id: string; ten_may: string; hanh_dong: string; muc_moi: string | null };

/**
 * Bộ test quan trọng nhất của dự án. Nó không kiểm "hàm có chạy không" mà kiểm ĐÚNG SỐ
 * LƯỢNG cảnh báo sinh ra cho từng kịch bản — tiêu chí nghiệm thu toàn dự án là "dưới 5
 * cảnh báo/tuần", và nó được bảo vệ ở đây chứ không ở đâu khác.
 */
describe("engine ngưỡng — duration + hysteresis", () => {
  let db: PGlite;
  const MOC = new Date("2026-09-01T10:00:00Z");
  const phutSau = (n: number) => new Date(MOC.getTime() + n * 60_000);

  beforeEach(async () => {
    db = new PGlite();
    await napMigration(db);
    await taoPartitionNgay(db, MOC);
    await napCauHinhNguong(db);
    await db.exec(`insert into public.hosts (ten_nghiep_vu, he_dieu_hanh, token_bam)
      values ('máy chủ kế toán','windows',
              encode(sha256(convert_to('${TOKEN}','utf8')),'hex'));`);
  });

  /**
   * Ghi một chuỗi mẫu CPU cách nhau 1 phút, mẫu CUỐI tại `moc`.
   *
   * `moc` bắt buộc phải TIẾN LÊN giữa các giai đoạn của một kịch bản. Lần đầu viết bộ test
   * này tôi tái dùng cùng một mốc cho mọi giai đoạn — và vì ghi_metric cố ý dùng
   * "on conflict do nothing" (để collector đẩy bù sau khi mất mạng), toàn bộ dữ liệu giai
   * đoạn sau bị bỏ qua âm thầm. Hai test hysteresis khi đó vẫn XANH nhưng thực chất đang
   * kiểm dữ liệu của giai đoạn một. Test xanh vì lý do sai nguy hiểm hơn test đỏ.
   */
  async function ghiChuoiCpu(giaTri: number[], moc: Date) {
    for (let i = 0; i < giaTri.length; i++) {
      const t = new Date(moc.getTime() - (giaTri.length - 1 - i) * 60_000);
      await db.query(`select public.ghi_metric($1, $2::jsonb)`, [
        TOKEN, JSON.stringify({ thoi_diem: t.toISOString(), cpu_phan_tram: giaTri[i] }),
      ]);
    }
  }

  const danhGia = async (moc: Date = MOC) =>
    (await db.query<KetQua>(
      `select * from public.danh_gia_nguong('cpu_phan_tram', $1::timestamptz)`,
      [moc.toISOString()],
    )).rows;

  const soCanhBaoDangMo = async () =>
    (await db.query(`select 1 from public.alerts where ket_thuc_luc is null`)).rows.length;

  it("ngưỡng đọc từ config, không hardcode trong SQL", async () => {
    const c = await db.query<{ canh_cao: number; nghiem_trong: number; giu_trong_phut: number }>(
      `select canh_cao, nghiem_trong, giu_trong_phut from public.cau_hinh_nguong where chi_so='cpu_phan_tram'`);
    expect(c.rows[0]).toMatchObject({ canh_cao: 85, nghiem_trong: 95, giu_trong_phut: 5 });
  });

  it("CPU vượt ngưỡng 3 phút rồi thả: KHÔNG sinh cảnh báo nào (chưa đủ 5 phút)", async () => {
    await ghiChuoiCpu([20, 20, 97, 97, 97, 20], MOC);
    expect((await danhGia())[0]!.hanh_dong).toBe("binh_thuong");
    expect(await soCanhBaoDangMo()).toBe(0);
  });

  it("CPU vượt ngưỡng suốt cửa sổ 5 phút: sinh ĐÚNG 1 cảnh báo nghiêm trọng", async () => {
    await ghiChuoiCpu([97, 97, 97, 97, 97, 97], MOC);
    const r = await danhGia();
    expect(r[0]!.hanh_dong).toBe("mo_canh_bao");
    expect(r[0]!.muc_moi).toBe("nghiem_trong");
    expect(await soCanhBaoDangMo()).toBe(1);
  });

  it("chạy engine nhiều lần khi vẫn quá tải: KHÔNG nhân bản cảnh báo", async () => {
    await ghiChuoiCpu([97, 97, 97, 97, 97, 97], MOC);
    await danhGia();
    expect((await danhGia())[0]!.hanh_dong).toBe("van_dang_canh_bao");
    expect((await danhGia())[0]!.hanh_dong).toBe("van_dang_canh_bao");
    expect(await soCanhBaoDangMo()).toBe(1);
  });

  it("HYSTERESIS: tụt về 84% (dưới ngưỡng 85 nhưng chưa dưới ~76) thì cảnh báo VẪN MỞ", async () => {
    await ghiChuoiCpu([97, 97, 97, 97, 97, 97], MOC);
    await danhGia();
    expect(await soCanhBaoDangMo()).toBe(1);

    // 84 < 85 nên "hết vượt ngưỡng", nhưng chưa xuống dưới 85*0.89 ≈ 75,7 → chưa được tắt.
    await ghiChuoiCpu([84, 84, 84, 84, 84, 84], phutSau(6));
    expect((await danhGia(phutSau(6)))[0]!.hanh_dong).toBe("van_dang_canh_bao");
    expect(await soCanhBaoDangMo()).toBe(1);
  });

  it("HYSTERESIS: tụt sâu dưới 76% đủ 3 mẫu thì mới đóng cảnh báo", async () => {
    await ghiChuoiCpu([97, 97, 97, 97, 97, 97], MOC);
    await danhGia();
    await ghiChuoiCpu([40, 40, 40, 40, 40, 40], phutSau(6));
    expect((await danhGia(phutSau(6)))[0]!.hanh_dong).toBe("dong_canh_bao");
    expect(await soCanhBaoDangMo()).toBe(0);
  });

  it("CHỐNG NHẤP NHÁY: dao động quanh ngưỡng 10 vòng chỉ sinh 1 cảnh báo, không phải 10", async () => {
    // Kịch bản kinh điển giết chết hệ giám sát tự xây: máy chạy sát ngưỡng, mỗi lần
    // vượt/tụt là một email. Không có hysteresis thì đây là hàng chục email.
    await ghiChuoiCpu([97, 97, 97, 97, 97, 97], MOC);
    await danhGia();
    for (let i = 1; i <= 10; i++) {
      const moc = phutSau(6 * i);
      await ghiChuoiCpu([84, 97, 84, 97, 84, 97], moc);
      await danhGia(moc);
    }
    expect((await db.query(`select 1 from public.alerts`)).rows).toHaveLength(1);
    expect(await soCanhBaoDangMo()).toBe(1);
  });

  it("một mẫu bình thường xen giữa làm đứt chuỗi: chưa đủ điều kiện bắn", async () => {
    await ghiChuoiCpu([97, 97, 30, 97, 97, 97], MOC);
    expect((await danhGia())[0]!.hanh_dong).toBe("binh_thuong");
    expect(await soCanhBaoDangMo()).toBe(0);
  });

  it("mức cảnh cáo (88%) khác mức nghiêm trọng (97%)", async () => {
    await ghiChuoiCpu([88, 88, 88, 88, 88, 88], MOC);
    expect((await danhGia())[0]!.muc_moi).toBe("canh_cao");
  });

  it("chỉ số chưa khai ngưỡng thì báo lỗi rõ ràng, không im lặng bỏ qua", async () => {
    await expect(
      db.query(`select * from public.danh_gia_nguong('chi_so_bia_dat')`),
    ).rejects.toThrow(/CHUA_KHAI_NGUONG/);
  });
});
