---
description: Bước 2 — Viết lộ trình vào PLAN.md theo khuôn 4 dòng, chờ DUYỆT mới thi công
model: best
---

MODE: luôn Plan Mode — chưa ở trong thì gọi tool EnterPlanMode trước khi làm bất cứ việc
gì (môi trường không có tool này thì nhắc tôi bấm Shift+Tab). Báo 1 dòng:
`Mode: plan — chốt lộ trình, chưa code.` Ma trận mode đầy đủ: `.claude/rules/workflow.md`.

Dùng skill `writing-plans`. Từ phạm vi MVP đã chốt trong docs/brd/, viết lộ trình vào
PLAN.md (nguồn lộ trình DUY NHẤT của dự án) theo đúng khuôn có sẵn trong file:

1. Chia theo GIAI ĐOẠN; mỗi giai đoạn kết thúc bằng một DEMO tôi tự nhìn thấy/bấm thử được.
2. Mỗi hạng mục dùng checkbox [ ] và đúng 4 dòng:
   (a) làm gì · (b) tôi kiểm chứng bằng thao tác nào · (c) test tự động nào chứng minh ·
   (d) ước lượng thời gian.
3. Hạng mục 🔴 rủi ro cao nhất xếp làm SỚM NHẤT.
4. Giai đoạn đầu tiên BẮT BUỘC gồm: dựng dự án chạy được trên LOCAL. Dự án có database
   (stack chuẩn Supabase): thêm Supabase Docker + .env.local + supabase/seed.sql dữ liệu
   test riêng + /reset_db chạy được; dự án không DB thì bỏ phần này. Mọi giai đoạn sau
   đều phát triển và test trên local; chỉ /B6_xuat_ban mới đưa lên môi trường thật.
5. KHÔNG đụng vào các mục đã có sẵn trong PLAN.md; chỉ bổ sung.

Viết xong: ĐỪNG code. In số giai đoạn + tổng hạng mục + hạng mục rủi ro cao, rồi trình
plan chờ tôi duyệt (có tool ExitPlanMode thì gọi nó; không có thì DỪNG chờ tôi gõ "DUYỆT").

Muốn giai đoạn thi công chạy edit tự động, nhắc tôi đúng 2 đường:
- Bấm **"Yes, and use auto mode"** ngay trong hộp thoại duyệt plan — hiệu lực phiên này.
- Bật BỀN cho dự án: kiểm `.claude/settings.local.json`; chưa có `"defaultMode":
  "acceptEdits"` thì đề xuất chạy skill `cam_may` (nó checkpoint commit trước rồi mới
  bật — KHÔNG tự chép logic của cam_may vào đây).

Sau khi duyệt, gợi ý chạy /B3_thi_cong.
