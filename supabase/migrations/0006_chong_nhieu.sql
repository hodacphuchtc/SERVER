-- 0006 — Bốn cơ chế chống nhiễu, chạy SAU khi engine ngưỡng đã quyết trạng thái.
--
-- Tách khỏi 0005 có chủ đích: danh_gia_nguong() quyết định "máy nào đang có vấn đề",
-- còn file này quyết định "gửi bao nhiêu email". Tách ra thì chạy lại phần đánh giá bao
-- nhiêu lần cũng được mà không ai bị spam.
--
--  • GOM NHÓM   — 10 máy cùng mất mạng thì gửi 1 email liệt kê 10, không phải 10 email.
--  • ỨC CHẾ     — máy đã mất liên lạc thì nuốt mọi cảnh báo con của nó. Báo "CPU cao"
--                 cho một máy vừa mất điện là vô nghĩa và làm loãng cái tin quan trọng.
--  • GIỚI HẠN   — tối đa N email mỗi 5 phút, TỰ CHẶN phía mình. Không dựa vào trần 100
--                 mail/ngày của Resend: dựa vào họ thì bị khoá đúng lúc cần nhất.
--  • CẦU DAO    — quá nhiều cảnh báo cùng lúc thì gửi 1 email "SỰ CỐ DIỆN RỘNG" rồi im,
--                 vì lúc đó người ta cần một tín hiệu chứ không cần 40 tín hiệu.

create table if not exists public.cau_hinh_chong_nhieu (
  id                       int primary key default 1 check (id = 1),
  gom_nhom_trong_giay      int not null default 60,
  gioi_han_email_moi_5_phut int not null default 10,
  cau_dao_so_canh_bao      int not null default 20
);
insert into public.cau_hinh_chong_nhieu (id) values (1) on conflict do nothing;

/*
 * soan_thong_bao() — biến các cảnh báo đang mở chưa báo thành CÁC BẢN GHI OUTBOX.
 *
 * Không gửi mail ở đây. Ghi vào alert_notifications trước, worker gửi sau: nếu function
 * chết giữa chừng sau khi đã gọi Resend thì lần chạy sau sẽ gửi trùng. Outbox + khoá
 * idempotency làm cho việc chạy lại là vô hại.
 */
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

  -- Cảnh báo cần báo = đang mở, chưa đưa vào outbox, và KHÔNG bị ức chế.
  create temporary table can_bao on commit drop as
  select a.id, a.host_id, h.ten_nghiep_vu, a.chi_so, a.muc, a.gia_tri, a.bat_dau_luc
  from public.alerts a
  join public.hosts h on h.id = a.host_id
  where a.ket_thuc_luc is null
    and a.da_dua_vao_outbox = false
    -- ỨC CHẾ: máy đang mất liên lạc thì nuốt mọi cảnh báo khác của chính máy đó.
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

  -- CẦU DAO
  if v_chua_bao >= v_cfg.cau_dao_so_canh_bao then
    v_khoa := 'dien_rong:' || to_char(date_trunc('minute', p_bay_gio), 'YYYYMMDDHH24MI');
    v_tieu_de := format('SỰ CỐ DIỆN RỘNG — %s cảnh báo cùng lúc', v_chua_bao);
    v_than := format('Hệ thống ghi nhận %s cảnh báo trong cùng một lượt soát. Đây là dấu hiệu sự cố diện rộng (mất điện, mất mạng, hoặc hỏng thiết bị mạng) chứ không phải nhiều sự cố riêng lẻ.'
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

  -- GIỚI HẠN TỐC ĐỘ
  select count(*) into v_da_gui from public.alert_notifications
   where tao_luc > p_bay_gio - interval '5 minutes';
  if v_da_gui >= v_cfg.gioi_han_email_moi_5_phut then
    return query select 'bi_gioi_han'::text, v_chua_bao, null::text;
    return;
  end if;

  -- GOM NHÓM: mọi cảnh báo chưa báo gộp vào MỘT thông báo.
  v_khoa := 'gom:' || md5((select string_agg(id::text, ',' order by id) from can_bao));
  v_tieu_de := case
    when v_chua_bao = 1 then (select format('%s — %s', ten_nghiep_vu, chi_so) from can_bao)
    else format('%s cảnh báo trên %s máy', v_chua_bao,
                (select count(distinct host_id) from can_bao))
  end;
  v_than := (select string_agg(
               format('• %s — %s: %s (mức %s, từ %s)',
                      ten_nghiep_vu, chi_so, coalesce(gia_tri::text, 'n/a'), muc,
                      to_char(bat_dau_luc, 'HH24:MI')),
               E'\n' order by muc desc, ten_nghiep_vu)
             from can_bao);

  insert into public.alert_notifications (khoa_idempotency, loai, nguoi_nhan, tieu_de, than_thu)
  values (v_khoa, 'canh_bao', array['quan_tri'], v_tieu_de, v_than)
  on conflict (khoa_idempotency) do nothing;

  update public.alerts set da_dua_vao_outbox = true where id in (select id from can_bao);

  return query select 'canh_bao'::text, v_chua_bao, v_khoa;
end $$;
