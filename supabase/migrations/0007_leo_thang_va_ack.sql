-- 0007 — Leo thang phân tầng + ghi nhận xử lý (ack).
--
-- Luật phân tầng đã chốt khi phỏng vấn: quản trị nhận NGAY mọi mức; lãnh đạo CHỈ nhận khi
-- một cảnh báo NGHIÊM TRỌNG chưa ai tiếp nhận sau N phút. Nếu gửi hết cho tất cả thì sau
-- hai tuần lãnh đạo lọc mail sang thư mục khác và kênh đó chết vĩnh viễn — lúc cần thật
-- thì không còn ai đọc.

create table if not exists public.cau_hinh_leo_thang (
  id                              int primary key default 1 check (id = 1),
  lanh_dao_nhan_sau_phut_chua_xu_ly int not null default 30
);
insert into public.cau_hinh_leo_thang (id) values (1) on conflict do nothing;

alter table public.alerts add column if not exists da_leo_thang boolean not null default false;

/*
 * soat_leo_thang() — Worker gọi mỗi phút, SAU soan_thong_bao().
 *
 * Chỉ leo thang khi HỘI ĐỦ ba điều: mức nghiêm trọng · chưa ai bấm "Đã tiếp nhận" · đã
 * quá N phút kể từ lúc mở. Bấm tiếp nhận ở phút thứ 10 thì lãnh đạo không bao giờ nhận
 * được gì — đó là điều kiện nghiệm thu của hạng mục này.
 */
create or replace function public.soat_leo_thang(p_bay_gio timestamptz default now())
returns table (canh_bao_id uuid, ten_may text, khoa text)
language plpgsql as $$
declare v_phut int;
begin
  select lanh_dao_nhan_sau_phut_chua_xu_ly into v_phut from public.cau_hinh_leo_thang where id = 1;

  return query
  with can_leo as (
    select a.id, h.ten_nghiep_vu as ten, a.chi_so, a.gia_tri, a.bat_dau_luc
    from public.alerts a
    join public.hosts h on h.id = a.host_id
    where a.ket_thuc_luc is null
      and a.muc = 'nghiem_trong'
      and a.tiep_nhan_luc is null
      and not a.da_leo_thang
      and a.bat_dau_luc <= p_bay_gio - (v_phut || ' minutes')::interval
  ),
  ghi as (
    insert into public.alert_notifications (khoa_idempotency, loai, nguoi_nhan, tieu_de, than_thu)
    select 'leo_thang:' || c.id::text,
           'canh_bao',
           array['quan_tri', 'lanh_dao'],
           format('Chưa xử lý sau %s phút — %s', v_phut, c.ten),
           -- Ngôn ngữ quản trị, không thuật ngữ kỹ thuật, và nói rõ CẦN GÌ Ở NGƯỜI ĐỌC.
           format('Sự cố tại %s bắt đầu lúc %s và đến giờ vẫn chưa có ai tiếp nhận xử lý.'
                  || E'\n\nĐây là thông báo tự động gửi tới ban lãnh đạo vì sự cố ở mức'
                  || ' nghiêm trọng và đã quá %s phút.'
                  || E'\n\nCần: xác nhận có người đang xử lý.',
                  c.ten, to_char(c.bat_dau_luc, 'HH24:MI DD/MM'), v_phut)
    from can_leo c
    on conflict (khoa_idempotency) do nothing
    returning alert_notifications.khoa_idempotency as k
  ),
  danh_dau as (
    update public.alerts a set da_leo_thang = true
     where a.id in (select cl.id from can_leo cl)
    returning a.id as id_leo
  )
  select c.id, c.ten, 'leo_thang:' || c.id::text
  from can_leo c
  where c.id in (select id_leo from danh_dau);
end $$;

/*
 * tiep_nhan_canh_bao() — người trực bấm nút trong email.
 *
 * Trả về boolean thay vì raise exception khi không tìm thấy: link trong email có thể bị
 * bấm lại sau khi sự cố đã đóng, và ném lỗi vào mặt người vừa cố gắng xử lý sự cố là
 * cách đối xử tệ với đúng người đang giúp mình.
 */
create or replace function public.tiep_nhan_canh_bao(p_canh_bao_id uuid, p_nguoi text)
returns boolean language plpgsql as $$
declare v_co boolean;
begin
  update public.alerts
     set tiep_nhan_luc = now(), tiep_nhan_boi = p_nguoi
   where id = p_canh_bao_id and tiep_nhan_luc is null and ket_thuc_luc is null;
  get diagnostics v_co = row_count;
  return v_co;
end $$;

-- Thời gian khắc phục trung bình. Chỉ tính cảnh báo ĐÃ ĐÓNG — cảnh báo đang mở chưa có
-- thời gian khắc phục, và gộp chúng vào sẽ kéo con số xuống một cách giả tạo.
create or replace view public.thoi_gian_khac_phuc as
select h.ten_nghiep_vu,
       a.chi_so,
       count(*)                                                             as so_su_co,
       round(avg(extract(epoch from (a.ket_thuc_luc - a.bat_dau_luc)) / 60.0)::numeric, 1) as phut_trung_binh,
       round(max(extract(epoch from (a.ket_thuc_luc - a.bat_dau_luc)) / 60.0)::numeric, 1) as phut_lau_nhat
from public.alerts a
join public.hosts h on h.id = a.host_id
where a.ket_thuc_luc is not null
group by h.ten_nghiep_vu, a.chi_so;
