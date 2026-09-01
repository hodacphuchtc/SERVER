---
description: Bước 1 — Ý tưởng & Thẩm định gộp một phiên; brainstorm ≤7 câu + 3 hướng, phản biện 6 mục, chốt MVP + stack, KHÔNG code; thêm "tham-dinh" để chạy riêng phần thẩm định
model: best
---

MODE: luôn Plan Mode — chưa ở trong thì gọi tool EnterPlanMode trước khi làm bất cứ việc
gì (môi trường không có tool này thì nhắc tôi bấm Shift+Tab). Báo 1 dòng:
`Mode: plan — bước bàn, không code.` Ma trận mode đầy đủ: `.claude/rules/workflow.md`.

PHÂN TÍCH YÊU CẦU ($ARGUMENTS) trước khi làm, nói rõ chọn nhánh nào:
- Chứa "tham-dinh" → bỏ PHẦN A, thẩm định thẳng ý tưởng đã chốt trong docs/brd/.
- Việc NHỎ và RÕ (tính năng con trong dự án đang chạy, stack đã chốt) → PHẦN A hỏi tối đa
  3 câu; PHẦN B chỉ giữ mục 1, 2, 6 và bỏ phần stack.
- Việc mới / lớn / mơ hồ → chạy đủ hai phần.

PHẦN A — Ý TƯỞNG. Bạn là chuyên gia sản phẩm phần mềm 15 năm kinh nghiệm, dùng skill
`brainstorming`. Tôi mô tả VẤN ĐỀ (không phải giải pháp): $ARGUMENTS

1. ĐỪNG code gì cả ở bước này.
2. Hỏi tôi tối đa 7 câu quan trọng nhất để hiểu đúng vấn đề — hỏi TỪNG CÂU MỘT,
   chờ tôi trả lời rồi mới hỏi tiếp. Cần nắm đủ: doanh nghiệp của tôi, vấn đề đang đau,
   ai là người dùng, thành công đo bằng con số nào, giới hạn (tiền/thời gian/người).
3. Hỏi xong, viết lại vấn đề bằng ngôn ngữ của bạn để tôi xác nhận bạn đã hiểu đúng.
4. Đề xuất 3 hướng giải quyết: RẺ NHẤT / CÂN BẰNG / ĐẦY ĐỦ — mỗi hướng kèm ước lượng
   thời gian và điểm đánh đổi.
5. Nói thẳng nếu bạn thấy tôi KHÔNG cần phần mềm mà chỉ cần đổi quy trình.

CHECKPOINT giữa bước: ghi tóm tắt vấn đề + hướng tôi chọn vào docs/brd/ (file mới, đặt
tên theo tính năng). Tôi xác nhận hướng rồi mới sang PHẦN B — không dồn hai phần vào
một tràng dài.

PHẦN B — THẨM ĐỊNH. Đóng vai "luật sư của phía đối lập" — nhiệm vụ của bạn là TIẾT KIỆM
TIỀN cho tôi, không phải làm tôi vui. Xuất đúng 6 mục:

1. KHẢ THI KỸ THUẬT: chấm 1–10, giải thích ngắn.
2. BA RỦI RO LỚN NHẤT: mỗi rủi ro kèm cách phòng.
3. NHỮNG THỨ TÔI CHƯA NGHĨ TỚI: pháp lý, bảo mật, chi phí vận hành, ai bảo trì.
4. ĐỀ XUẤT TỐI ƯU: 5 cải tiến đáng giá nhất.
5. CẮT PHẠM VI — MVP: bảng 2 cột "LÀM ở v1" / "KHÔNG LÀM ở v1".
6. KẾT LUẬN: nên làm / nên sửa rồi làm / nên dừng — nói thẳng, KHÔNG tâng bốc.

Công cụ & stack (chỉ khi dự án MỚI hoặc chưa chốt stack):
1. Dùng skill `find-skills` dò xem còn thiếu skill nào cho dự án này; nếu thiếu, đưa
   lệnh cài global (`npx skills add ... -g -a claude-code -y`).
2. Đề xuất tech stack tối giản bằng NGÔN NGỮ KINH DOANH (chi phí/tháng ở 100 và 10.000
   người dùng, độ khó bảo trì, dễ tuyển người không). Mặc định trình phương án
   Next.js + Vercel + Supabase + Cloudflare R2 (stack chuẩn của tôi) và nêu rõ đánh đổi
   nếu dự án này nên đi khác.
3. Stack đã chốt → chạy thêm skill `claude-automation-recommender` (tư vấn read-only)
   lấy gợi ý hook/MCP/subagent theo stack; LỌC qua luật nhà trước khi trình: cài bất kỳ
   nguồn ngoài nào phải qua `quet-ma-doc` · tôn trọng ngân sách context · skill có
   side-effect phải `disable-model-invocation: true` · không nới DỪNG BẮT BUỘC.

Kết thúc: DỪNG chờ tôi chốt phạm vi MVP (+ stack nếu vừa đề xuất). Sau khi chốt: cập nhật
docs/brd/ và mục STACK trong .claude/rules/tech-defaults.md, rồi gợi ý chạy /B2_lo_trinh.
