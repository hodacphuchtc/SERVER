---
description: Bước 6 — Cấu hình hạ tầng GitHub/Vercel/Supabase/R2 bằng skill cau-hinh-ha-tang; chạy lại để bổ sung phần thiếu
---

MODE: hỏi từng điểm dừng — lệnh tạo/sửa tài nguyên cloud là side-effect ngoài, xin duyệt
từng lệnh. Báo: `Mode: hỏi — cấu hình hạ tầng.`

Dùng skill toàn cục `cau-hinh-ha-tang` để cấu hình hạ tầng cho dự án này.

Bối cảnh bắt buộc skill phải tôn trọng:
- Stack chuẩn: GitHub (code) + Vercel (hosting, auto-deploy) + Supabase (database;
  local bằng Docker khi dev) + Cloudflare R2 (lưu file).
- Đọc `.claude/infra.json` trước: hạng mục nào ĐÃ XONG thì bỏ qua, chỉ làm phần còn
  thiếu/tôi muốn bổ sung hôm nay ($ARGUMENTS nếu có — ví dụ "vercel", "r2", "giam-sat").
- Tôi có thể BỎ QUA bất kỳ hạng mục nào để bổ sung sau — ghi trạng thái "cho" vào
  infra.json, không được chặn các việc khác.
- CLI tối đa (gh, vercel, supabase, wrangler); chỉ hướng dẫn tôi bấm web khi CLI không
  làm được (tạo tài khoản, lấy token lần đầu). Lệnh tạo/sửa tài nguyên cloud: xin duyệt
  từng lệnh.
- Secrets: không bao giờ đọc/in giá trị key. Chỉ tạo .env.example (tên biến + nơi lấy);
  giá trị thật do tôi tự dán vào .env.local hoặc CLI tự ghi (vercel env pull).

Kết thúc: in bảng trạng thái 6 hạng mục (Công cụ / GitHub / Supabase / Vercel / R2 /
Giám sát — xong/chờ/bỏ qua), cập nhật docs/DEPLOY.md, và cho tôi biết còn thiếu gì
trước khi /B6_xuat_ban dùng được.
