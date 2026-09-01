-- 0011 — Biến kết quả soát backup/job và CSDL thành CẢNH BÁO.
--
-- Lỗ hổng được phát hiện khi nối các mảnh lại: soat_cong_viec() và soat_csdl() chỉ TRẢ VỀ
-- vấn đề chứ không ghi vào bảng alerts, nên chúng không bao giờ đi vào outbox và không bao
-- giờ thành email. Mỗi bộ test riêng đều xanh vì chúng chỉ kiểm giá trị trả về.
--
-- Đây đúng là kiểu hỏng mà dự án này đang chống: mọi bộ phận tốt, tổng thể không chạy, và
-- không có dòng lỗi nào.

create or replace function public.ghi_canh_bao_cong_viec(p_bay_gio timestamptz default now())
returns table (ma text, hanh_dong text)
language plpgsql as $$
begin
  return query
  with soat as (
    select s.ma, s.ten_de_hieu, s.van_de, s.chi_tiet, c.host_id, c.id as cv_id
    from public.soat_cong_viec(p_bay_gio) s
    join public.cong_viec_dinh_ky c on c.ma = s.ma
  ),
  danh_gia as (
    select s.*,
           s.van_de <> 'binh_thuong' as co_van_de,
           case
             when s.van_de in ('tre', 'chua_bao_gio_chay', 'kich_thuoc_bat_thuong_nghiem_trong')
               then 'nghiem_trong'
             else 'canh_cao'
           end as muc,
           'cong_viec:' || s.ma as chi_so
    from soat s
  ),
  mo as (
    insert into public.alerts (host_id, chi_so, muc, bat_dau_luc)
    select d.host_id, d.chi_so, d.muc, p_bay_gio from danh_gia d where d.co_van_de
    on conflict (host_id, chi_so, muc) where ket_thuc_luc is null do nothing
    returning alerts.chi_so as chi_so_mo
  ),
  dong as (
    update public.alerts a set ket_thuc_luc = p_bay_gio
      from danh_gia d
     where a.chi_so = d.chi_so and a.ket_thuc_luc is null and not d.co_van_de
    returning a.chi_so as chi_so_dong
  )
  select d.ma,
         case
           when d.chi_so in (select chi_so_mo from mo)     then 'mo_canh_bao'
           when d.chi_so in (select chi_so_dong from dong) then 'dong_canh_bao'
           when d.co_van_de                                then 'van_dang_co_van_de'
           else 'binh_thuong'
         end
  from danh_gia d;
end $$;

create or replace function public.ghi_canh_bao_csdl(p_bay_gio timestamptz default now())
returns table (ten_de_hieu text, hanh_dong text)
language plpgsql as $$
begin
  return query
  with soat as (
    select s.ten_de_hieu, s.van_de, c.host_id
    from public.soat_csdl(p_bay_gio) s
    join public.csdl_theo_doi c on c.ten_de_hieu = s.ten_de_hieu
  ),
  danh_gia as (
    select s.*,
           s.van_de <> 'binh_thuong' as co_van_de,
           case when s.van_de in ('khong_ket_noi_duoc', 'khong_do_duoc', 'gan_het_ket_noi')
                then 'nghiem_trong' else 'canh_cao' end as muc,
           'csdl:' || s.ten_de_hieu as chi_so
    from soat s
  ),
  mo as (
    insert into public.alerts (host_id, chi_so, muc, bat_dau_luc)
    select d.host_id, d.chi_so, d.muc, p_bay_gio from danh_gia d where d.co_van_de
    on conflict (host_id, chi_so, muc) where ket_thuc_luc is null do nothing
    returning alerts.chi_so as chi_so_mo
  ),
  dong as (
    update public.alerts a set ket_thuc_luc = p_bay_gio
      from danh_gia d
     where a.chi_so = d.chi_so and a.ket_thuc_luc is null and not d.co_van_de
    returning a.chi_so as chi_so_dong
  )
  select d.ten_de_hieu,
         case
           when d.chi_so in (select chi_so_mo from mo)     then 'mo_canh_bao'
           when d.chi_so in (select chi_so_dong from dong) then 'dong_canh_bao'
           when d.co_van_de                                then 'van_dang_co_van_de'
           else 'binh_thuong'
         end
  from danh_gia d;
end $$;

-- Liệt kê chỉ số đã khai ngưỡng. Worker gọi hàm này để KHÔNG hardcode danh sách chỉ số:
-- thêm một chỉ số vào config là Worker tự đánh giá nó ở vòng kế tiếp, không phải deploy lại.
create or replace function public.danh_sach_chi_so_nguong()
returns table (chi_so text) language sql stable as $$
  select c.chi_so from public.cau_hinh_nguong c order by c.chi_so;
$$;
