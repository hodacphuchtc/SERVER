-- 0003 — Dead-man's switch: phát hiện máy ngừng gửi số liệu.
--
-- Vì sao logic này nằm Ở ĐÂY (trong cơ sở dữ liệu trên cloud) chứ không nằm trong collector:
-- collector chết thì nó không thể tự báo mình đã chết. Đây là kiểu hỏng nguy hiểm nhất của
-- hệ giám sát — "không có dữ liệu mới" bị đọc nhầm thành "không có vấn đề", và màn hình
-- vẫn xanh đúng lúc mọi thứ đang cháy (BRD §7.2 ④).
--
-- Hàm được Cloudflare Worker gọi mỗi phút (ADR-003).
--
-- Cột trả về đặt tên may_id / ten_may chứ không phải host_id: RETURNS TABLE tạo biến OUT
-- cùng tên, và biến đó đụng với cột alerts.host_id trong các CTE bên dưới
-- ("column reference host_id is ambiguous"). Test đã bắt được lỗi này.

-- p_bay_gio tiêm được từ ngoài chứ không dùng thẳng now(): cả engine phải nhìn CÙNG MỘT
-- mốc thời gian trong một vòng đánh giá. Trước đây hàm này dùng now() còn các hàm khác
-- nhận mốc, nên cảnh báo sinh ra mang giờ thật trong khi engine đang xét ở giờ khác — và
-- soat_leo_thang tưởng cảnh báo đã 30 phút chưa ai nhận, đẻ ra email thứ hai.
create or replace function public.soat_mat_lien_lac(p_im_lang_phut int default 3,
                                                    p_bay_gio timestamptz default now())
returns table (may_id uuid, ten_may text, im_lang_phut numeric, hanh_dong text)
language plpgsql
as $$
begin
  return query
  with danh_gia as (
    select h.id                                                                          as id,
           h.ten_nghiep_vu                                                               as ten,
           round(extract(epoch from (p_bay_gio - coalesce(h.lan_day_du_lieu_cuoi, h.tao_luc))) / 60.0, 1) as phut,
           extract(epoch from (p_bay_gio - coalesce(h.lan_day_du_lieu_cuoi, h.tao_luc))) / 60.0 > p_im_lang_phut as qua_han
    from public.hosts h
    where h.dang_theo_doi
  ),
  -- MỞ cảnh báo cho máy vừa quá hạn mà chưa có cảnh báo đang mở.
  mo as (
    insert into public.alerts (host_id, chi_so, muc, gia_tri, nguong, bat_dau_luc)
    select d.id, 'mat_lien_lac', 'nghiem_trong', d.phut, p_im_lang_phut, p_bay_gio
    from danh_gia d
    where d.qua_han
    on conflict (host_id, chi_so, muc) where ket_thuc_luc is null do nothing
    returning alerts.host_id as id_mo
  ),
  -- ĐÓNG cảnh báo cho máy đã gửi dữ liệu trở lại.
  dong as (
    update public.alerts a
       set ket_thuc_luc = p_bay_gio
      from danh_gia d
     where a.host_id = d.id
       and a.chi_so = 'mat_lien_lac'
       and a.ket_thuc_luc is null
       and not d.qua_han
    returning a.host_id as id_dong
  )
  select d.id, d.ten, d.phut,
         case
           when d.id in (select id_mo   from mo)   then 'mo_canh_bao'
           when d.id in (select id_dong from dong) then 'dong_canh_bao'
           when d.qua_han                          then 'van_dang_mat_lien_lac'
           else 'binh_thuong'
         end
  from danh_gia d;
end;
$$;

comment on function public.soat_mat_lien_lac(int, timestamptz) is
  'Cloudflare Worker gọi mỗi phút. Trả về trạng thái từng máy để Worker biết cần gửi mail nào.';
