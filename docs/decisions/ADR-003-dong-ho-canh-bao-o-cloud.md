# ADR-003 — Đồng hồ đánh giá cảnh báo đặt ở Cloudflare Worker, logic viết bằng SQL

- **Ngày:** 01/09/2026
- **Trạng thái:** Đã chốt (số đo CPU điền sau khi xong hạng mục 2.2)

## Bối cảnh

Engine cảnh báo cần một "đồng hồ" chạy đều đặn để đánh giá ngưỡng và phát hiện máy mất liên
lạc. Ràng buộc: ngân sách 0 đồng, và **đồng hồ không được nằm trên máy được giám sát**.

## Quyết định

1. **Cloudflare Workers Cron Trigger, nhịp 1 phút** làm đồng hồ.
2. **Toàn bộ phép đánh giá viết bằng SQL chạy trong Postgres**; Worker chỉ gọi một hàm RPC
   rồi gửi email qua Resend HTTP API.
3. Không dùng `pg_cron` (chỉ có từ gói Pro) và không dùng GitHub Actions cron.

## Lý do

- **Nguyên tắc sống còn: mất điện văn phòng không được làm mất khả năng biết mình đang mất
  điện.** Đồng hồ đặt trong LAN là vi phạm nguyên tắc này.
- **Workers gói miễn phí giới hạn 10ms CPU mỗi lần gọi.** Đánh giá 6 máy × 40 chỉ số kèm
  logic duration/hysteresis/gom nhóm rất dễ vượt nếu viết bằng TypeScript trong Worker. Đẩy
  phép tính xuống SQL thì thời gian chờ I/O **không tính vào CPU time** — đây là cách duy
  nhất để gói free chạy nổi. Hạng mục 2.2 của PLAN.md là spike chứng minh điều này bằng số
  đo thật trước khi xây tiếp.
- **GitHub Actions cron trễ 5–15 phút** vào giờ cao điểm, nhịp nhỏ nhất 5 phút — không chấp
  nhận được cho cảnh báo sự cố. Vẫn dùng nó cho việc chậm: sao lưu bảng cấu hình hằng tuần.

## Đường nâng cấp

Nếu spike 2.2 cho thấy vượt 10ms CPU kể cả sau khi đẩy hết xuống SQL → Workers Paid 5 USD
(30s CPU). Nếu tổ chức không dùng được Cloudflare → `pg_cron` trên Supabase Pro. Cả hai
đường đều không phải viết lại logic vì logic nằm trong Postgres.
