import { describe, expect, it, vi } from "vitest";
import {
  doiVaiThanhDiaChi,
  xuLyOutbox,
  type BanGhiOutbox,
  type CauHinhEmail,
  type Transport,
} from "../src/email/gui-email.js";

const CAU_HINH: CauHinhEmail = {
  nguoi_gui: "Giám sát hệ thống <canh-bao@alerts.congty.vn>",
  hop_thu: {
    quan_tri: ["it@congty.vn"],
    lanh_dao: ["ceo@congty.vn", "giamdoc@congty.vn"],
  },
};

const banGhi = (id: string, vai: string[] = ["quan_tri"]): BanGhiOutbox => ({
  id,
  khoa_idempotency: `khoa-${id}`,
  nguoi_nhan: vai,
  tieu_de: "Thử",
  than_thu: "Nội dung",
});

describe("đổi vai thành địa chỉ", () => {
  it("một vai có thể ứng với nhiều địa chỉ", () => {
    expect(doiVaiThanhDiaChi(["lanh_dao"], CAU_HINH)).toEqual(["ceo@congty.vn", "giamdoc@congty.vn"]);
  });

  it("người nằm ở hai vai chỉ nhận MỘT bản, không nhận đúp", () => {
    const c: CauHinhEmail = { ...CAU_HINH, hop_thu: { a: ["x@y.vn"], b: ["x@y.vn"] } };
    expect(doiVaiThanhDiaChi(["a", "b"], c)).toEqual(["x@y.vn"]);
  });

  it("vai gõ sai bị BỎ QUA, không chặn email tới các vai còn lại", () => {
    // Đúng lúc có sự cố thì gửi được cho một nửa vẫn tốt hơn không gửi cho ai.
    expect(doiVaiThanhDiaChi(["quan_tri", "vai_go_sai"], CAU_HINH)).toEqual(["it@congty.vn"]);
  });
});

describe("outbox — thứ tự gửi rồi mới đánh dấu", () => {
  it("gửi thành công thì đánh dấu đã gửi kèm mã của nhà cung cấp", async () => {
    const danhDau = vi.fn(async () => {});
    const ghiLoi = vi.fn(async () => {});
    const transport: Transport = async () => ({ ok: true, ma: "re_abc123" });

    const r = await xuLyOutbox(async () => [banGhi("1")], danhDau, ghiLoi, transport);

    expect(r.da_gui).toBe(1);
    expect(danhDau).toHaveBeenCalledWith("1", "re_abc123");
    expect(ghiLoi).not.toHaveBeenCalled();
  });

  it("gửi HỎNG thì KHÔNG đánh dấu đã gửi — lượt sau còn thử lại", async () => {
    // Đánh dấu trước rồi mới gửi thì một lần timeout là mất thư vĩnh viễn mà sổ vẫn ghi
    // "đã gửi", và không ai phát hiện ra.
    const danhDau = vi.fn(async () => {});
    const ghiLoi = vi.fn(async () => {});
    const transport: Transport = async () => ({ ok: false, loi: "resend trả mã 500" });

    const r = await xuLyOutbox(async () => [banGhi("1")], danhDau, ghiLoi, transport);

    expect(r.that_bai).toBe(1);
    expect(danhDau).not.toHaveBeenCalled();
    expect(ghiLoi).toHaveBeenCalledWith("1", "resend trả mã 500");
  });

  it("một thư hỏng không chặn các thư còn lại", async () => {
    let lan = 0;
    const transport: Transport = async () => (++lan === 1 ? { ok: false, loi: "x" } : { ok: true });
    const r = await xuLyOutbox(
      async () => [banGhi("1"), banGhi("2"), banGhi("3")],
      async () => {}, async () => {}, transport,
    );
    expect(r.da_gui).toBe(2);
    expect(r.that_bai).toBe(1);
  });

  it("outbox rỗng: không gọi transport lần nào", async () => {
    const transport = vi.fn<Transport>(async () => ({ ok: true }));
    const r = await xuLyOutbox(async () => [], async () => {}, async () => {}, transport);
    expect(r.da_gui).toBe(0);
    expect(transport).not.toHaveBeenCalled();
  });

  it("khoá idempotency được truyền xuống transport — lớp chống trùng thứ hai", async () => {
    const thay: string[] = [];
    const transport: Transport = async (t) => { thay.push(t.khoa_idempotency); return { ok: true }; };
    await xuLyOutbox(async () => [banGhi("1"), banGhi("2")], async () => {}, async () => {}, transport);
    expect(thay).toEqual(["khoa-1", "khoa-2"]);
  });

  it("không có địa chỉ nhận nào thì báo lỗi rõ, không im lặng coi như đã gửi", async () => {
    const transport: Transport = async (t) => {
      const den = doiVaiThanhDiaChi(t.nguoi_nhan, CAU_HINH);
      return den.length === 0 ? { ok: false, loi: "khong_co_dia_chi_nhan" } : { ok: true };
    };
    const ghiLoi = vi.fn(async () => {});
    const r = await xuLyOutbox(async () => [banGhi("1", ["vai_khong_ton_tai"])],
      async () => {}, ghiLoi, transport);
    expect(r.that_bai).toBe(1);
    expect(ghiLoi).toHaveBeenCalledWith("1", "khong_co_dia_chi_nhan");
  });
});
