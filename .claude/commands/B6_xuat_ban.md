---
description: Bước 6 — LỆNH VÀNG xuất bản; test local xong → GitHub → Vercel Preview → tôi DUYỆT → production
---

MODE: hỏi từng cửa — toàn side-effect ngoài (push/merge/migration production), thuộc
DỪNG BẮT BUỘC, không gộp duyệt. Báo: `Mode: hỏi — cổng xuất bản 2 lớp.`

Xuất bản lên môi trường thật, cổng 2 lớp. Làm đúng thứ tự — bước nào FAIL là DỪNG
và báo rõ lý do, không được đi tiếp:

1. Chặn cửa: PLAN.md còn hạng mục dở chưa nghiệm thu trong phạm vi xuất bản →
   DỪNG, gợi ý /B4_nghiem_thu trước.
2. Quét an toàn lần cuối: `gitleaks detect` toàn repo + chạy TOÀN BỘ test — cả hai
   phải sạch/xanh, dán bằng chứng.
3. Soát schema: có migration Supabase mới chưa áp lên production → liệt kê từng file,
   cảnh báo trước là bước 7 sẽ áp chúng.
4. Đẩy lên trạm Preview: tạo nhánh release, commit, push, mở PR bằng `gh pr create`
   (base: main). GitHub Actions CI chạy (test + gitleaks) và Vercel tự dựng bản Preview.
5. Đưa tôi: link Preview + kết quả CI + checklist bấm thử tay (luồng chính, đăng nhập,
   dữ liệu hiển thị đúng). DỪNG TẠI ĐÂY chờ tôi gõ "DUYỆT" — khách chưa thấy gì cả.
6. Sau khi tôi DUYỆT: merge PR vào main (`gh pr merge --squash`) → Vercel tự deploy
   PRODUCTION.
7. Migration (nếu có ở bước 3): `supabase db push` lên project production — HỎI XÁC NHẬN
   RIÊNG một lần nữa trước khi chạy; đây là thao tác rủi ro nhất.
8. Smoke test bản THẬT: mở URL production, kiểm tra trang chính + 1-2 luồng quan trọng
   chạy đúng. Báo cáo: link production, những gì đã kiểm, còn gì cần theo dõi.

Kết thúc: cập nhật docs/DEPLOY.md (ngày, phiên bản, có migration không), nhắc tôi
/dong_session để chốt sổ.
