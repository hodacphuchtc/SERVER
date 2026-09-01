---
description: Bước 4 — Nghiệm thu chống "xong ảo" bằng 5 câu bằng chứng; thêm "bao-mat" để soi bảo mật & tốc độ
---

MODE: tự chạy — bước này chỉ đọc code và chạy test trên local, không side-effect ngoài.
Báo: `Mode: tự chạy — nghiệm thu bằng bằng chứng.`

Dùng skill `verification-before-completion`. Nghiệm thu phần việc vừa báo "xong"
(phạm vi: $ARGUMENTS — bỏ trống là toàn bộ mục vừa tick trong PLAN.md).

Trả lời đủ 5 câu, mỗi câu phải có BẰNG CHỨNG dán kèm, không nhận định suông:
1. Đã THỰC SỰ chạy chưa? Dán kết quả chạy/test.
2. Liệt kê từng thứ khẳng định "hoạt động" — kèm bằng chứng tương ứng.
3. Có phần nào viết ra mà CHƯA chạy lần nào không? Nói thẳng.
4. Input bậy đã xử lý chưa: bỏ trống, nhập chữ vào ô số, bấm 2 lần liên tiếp, mất mạng
   giữa chừng? Test thử và dán kết quả.
5. Còn mock/dữ liệu giả/TODO nào sót trong code không? Grep và liệt kê.

Câu nào không có bằng chứng → hạng mục đó CHƯA XONG: bỏ tick trong PLAN.md, ghi rõ
thiếu gì, đề xuất quay lại /B3_thi_cong.

NẾU $ARGUMENTS chứa "bao-mat": chạy thêm phần soi bảo mật & tốc độ — đóng vai hacker
mũ trắng + chuyên gia hiệu năng, dùng skill `web-perf`; báo cáo 3 nhóm NGUY HIỂM /
NÊN SỬA / GHI NHẬN (key-token lộ trong code, phân quyền dữ liệu Supabase RLS, SQL
injection/XSS/upload độc, tốc độ mạng 3G, chịu tải 500 người đồng thời).

Kết thúc: bảng tổng kết đạt/không đạt. Tất cả đạt → gợi ý /B5_luu_code hoặc /B6_xuat_ban.
