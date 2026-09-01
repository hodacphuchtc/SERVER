-- 0015 — Cho engine đọc nốt các ngưỡng đã khai từ lâu (hạng mục 1.2 của PLAN_V2).
--
-- NGHỊCH LÝ ĐẮT GIÁ NHẤT CỦA DỰ ÁN: config/nguong-canh-bao.json đã khai đủ 20 dòng ngưỡng
-- từ ngày đầu — đĩa theo %, đĩa theo GB tuyệt đối, áp lực bộ nhớ, swap, tải, lỗi gói mạng.
-- Nhưng danh_gia_nguong (0005:52-53) chỉ có ĐÚNG HAI nhánh CASE: cpu_phan_tram và
-- ram_phan_tram. Mọi ngưỡng còn lại là chữ chết.
--
-- Hệ quả đo được: máy MacBook đang 97,8% đầy đĩa, còn 3,9 GB — dưới cả ngưỡng nghiêm trọng
-- 10 GB lẫn ngưỡng 90% — mà engine hoàn toàn mù. Hệ thống đã biết trước cách gọi tình trạng
-- này là "nghiêm trọng" từ lâu, chỉ là không có ai đi hỏi nó.

-- ── 1. Ngưỡng theo HỆ ĐIỀU HÀNH ───────────────────────────────────────────────────────
-- Vì sao cần: nap-cau-hinh.ts nạp ram_phan_tram 85/95 cho MỌI máy, trong khi tài liệu của
-- chính dự án (docs/architecture/metric-2-nen-tang.md §2.1) viết rõ "90% RAM đã dùng trên
-- máy Mac là bình thường" — macOS dùng RAM rỗi làm cache rất hung. Áp 85% cho macOS là
-- nguồn báo động giả thường trực, đe doạ thẳng chỉ tiêu dưới 5 cảnh báo/tuần.
alter table public.cau_hinh_nguong
  add column if not exists he_dieu_hanh text;

comment on column public.cau_hinh_nguong.he_dieu_hanh is
  'null = áp dụng cho mọi máy. Đặt ''windows'' hoặc ''macos'' để giới hạn — dùng cho các '
  'chỉ số mà hai nền tảng hiểu khác nhau, ví dụ ram_phan_tram.';

-- ── 2. Câu diễn giải và câu hệ quả, theo từng chỉ số ─────────────────────────────────
--
-- Đây là lớp phiên dịch TỐI THIỂU, đặt ngay tại chỗ phát hiện. Lớp phiên dịch đầy đủ ở
-- TypeScript (gói sau) sẽ viết đè bằng câu có nguyên nhân gốc và danh sách hành động.
-- Nhưng có sẵn một câu đọc được vẫn hơn hẳn để trống: nếu lớp kia hỏng, email vẫn có nghĩa
-- thay vì rơi về "cpu_phan_tram: 97".
--
-- KHÔNG dùng thuật ngữ kỹ thuật thô: người đọc email lúc 2 giờ sáng cần biết chuyện gì,
-- không cần biết tên cột trong cơ sở dữ liệu.
create or replace function public.cau_dien_giai(p_chi_so text, p_gia_tri double precision, p_nguong double precision)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_chi_so
    when 'cpu_phan_tram' then
      format('Bộ xử lý đang chạy ở mức %s%% (ngưỡng %s%%) và giữ mức đó liên tục.',
             round(p_gia_tri::numeric, 1), round(p_nguong::numeric))
    when 'ram_phan_tram' then
      format('Bộ nhớ đã dùng %s%% (ngưỡng %s%%).',
             round(p_gia_tri::numeric, 1), round(p_nguong::numeric))
    when 'dia_phan_tram_dung' then
      format('Ổ đĩa đã dùng %s%% dung lượng (ngưỡng %s%%).',
             round(p_gia_tri::numeric, 1), round(p_nguong::numeric))
    when 'dia_con_lai_gb' then
      format('Ổ đĩa chỉ còn %s GB trống (ngưỡng %s GB).',
             round(p_gia_tri::numeric, 1), round(p_nguong::numeric, 1))
    when 'swap_dung_ty_le' then
      format('Vùng nhớ tạm trên ổ đĩa đã dùng %s%% — máy đang phải mượn ổ cứng làm bộ nhớ.',
             round((p_gia_tri * 100)::numeric, 1))
    when 'swap_ra_moi_giay' then
      format('Máy đang liên tục đẩy dữ liệu từ bộ nhớ xuống ổ đĩa (%s MB mỗi giây).',
             round((p_gia_tri / 1048576)::numeric, 1))
    when 'ap_luc_bo_nho' then
      case when p_gia_tri >= 2 then 'Bộ nhớ đã cạn — máy đang phải xoay xở từng chút một.'
           else 'Bộ nhớ đang căng, máy bắt đầu phải dồn dịch dữ liệu.' end
    when 'cpu_hang_doi' then
      format('Có %s việc đang xếp hàng chờ máy xử lý (ngưỡng %s).',
             round(p_gia_tri::numeric, 1), round(p_nguong::numeric, 1))
    when 'pin_phan_tram' then
      format('Máy đang chạy bằng pin và chỉ còn %s%%.', round(p_gia_tri::numeric))
    when 'gioi_han_toc_do_cpu' then
      format('Máy đang tự giảm tốc còn %s%% để hạ nhiệt — mọi việc sẽ chậm đi tương ứng.',
             round(p_gia_tri::numeric))
    when 'mat_lien_lac' then 'Máy đã ngừng gửi số liệu.'
    else null
  end;
$$;

create or replace function public.cau_anh_huong(p_chi_so text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  -- ④ Hệ quả nếu KHÔNG làm gì. Đây là thứ biến một con số thành một hành động: người đọc
  -- phải hiểu vì sao mình nên bỏ việc đang làm để xử lý cái này.
  select case p_chi_so
    when 'cpu_phan_tram' then 'Người dùng sẽ thấy phần mềm phản hồi chậm dần.'
    when 'ram_phan_tram' then 'Máy sẽ bắt đầu mượn ổ cứng làm bộ nhớ và chậm hẳn.'
    when 'dia_phan_tram_dung' then
      'Khi hết chỗ, máy không ghi được dữ liệu mới: phần mềm báo lỗi, bản sao lưu thất bại.'
    when 'dia_con_lai_gb' then
      'Dưới khoảng 2 GB, hệ điều hành không tạo được vùng nhớ tạm; ứng dụng bị tắt đột ngột '
      || 'và máy có thể không khởi động lại được. Đây là loại hỏng mất dữ liệu.'
    when 'swap_dung_ty_le' then
      'Máy sẽ chậm dần cho tới lúc gần như không dùng được, dù bộ xử lý vẫn đang rảnh.'
    when 'swap_ra_moi_giay' then 'Ổ cứng bị hao mòn nhanh hơn bình thường và máy giật liên tục.'
    when 'ap_luc_bo_nho' then 'Ứng dụng có thể bị hệ điều hành tắt bất ngờ để lấy lại bộ nhớ.'
    when 'cpu_hang_doi' then 'Việc mới sẽ phải chờ, người dùng thấy máy "đơ".'
    when 'pin_phan_tram' then
      'Hết pin là máy tắt đột ngột — mọi việc đang chạy dừng giữa chừng và dữ liệu đang ghi có thể hỏng.'
    when 'gioi_han_toc_do_cpu' then 'Mọi tác vụ chậm đi mà không có dấu hiệu gì rõ ràng.'
    when 'mat_lien_lac' then
      'Không biết tình trạng máy. Không đo được KHÔNG có nghĩa là máy đang khoẻ.'
    else null
  end;
$$;

-- ── 3. danh_gia_nguong: đủ nhánh chỉ số + lọc theo hệ điều hành ───────────────────────
create or replace function public.danh_gia_nguong(p_chi_so text, p_bay_gio timestamptz default now())
returns table (may_id uuid, ten_may text, hanh_dong text, muc_moi text, gia_tri_hien_tai real)
language plpgsql as $$
declare
  v_cfg public.cau_hinh_nguong%rowtype;
begin
  select * into v_cfg from public.cau_hinh_nguong where chi_so = p_chi_so;
  if not found then
    raise exception 'CHUA_KHAI_NGUONG: %', p_chi_so;
  end if;

  return query
  with mau as (
    select m.host_id as id,
           m.thoi_diem,
           -- Ép cả biểu thức về real: các nhánh trả kiểu khác nhau (real, integer,
           -- double precision) nên Postgres tự nâng lên double precision, lệch với kiểu
           -- trả về đã khai của hàm.
           (case p_chi_so
             when 'cpu_phan_tram' then m.cpu_phan_tram
             when 'ram_phan_tram' then m.ram_phan_tram
             -- Ổ ĐĨA: `dia` là jsonb (một máy có nhiều ổ), nên phải bung ra rồi lấy ổ TỆ
             -- NHẤT. Đây chính là lý do hai chỉ số này bị bỏ quên: chúng không phải cột số
             -- nên nhánh CASE cũ không đọc được, và không ai để ý là chúng thiếu.
             when 'dia_phan_tram_dung' then
               (select max((d->>'phan_tram_dung')::real) from jsonb_array_elements(m.dia) d)
             when 'dia_con_lai_gb' then
               (select min((d->>'con_lai_gb')::real) from jsonb_array_elements(m.dia) d)
             -- Swap theo TỶ LỆ, không theo số tuyệt đối: 4 GB swap trên máy 8 GB là nguy
             -- cấp, trên máy 128 GB là bình thường.
             when 'swap_dung_ty_le' then
               case when coalesce(m.swap_tong_mb, 0) > 0
                    then m.swap_dung_mb::real / m.swap_tong_mb else null end
             when 'swap_ra_moi_giay' then m.swap_ra_moi_giay::real
             -- Áp lực bộ nhớ là chuỗi, quy về thang số để so ngưỡng được: 0 · 1 · 2.
             when 'ap_luc_bo_nho' then
               case m.ap_luc_bo_nho when 'critical' then 2 when 'warn' then 1
                                    when 'normal' then 0 else null end
             when 'cpu_hang_doi' then m.cpu_hang_doi
             -- Pin: THẤP là xấu (cao_la_xau = false trong cấu hình).
             when 'pin_phan_tram' then m.pin_phan_tram::real
             -- Ghìm tốc độ vì nhiệt: THẤP là xấu. 100 = không bị ghìm.
             when 'gioi_han_toc_do_cpu' then m.gioi_han_toc_do_cpu::real
             else null
           end)::real as gia_tri
    from public.metrics_raw m
    join public.hosts h2 on h2.id = m.host_id
    where m.thoi_diem > p_bay_gio - (v_cfg.giu_trong_phut || ' minutes')::interval
      and m.thoi_diem <= p_bay_gio
      -- Lọc theo hệ điều hành: null nghĩa là áp dụng cho mọi máy.
      and (v_cfg.he_dieu_hanh is null or h2.he_dieu_hanh = v_cfg.he_dieu_hanh)
  ),
  tong_hop as (
    select mau.id,
           count(*) as so_mau,
           bool_and(case when v_cfg.cao_la_xau then mau.gia_tri >= v_cfg.nghiem_trong
                                               else mau.gia_tri <= v_cfg.nghiem_trong end) as moi_mau_deu_nghiem_trong,
           bool_and(case when v_cfg.cao_la_xau then mau.gia_tri >= v_cfg.canh_cao
                                               else mau.gia_tri <= v_cfg.canh_cao end) as moi_mau_deu_canh_cao,
           (array_agg(mau.gia_tri order by mau.thoi_diem desc))[1] as gia_tri_moi_nhat
    from mau
    where mau.gia_tri is not null
    group by mau.id
  ),
  du_mau_tat as (
    select t.id,
           bool_and(case when v_cfg.cao_la_xau then g.gia_tri < v_cfg.canh_cao * v_cfg.ty_le_tat
                                               else g.gia_tri > v_cfg.canh_cao / v_cfg.ty_le_tat end) as da_ha_nhiet
    from tong_hop t
    join lateral (
      select mau.gia_tri from mau
      where mau.id = t.id and mau.gia_tri is not null
      order by mau.thoi_diem desc
      limit v_cfg.so_mau_binh_thuong
    ) g on true
    group by t.id
    having count(*) >= v_cfg.so_mau_binh_thuong
  ),
  quyet_dinh as (
    select h.id,
           h.ten_nghiep_vu as ten,
           t.gia_tri_moi_nhat,
           case
             when t.moi_mau_deu_nghiem_trong then 'nghiem_trong'
             when t.moi_mau_deu_canh_cao     then 'canh_cao'
             else null
           end as muc_can_co,
           coalesce(x.da_ha_nhiet, false) as da_ha_nhiet,
           (select a.muc from public.alerts a
             where a.host_id = h.id and a.chi_so = p_chi_so and a.ket_thuc_luc is null
             limit 1) as muc_dang_mo
    from public.hosts h
    join tong_hop t on t.id = h.id
    left join du_mau_tat x on x.id = h.id
    where h.dang_theo_doi
  ),
  mo as (
    insert into public.alerts (host_id, chi_so, muc, gia_tri, nguong, bat_dau_luc, dien_giai, anh_huong)
    select q.id, p_chi_so, q.muc_can_co, q.gia_tri_moi_nhat,
           case q.muc_can_co when 'nghiem_trong' then v_cfg.nghiem_trong else v_cfg.canh_cao end,
           p_bay_gio,
           -- Câu diễn giải sinh ngay tại chỗ phát hiện. Lớp phiên dịch ở TypeScript sẽ
           -- viết đè bằng câu tốt hơn (có nguyên nhân gốc + hành động), nhưng có sẵn một
           -- câu đọc được vẫn hơn hẳn để trống — nếu lớp kia hỏng, email vẫn có nghĩa.
           public.cau_dien_giai(p_chi_so, q.gia_tri_moi_nhat,
             case q.muc_can_co when 'nghiem_trong' then v_cfg.nghiem_trong else v_cfg.canh_cao end),
           public.cau_anh_huong(p_chi_so)
    from quyet_dinh q
    where q.muc_can_co is not null and q.muc_dang_mo is distinct from q.muc_can_co
    on conflict (host_id, chi_so, muc) where ket_thuc_luc is null do nothing
    returning alerts.host_id as id_mo
  ),
  dong as (
    update public.alerts a set ket_thuc_luc = p_bay_gio
      from quyet_dinh q
     where a.host_id = q.id and a.chi_so = p_chi_so and a.ket_thuc_luc is null
       and q.muc_can_co is null and q.da_ha_nhiet
    returning a.host_id as id_dong
  )
  select q.id, q.ten,
         case
           when q.id in (select id_mo   from mo)   then 'mo_canh_bao'
           when q.id in (select id_dong from dong) then 'dong_canh_bao'
           when q.muc_dang_mo is not null          then 'van_dang_canh_bao'
           else 'binh_thuong'
         end,
         q.muc_can_co,
         q.gia_tri_moi_nhat
  from quyet_dinh q;
end $$;

-- ── 4. soat_mat_lien_lac: cũng phải nói bằng tiếng Việt ───────────────────────────────
-- Đây là cảnh báo QUAN TRỌNG NHẤT của hệ (máy im lặng = không biết gì về nó), mà nó vẫn
-- gửi ra chuỗi "mat_lien_lac: 10". Sửa nốt để không còn mã snake_case nào tới người đọc.
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
  mo as (
    insert into public.alerts (host_id, chi_so, muc, gia_tri, nguong, bat_dau_luc,
                               dien_giai, anh_huong, khuyen_nghi)
    select d.id, 'mat_lien_lac', 'nghiem_trong', d.phut, p_im_lang_phut, p_bay_gio,
           format('Máy đã ngừng gửi số liệu %s phút (ngưỡng %s phút).',
                  round(d.phut, 0), p_im_lang_phut),
           public.cau_anh_huong('mat_lien_lac'),
           jsonb_build_array(
             jsonb_build_object('viec', 'Kiểm tra máy còn bật và còn mạng không'),
             jsonb_build_object('viec', 'Kiểm tra phần mềm thu thập số liệu còn chạy không'))
    from danh_gia d
    where d.qua_han
    on conflict (host_id, chi_so, muc) where ket_thuc_luc is null do nothing
    returning alerts.host_id as id_mo
  ),
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
