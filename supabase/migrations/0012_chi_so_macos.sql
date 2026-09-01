-- 0012 — Mười lăm chỉ số macOS còn thiếu (hạng mục 0.3/0.4 của PLAN_V2).
--
-- Vì sao cần: engine chỉ đánh giá được thứ có trong CỘT. Trước migration này, ba tín hiệu
-- quan trọng nhất của một máy macOS đều không có chỗ để lưu:
--   · tốc độ GHI swap — khác hẳn mức tồn `swap_dung_mb`; mức tồn có thể là tàn dư vô hại
--     từ bốn giờ trước, còn tốc độ mới là thứ đang làm máy không dùng được;
--   · nguồn điện — một "máy chủ" chạy bằng pin là một cái hẹn giờ tắt máy, và không chỉ
--     số nào khác nói được điều đó;
--   · tải cao ĐỒNG THỜI với CPU rảnh — chữ ký kinh điển của nghẽn đĩa. Thiếu cặp này thì
--     "tải cao" và "CPU thấp" mãi là hai cảnh báo mâu thuẫn nhau, không ai luận ra được.
--
-- KHÔNG sửa 0002 đã chạy (rule 5 module-boundaries) — thay bằng create or replace ở cuối.

-- ── 1. Cột hẹp cho số vô hướng ────────────────────────────────────────────────────────
-- Thêm cột vào bảng phân mảnh: Postgres tự lan xuống mọi partition đã có và sẽ có.
alter table public.metrics_raw
  -- Bộ nhớ
  add column if not exists swap_ra_moi_giay     bigint,
  add column if not exists swap_tong_mb         integer,
  -- Nguồn điện. Máy chủ chạy pin = hẹn giờ tắt máy.
  add column if not exists nguon_dien           text,
  add column if not exists pin_phan_tram        smallint,
  add column if not exists pin_con_phut         integer,
  -- Nhiệt: % tốc độ CPU còn được phép dùng. 100 = không bị ghìm.
  -- Máy bị ghìm còn 50% hiện "bận 60%" nhưng thực tế chỉ làm được nửa việc.
  add column if not exists gioi_han_toc_do_cpu  smallint,
  -- Tiến trình/thread LUÔN đi kèm trần: số tuyệt đối vô nghĩa và không mang sang máy khác
  -- được. (Và `kern.num_threads` là TRẦN chứ không phải số đếm — bẫy đã mắc một lần.)
  add column if not exists so_tien_trinh        integer,
  add column if not exists so_thread            integer,
  add column if not exists tran_tien_trinh      integer,
  add column if not exists tran_thread          integer,
  -- Nhập/xuất: macOS không có cột iowait, nên dùng cặp (tải cao + CPU rảnh) thay thế.
  add column if not exists dia_tps              real,
  add column if not exists dia_kb_moi_lan       real,
  add column if not exists cpu_ranh             real,
  -- Mắt xích nối trụ bộ nhớ với trụ chỗ lưu trữ: bộ nhớ thiếu → swap phình → ăn đĩa →
  -- đĩa hết chỗ → swap không phình được nữa. Đo được nó mới đưa ra được khuyến nghị
  -- "khởi động lại trả lại ngay N GB" — một câu kiểm chứng được.
  add column if not exists dia_vm_dung_gb       real,
  -- Ảnh chụp Time Machine cục bộ: nguyên nhân số một của "đĩa đầy ảo" trên macOS.
  -- Bằng 0 cũng là kết luận có giá trị: đĩa đầy THẬT, không có gì dễ xoá.
  add column if not exists snapshot_cuc_bo      smallint,
  -- Thứ dạng DANH SÁCH gom vào một jsonb, cùng lý do `dia` và `tien_trinh_top` đã là jsonb:
  -- thêm một loại danh sách mới không phải đổi schema lần nữa.
  add column if not exists chi_so_them          jsonb not null default '{}'::jsonb;

comment on column public.metrics_raw.chi_so_them is
  'Danh sách phụ: cong_ra_ngoai (số hiệu cổng), cong_trong_may, dich_vu_loi (nhãn). '
  'KHÔNG được chứa tên tiến trình, đường dẫn, hay số hiệu người dùng.';

-- ── 2. Chốt chặn lộ dữ liệu cá nhân ───────────────────────────────────────────────────
-- Canh bằng MÁY chứ không bằng lời dặn — cùng cách đã dùng cho tien_trinh_khong_co_tham_so().
create or replace function public.chi_so_them_khong_lo_du_lieu(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_khoa text;
  v_cong jsonb;
  v_nhan jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return p is null;
  end if;

  -- Chỉ ba khoá được phép. Khoá lạ = ai đó đang nhét thêm dữ liệu không qua rà soát.
  for v_khoa in select jsonb_object_keys(p) loop
    if v_khoa not in ('cong_ra_ngoai', 'cong_trong_may', 'dich_vu_loi') then
      return false;
    end if;
  end loop;

  -- Cổng phải là SỐ. Dùng lsof sẽ kéo theo tên người dùng và đường dẫn nhị phân, nên ràng
  -- buộc "chỉ được là số" chặn luôn cả việc đổi sang lsof sau này mà quên hệ quả.
  if p ? 'cong_ra_ngoai' then
    if jsonb_typeof(p->'cong_ra_ngoai') <> 'array' then return false; end if;
    for v_cong in select * from jsonb_array_elements(p->'cong_ra_ngoai') loop
      if jsonb_typeof(v_cong) <> 'number' then return false; end if;
    end loop;
  end if;

  -- Nhãn dịch vụ: không đường dẫn, không số hiệu người dùng (gui/501/…).
  if p ? 'dich_vu_loi' then
    if jsonb_typeof(p->'dich_vu_loi') <> 'array' then return false; end if;
    for v_nhan in select * from jsonb_array_elements(p->'dich_vu_loi') loop
      if jsonb_typeof(v_nhan) <> 'string' then return false; end if;
      if (v_nhan #>> '{}') ~ '(/|\\)' then return false; end if;
      if (v_nhan #>> '{}') ~ '\m(gui|user)/[0-9]+' then return false; end if;
    end loop;
  end if;

  return true;
end;
$$;

alter table public.metrics_raw
  drop constraint if exists metrics_raw_chi_so_them_sach;
alter table public.metrics_raw
  add constraint metrics_raw_chi_so_them_sach
  check (public.chi_so_them_khong_lo_du_lieu(chi_so_them));

-- ── 3. Cùng các cột đó cho bảng gộp, để giao diện đọc được mà không chạm metrics_raw ──
alter table public.metrics_5m
  add column if not exists swap_dung_mb_max        integer,
  add column if not exists swap_ra_moi_giay_max    bigint,
  add column if not exists ap_luc_bo_nho_xau_nhat  text,
  add column if not exists cpu_hang_doi_max        real,
  add column if not exists cpu_ranh_min            real,
  add column if not exists dia_vm_dung_gb_max      real,
  add column if not exists nguon_dien_cuoi         text,
  add column if not exists pin_phan_tram_cuoi      smallint;

alter table public.metrics_1h
  add column if not exists swap_dung_mb_max        integer,
  add column if not exists swap_ra_moi_giay_max    bigint,
  add column if not exists ap_luc_bo_nho_xau_nhat  text,
  add column if not exists cpu_hang_doi_max        real,
  add column if not exists cpu_ranh_min            real,
  add column if not exists dia_vm_dung_gb_max      real,
  add column if not exists nguon_dien_cuoi         text,
  add column if not exists pin_phan_tram_cuoi      smallint;

-- ── 4. ghi_metric: nhận thêm 15 trường ────────────────────────────────────────────────
-- create or replace, KHÔNG sửa file 0002 đã chạy (rule 5).
create or replace function public.ghi_metric(p_token text, p_so_lieu jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_host_id     uuid;
  v_thoi_diem   timestamptz;
  v_host_khai   uuid;
  v_them        jsonb;
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'TOKEN_KHONG_HOP_LE' using hint = 'Token phải dài tối thiểu 32 ký tự.';
  end if;

  select id into v_host_id
  from public.hosts
  where token_bam = encode(sha256(convert_to(p_token, 'utf8')), 'hex')
    and dang_theo_doi;

  if v_host_id is null then
    raise exception 'TOKEN_KHONG_HOP_LE';
  end if;

  v_host_khai := nullif(p_so_lieu->>'host_id', '')::uuid;
  if v_host_khai is not null and v_host_khai <> v_host_id then
    raise exception 'TOKEN_KHONG_KHOP_HOST'
      using hint = 'Token này thuộc về một máy khác với host_id đã khai trong payload.';
  end if;

  v_thoi_diem := coalesce(nullif(p_so_lieu->>'thoi_diem', '')::timestamptz, now());

  -- Dựng chi_so_them từ đúng ba khoá được phép. Dựng lại thay vì bê nguyên payload: nếu
  -- collector (hay ai đó) nhét thêm khoá lạ, nó bị bỏ ở đây chứ không phải bị ràng buộc
  -- check từ chối cả dòng — mất một chỉ số phụ tốt hơn mất trọn một nhịp đo.
  v_them := jsonb_strip_nulls(jsonb_build_object(
    'cong_ra_ngoai',  p_so_lieu->'cong_ra_ngoai',
    'cong_trong_may', p_so_lieu->'cong_trong_may',
    'dich_vu_loi',    p_so_lieu->'dich_vu_loi'
  ));

  insert into public.metrics_raw (
    thoi_diem, host_id,
    cpu_phan_tram, cpu_hang_doi, tai_trung_binh_15p,
    ram_phan_tram, ram_tong_mb, ram_con_lai_mb, swap_dung_mb, swap_vao_moi_giay, ap_luc_bo_nho,
    dia,
    mang_vao_byte_moi_giay, mang_ra_byte_moi_giay, mang_goi_loi, mang_goi_tong,
    uptime_giay, thoi_diem_khoi_dong,
    tien_trinh_top, dich_vu_thieu,
    swap_ra_moi_giay, swap_tong_mb,
    nguon_dien, pin_phan_tram, pin_con_phut, gioi_han_toc_do_cpu,
    so_tien_trinh, so_thread, tran_tien_trinh, tran_thread,
    dia_tps, dia_kb_moi_lan, cpu_ranh, dia_vm_dung_gb, snapshot_cuc_bo,
    chi_so_them
  ) values (
    v_thoi_diem, v_host_id,
    (p_so_lieu->>'cpu_phan_tram')::real,
    (p_so_lieu->>'cpu_hang_doi')::real,
    (p_so_lieu->>'tai_trung_binh_15p')::real,
    (p_so_lieu->>'ram_phan_tram')::real,
    (p_so_lieu->>'ram_tong_mb')::integer,
    (p_so_lieu->>'ram_con_lai_mb')::integer,
    (p_so_lieu->>'swap_dung_mb')::integer,
    (p_so_lieu->>'swap_vao_moi_giay')::bigint,
    nullif(p_so_lieu->>'ap_luc_bo_nho', ''),
    coalesce(p_so_lieu->'dia', '[]'::jsonb),
    (p_so_lieu->>'mang_vao_byte_moi_giay')::bigint,
    (p_so_lieu->>'mang_ra_byte_moi_giay')::bigint,
    (p_so_lieu->>'mang_goi_loi')::bigint,
    (p_so_lieu->>'mang_goi_tong')::bigint,
    (p_so_lieu->>'uptime_giay')::bigint,
    nullif(p_so_lieu->>'thoi_diem_khoi_dong', '')::timestamptz,
    coalesce(p_so_lieu->'tien_trinh_top', '[]'::jsonb),
    coalesce(p_so_lieu->'dich_vu_thieu', '[]'::jsonb),
    (p_so_lieu->>'swap_ra_moi_giay')::bigint,
    (p_so_lieu->>'swap_tong_mb')::integer,
    nullif(p_so_lieu->>'nguon_dien', ''),
    (p_so_lieu->>'pin_phan_tram')::smallint,
    (p_so_lieu->>'pin_con_phut')::integer,
    (p_so_lieu->>'gioi_han_toc_do_cpu')::smallint,
    (p_so_lieu->>'so_tien_trinh')::integer,
    (p_so_lieu->>'so_thread')::integer,
    (p_so_lieu->>'tran_tien_trinh')::integer,
    (p_so_lieu->>'tran_thread')::integer,
    (p_so_lieu->>'dia_tps')::real,
    (p_so_lieu->>'dia_kb_moi_lan')::real,
    (p_so_lieu->>'cpu_ranh')::real,
    (p_so_lieu->>'dia_vm_dung_gb')::real,
    (p_so_lieu->>'snapshot_cuc_bo')::smallint,
    coalesce(v_them, '{}'::jsonb)
  )
  on conflict (host_id, thoi_diem) do nothing;

  update public.hosts
     set lan_day_du_lieu_cuoi = greatest(coalesce(lan_day_du_lieu_cuoi, v_thoi_diem), v_thoi_diem)
   where id = v_host_id;

  return v_host_id;
end;
$$;

-- Vai `anon` chỉ tồn tại trên Supabase. Test chạy bằng PGlite (Postgres thuần) nên phải
-- kiểm trước, y như 0002 đã làm — không kiểm thì mọi test đụng migration đều đỏ.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function public.ghi_metric(text, jsonb) to anon;
  end if;
end $$;
