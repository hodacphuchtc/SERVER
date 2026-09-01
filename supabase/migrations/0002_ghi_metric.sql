-- 0002 — ghi_metric(): ĐƯỜNG GHI DUY NHẤT của collector.
--
-- Vì sao hàm này tồn tại thay vì cho collector INSERT thẳng: collector chạy trên máy công
-- ty, và bất kỳ ai chạm được máy đó cũng đọc được khóa nó cầm. Nếu khóa đó là service_role
-- thì mất toàn quyền cơ sở dữ liệu (BRD §7.2 ②). Nên collector chỉ cầm một token gắn với
-- ĐÚNG MỘT máy, và host_id được SUY RA từ token — người gọi không khai được.
--
-- SECURITY DEFINER: hàm chạy bằng quyền của chủ sở hữu để ghi được vào bảng đang bật RLS,
-- nhưng nó tự kiểm token trước. search_path bị ghim để chống tấn công chiếm tên hàm.

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
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'TOKEN_KHONG_HOP_LE' using hint = 'Token phải dài tối thiểu 32 ký tự.';
  end if;

  -- host_id SUY RA từ token. Đây là chốt chặn chính.
  select id into v_host_id
  from public.hosts
  where token_bam = encode(sha256(convert_to(p_token, 'utf8')), 'hex')
    and dang_theo_doi;

  if v_host_id is null then
    raise exception 'TOKEN_KHONG_HOP_LE';
  end if;

  -- Nếu payload có khai host_id thì nó PHẢI khớp. Về mặt kỹ thuật có thể bỏ qua trường
  -- này, nhưng từ chối thẳng thì một collector bị cấu hình sai sẽ lộ ra ngay ở lần ghi
  -- đầu, thay vì âm thầm ghi số của máy A vào hồ sơ máy A trong khi người vận hành tin
  -- rằng mình đang cấu hình cho máy B.
  v_host_khai := nullif(p_so_lieu->>'host_id', '')::uuid;
  if v_host_khai is not null and v_host_khai <> v_host_id then
    raise exception 'TOKEN_KHONG_KHOP_HOST'
      using hint = 'Token này thuộc về một máy khác với host_id đã khai trong payload.';
  end if;

  v_thoi_diem := coalesce(nullif(p_so_lieu->>'thoi_diem', '')::timestamptz, now());

  insert into public.metrics_raw (
    thoi_diem, host_id,
    cpu_phan_tram, cpu_hang_doi, tai_trung_binh_15p,
    ram_phan_tram, ram_tong_mb, ram_con_lai_mb, swap_dung_mb, swap_vao_moi_giay, ap_luc_bo_nho,
    dia,
    mang_vao_byte_moi_giay, mang_ra_byte_moi_giay, mang_goi_loi, mang_goi_tong,
    uptime_giay, thoi_diem_khoi_dong,
    tien_trinh_top, dich_vu_thieu
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
    coalesce(p_so_lieu->'dich_vu_thieu', '[]'::jsonb)
  )
  -- Collector có hàng đợi tại chỗ và đẩy bù sau khi mất mạng, nên gửi lại cùng một mốc
  -- thời gian là chuyện bình thường — không phải lỗi.
  on conflict (host_id, thoi_diem) do nothing;

  update public.hosts
     set lan_day_du_lieu_cuoi = greatest(coalesce(lan_day_du_lieu_cuoi, v_thoi_diem), v_thoi_diem)
   where id = v_host_id;

  return v_host_id;
end;
$$;

-- Cấp quyền gọi cho vai ẩn danh: đây là cửa duy nhất collector cần, và nó tự kiểm token.
-- Mọi bảng vẫn bị RLS chặn sạch, nên khóa anon không đọc/ghi thẳng được gì.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function public.ghi_metric(text, jsonb) to anon;
  end if;
end $$;

-- Xoay token: sinh token mới cho một máy. Chỉ chạy bằng quyền quản trị.
create or replace function public.xoay_token(p_ten_nghiep_vu text, p_token_moi text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if length(p_token_moi) < 32 then
    raise exception 'TOKEN_QUA_NGAN';
  end if;
  update public.hosts
     set token_bam = encode(sha256(convert_to(p_token_moi, 'utf8')), 'hex'),
         token_tao_luc = now()
   where ten_nghiep_vu = p_ten_nghiep_vu;
  if not found then
    raise exception 'KHONG_TIM_THAY_MAY';
  end if;
end $$;

revoke execute on function public.xoay_token(text, text) from public;
