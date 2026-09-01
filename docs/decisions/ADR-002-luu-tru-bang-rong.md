# ADR-002 — Lưu số liệu theo bảng RỘNG, ba tầng, dọn bằng DROP PARTITION

- **Ngày:** 01/09/2026
- **Trạng thái:** Đã chốt

## Bối cảnh

Cần lưu ~40 chỉ số × 6 máy × mỗi 60 giây, giữ lịch sử tới 13 tháng, **trên Supabase gói
miễn phí giới hạn 500 MB**.

## Quyết định

1. **Bảng RỘNG**: một dòng = một snapshot của một máy tại một nhịp, ~40 cột. **Không dùng
   EAV** (mỗi chỉ số một dòng).
2. **Ba tầng**: `metrics_raw` 60s giữ 7 ngày · `metrics_5m` giữ 90 ngày · `metrics_1h` giữ
   13 tháng. Bảng gộp lưu **min/max/avg/p95**, không chỉ avg.
3. **Partition theo ngày, dọn bằng `DROP PARTITION`** — không bao giờ `DELETE`.
4. **KHÔNG dùng TimescaleDB.**

## Lý do

- **Bảng rộng tiết kiệm 8–10 lần dung lượng.** Chi phí header dòng (~24 B) + line pointer +
  index chia đều cho 40 giá trị thay vì gánh cho từng giá trị một. Đo trên bài toán tương
  đương: dạng rộng ~0,5 GB so với dạng EAV ~5,2 GB. Với trần 500 MB thì đây không phải tối
  ưu, mà là điều kiện chạy được.
- **`DELETE` khối lượng lớn gây bloat + autovacuum kéo hàng giờ**; `DROP PARTITION` là thao
  tác tức thời.
- **Lưu cả min/max/p95 vì avg nói dối:** avg 5 phút che mất spike CPU 100% kéo dài 40 giây —
  đúng thứ cần nhìn.
- **TimescaleDB đã bị khai tử trên Supabase Postgres 17** (Timescale chuyển sang giấy phép
  TSL không tương thích cam kết open-source của Supabase); chỉ còn dùng được trên PG15 và
  phải gỡ trước khi nâng cấp. Thiết kế dựa vào nó là tự đặt bom hẹn giờ.

## Đường nâng cấp

Quá ~15 máy hoặc cần giữ lịch sử lâu hơn → nâng Supabase Pro (8 GB) và nới thời gian giữ
của từng tầng. Thời gian giữ khai trong config, **nâng gói chỉ là đổi số, không viết lại**.
