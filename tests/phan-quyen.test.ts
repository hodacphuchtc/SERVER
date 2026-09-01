import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { napMigration, taoPartitionNgay } from "../src/db/nap-migration.js";

const ID = {
  lanh_dao: "11111111-1111-1111-1111-111111111111",
  quan_tri: "22222222-2222-2222-2222-222222222222",
  xem: "33333333-3333-3333-3333-333333333333",
};

/**
 * Ma trận quyền được kiểm ở TẦNG DỮ LIỆU, không phải tầng giao diện.
 *
 * Nghiệm thu của hạng mục 6.2 cố ý là "đăng nhập bằng tài khoản Lãnh đạo rồi GÕ THẲNG URL
 * trang kỹ thuật" — vì ẩn nút chỉ chặn được người vô tình. Bộ test này chính là phiên bản
 * tự động của thao tác đó.
 */
describe("phân quyền ba vai — chặn ở tầng dữ liệu", () => {
  let db: PGlite;

  beforeEach(async () => {
    db = new PGlite();
    await napMigration(db);
    await taoPartitionNgay(db, new Date());
    await db.exec(`
      insert into public.nguoi_dung (id, email, vai) values
        ('${ID.lanh_dao}','ceo@congty.vn','lanh_dao'),
        ('${ID.quan_tri}','it@congty.vn','quan_tri'),
        ('${ID.xem}','ketoan@congty.vn','xem');
      insert into public.hosts (ten_nghiep_vu, he_dieu_hanh, token_bam)
        values ('máy chủ kế toán','windows','bam-1');
      insert into public.alerts (host_id, chi_so, muc)
        select id, 'cpu_phan_tram', 'canh_cao' from public.hosts;
      insert into public.alert_notifications (khoa_idempotency, loai, nguoi_nhan, tieu_de, than_thu)
        values ('k1','canh_bao',array['quan_tri'],'t','t');
      -- Vai không phải chủ sở hữu bảng: RLS mới thật sự có hiệu lực.
      create role app_user nologin;
      grant usage on schema public to app_user;
      grant select, insert, update, delete on all tables in schema public to app_user;
      grant execute on all functions in schema public to app_user;
    `);
  });

  /**
   * Chạy một truy vấn dưới danh nghĩa một người dùng cụ thể.
   *
   * Bắt buộc gói trong MỘT transaction: `set local role` chỉ sống trong transaction hiện
   * tại, mà mỗi lệnh rời rạc là một transaction riêng — chạy tách ra thì vai trở lại chủ
   * sở hữu bảng trước khi truy vấn kịp chạy, và RLS im lặng không có hiệu lực. Lần đầu
   * viết bộ test này tôi mắc đúng lỗi đó và 4 test "an toàn" đều đỏ.
   */
  async function nhuLa<T>(vaiId: string | null, sql: string): Promise<T[]> {
    return db.transaction(async (tx) => {
      await tx.exec(`set local role app_user;`);
      await tx.query(`select set_config('app.nguoi_dung_id', $1, true)`, [vaiId ?? ""]);
      const r = await tx.query<T>(sql);
      return r.rows;
    }) as Promise<T[]>;
  }

  const demHosts = (id: string | null) =>
    nhuLa<{ n: number }>(id, `select count(*)::int as n from public.hosts`);

  it("QUẢN TRỊ đọc được danh sách máy", async () => {
    expect((await demHosts(ID.quan_tri))[0]!.n).toBe(1);
  });

  it("XEM đọc được danh sách máy", async () => {
    expect((await demHosts(ID.xem))[0]!.n).toBe(1);
  });

  it("LÃNH ĐẠO gõ thẳng vào bảng máy: KHÔNG thấy dòng nào — không lộ tên máy, hệ điều hành", async () => {
    expect((await demHosts(ID.lanh_dao))[0]!.n).toBe(0);
  });

  it("chưa đăng nhập: không thấy gì", async () => {
    expect((await demHosts(null))[0]!.n).toBe(0);
  });

  it("LÃNH ĐẠO không đọc được số liệu kỹ thuật lẫn cảnh báo", async () => {
    const m = await nhuLa<{ n: number }>(ID.lanh_dao, `select count(*)::int as n from public.metrics_raw`);
    const a = await nhuLa<{ n: number }>(ID.lanh_dao, `select count(*)::int as n from public.alerts`);
    expect(m[0]!.n).toBe(0);
    expect(a[0]!.n).toBe(0);
  });

  it("chỉ QUẢN TRỊ đọc được outbox — nội dung email có thể chứa tên máy", async () => {
    const q = await nhuLa<{ n: number }>(ID.quan_tri, `select count(*)::int as n from public.alert_notifications`);
    const x = await nhuLa<{ n: number }>(ID.xem, `select count(*)::int as n from public.alert_notifications`);
    const l = await nhuLa<{ n: number }>(ID.lanh_dao, `select count(*)::int as n from public.alert_notifications`);
    expect(q[0]!.n).toBe(1);
    expect(x[0]!.n).toBe(0);
    expect(l[0]!.n).toBe(0);
  });

  it("vai XEM không SỬA được gì — chỉ đọc là chỉ đọc", async () => {
    await nhuLa(ID.xem, `update public.hosts set ten_nghiep_vu = 'đổi trộm'`);
    const sau = await db.query<{ ten_nghiep_vu: string }>(`select ten_nghiep_vu from public.hosts`);
    expect(sau.rows[0]!.ten_nghiep_vu).toBe("máy chủ kế toán");
  });

  it("QUẢN TRỊ sửa được", async () => {
    await nhuLa(ID.quan_tri, `update public.hosts set ten_nghiep_vu = 'máy chủ kế toán 2'`);
    const sau = await db.query<{ ten_nghiep_vu: string }>(`select ten_nghiep_vu from public.hosts`);
    expect(sau.rows[0]!.ten_nghiep_vu).toBe("máy chủ kế toán 2");
  });

  it("ai cũng đọc được hồ sơ của CHÍNH MÌNH, không đọc được của người khác", async () => {
    const r = await nhuLa<{ email: string }>(ID.lanh_dao, `select email from public.nguoi_dung`);
    expect(r.map((x) => x.email)).toEqual(["ceo@congty.vn"]);
  });

  it("QUẢN TRỊ thấy toàn bộ người dùng", async () => {
    const r = await nhuLa<{ email: string }>(ID.quan_tri, `select email from public.nguoi_dung`);
    expect(r).toHaveLength(3);
  });
});

describe("cửa duy nhất của lãnh đạo — tom_tat_cho_lanh_dao", () => {
  let db: PGlite;

  beforeEach(async () => {
    db = new PGlite();
    await napMigration(db);
    await db.exec(`
      insert into public.nguoi_dung (id, email, vai) values
        ('${ID.lanh_dao}','ceo@congty.vn','lanh_dao');
      insert into public.hosts (ten_nghiep_vu, he_dieu_hanh, token_bam) values
        ('máy chủ kế toán','windows','b1'), ('máy chủ bán hàng','macos','b2'),
        ('máy chủ thiết kế','macos','b3');
    `);
  });

  const tomTat = async (id: string | null) => {
    await db.exec(`select set_config('app.nguoi_dung_id', '${id ?? ""}', false);`);
    return (await db.query<{ so_may: number; so_su_co_dang_mo: number; cau_ket_luan: string }>(
      `select * from public.tom_tat_cho_lanh_dao()`)).rows[0]!;
  };

  it("lãnh đạo thấy con số tổng hợp DÙ không đọc được bảng nào", async () => {
    const r = await tomTat(ID.lanh_dao);
    expect(r.so_may).toBe(3);
    expect(r.so_su_co_dang_mo).toBe(0);
  });

  it("câu kết luận viết bằng ngôn ngữ quản trị, KHÔNG lộ tên máy", async () => {
    await db.exec(`insert into public.alerts (host_id, chi_so, muc)
      select id, 'cpu_phan_tram', 'nghiem_trong' from public.hosts
      where ten_nghiep_vu = 'máy chủ kế toán';`);
    const r = await tomTat(ID.lanh_dao);
    expect(r.cau_ket_luan).toBe("Có 1 phần của hệ thống đang gặp sự cố, đội kỹ thuật đã được báo.");
    expect(r.cau_ket_luan).not.toMatch(/máy chủ kế toán|cpu|CPU/);
    expect(r.so_may_binh_thuong).toBe(2);
  });

  it("chưa đăng nhập: từ chối, không trả dữ liệu rỗng gây hiểu nhầm là 'mọi thứ ổn'", async () => {
    await expect(tomTat(null)).rejects.toThrow(/CHUA_DANG_NHAP/);
  });
});
