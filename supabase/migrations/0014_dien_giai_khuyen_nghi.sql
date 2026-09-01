-- 0014 — Mở đường cho VĂN BẢN đi qua (hạng mục 1.1 của PLAN_V2).
--
-- Nút thắt: bảng `alerts` không có cột nào chứa văn bản (0001:92-106). Mọi câu diễn giải
-- tiếng Việt sinh ra ở tầng phát hiện đều CHẾT tại ranh giới này. Hậu quả cụ thể:
--
--   · soat_cong_viec (0009:160-164) sinh ra câu "…có chạy nhưng dung lượng lệch 68% so với
--     thường lệ — có thể bản sao lưu bị rỗng." → ghi_canh_bao_cong_viec (0011:32-33) chèn
--     đúng ba cột host_id/chi_so/muc rồi VỨT `chi_tiet` đi.
--   · soat_csdl (0009:201-206) sinh ra "Kho dữ liệu X không kết nối được — các phần mềm
--     dùng nó sẽ ngừng hoạt động." → cũng bị vứt y hệt.
--
-- Nên email tới người trực chỉ còn "• máy X — cpu_phan_tram: 97 (mức nghiem_trong)".
-- Đây là nguyên nhân gốc của "chỉ số trần trụi, không có nhận định".

alter table public.alerts
  -- ① Chuyện gì đang xảy ra, bằng ngôn ngữ quản trị.
  add column if not exists dien_giai   text,
  -- ② Nguyên nhân có khả năng nhất.
  add column if not exists nguyen_nhan text,
  -- ③ Hệ quả nếu không làm gì — đây là thứ tạo ra hành động.
  add column if not exists anh_huong   text,
  -- ④ Việc cần làm, đã sắp theo thứ tự ưu tiên. Mảng object, mỗi phần tử tối thiểu có
  --    khoá `viec`; lớp phiên dịch ở TypeScript bồi thêm rủi ro/thời gian/hiệu quả.
  add column if not exists khuyen_nghi jsonb;

-- Thư phải mang theo id các cảnh báo nó gộp, để tầng gửi (TypeScript) dựng được nút
-- "Đã tiếp nhận". Link phải ký bằng HMAC, mà KHOÁ KÝ tuyệt đối không được nằm trong SQL —
-- nên SQL chỉ đưa id, TypeScript mới ký. Không có cột này thì `taoLinkTiepNhan` mãi mãi
-- chỉ được gọi trong test, và cơ chế leo thang 30 phút dựa vào một cái nút không tồn tại.
alter table public.alert_notifications
  add column if not exists canh_bao_ids uuid[];

comment on column public.alerts.dien_giai is
  'Một câu tiếng Việt nói CHUYỆN GÌ đang xảy ra. Không thuật ngữ kỹ thuật thô.';
comment on column public.alerts.khuyen_nghi is
  'Mảng việc cần làm, đã sắp ưu tiên. Mỗi phần tử: {viec, cach_lam?, rui_ro?, phut_uoc_tinh?}.';

-- ── ghi_canh_bao_cong_viec: LƯU chi_tiet thay vì vứt đi ───────────────────────────────
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
           'cong_viec:' || s.ma as chi_so,
           -- Hệ quả nếu không làm gì. Với sao lưu thì đây là câu quan trọng nhất: người
           -- đọc phải hiểu rằng mất dữ liệu là loại hỏng KHÔNG hoàn tác được.
           case s.van_de
             when 'chua_bao_gio_chay' then 'Chưa từng có bản sao lưu nào. Mất dữ liệu lúc này là mất vĩnh viễn.'
             when 'tre' then 'Bản sao lưu gần nhất đã cũ. Sự cố xảy ra bây giờ sẽ mất phần dữ liệu phát sinh từ đó tới nay.'
             else 'Bản sao lưu có thể không dùng được khi cần phục hồi.'
           end as anh_huong
    from soat s
  ),
  mo as (
    insert into public.alerts (host_id, chi_so, muc, bat_dau_luc, dien_giai, anh_huong, khuyen_nghi)
    select d.host_id, d.chi_so, d.muc, p_bay_gio, d.chi_tiet, d.anh_huong,
           jsonb_build_array(jsonb_build_object(
             'viec', format('Kiểm tra công việc "%s" trên máy chạy nó', d.ten_de_hieu),
             'cach_lam', 'Xem máy đó còn bật không, tập lệnh còn đúng đường dẫn không, và nhật ký lần chạy gần nhất báo gì.'))
      from danh_gia d where d.co_van_de
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

-- ── ghi_canh_bao_csdl: LƯU chi_tiet thay vì vứt đi ────────────────────────────────────
create or replace function public.ghi_canh_bao_csdl(p_bay_gio timestamptz default now())
returns table (ten_de_hieu text, hanh_dong text)
language plpgsql as $$
begin
  return query
  with soat as (
    -- Bản trước KHÔNG select chi_tiet, nên câu diễn giải đã viết sẵn ở 0009 không bao giờ
    -- rời khỏi hàm soát.
    select s.ten_de_hieu, s.van_de, s.chi_tiet, c.host_id
    from public.soat_csdl(p_bay_gio) s
    join public.csdl_theo_doi c on c.ten_de_hieu = s.ten_de_hieu
  ),
  danh_gia as (
    select s.*,
           s.van_de <> 'binh_thuong' as co_van_de,
           case when s.van_de in ('khong_ket_noi_duoc', 'khong_do_duoc', 'gan_het_ket_noi')
                then 'nghiem_trong' else 'canh_cao' end as muc,
           'csdl:' || s.ten_de_hieu as chi_so,
           case s.van_de
             when 'khong_ket_noi_duoc' then 'Mọi phần mềm dùng kho dữ liệu này đang ngừng phục vụ.'
             when 'gan_het_ket_noi' then 'Sắp tới lúc phần mềm không mở thêm được kết nối và người dùng bị chặn việc.'
             when 'khong_do_duoc' then 'Không rõ tình trạng kho dữ liệu — không đo được không có nghĩa là nó khoẻ.'
             else 'Có thể ảnh hưởng tới tốc độ phần mềm.'
           end as anh_huong
    from soat s
  ),
  mo as (
    insert into public.alerts (host_id, chi_so, muc, bat_dau_luc, dien_giai, anh_huong, khuyen_nghi)
    select d.host_id, d.chi_so, d.muc, p_bay_gio, d.chi_tiet, d.anh_huong,
           jsonb_build_array(jsonb_build_object(
             'viec', format('Kiểm tra kho dữ liệu "%s"', d.ten_de_hieu),
             'cach_lam', 'Xem dịch vụ còn chạy không, số kết nối đang dùng bao nhiêu, và dung lượng còn bao nhiêu.'))
      from danh_gia d where d.co_van_de
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

-- ── soan_thong_bao: IN diễn giải thay vì "chi_so: giá_trị" ────────────────────────────
-- Giữ NGUYÊN toàn bộ cỗ máy chống nhiễu (ức chế · cầu dao · giới hạn · gom nhóm) — chỉ
-- đổi đúng cách dựng thân thư. Cỗ máy đó đã được 11 test canh, không đụng vào.
create or replace function public.soan_thong_bao(p_bay_gio timestamptz default now())
returns table (loai text, so_canh_bao int, khoa text)
language plpgsql as $$
declare
  v_cfg      public.cau_hinh_chong_nhieu%rowtype;
  v_da_gui   int;
  v_chua_bao int;
  v_khoa     text;
  v_than     text;
  v_tieu_de  text;
begin
  select * into v_cfg from public.cau_hinh_chong_nhieu where id = 1;

  create temporary table can_bao on commit drop as
  select a.id, a.host_id, h.ten_nghiep_vu, a.chi_so, a.muc, a.gia_tri, a.nguong,
         a.bat_dau_luc, a.dien_giai, a.nguyen_nhan, a.anh_huong, a.khuyen_nghi
  from public.alerts a
  join public.hosts h on h.id = a.host_id
  where a.ket_thuc_luc is null
    and a.da_dua_vao_outbox = false
    and not (
      a.chi_so <> 'mat_lien_lac'
      and exists (select 1 from public.alerts b
                   where b.host_id = a.host_id and b.chi_so = 'mat_lien_lac'
                     and b.ket_thuc_luc is null)
    );

  select count(*) into v_chua_bao from can_bao;
  if v_chua_bao = 0 then
    return;
  end if;

  if v_chua_bao >= v_cfg.cau_dao_so_canh_bao then
    v_khoa := 'dien_rong:' || to_char(date_trunc('minute', p_bay_gio), 'YYYYMMDDHH24MI');
    v_tieu_de := format('SỰ CỐ DIỆN RỘNG — %s cảnh báo cùng lúc', v_chua_bao);
    v_than := format('Hệ thống ghi nhận %s cảnh báo trong cùng một lượt soát. Đây là dấu hiệu sự cố diện rộng (mất điện, mất mạng, hoặc hỏng thiết bị mạng) chứ không phải nhiều sự cố riêng lẻ.'
                     || E'\n\nViệc đầu tiên: kiểm tra nguồn điện và đường mạng của khu vực, trước khi xử lý từng máy.'
                     || E'\n\nCác máy bị ảnh hưởng: %s',
                     v_chua_bao,
                     (select string_agg(distinct ten_nghiep_vu, ', ') from can_bao));
    insert into public.alert_notifications (khoa_idempotency, loai, nguoi_nhan, tieu_de, than_thu)
    values (v_khoa, 'dien_rong', array['quan_tri'], v_tieu_de, v_than)
    on conflict (khoa_idempotency) do nothing;

    update public.alerts set da_dua_vao_outbox = true
     where id in (select id from can_bao);

    return query select 'dien_rong'::text, v_chua_bao, v_khoa;
    return;
  end if;

  select count(*) into v_da_gui from public.alert_notifications
   where tao_luc > p_bay_gio - interval '5 minutes';
  if v_da_gui >= v_cfg.gioi_han_email_moi_5_phut then
    return query select 'bi_gioi_han'::text, v_chua_bao, null::text;
    return;
  end if;

  v_khoa := 'gom:' || md5((select string_agg(id::text, ',' order by id) from can_bao));
  v_tieu_de := case
    when v_chua_bao = 1 then
      (select format('%s — %s', ten_nghiep_vu, coalesce(dien_giai, chi_so)) from can_bao)
    else format('%s cảnh báo trên %s máy', v_chua_bao,
                (select count(distinct host_id) from can_bao))
  end;

  -- Thân thư: ưu tiên câu diễn giải. Chỉ khi KHÔNG có mới rơi về định dạng kỹ thuật cũ —
  -- và khi đó vẫn nói rõ "vượt ngưỡng bao nhiêu" chứ không để con số trần trụi một mình.
  v_than := (select string_agg(
               format('• %s — %s%s%s%s',
                      ten_nghiep_vu,
                      coalesce(dien_giai,
                        format('%s: %s%s', chi_so, coalesce(gia_tri::text, 'chưa đo được'),
                               case when nguong is not null
                                    then format(' (ngưỡng %s)', nguong) else '' end)),
                      case when nguyen_nhan is not null
                           then E'\n  Vì sao: ' || nguyen_nhan else '' end,
                      case when anh_huong is not null
                           then E'\n  Nếu không xử lý: ' || anh_huong else '' end,
                      case when jsonb_typeof(khuyen_nghi) = 'array' and jsonb_array_length(khuyen_nghi) > 0
                           then E'\n  Cần làm: ' || (khuyen_nghi->0->>'viec') else '' end),
               E'\n' order by muc desc, ten_nghiep_vu)
             from can_bao);

  insert into public.alert_notifications
    (khoa_idempotency, loai, nguoi_nhan, tieu_de, than_thu, canh_bao_ids)
  values (v_khoa, 'canh_bao', array['quan_tri'], v_tieu_de, v_than,
          (select array_agg(id order by id) from can_bao))
  on conflict (khoa_idempotency) do nothing;

  update public.alerts set da_dua_vao_outbox = true where id in (select id from can_bao);

  return query select 'canh_bao'::text, v_chua_bao, v_khoa;
end $$;
