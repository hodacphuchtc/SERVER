# Biến môi trường — GIAM_SAT_SERVER

> Claude KHÔNG đọc/ghi file `.env*` (guardrail). File này chỉ LIỆT KÊ biến để người dùng
> tự điền vào `.env.local` của mình. Không bao giờ ghi GIÁ TRỊ thật vào đây — chỉ tên,
> mô tả, và nơi lấy.

## Giai đoạn nền tảng

| Biến | Mô tả | Bắt buộc | Nhạy cảm |
| ---- | ----- | -------- | -------- |
| (điền khi chốt stack — vd `DATABASE_URL`) | | | |

## Quy tắc

- Biến nhạy cảm (key, token, mật khẩu): chỉ nằm trong `.env*` (đã gitignore) hoặc kho
  bí mật của hạ tầng — không vào code, log, tài liệu, commit message.
- Thêm biến mới = thêm MỘT dòng vào bảng này trong cùng PR/commit — người sau đọc bảng
  là dựng lại được môi trường.
- Nên có script kiểm tra biến (thiếu/thừa/đảo khóa) mà KHÔNG in giá trị — xem mẫu
  `check:env` của dự án gốc.
