-- 0005b — Đánh dấu cảnh báo đã được đưa vào outbox.
-- Tách khỏi bảng alerts ban đầu vì nó thuộc về lớp GỬI, không thuộc lớp PHÁT HIỆN:
-- một cảnh báo tồn tại độc lập với việc đã báo cho ai chưa.
alter table public.alerts
  add column if not exists da_dua_vao_outbox boolean not null default false;
