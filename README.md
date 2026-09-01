# GIAM_SAT_SERVER

Hệ thống giám sát tổng hợp cho máy chủ: theo dõi tài nguyên hạ tầng (CPU/RAM/ổ đĩa/mạng, uptime) lẫn trạng thái ứng dụng, dịch vụ đang chạy, kèm cảnh báo khi vượt ngưỡng.

## Bắt đầu đọc từ đâu

| File | Vai trò |
| ---- | ------- |
| `CLAUDE.md` | Hiến pháp dự án: guardrails, quy tắc làm việc, trạng thái hiện tại, decision log, sổ cạm bẫy |
| `PLAN.md` | Lộ trình thi công dạng checklist — nguồn lộ trình DUY NHẤT |
| `docs/brd/` | Tài liệu yêu cầu nghiệp vụ |
| `docs/decisions/` | Các quyết định kiến trúc (ADR) |
| `*/OVERVIEW.md` | Não của từng thư mục/module: mục đích, phạm vi, trạng thái, quyết định |

## Đóng & mở session (làm đúng để không mất context, tiết kiệm token)

- **Mở mỗi phiên — LỆNH ĐẦU TIÊN: `/mo_session`.** Claude chỉ đọc CLAUDE.md → PLAN.md →
  OVERVIEW.md module (không quét cả codebase) để lấy lại context của phiên trước với ít
  token nhất, tóm tắt trạng thái và gợi ý handle của giai đoạn đang dở. Duyệt rồi làm tiếp.
- **Trước khi đóng phiên: `/dong_session`.** Claude báo cáo tiến độ lên PLAN.md, cập nhật
  TRẠNG THÁI/QUYẾT ĐỊNH/CẢNH BÁO trong CLAUDE.md + OVERVIEW.md module, rồi tắt tài nguyên
  (Supabase local, dev server). Sau đó chạy `/B5_luu_code` để commit + push.
  → Nhờ vậy phiên sau `/mo_session` khôi phục lại đúng chỗ đang dở.

## Nhịp làm việc — quy trình 6 bước (6 số lệnh B1..B6)

| Handle | Khi nào dùng |
| ------ | ------------ |
| `/B1_y_tuong` | Đầu dự án/tính năng: brainstorm 3 hướng + phản biện + chốt MVP/stack (Plan Mode, model cao nhất); `tham-dinh` để chạy riêng phần thẩm định |
| `/B2_lo_trinh` | Viết PLAN.md chi tiết, chờ bạn "DUYỆT" (Plan Mode, model cao nhất) |
| `/B3_thi_cong` | Làm hằng ngày: thi công trên LOCAL theo GÓI, test xanh mới đi tiếp — không dừng chờ từng hạng mục |
| `/B4_nghiem_thu` | Trước khi tin "đã xong": bắt chứng minh bằng bằng chứng; `bao-mat` để soi bảo mật |
| `/B5_luu_code` | Cuối mỗi ngày: commit + push (gitleaks tự chặn lộ key); `quay-dau` để lùi bản |
| `/B6_trien_khai` | Bước 6a — cấu hình GitHub/Vercel/Supabase/R2: làm 1 lần, bổ sung dần |
| `/B6_xuat_ban` | Bước 6b — đưa lên sản phẩm thật: Preview → bạn duyệt → production (cổng 2 lớp) |
| `/reset_db` | Đưa database local về trạng thái sạch có dữ liệu test |

Bước 6 "Ra mắt" có 2 lệnh: `/B6_trien_khai` (cấu hình 1 lần) và `/B6_xuat_ban` (mỗi lần
lên sản phẩm). Hai bước đầu tự chạy ở **model cao nhất** và tự vào **Plan Mode**; mỗi
handle tự phân tích yêu cầu và báo `Mode: <plan|tự chạy|hỏi> — vì <lý do>` trước khi làm.
Muốn thi công chạy tự động không hỏi từng edit: bấm **"Yes, and use auto mode"** khi
duyệt plan ở `/B2_lo_trinh`, hoặc bật bền cho dự án bằng skill `cam_may`.

- Kiểm tra cấu trúc bất kỳ lúc nào: `node scripts/check-structure.mjs`.

Khởi tạo 01/09/2026 bằng skill `khoi-tao-du-an`.
