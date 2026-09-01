import { describe, expect, it } from "vitest";
import { chuKyHopLe, kyLink, taoLinkTiepNhan, themNutTiepNhan } from "../src/email/ky-link";

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

describe("nút Đã tiếp nhận trong thân thư", () => {
  const GOC = "https://giamsat.congty.vn";
  const KHOA = "khoa-ky-link-rat-dai-va-bi-mat-0123456789";
  const A = "11111111-1111-1111-1111-111111111111";
  const B = "22222222-2222-2222-2222-222222222222";

  it("một cảnh báo: câu mời bấm gọn, link ký đúng", () => {
    const t = themNutTiepNhan("• máy chủ kế toán — ổ đĩa sắp đầy", [A], GOC, KHOA);
    expect(t).toContain("• máy chủ kế toán — ổ đĩa sắp đầy");
    expect(t).toContain(taoLinkTiepNhan(GOC, A, KHOA));
    expect(t).toMatch(/Đã xử lý\? Bấm vào đây:/);
    // Chữ ký phải hợp lệ thật, không phải chuỗi bịa.
    const chuKy = new URL(t.split("Bấm vào đây: ")[1]!).searchParams.get("chu_ky")!;
    expect(chuKyHopLe(A, chuKy, KHOA)).toBe(true);
  });

  it("nhiều cảnh báo: đánh số theo đúng thứ tự các dòng bên trên", () => {
    const t = themNutTiepNhan("• việc 1\n• việc 2", [A, B], GOC, KHOA);
    expect(t).toMatch(/1\. https:/);
    expect(t).toMatch(/2\. https:/);
    expect(t).toContain(taoLinkTiepNhan(GOC, A, KHOA));
    expect(t).toContain(taoLinkTiepNhan(GOC, B, KHOA));
  });

  it("không có cảnh báo nào (digest, email tuần) thì KHÔNG gắn nút", () => {
    // Digest sáng không gắn với một sự cố cụ thể — gắn nút vào đó là mời bấm vào hư không.
    const t = "Đêm qua mọi thứ bình thường.";
    expect(themNutTiepNhan(t, [], GOC, KHOA)).toBe(t);
  });

  it("chữ ký của cảnh báo A KHÔNG mở được cảnh báo B", () => {
    // Không có tính chất này thì ai đoán được id cũng bấm hộ được, và sự cố nghiêm trọng
    // sẽ không bao giờ leo thang lên người có thẩm quyền.
    expect(chuKyHopLe(B, kyLink(A, KHOA), KHOA)).toBe(false);
  });
});
