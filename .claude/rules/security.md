# Bảo mật — quy tắc bắt buộc

## Secrets

- KHÔNG đọc/ghi/in nội dung `.env*`, `secrets/**`, token, password, API key.
- Biến nhạy cảm chỉ ở `.env.local` (danh sách tên khai tại `docs/architecture/env-vars.md`,
  mẫu ở `.env.example`); token API mã hóa khi lưu DB.
- Không secret trong code, prompt, log, CLAUDE.md, README, commit message.
- 3 lớp chặn lộ key đã cài sẵn: `.gitignore` chặn `.env*` · `.gitleaks.toml` + hook
  `.githooks/pre-commit` quét trước mỗi commit · rule này. Chỉ /B6_xuat_ban đưa code
  ra ngoài, và nó quét gitleaks lần cuối trước khi push.

## Xử lý khi lộ key

- Nghi/biết API key, token, mật khẩu đã lọt lên GitHub hoặc ra ngoài → mở
  `docs/sop/SU-CO-LO-KEY.md` và làm theo NGAY. Nguyên tắc: **xoay key trước, dọn lịch
  sử git sau** (key đã lộ coi như mất, việc gấp là làm nó vô hiệu).

## Dữ liệu cá nhân của người dùng cuối

- Không đưa thông tin định danh (họ tên đầy đủ + liên hệ + hồ sơ) vào prompt AI, log,
  seed data, code mẫu, output.
- Dữ liệu thật không để trong `docs/` — tách thư mục riêng đã gitignore.
- Truy cập dữ liệu nhạy cảm đi qua phân quyền + audit log; không export hàng loạt.

## Checklist trước mỗi commit

- [ ] Không secret trong diff.
- [ ] Input validate/sanitize; output escape khi hiển thị.
- [ ] Permission check cho action quan trọng.
- [ ] Không destructive command / migration chưa duyệt.
- [ ] Không dữ liệu định danh người dùng cuối trong code, seed, log.

## Checklist trước khi đưa tính năng ra người dùng thật

- [ ] CODE — đã review: không file lạ, không refactor ngoài phạm vi.
- [ ] TEST — test/build pass; lỗi được ghi nhận.
- [ ] DATA — có backup; migration có plan + rollback.
- [ ] CONFIG — môi trường dev/production tách riêng; không hardcode key.
- [ ] APPROVAL — deploy production / gửi thông báo hàng loạt: có người duyệt.
- [ ] MONITOR — biết xem log, metric, error và cách tắt khi sự cố.
