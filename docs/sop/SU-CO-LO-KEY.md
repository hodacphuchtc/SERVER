# SỰ CỐ LỘ KEY — Playbook xử lý khẩn (GIAM_SAT_SERVER)

Khi nghi/biết một API key, token, mật khẩu đã bị đẩy lên GitHub (hoặc lọt ra ngoài):
**xoay key TRƯỚC, dọn lịch sử SAU.** Kẻ xấu quét GitHub trong vài phút, nên key đã lộ
coi như đã mất — việc gấp nhất là làm nó vô hiệu.

## Bước 0 — Đánh giá nhanh (2 phút)
- Key nào lộ? Của dịch vụ gì? Quyền tới đâu (chỉ đọc / ghi / admin)?
- Đã lộ ở đâu: commit public, log, ảnh chụp màn hình, chat?
- Repo public hay private? (Private vẫn phải xoay — cộng tác viên/CI đều thấy.)

## Bước 1 — THU HỒI & XOAY key ngay (theo dịch vụ)

**Supabase**
- service_role / anon key lộ: Dashboard → Project Settings → API → **Roll** JWT secret
  (lưu ý: roll sẽ vô hiệu mọi token cũ — cập nhật lại .env.local và Vercel env).
- Mật khẩu database lộ: Settings → Database → **Reset database password**.

**Vercel**
- Token lộ: Account Settings → Tokens → **Delete** token cũ, tạo token mới.
- Biến môi trường lộ: `vercel env rm <TÊN>` rồi `vercel env add <TÊN>` giá trị mới;
  redeploy để bản production nhận giá trị mới.

**Cloudflare R2**
- Dashboard → R2 → Manage API Tokens → **Revoke** token cũ, tạo token mới.
- Cập nhật R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY ở .env.local và Vercel env.

**GitHub**
- Personal Access Token / fine-grained token lộ: Settings → Developer settings →
  **Revoke**, tạo lại.
- Deploy key / Actions secret lộ: xóa trong repo Settings → Secrets, tạo lại.

## Bước 2 — Dọn key khỏi lịch sử Git
- Nếu vừa commit **chưa push**: `git reset --soft HEAD~1`, gỡ giá trị, commit lại sạch.
- Nếu **đã push**: sau khi ĐÃ xoay key (Bước 1), xóa khỏi lịch sử bằng
  `git filter-repo --path <file> --invert-paths` (hoặc BFG Repo-Cleaner), rồi
  `git push --force` (thao tác này cần xin duyệt — phá lịch sử chung).
- Bật GitHub **Secret Scanning + Push Protection** để lần sau bị chặn ngay ở server
  (skill cau-hinh-ha-tang làm việc này).

## Bước 3 — Kiểm tra thiệt hại
- Xem log truy cập bất thường: Supabase (Logs), Cloudflare (R2 metrics), Vercel (Logs).
- Dữ liệu có bị đọc/sửa/xóa lạ không? Có tài nguyên bị tạo thêm (tốn tiền) không?
- Ghi lại sự cố vào docs/decisions/ (1 ADR ngắn: đã lộ gì, đã xoay gì, ngày) để lần
  sau không lặp lại.

## Phòng ngừa (đã có sẵn trong dự án)
- `.gitignore` chặn `.env*`; `.gitleaks.toml` + hook pre-commit quét trước mỗi commit.
- Claude không bao giờ đọc/ghi/in giá trị `.env*`.
- Chỉ tên biến nằm trong docs/architecture/env-vars.md; giá trị thật chỉ ở .env.local
  và trong dashboard dịch vụ.
