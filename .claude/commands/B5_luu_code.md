---
description: Bước 5 — Commit an toàn (gitleaks chặn lộ key), push hỏi trước; "quay-dau" để lùi phiên bản
---

MODE: hỏi từng điểm dừng — commit/push là side-effect ngoài (DỪNG BẮT BUỘC), không gộp
duyệt. Báo: `Mode: hỏi — cửa lưu code.`

NẾU $ARGUMENTS chứa "quay-dau" → chỉ làm mục QUAY ĐẦU ở cuối, bỏ các bước còn lại.

Lưu công việc lên Git — theo đúng thứ tự, bước nào fail thì DỪNG báo tôi:

1. An toàn trước tiên:
   - Kiểm tra gitleaks đã cài (`gitleaks version`) và hook pre-commit đang hoạt động
     (`git config core.hooksPath` = .githooks). Thiếu → cài/kích hoạt trước
     (`brew install gitleaks`; chép hook theo khuôn dự án) rồi mới tiếp.
   - `git status`: nếu thấy .env*, file chứa key/token/mật khẩu sắp bị commit → DỪNG,
     bổ sung .gitignore, báo tôi. Nghi ngờ key đã lộ trong lịch sử → mở
     docs/sop/SU-CO-LO-KEY.md và làm theo.
2. Chất lượng: chạy test, phải xanh mới commit (test đỏ → báo tôi, không commit đè lỗi).
3. Commit: chia theo cụm việc có nghĩa, message chuẩn feat/fix/docs/chore bằng tiếng Anh
   + 1 dòng mô tả tiếng Việt trong body.
4. Push: HỎI tôi trước (theo rule workflow). Chưa có remote → đề xuất tạo repo PRIVATE
   bằng `gh repo create` (xin duyệt), push nhánh hiện tại, đưa tôi link repo.
   Nhắc: KHÔNG push thẳng main nếu dự án đã bật branch protection — dùng /B6_xuat_ban
   để lên sản phẩm.

QUAY ĐẦU (chỉ khi được gọi "quay-dau"):
1. Liệt kê 5 commit gần nhất (hash — message — ngày), chỉ ra commit cuối cùng còn chạy tốt.
2. Tạo nhánh backup từ trạng thái hiện tại TRƯỚC, rồi mới checkout/revert về commit tôi
   chọn. Không bao giờ xóa lịch sử; mọi thao tác xin duyệt từng bước.
