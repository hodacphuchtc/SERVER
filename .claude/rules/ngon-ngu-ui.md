# Quy tắc ngôn ngữ UI / tài liệu

## Nguyên tắc

- Ngôn ngữ hiển thị cho người dùng cuối: **Tiếng Việt 100%** — label, nút, thông báo
  lỗi, empty state, email/notification.
- Thuật ngữ lấy từ điển duy nhất trong `config/` (tạo file locale khi bắt đầu có UI) —
  thêm từ mới vào đó trước, không tự dịch tùy tiện mỗi nơi một kiểu.
- Code (biến, hàm, comment kỹ thuật) dùng tiếng Anh; comment nghiệp vụ có thể dùng
  Tiếng Việt.

## Thuật ngữ chuẩn (điền dần khi dự án có nghiệp vụ)

| Khái niệm | Dùng | KHÔNG dùng |
| --------- | ---- | ---------- |
| (mẫu)     |      |            |

## Định dạng (điều chỉnh theo địa phương của người dùng)

- Ngày: `dd/mm/yyyy`. Giờ: 24h.
- Số/tiền: theo chuẩn địa phương của người dùng cuối.
