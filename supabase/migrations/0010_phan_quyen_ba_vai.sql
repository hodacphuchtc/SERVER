-- 0010 — Phân quyền ba vai, chặn ở TẦNG DỮ LIỆU.
--
-- Vì sao không chỉ ẩn nút trên giao diện: ẩn nút chặn được người vô tình, không chặn được
-- ai gõ thẳng URL hoặc gọi API. Với hệ giám sát thì thứ rò rỉ là sơ đồ hạ tầng — tên máy,
-- địa chỉ nội bộ, dịch vụ nào chạy ở đâu — đúng bản đồ mà kẻ tấn công cần. Nghiệm thu của
-- hạng mục 6.2 vì thế cố ý là "gõ thẳng URL vào thanh địa chỉ".
--
--   lanh_dao — CHỈ đọc phần đã tổng hợp bằng ngôn ngữ quản trị. Không thấy tên máy thật.
--   quan_tri — đọc và ghi mọi thứ.
--   xem      — đọc mọi thứ kỹ thuật, không sửa được gì.

create table if not exists public.nguoi_dung (
  id      uuid primary key,
  email   text not null unique,
  vai     text not null check (vai in ('lanh_dao', 'quan_tri', 'xem')),
  ten     text,
  tao_luc timestamptz not null default now()
);

alter table public.nguoi_dung enable row level security;
alter table public.nguoi_dung force row level security;

/*
 * auth_uid_an_toan() — bọc auth.uid() của Supabase.
 * Bọc vì hai lý do: ngoài Supabase (test bằng PGlite) không có schema auth, và nếu
 * Supabase đổi cách lấy danh tính thì chỉ phải sửa một chỗ.
 */
create or replace function public.auth_uid_an_toan()
returns uuid language plpgsql stable as $$
declare v uuid;
begin
  begin
    execute 'select auth.uid()' into v;
  exception when others then
    v := nullif(current_setting('app.nguoi_dung_id', true), '')::uuid;
  end;
  return v;
end $$;

/*
 * vai_hien_tai() — vai của người đang đăng nhập.
 *
 * SECURITY DEFINER bắt buộc: nếu hàm này chạy bằng quyền người gọi thì chính nó bị RLS
 * của bảng nguoi_dung chặn, mọi policy dựa vào nó luôn trả false, và hệ thống "an toàn"
 * tới mức không ai vào được.
 */
create or replace function public.vai_hien_tai()
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select vai from public.nguoi_dung where id = public.auth_uid_an_toan();
$$;

-- ── hosts: lãnh đạo KHÔNG đọc (chứa tên máy, hệ điều hành, token băm) ──
drop policy if exists hosts_doc on public.hosts;
create policy hosts_doc on public.hosts for select
  using (public.vai_hien_tai() in ('quan_tri', 'xem'));

drop policy if exists hosts_ghi on public.hosts;
create policy hosts_ghi on public.hosts for all
  using (public.vai_hien_tai() = 'quan_tri')
  with check (public.vai_hien_tai() = 'quan_tri');

drop policy if exists metrics_doc on public.metrics_raw;
create policy metrics_doc on public.metrics_raw for select
  using (public.vai_hien_tai() in ('quan_tri', 'xem'));

drop policy if exists alerts_doc on public.alerts;
create policy alerts_doc on public.alerts for select
  using (public.vai_hien_tai() in ('quan_tri', 'xem'));

drop policy if exists alerts_ghi on public.alerts;
create policy alerts_ghi on public.alerts for update
  using (public.vai_hien_tai() = 'quan_tri')
  with check (public.vai_hien_tai() = 'quan_tri');

-- Outbox: chỉ quản trị — nội dung email có thể chứa tên máy.
drop policy if exists thong_bao_doc on public.alert_notifications;
create policy thong_bao_doc on public.alert_notifications for select
  using (public.vai_hien_tai() = 'quan_tri');

drop policy if exists nguoi_dung_doc on public.nguoi_dung;
create policy nguoi_dung_doc on public.nguoi_dung for select
  using (id = public.auth_uid_an_toan() or public.vai_hien_tai() = 'quan_tri');

drop policy if exists nguoi_dung_ghi on public.nguoi_dung;
create policy nguoi_dung_ghi on public.nguoi_dung for all
  using (public.vai_hien_tai() = 'quan_tri')
  with check (public.vai_hien_tai() = 'quan_tri');

/*
 * tom_tat_cho_lanh_dao() — CỬA DUY NHẤT của vai lãnh đạo.
 *
 * SECURITY DEFINER có chủ đích: lãnh đạo không có quyền đọc bảng nào, nhưng vẫn cần con
 * số tổng hợp. Hàm tự kiểm vai rồi trả về đúng thứ đã diễn giải sang ngôn ngữ quản trị —
 * không tên máy, không tên chỉ số kỹ thuật.
 */
create or replace function public.tom_tat_cho_lanh_dao()
returns table (so_may int, so_may_binh_thuong int, so_su_co_dang_mo int, cau_ket_luan text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_vai text; v_tong int; v_su_co int;
begin
  v_vai := public.vai_hien_tai();
  if v_vai is null then raise exception 'CHUA_DANG_NHAP'; end if;
  if v_vai not in ('lanh_dao', 'quan_tri', 'xem') then raise exception 'KHONG_DU_QUYEN'; end if;

  select count(*) into v_tong from public.hosts where dang_theo_doi;
  select count(distinct host_id) into v_su_co from public.alerts where ket_thuc_luc is null;

  return query select v_tong, v_tong - v_su_co, v_su_co,
    case
      when v_su_co = 0 then 'Toàn bộ hệ thống đang hoạt động bình thường.'
      when v_su_co = 1 then 'Có 1 phần của hệ thống đang gặp sự cố, đội kỹ thuật đã được báo.'
      else format('Có %s phần của hệ thống đang gặp sự cố, đội kỹ thuật đã được báo.', v_su_co)
    end;
end $$;
