-- 0009 — Giám sát dịch vụ bắt buộc, sao lưu và cơ sở dữ liệu.
--
-- Hai tính năng trong file này (sao lưu) bị đánh giá thấp nhất nhưng giá trị cao nhất:
-- backup hỏng ÂM THẦM. Nó không làm chậm máy, không làm ai kêu, và chỉ lộ ra vào đúng
-- ngày cần phục hồi. "Backup fail âm thầm 3 đêm" nghĩa là thời gian mất dữ liệu chấp
-- nhận được thực tế của công ty là 72 giờ chứ không phải 1 giờ.

-- ═══════════════════════ 4.1 — Dịch vụ bắt buộc luôn chạy ═══════════════════════
create table if not exists public.dich_vu_bat_buoc (
  id            uuid primary key default gen_random_uuid(),
  host_id       uuid not null references public.hosts(id) on delete cascade,
  ten_dich_vu   text not null,
  -- Tên cho người đọc: "phần mềm kế toán" thay vì "MSSQLSERVER". Dùng trong email.
  ten_de_hieu   text not null,
  unique (host_id, ten_dich_vu)
);

/*
 * soat_dich_vu() — đối chiếu danh sách khai với cột dich_vu_thieu của nhịp gần nhất.
 *
 * Đọc từ nhịp GẦN NHẤT chứ không từ cả cửa sổ: dịch vụ chết là chết ngay, không cần
 * duration như CPU. Một dịch vụ bắt buộc mà dừng thì không có kịch bản "chờ xem có tự
 * hồi không" — nó phải được báo.
 */
create or replace function public.soat_dich_vu(p_bay_gio timestamptz default now())
returns table (may_id uuid, ten_may text, dich_vu text, hanh_dong text)
language plpgsql as $$
begin
  return query
  with nhip_cuoi as (
    select distinct on (m.host_id) m.host_id as id, m.dich_vu_thieu
    from public.metrics_raw m
    where m.thoi_diem > p_bay_gio - interval '10 minutes'
    order by m.host_id, m.thoi_diem desc
  ),
  danh_gia as (
    select d.host_id as id, h.ten_nghiep_vu as ten, d.ten_dich_vu, d.ten_de_hieu,
           coalesce(n.dich_vu_thieu ? d.ten_dich_vu, false) as dang_thieu
    from public.dich_vu_bat_buoc d
    join public.hosts h on h.id = d.host_id and h.dang_theo_doi
    left join nhip_cuoi n on n.id = d.host_id
  ),
  mo as (
    insert into public.alerts (host_id, chi_so, muc, gia_tri)
    select g.id, 'dich_vu:' || g.ten_dich_vu, 'nghiem_trong', null
    from danh_gia g where g.dang_thieu
    on conflict (host_id, chi_so, muc) where ket_thuc_luc is null do nothing
    returning alerts.host_id as id_mo, alerts.chi_so as chi_so_mo
  ),
  dong as (
    update public.alerts a set ket_thuc_luc = p_bay_gio
      from danh_gia g
     where a.host_id = g.id and a.chi_so = 'dich_vu:' || g.ten_dich_vu
       and a.ket_thuc_luc is null and not g.dang_thieu
    returning a.host_id as id_dong, a.chi_so as chi_so_dong
  )
  select g.id, g.ten, g.ten_de_hieu,
         case
           when exists (select 1 from mo where id_mo = g.id and chi_so_mo = 'dich_vu:' || g.ten_dich_vu)
             then 'mo_canh_bao'
           when exists (select 1 from dong where id_dong = g.id and chi_so_dong = 'dich_vu:' || g.ten_dich_vu)
             then 'dong_canh_bao'
           when g.dang_thieu then 'van_dang_dung'
           else 'dang_chay'
         end
  from danh_gia g;
end $$;

-- ═══════════════════════ 4.2 + 4.3 — Sao lưu và job định kỳ ═══════════════════════
create table if not exists public.cong_viec_dinh_ky (
  id                uuid primary key default gen_random_uuid(),
  host_id           uuid references public.hosts(id) on delete set null,
  ma                text not null unique,       -- dùng trong URL ping
  ten_de_hieu       text not null,              -- "sao lưu dữ liệu kế toán"
  loai              text not null default 'backup' check (loai in ('backup', 'job')),
  chu_ky_gio        numeric not null,
  grace_gio         numeric not null default 4,
  -- Lệch quá bao nhiêu % so với trung vị 7 ngày thì coi là bất thường.
  lech_canh_cao_pt  numeric not null default 30,
  lech_nghiem_trong_pt numeric not null default 60,
  dang_theo_doi     boolean not null default true
);

create table if not exists public.lan_chay_cong_viec (
  id            uuid primary key default gen_random_uuid(),
  cong_viec_id  uuid not null references public.cong_viec_dinh_ky(id) on delete cascade,
  luc           timestamptz not null default now(),
  kich_thuoc_byte bigint
);

create index if not exists lan_chay_theo_thoi_gian
  on public.lan_chay_cong_viec (cong_viec_id, luc desc);

/*
 * ghi_nhan_chay() — script backup gọi khi THÀNH CÔNG (dead-man's switch).
 *
 * Nguyên tắc đảo ngược: không có tiếng ping = báo động, thay vì chờ ai đó nhớ đi kiểm
 * tra. Script hỏng, máy tắt, ổ đĩa đầy — mọi cách hỏng đều dẫn tới cùng một kết quả là
 * im lặng, và im lặng thì hệ thống bắt được.
 */
create or replace function public.ghi_nhan_chay(p_ma text, p_kich_thuoc_byte bigint default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_lan uuid;
begin
  select id into v_id from public.cong_viec_dinh_ky where ma = p_ma and dang_theo_doi;
  if v_id is null then
    raise exception 'KHONG_TIM_THAY_CONG_VIEC';
  end if;
  insert into public.lan_chay_cong_viec (cong_viec_id, kich_thuoc_byte)
  values (v_id, p_kich_thuoc_byte) returning id into v_lan;
  return v_lan;
end $$;

/*
 * soat_cong_viec() — hai phép kiểm khác nhau, đừng gộp:
 *
 *  ① TRỄ: quá chu kỳ + grace mà chưa có tiếng ping nào.
 *  ② KÍCH THƯỚC BẤT THƯỜNG: có chạy, exit code 0, nhưng file nhỏ bất thường so với
 *     trung vị 7 ngày. Đây là bẫy phổ biến NHẤT — script thoát mã 0 mà file 0 byte, và
 *     mọi phép kiểm dựa trên "job có chạy không" đều báo xanh.
 */
create or replace function public.soat_cong_viec(p_bay_gio timestamptz default now())
returns table (ma text, ten_de_hieu text, van_de text, chi_tiet text)
language plpgsql as $$
begin
  return query
  with lan_cuoi as (
    select distinct on (l.cong_viec_id) l.cong_viec_id as cv, l.luc, l.kich_thuoc_byte
    from public.lan_chay_cong_viec l
    order by l.cong_viec_id, l.luc desc
  ),
  trung_vi as (
    select l.cong_viec_id as cv,
           percentile_cont(0.5) within group (order by l.kich_thuoc_byte) as giua
    from public.lan_chay_cong_viec l
    where l.luc > p_bay_gio - interval '7 days' and l.kich_thuoc_byte is not null
    group by l.cong_viec_id
    -- Dưới 3 lần chạy thì trung vị chưa đáng tin, không phán xét kích thước.
    having count(*) >= 3
  )
  select c.ma, c.ten_de_hieu,
         case
           when lc.luc is null then 'chua_bao_gio_chay'
           when lc.luc < p_bay_gio - ((c.chu_ky_gio + c.grace_gio) || ' hours')::interval
             then 'tre'
           when tv.giua is not null and lc.kich_thuoc_byte is not null
                and abs(lc.kich_thuoc_byte - tv.giua) / nullif(tv.giua, 0) * 100 >= c.lech_nghiem_trong_pt
             then 'kich_thuoc_bat_thuong_nghiem_trong'
           when tv.giua is not null and lc.kich_thuoc_byte is not null
                and abs(lc.kich_thuoc_byte - tv.giua) / nullif(tv.giua, 0) * 100 >= c.lech_canh_cao_pt
             then 'kich_thuoc_bat_thuong'
           else 'binh_thuong'
         end,
         case
           when lc.luc is null then format('%s chưa chạy lần nào.', c.ten_de_hieu)
           when lc.luc < p_bay_gio - ((c.chu_ky_gio + c.grace_gio) || ' hours')::interval
             then format('%s lần cuối chạy cách đây %s giờ — quá hạn.',
                         c.ten_de_hieu,
                         round(extract(epoch from (p_bay_gio - lc.luc)) / 3600.0))
           when tv.giua is not null and lc.kich_thuoc_byte is not null
                and abs(lc.kich_thuoc_byte - tv.giua) / nullif(tv.giua, 0) * 100 >= c.lech_canh_cao_pt
             then format('%s có chạy nhưng dung lượng lệch %s%% so với thường lệ — có thể bản sao lưu bị rỗng.',
                         c.ten_de_hieu,
                         round(abs(lc.kich_thuoc_byte - tv.giua) / nullif(tv.giua, 0) * 100))
           else format('%s bình thường.', c.ten_de_hieu)
         end
  from public.cong_viec_dinh_ky c
  left join lan_cuoi lc on lc.cv = c.id
  left join trung_vi tv on tv.cv = c.id
  where c.dang_theo_doi;
end $$;

-- ═══════════════════════ 4.3 — Cơ sở dữ liệu ở mức cơ bản ═══════════════════════
create table if not exists public.csdl_theo_doi (
  id           uuid primary key default gen_random_uuid(),
  host_id      uuid not null references public.hosts(id) on delete cascade,
  ten_de_hieu  text not null,
  ket_noi_duoc boolean,
  so_ket_noi   integer,
  gioi_han_ket_noi integer,
  dung_luong_mb integer,
  cap_nhat_luc timestamptz not null default now()
);

create or replace function public.soat_csdl(p_bay_gio timestamptz default now())
returns table (ten_de_hieu text, van_de text, chi_tiet text)
language sql as $$
  select c.ten_de_hieu,
         case
           when c.cap_nhat_luc < p_bay_gio - interval '10 minutes' then 'khong_do_duoc'
           when c.ket_noi_duoc is false then 'khong_ket_noi_duoc'
           when c.gioi_han_ket_noi is not null and c.so_ket_noi is not null
                and c.so_ket_noi::numeric / nullif(c.gioi_han_ket_noi, 0) >= 0.95 then 'gan_het_ket_noi'
           when c.gioi_han_ket_noi is not null and c.so_ket_noi is not null
                and c.so_ket_noi::numeric / nullif(c.gioi_han_ket_noi, 0) >= 0.80 then 'nhieu_ket_noi'
           else 'binh_thuong'
         end,
         case
           when c.cap_nhat_luc < p_bay_gio - interval '10 minutes'
             then format('Không đo được %s trong 10 phút qua.', c.ten_de_hieu)
           when c.ket_noi_duoc is false
             then format('Kho dữ liệu %s không kết nối được — các phần mềm dùng nó sẽ ngừng hoạt động.', c.ten_de_hieu)
           when c.gioi_han_ket_noi is not null and c.so_ket_noi is not null
                and c.so_ket_noi::numeric / nullif(c.gioi_han_ket_noi, 0) >= 0.80
             then format('Kho dữ liệu %s đang dùng %s/%s kết nối — sắp chạm trần.',
                         c.ten_de_hieu, c.so_ket_noi, c.gioi_han_ket_noi)
           else format('Kho dữ liệu %s bình thường.', c.ten_de_hieu)
         end
  from public.csdl_theo_doi c;
$$;
