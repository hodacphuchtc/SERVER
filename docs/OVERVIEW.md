# OVERVIEW — docs/

## 1. Mục đích

Kho tài liệu của dự án: yêu cầu nghiệp vụ (`brd/`), kiến trúc (`architecture/`),
quyết định kiến trúc (`decisions/`), quy trình xử lý sự cố (`sop/`). Đây là nơi trả lời
câu hỏi "vì sao làm thế này", còn "làm cái gì tiếp theo" thì ở `PLAN.md` gốc dự án.

## 2. Quy ước

- `brd/` — mỗi tài liệu yêu cầu một file `kebab-case.md`; nêu rõ bài toán, người dùng,
  phạm vi In/Out, yêu cầu chính.
- `architecture/` — `env-vars.md` chỉ liệt kê TÊN biến môi trường, không bao giờ chứa
  giá trị thật.
- `decisions/` — ADR đặt tên `ADR-00N-<slug>.md`, N tăng liên tục không nhảy số; chốt
  ADR thật thì tăng `adrCount` trong `.claude/scaffold.json`.
- `sop/` — playbook xử lý sự cố, viết dạng các bước bấm được ngay lúc đang hoảng.

## 3. Trạng thái & bước tiếp theo

- **Trạng thái (01/09/2026):** vừa khởi tạo — mới có ADR mẫu và SOP lộ key, chưa có BRD.
- **Tiếp theo:** viết BRD đầu tiên cho GIAM_SAT_SERVER (hạng mục 0.2 trong PLAN.md).

## 4. Quyết định quan trọng

| Ngày | Quyết định | Lý do |
| ---- | ---------- | ----- |
