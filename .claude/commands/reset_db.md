---
description: Xóa sạch database local + nạp lại dữ liệu test từ seed; "tu-production" để kéo bản sao đã che thông tin
---

MODE: tự chạy — chỉ tác động database local. Riêng nhánh `tu-production` → hỏi từng
bước (chạm production dù chỉ ĐỌC). Báo: `Mode: tự chạy — reset dữ liệu test local.`

Đưa database LOCAL về trạng thái sạch có dữ liệu test. CHỈ tác động Supabase local
(Docker) — tuyệt đối không đụng production.

Mặc định:
1. Kiểm tra Supabase local đang chạy (`supabase status`); chưa chạy → `supabase start`
   và báo tôi biết Docker đang được bật.
2. `supabase db reset` — chạy lại toàn bộ migrations + nạp `supabase/seed.sql`.
3. Chưa có seed.sql hoặc schema đã đổi mà seed chưa theo kịp → viết/cập nhật seed:
   dữ liệu mẫu sát thực tế nghiệp vụ (vài người dùng, bản ghi chính, ca biên như tên
   dài/ký tự đặc biệt), đủ để bấm thử mọi luồng trong PLAN.md. Không dùng dữ liệu thật
   của khách.
4. Xác minh: đếm bản ghi các bảng chính, dán kết quả làm bằng chứng.

NẾU $ARGUMENTS chứa "tu-production" (chỉ khi dự án đã có production):
1. Xác nhận với tôi trước khi chạy bất kỳ lệnh nào chạm production (chỉ ĐỌC, không ghi).
2. Kéo dữ liệu production về file tạm (pg_dump qua chuỗi kết nối trong .env.local do
   CLI đọc — không in giá trị kết nối ra màn hình).
3. CHE thông tin cá nhân trước khi nạp vào local: thay email/SĐT/họ tên thật bằng dữ
   liệu giả có cấu trúc tương đương; tiền/bản ghi nghiệp vụ giữ nguyên để tái hiện lỗi.
4. Nạp vào Supabase local, xác minh số bản ghi, xóa file tạm ngay sau khi nạp.

Kết thúc: báo cáo 3 dòng (nguồn dữ liệu — số bản ghi — sẵn sàng test chưa).
