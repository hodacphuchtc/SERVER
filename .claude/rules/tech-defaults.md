# Stack & convention mặc định

## Stack (chốt 01/09/2026 — ADR-001, ADR-002, ADR-003)

| Tầng | Chọn | Vì sao |
|---|---|---|
| Thu thập | `windows_exporter` (MSI) + `node_exporter` (brew), **Apache-2.0** | Không tự viết agent — ADR-001 |
| Collector | Node + TypeScript, chạy nền qua `winsw` (Win) / LaunchDaemon (macOS) | Mảnh duy nhất cloud không làm hộ được |
| Uptime/SSL/backup ping | **Uptime Kuma** (Docker, MIT) | Cài 5 phút, thay được 3 tính năng |
| Cơ sở dữ liệu | **Supabase Free** (Postgres 500 MB) | Bảng rộng 3 tầng — ADR-002 |
| Đồng hồ cảnh báo | **Cloudflare Workers** cron 1 phút, logic viết bằng **SQL** | Độc lập với văn phòng, lách trần 10ms CPU — ADR-003 |
| Giao diện | **Next.js (App Router) + TypeScript**, deploy Cloudflare Pages | Bundle phải dưới 3 MB nén (spike 6.1) |
| Email | **Resend HTTP API** | **KHÔNG dùng SMTP** — Worker/Vercel đóng băng tác vụ nền khi trả response, lệnh SMTP chưa `await` xong chết giữa handshake: không lỗi, không log, không email |
| Test | **Vitest** | Mọi hạng mục PLAN.md dòng (c) đều dựa vào nó |

**Ba ràng buộc của gói miễn phí — vi phạm là phải trả tiền:**

1. **Phép nặng nằm trong Postgres**, không trong Worker (trần 10ms CPU/lần gọi).
2. **Trình duyệt chỉ đọc bảng đã gộp** (`metrics_5m`, `metrics_1h`), không bao giờ query
   `metrics_raw` (trần 5 GB băng thông ra/tháng).
3. **Bundle giao diện dưới 3 MB nén** (trần Workers Free). Vượt → trang tĩnh + gọi Supabase
   từ trình duyệt; vẫn vượt → tự host trên máy công ty.

**Thiết kế để nâng gói chỉ là đổi biến môi trường, không phải viết lại.**

## Convention đặt tên

- Thư mục/file: `kebab-case`. Tên file tài liệu và config dùng tiếng Việt không dấu.
- Biến/hàm tiếng Anh; text hiển thị theo `.claude/rules/ngon-ngu-ui.md`.
- **Trong mọi thứ gửi ra ngoài (email, giao diện): dùng TÊN NGHIỆP VỤ** ("máy chủ kế toán"),
  không dùng hostname/IP thật — vừa an toàn hơn vừa đúng ngôn ngữ quản trị.
- Hằng số nghiệp vụ (ngưỡng, chu kỳ, thời gian giữ): đọc từ `config/`, **không hardcode**.

## Nguyên tắc code

- Validate input tại biên; escape output khi render.
- Không file > 500 dòng — tách nhỏ.
- Sau thay đổi có ý nghĩa: chạy lint/test/build thật (Verification Loop — `workflow.md`).
- **Không bao giờ để `service_role` của Supabase ở collector** — mỗi máy một token riêng,
  ghi qua RPC, RLS chặn phần còn lại (BRD §7.2 ②).
- **Không lưu tham số dòng lệnh của tiến trình, không lưu query string nguyên vẹn** — dữ
  liệu cá nhân, Nghị định 13/2023/NĐ-CP (BRD §8.1).
