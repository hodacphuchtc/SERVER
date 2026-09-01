# Bộ rule chống xung đột module (QUAN TRỌNG NHẤT với dự án kiến trúc module)

> Vi phạm bất kỳ rule nào dưới đây là lỗi nghiêm trọng — dừng lại và hỏi người dùng
> trước khi tiếp tục. (Dự án không dùng kiến trúc module: chỉ áp dụng rule 4 và 5.)

## Rule bắt buộc

1. **Dữ liệu:** mỗi module một vùng dữ liệu riêng (schema prefix / thư mục riêng).
   CẤM module này ghi trực tiếp dữ liệu module khác.

2. **Giao tiếp liên module:** chỉ qua 2 kênh — (a) API/service của module nền tảng,
   (b) sự kiện (event) khai báo trong manifest (`eventsPublished` / `eventsConsumed`).
   CẤM import trực tiếp code từ `modules/A` sang `modules/B`.

3. **Danh mục dùng chung** (người dùng, đơn vị, danh mục...) chỉ tồn tại MỘT nơi trong
   module nền tảng — module khác tham chiếu bằng ID, KHÔNG tạo bản sao entity.

4. **Cấu hình:** KHÔNG hardcode ngưỡng/hằng số nghiệp vụ trong code — đọc từ `config/`.

5. **Thay đổi dữ liệu có lịch sử** (migration): đặt tên có timestamp + mô tả; có rollback;
   KHÔNG sửa migration đã chạy — tạo cái mới.

6. **Manifest:** mỗi module tự khai báo qua `module.config.json` (id, name, version,
   navigation, permissions, entities, dependencies, eventsPublished, eventsConsumed).
   `dependencies` chỉ được chứa module nền tảng (+ module khai báo rõ nếu thật sự cần).
   Thêm module mới = tạo thư mục + manifest — KHÔNG sửa code module cũ để "nhét" vào.

## Checklist nhanh trước khi viết code liên quan ≥ 2 module

- [ ] Dữ liệu cần lấy có phải danh mục dùng chung không? → đọc từ module nền tảng.
- [ ] Cần dữ liệu module khác? → gọi service hoặc consume event, không đọc thẳng.
- [ ] Sự kiện mới? → khai báo vào manifest cả 2 phía publish/consume.
- [ ] Ngưỡng nghiệp vụ mới? → thêm vào `config/`, không inline.
