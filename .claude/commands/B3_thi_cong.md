---
description: Bước 3 — Thi công theo GÓI trên LOCAL; plan đã duyệt = duyệt cả gói, vòng TEST→FIX→TEST xanh mới đi tiếp, KHÔNG dừng chờ từng hạng mục
---

MODE (báo 1 dòng `Mode: <tự chạy|plan|hỏi> — vì <lý do ngắn>` rồi làm):
- Hạng mục TRONG PLAN.md đã duyệt, không phình quá mô tả (a) → tự chạy theo GÓI.
- Việc NGOÀI plan / đổi schema ngoài dự kiến / lan ≥2 module → gọi EnterPlanMode trình
  plan con, duyệt xong mới làm.
- Dính dữ liệu thật / production / ngoài thư mục dự án / commit-push-deploy → DỪNG hỏi.
Ma trận mode + luật GÓI đầy đủ: `.claude/rules/workflow.md`.

DUYỆT. Dùng skill `executing-plans`, thi công theo PLAN.md, bắt đầu từ hạng mục dở/
kế tiếp (hoặc theo chỉ định: $ARGUMENTS).

MÔI TRƯỜNG: mọi thứ chạy trên LOCAL; biến môi trường từ .env.local. Dự án có database
(stack chuẩn Supabase): Supabase Docker (`supabase start`, báo tôi biết khi bật), dữ
liệu là dữ liệu test (thiếu thì chạy /reset_db); dự án không DB thì bỏ phần này.
TUYỆT ĐỐI không đụng database/dịch vụ production ở bước này.

Với MỖI hạng mục trong gói:
1. Làm đúng phần (a) của hạng mục. Giao diện dùng skill `frontend-design`; server/API
   dùng `api-design-principles` + `nodejs-backend-patterns`.
2. Vòng lặp TEST→FIX→TEST (skill `webapp-testing` + `systematic-debugging`):
   (1) viết/chạy test mô phỏng thao tác thật theo phần (b) và (c);
   (2) FAIL → tìm nguyên nhân GỐC — không vá tạm, không bọc try/catch cho lỗi biến mất;
   (3) chạy lại test; (4) còn lỗi → quay lại (2); (5) chạy test hồi quy các phần cũ.
   CẤM nói "đã xong" khi chưa có kết quả test xanh dán ra làm bằng chứng.
   5 vòng chưa qua → DỪNG hạng mục này, ghi 3 giả thuyết nguyên nhân; còn hạng mục khác
   KHÔNG phụ thuộc nó thì làm tiếp, gom câu hỏi trình một lượt cuối gói.
3. Xong hạng mục: tick [x] trong PLAN.md + báo cáo đúng 3 dòng (làm gì — bằng chứng
   test — ảnh hưởng gì), rồi ĐI TIẾP hạng mục kế trong gói, KHÔNG dừng chờ duyệt.

Luật GÓI:
- Test xanh thay người duyệt từng bước; DỪNG BẮT BUỘC (danh sách trong rules/workflow.md)
  giữ nguyên mọi mode.
- Thiếu key/env/dịch vụ ngoài → GHI vào mục "Chờ ngoài" (TRẠNG THÁI trong CLAUDE.md)
  kèm rõ *cần gì — để làm gì*, rồi chuyển hạng mục khác. Chỉ dừng khi TẤT CẢ hạng mục
  còn lại đều bị chặn — khi đó in danh sách "cần gì để mở khóa".
- Việc chạy dài (build, e2e, quét lớn) → chạy nền, làm tiếp việc khác rồi quay lại đọc
  kết quả.

Cuối gói: báo cáo tổng hợp (xong gì — bằng chứng — vướng gì — chờ ngoài gì), nhắc tôi
/B4_nghiem_thu nếu vừa xong giai đoạn, và /dong_session nếu chuẩn bị nghỉ.
