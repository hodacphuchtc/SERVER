import { describe, expect, it } from "vitest";
import { chuKyHopLe, kyLink, taoLinkTiepNhan } from "../src/email/ky-link";

const KHOA = "khoa-ky-link-rat-dai-0123456789abcdef";
const ID = "11111111-1111-1111-1111-111111111111";

describe("ký link tiếp nhận sự cố", () => {
  it("chữ ký đúng thì hợp lệ", () => {
    expect(chuKyHopLe(ID, kyLink(ID, KHOA), KHOA)).toBe(true);
  });

  it("KHÔNG bấm hộ được cảnh báo khác dù biết id — mỗi id một chữ ký riêng", () => {
    // Không có lớp này thì ai đoán được id cũng tắt được leo thang lên lãnh đạo.
    const idKhac = "22222222-2222-2222-2222-222222222222";
    expect(chuKyHopLe(idKhac, kyLink(ID, KHOA), KHOA)).toBe(false);
  });

  it("đổi khoá thì chữ ký cũ chết", () => {
    expect(chuKyHopLe(ID, kyLink(ID, KHOA), "khoa-khac-cung-rat-dai-0123456789ab")).toBe(false);
  });

  it("chữ ký rỗng hoặc sai độ dài bị từ chối, không ném lỗi", () => {
    expect(chuKyHopLe(ID, "", KHOA)).toBe(false);
    expect(chuKyHopLe(ID, "abc", KHOA)).toBe(false);
  });

  it("link sinh ra đủ id và chữ ký, dùng được ngay trong email", () => {
    const l = taoLinkTiepNhan("https://giamsat.congty.vn", ID, KHOA);
    expect(l).toMatch(/\/api\/tiep-nhan\?id=/);
    const u = new URL(l);
    expect(chuKyHopLe(u.searchParams.get("id")!, u.searchParams.get("chu_ky")!, KHOA)).toBe(true);
  });
});
