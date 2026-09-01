-- 0004 — Ba tầng lưu trữ (ADR-002).
--
-- Bảng gộp lưu min/max/avg/p95 chứ KHÔNG chỉ avg. Lý do rất cụ thể: avg 5 phút che mất
-- một spike CPU 100% kéo dài 40 giây — tức là che đúng thứ cần nhìn. Ai đó "tối ưu" bằng
-- cách chỉ giữ avg là mất khả năng điều tra sự cố ngắn, và sẽ không ai phát hiện ra vì
-- biểu đồ vẫn trông hoàn toàn bình thường.
--
-- Dọn dữ liệu cũ bằng DROP PARTITION, không bao giờ DELETE: xóa 100 triệu dòng bằng DELETE
-- gây bloat và autovacuum kéo hàng giờ.

create table if not exists public.metrics_5m (
  khung_gio        timestamptz not null,
  host_id          uuid not null references public.hosts(id) on delete cascade,
  so_mau           integer not null,
  cpu_min          real, cpu_avg real, cpu_max real, cpu_p95 real,
  ram_min          real, ram_avg real, ram_max real, ram_p95 real,
  dia_phan_tram_max real,
  dia_con_lai_gb_min real,
  mang_ra_avg      bigint,
  primary key (host_id, khung_gio)
);

create table if not exists public.metrics_1h (
  like public.metrics_5m including all
);

-- Gộp một khoảng thời gian từ metrics_raw sang metrics_5m.
-- Idempotent: chạy lại cùng khoảng thì cập nhật chứ không nhân đôi.
create or replace function public.gop_5_phut(p_tu timestamptz, p_den timestamptz)
returns integer language plpgsql as $$
declare v_so_dong integer;
begin
  insert into public.metrics_5m (
    khung_gio, host_id, so_mau,
    cpu_min, cpu_avg, cpu_max, cpu_p95,
    ram_min, ram_avg, ram_max, ram_p95,
    dia_phan_tram_max, dia_con_lai_gb_min, mang_ra_avg
  )
  select
    to_timestamp(floor(extract(epoch from m.thoi_diem) / 300) * 300) as khung_gio,
    m.host_id,
    count(*),
    min(m.cpu_phan_tram), avg(m.cpu_phan_tram)::real, max(m.cpu_phan_tram),
    percentile_cont(0.95) within group (order by m.cpu_phan_tram)::real,
    min(m.ram_phan_tram), avg(m.ram_phan_tram)::real, max(m.ram_phan_tram),
    percentile_cont(0.95) within group (order by m.ram_phan_tram)::real,
    -- Đĩa nằm trong jsonb (một máy nhiều ổ) nên phải mở ra để lấy ổ tệ nhất.
    max((select max((d->>'phan_tram_dung')::real) from jsonb_array_elements(m.dia) d)),
    min((select min((d->>'con_lai_gb')::real)    from jsonb_array_elements(m.dia) d)),
    avg(m.mang_ra_byte_moi_giay)::bigint
  from public.metrics_raw m
  where m.thoi_diem >= p_tu and m.thoi_diem < p_den
  group by 1, 2
  on conflict (host_id, khung_gio) do update set
    so_mau = excluded.so_mau,
    cpu_min = excluded.cpu_min, cpu_avg = excluded.cpu_avg,
    cpu_max = excluded.cpu_max, cpu_p95 = excluded.cpu_p95,
    ram_min = excluded.ram_min, ram_avg = excluded.ram_avg,
    ram_max = excluded.ram_max, ram_p95 = excluded.ram_p95,
    dia_phan_tram_max = excluded.dia_phan_tram_max,
    dia_con_lai_gb_min = excluded.dia_con_lai_gb_min,
    mang_ra_avg = excluded.mang_ra_avg;

  get diagnostics v_so_dong = row_count;
  return v_so_dong;
end $$;

-- Dọn partition cũ hơn N ngày. Trả về tên các partition đã bỏ để ghi nhật ký.
create or replace function public.don_partition_cu(p_giu_ngay int default 7)
returns text[] language plpgsql as $$
declare v_ten text; v_da_bo text[] := '{}';
begin
  for v_ten in
    select c.relname
    from pg_class c
    join pg_inherits i on i.inhrelid = c.oid
    join pg_class p on p.oid = i.inhparent
    where p.relname = 'metrics_raw'
      and c.relname ~ '^metrics_raw_\d{8}$'
      and to_date(right(c.relname, 8), 'YYYYMMDD') < current_date - p_giu_ngay
  loop
    execute format('drop table if exists public.%I', v_ten);
    v_da_bo := v_da_bo || v_ten;
  end loop;
  return v_da_bo;
end $$;

comment on function public.don_partition_cu(int) is
  'DROP PARTITION chứ không DELETE — ADR-002. Worker gọi mỗi ngày một lần.';
