-- 0016 — Biến DỰ BÁO đầy đĩa thành CẢNH BÁO (hạng mục 1.2 của PLAN_V2).
--
-- `du_bao_day_dia()` viết xong từ migration 0008, có test riêng, chạy đúng — và KHÔNG AI
-- GỌI. Không có trong 8 bước của chayMotVong (vong-danh-gia.ts), không có trong worker.
-- Ngưỡng `diaDuBaoDayNgay: {canhCao: 14, nghiemTrong: 7}` khai trong config từ ngày đầu
-- cũng không có dòng code nào so sánh.
--
-- Đây là tính năng BRD đánh giá cao nhất (B4): nó biến giám sát từ PHẢN ỨNG thành PHÒNG
-- NGỪA. Ngưỡng tĩnh chỉ báo khi đã 90% đầy — lúc đó còn vài ngày. Dự báo báo trước hai
-- tuần, đủ thời gian duyệt tiền mua ổ cứng.
--
-- Ngưỡng truyền vào bằng THAM SỐ (rule 4): nguồn sự thật là config/nguong-canh-bao.json.

create or replace function public.ghi_canh_bao_du_bao_dia(
  p_canh_cao_ngay     real,
  p_nghiem_trong_ngay real,
  p_cua_so_ngay       int         default 7,
  p_bay_gio           timestamptz default now()
)
returns table (ten_may text, ten_o text, hanh_dong text)
language plpgsql as $$
begin
  return query
  with du_bao as (
    select d.may_id, d.ten_may, d.ten_o, d.con_bao_nhieu_ngay, d.gb_moi_ngay, d.dien_giai
    from public.du_bao_day_dia(p_cua_so_ngay, p_bay_gio) d
  ),
  danh_gia as (
    select b.*,
           -- `con_bao_nhieu_ngay is null` = dung lượng ổn định hoặc chưa đủ mẫu. KHÔNG
           -- coi là có vấn đề: thà không trả lời còn hơn trả lời sai một cách đầy thuyết
           -- phục (đúng nguyên tắc đã ghi ở 0008).
           b.con_bao_nhieu_ngay is not null
             and b.con_bao_nhieu_ngay <= p_canh_cao_ngay as co_van_de,
           case when b.con_bao_nhieu_ngay is not null
                     and b.con_bao_nhieu_ngay <= p_nghiem_trong_ngay
                then 'nghiem_trong' else 'canh_cao' end   as muc,
           -- Một chỉ số cho MỖI Ổ: máy có 3 ổ thì mỗi ổ có lịch đầy riêng.
           'du_bao_day_dia:' || b.ten_o                    as chi_so
    from du_bao b
  ),
  mo as (
    insert into public.alerts (host_id, chi_so, muc, gia_tri, nguong, bat_dau_luc,
                               dien_giai, anh_huong, khuyen_nghi)
    select d.may_id, d.chi_so, d.muc, d.con_bao_nhieu_ngay::real,
           case d.muc when 'nghiem_trong' then p_nghiem_trong_ngay else p_canh_cao_ngay end,
           p_bay_gio,
           d.dien_giai,
           'Khi ổ đầy hẳn, máy không ghi được dữ liệu mới: phần mềm báo lỗi và bản sao lưu thất bại.',
           jsonb_build_array(
             jsonb_build_object('viec', 'Dọn tệp tạm, bản ghi cũ và dữ liệu không còn dùng'),
             jsonb_build_object('viec', 'Nếu dung lượng tăng đều mỗi ngày thì cần duyệt mua thêm ổ lưu trữ',
                                'cach_lam', 'Đây là việc cần người quyết chi, nên báo sớm khi còn hai tuần.'))
    from danh_gia d where d.co_van_de
    on conflict (host_id, chi_so, muc) where ket_thuc_luc is null do nothing
    returning alerts.host_id as id_mo, alerts.chi_so as chi_so_mo
  ),
  dong as (
    update public.alerts a set ket_thuc_luc = p_bay_gio
      from danh_gia d
     where a.host_id = d.may_id and a.chi_so = d.chi_so
       and a.ket_thuc_luc is null and not d.co_van_de
    returning a.chi_so as chi_so_dong
  )
  select d.ten_may, d.ten_o,
         case
           when d.chi_so in (select chi_so_mo   from mo)   then 'mo_canh_bao'
           when d.chi_so in (select chi_so_dong from dong) then 'dong_canh_bao'
           when d.co_van_de                                then 'van_dang_co_van_de'
           else 'binh_thuong'
         end
  from danh_gia d;
end $$;

comment on function public.ghi_canh_bao_du_bao_dia(real, real, int, timestamptz) is
  'Biến kết quả du_bao_day_dia() thành cảnh báo. Ngưỡng (ngày còn lại) truyền vào bằng '
  'tham số — nguồn sự thật là config/nguong-canh-bao.json → phanCung.diaDuBaoDayNgay.';
