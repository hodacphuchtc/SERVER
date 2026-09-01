-- 0013 — anh_chup_suc_khoe(): MỘT dòng mỗi máy, chứa toàn bộ "sự thật" mà lớp phiên dịch cần.
--
-- Ranh giới kiến trúc (ADR-004): **Postgres trả về SỰ THẬT ĐÃ TỔNG HỢP, TypeScript biến
-- sự thật thành NHẬN ĐỊNH.** Phép nặng — gộp, gaps-and-islands, trích jsonb — nằm ở đây vì
-- Cloudflare Worker chỉ có 10ms CPU mỗi lượt gọi. Còn viết một câu tiếng Việt có nguyên
-- nhân + hành động thì PL/pgSQL làm rất tệ, nên phần đó ở TypeScript.
--
-- 🔴 Hàm này CÓ đọc metrics_raw, và đó KHÔNG phải vi phạm luật "giao diện chỉ đọc bảng gộp".
-- Tinh thần của luật là cấm KÉO dòng thô ra khỏi Postgres và đốt băng thông (trần 5 GB/tháng).
-- Ở đây cửa sổ ≤ 2 giờ, đi thẳng theo khoá chính (host_id, thoi_diem), trả về đúng MỘT dòng
-- mỗi máy. Ghi rõ để phiên sau không hiểu nhầm rồi đi "sửa" nó.
--
-- 🔴 NGƯỠNG TRUYỀN VÀO BẰNG THAM SỐ, không viết số vào SQL (rule 4 module-boundaries).
-- Nguồn sự thật là config/nguong-canh-bao.json; TypeScript đọc rồi truyền xuống. Nhét
-- `coalesce(..., 10)` vào đây là tạo ra một ngưỡng vô hình mà sửa config không đổi được.

create or replace function public.anh_chup_suc_khoe(
  p_dia_con_lai_gb      real,          -- ngưỡng nghiêm trọng của dung lượng trống
  p_swap_ty_le          real,          -- ngưỡng nghiêm trọng của tỷ lệ swap đã dùng
  p_tai_moi_nhan        real,          -- tải / số nhân, mức bắt đầu coi là cao
  p_cpu_ranh_toi_thieu  real,          -- % CPU rảnh tối thiểu để coi là NGHẼN I/O
  p_may                 uuid        default null,
  p_bay_gio             timestamptz default now()
)
returns table (
  host_id                   uuid,
  ten_nghiep_vu             text,
  he_dieu_hanh              text,
  muc_quan_trong            text,
  lan_day_du_lieu_cuoi      timestamptz,
  so_phut_im_lang           real,
  thoi_diem                 timestamptz,
  cpu_phan_tram             real,
  cpu_hang_doi              real,
  cpu_ranh                  real,
  ram_phan_tram             real,
  ram_tong_mb               integer,
  ram_con_lai_mb            integer,
  swap_dung_mb              integer,
  swap_tong_mb              integer,
  swap_ra_moi_giay          bigint,
  ap_luc_bo_nho             text,
  dia_ten                   text,
  dia_con_lai_gb            real,
  dia_phan_tram_dung        real,
  dia_vm_dung_gb            real,
  dia_tps                   real,
  dia_kb_moi_lan            real,
  snapshot_cuc_bo           smallint,
  nguon_dien                text,
  pin_phan_tram             smallint,
  pin_con_phut              integer,
  gioi_han_toc_do_cpu       smallint,
  so_tien_trinh             integer,
  so_thread                 integer,
  tran_tien_trinh           integer,
  tran_thread               integer,
  mang_vao_byte_moi_giay    bigint,
  mang_ra_byte_moi_giay     bigint,
  uptime_giay               bigint,
  tien_trinh_top            jsonb,
  chi_so_them               jsonb,
  so_phut_dia_thap          real,
  so_phut_swap_cao          real,
  so_phut_tai_cao_cpu_ranh  real,
  so_canh_bao_dang_mo       integer,
  co_nghiem_trong_chua_nhan boolean
)
language sql
stable
set search_path = public, pg_temp
as $$
with may as (
  select h.id, h.ten_nghiep_vu, h.he_dieu_hanh, h.muc_quan_trong, h.lan_day_du_lieu_cuoi
  from public.hosts h
  where h.dang_theo_doi and (p_may is null or h.id = p_may)
),
-- Cửa sổ 2 giờ gần nhất: đủ cho mọi phép "bền bỉ" và luôn nằm trong 1–2 partition.
-- Ba cột `xau_*` được tính MỘT LẦN ở đây rồi dùng lại cho cả ba phép đếm bền bỉ.
mau as (
  select
    r.host_id, r.thoi_diem, r.cpu_hang_doi, r.cpu_ranh,
    (select min((d->>'con_lai_gb')::real) from jsonb_array_elements(r.dia) d) as dia_con_lai,
    (select max((d->>'phan_tram_dung')::real) from jsonb_array_elements(r.dia) d) as dia_pt,
    (select min((d->>'con_lai_gb')::real) from jsonb_array_elements(r.dia) d)
      <= p_dia_con_lai_gb                                                     as xau_dia,
    (r.swap_tong_mb > 0 and r.swap_dung_mb::real / r.swap_tong_mb >= p_swap_ty_le) as xau_swap,
    -- Chữ ký của NGHẼN I/O: việc xếp hàng nhiều TRONG KHI bộ xử lý đang rảnh. Một mình
    -- "tải cao" không nói lên gì — máy tính toán nặng cũng tải cao mà vẫn khoẻ.
    (r.cpu_hang_doi >= p_tai_moi_nhan and r.cpu_ranh >= p_cpu_ranh_toi_thieu)  as xau_tai
  from public.metrics_raw r
  join may m on m.id = r.host_id
  where r.thoi_diem <= p_bay_gio and r.thoi_diem > p_bay_gio - interval '2 hours'
),
-- LEFT JOIN LATERAL: máy chưa có số liệu vẫn phải ra một dòng toàn null. Mất dòng nghĩa là
-- máy biến mất khỏi báo cáo — đúng vào lúc nó đáng lo nhất.
moi_nhat as (
  select m.id, r.*
  from may m
  left join lateral (
    select mr.* from public.metrics_raw mr
    where mr.host_id = m.id and mr.thoi_diem <= p_bay_gio
      and mr.thoi_diem > p_bay_gio - interval '2 hours'
    order by mr.thoi_diem desc limit 1
  ) r on true
),
-- ĐỘ BỀN BỈ: mốc gần nhất mà điều kiện KHÔNG xấu. Đo từ mẫu xấu đầu tiên SAU mốc đó.
--
-- Cố ý KHÔNG đếm tổng số mẫu vượt ngưỡng: đếm tổng thì một mẫu xấu từ 90 phút trước vẫn
-- làm luật nổ mãi, kể cả khi máy đã bình thường suốt 89 phút sau đó.
moc_tot as (
  select host_id,
         max(thoi_diem) filter (where not xau_dia)  as tot_dia,
         max(thoi_diem) filter (where not xau_swap) as tot_swap,
         max(thoi_diem) filter (where not xau_tai)  as tot_tai
  from mau group by host_id
),
ben_bi (host_id, so_phut_dia_thap, so_phut_swap_cao, so_phut_tai_cao_cpu_ranh) as (
  select
    s.host_id,
    coalesce(extract(epoch from (p_bay_gio - min(s.thoi_diem)
      filter (where s.xau_dia  and (t.tot_dia  is null or s.thoi_diem > t.tot_dia)))) / 60, 0)::real,
    coalesce(extract(epoch from (p_bay_gio - min(s.thoi_diem)
      filter (where s.xau_swap and (t.tot_swap is null or s.thoi_diem > t.tot_swap)))) / 60, 0)::real,
    coalesce(extract(epoch from (p_bay_gio - min(s.thoi_diem)
      filter (where s.xau_tai  and (t.tot_tai  is null or s.thoi_diem > t.tot_tai)))) / 60, 0)::real
  from mau s join moc_tot t on t.host_id = s.host_id
  group by s.host_id
),
canh_bao as (
  select a.host_id,
         count(*)::integer as so_mo,
         bool_or(a.muc = 'nghiem_trong' and a.tiep_nhan_luc is null) as co_nghiem_trong
  from public.alerts a
  where a.van_mo
  group by a.host_id
)
select
  m.id, m.ten_nghiep_vu, m.he_dieu_hanh, m.muc_quan_trong,
  m.lan_day_du_lieu_cuoi,
  -- null = CHƯA BAO GIỜ gửi. Khác hẳn "gửi lâu rồi" và phải hiện khác nhau.
  case when m.lan_day_du_lieu_cuoi is null then null
       else (extract(epoch from (p_bay_gio - m.lan_day_du_lieu_cuoi)) / 60)::real end,
  n.thoi_diem, n.cpu_phan_tram, n.cpu_hang_doi, n.cpu_ranh,
  n.ram_phan_tram, n.ram_tong_mb, n.ram_con_lai_mb,
  n.swap_dung_mb, n.swap_tong_mb, n.swap_ra_moi_giay, n.ap_luc_bo_nho,
  -- Ổ TỆ NHẤT, không phải ổ đầu tiên: máy có 3 ổ thì cái sắp đầy mới đáng nói.
  (select d->>'ten' from jsonb_array_elements(coalesce(n.dia, '[]'::jsonb)) d
    order by (d->>'con_lai_gb')::real asc limit 1),
  (select min((d->>'con_lai_gb')::real) from jsonb_array_elements(coalesce(n.dia, '[]'::jsonb)) d),
  (select max((d->>'phan_tram_dung')::real) from jsonb_array_elements(coalesce(n.dia, '[]'::jsonb)) d),
  n.dia_vm_dung_gb, n.dia_tps, n.dia_kb_moi_lan, n.snapshot_cuc_bo,
  n.nguon_dien, n.pin_phan_tram, n.pin_con_phut, n.gioi_han_toc_do_cpu,
  n.so_tien_trinh, n.so_thread, n.tran_tien_trinh, n.tran_thread,
  n.mang_vao_byte_moi_giay, n.mang_ra_byte_moi_giay, n.uptime_giay,
  coalesce(n.tien_trinh_top, '[]'::jsonb), coalesce(n.chi_so_them, '{}'::jsonb),
  coalesce(b.so_phut_dia_thap, 0), coalesce(b.so_phut_swap_cao, 0), coalesce(b.so_phut_tai_cao_cpu_ranh, 0),
  coalesce(c.so_mo, 0), coalesce(c.co_nghiem_trong, false)
from may m
left join moi_nhat n on n.id = m.id
left join ben_bi   b on b.host_id = m.id
left join canh_bao c on c.host_id = m.id;
$$;

comment on function public.anh_chup_suc_khoe(real, real, real, real, uuid, timestamptz) is
  'Một dòng mỗi máy: số đo mới nhất + độ bền bỉ (phút) + bối cảnh cảnh báo. Đầu vào duy '
  'nhất của lớp phiên dịch. Ngưỡng truyền vào bằng tham số — nguồn sự thật là config/.';
