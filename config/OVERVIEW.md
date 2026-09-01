# OVERVIEW — config/

## 1. Mục đích

Nơi chứa MỌI hằng số và ngưỡng nghiệp vụ của dự án — với hệ giám sát thì đây là chỗ đặt
ngưỡng cảnh báo (CPU %, RAM %, dung lượng đĩa còn lại, thời gian phản hồi, số lần
health-check lỗi liên tiếp), chu kỳ thu thập, và kênh gửi cảnh báo. Code ĐỌC từ đây,
KHÔNG hardcode (rule 4 — `.claude/rules/module-boundaries.md`).

## 2. Quy ước

- Một nhóm hằng số một file `kebab-case` (vd `nguong-canh-bao.*`, `chu-ky-thu-thap.*`);
  định dạng file chốt cùng lúc với stack.
- Ngưỡng phải kèm đơn vị trong tên hoặc comment (`cpuPhanTramCanhBao`, không `cpuMax`).
- KHÔNG để bí mật (token, key, mật khẩu) ở đây — chúng thuộc `.env.local`; tên biến khai
  ở `docs/architecture/env-vars.md`.
- Đổi ngưỡng là đổi hành vi hệ thống: ghi lý do vào commit, ngưỡng gây tranh cãi thì viết ADR.

## 3. Trạng thái & bước tiếp theo

- **Trạng thái (01/09/2026):** vừa khởi tạo, chưa có hằng số nào.
- **Tiếp theo:** khi chốt BRD sẽ có bộ ngưỡng cảnh báo đầu tiên.

## 4. Quyết định quan trọng

| Ngày | Quyết định | Lý do |
| ---- | ---------- | ----- |
