-- 0005 — Engine ngưỡng: duration + hysteresis.
--
-- Đây là hạng mục quyết định dự án sống hay chết. Không có hai cơ chế dưới đây thì sau
-- 2 tuần email trở thành rác, người ta ngừng đọc, và hệ thống chết mà không ai tuyên bố.
--
--  • DURATION — chỉ bắn khi vượt ngưỡng LIÊN TỤC đủ lâu. CPU chạm 95% trong 20 giây là
--    chuyện bình thường của mọi máy chủ; chạm 95% suốt 5 phút mới là vấn đề.
--
--  • HYSTERESIS — bắn ở 90% nhưng chỉ TẮT khi xuống dưới 80% và có đủ N mẫu bình thường
--    liên tiếp. Không có nó, một máy dao động quanh đúng ngưỡng sẽ sinh ra chuỗi
--    bật/tắt/bật/tắt và mỗi lần là một email. Đây là thứ hầu hết hệ tự xây bỏ quên.
--
-- Ngưỡng KHÔNG hardcode ở đây — đọc từ bảng cau_hinh_nguong, bảng này được nạp từ
-- config/nguong-canh-bao.json (rule 4 module-boundaries).

create table if not exists public.cau_hinh_nguong (
  chi_so              text primary key,
  canh_cao            real not null,
  nghiem_trong        real not null,
  giu_trong_phut      int  not null default 5,
  -- Tắt khi giá trị xuống dưới nguong * ty_le_tat. 0.89 nghĩa là ngưỡng 90% chỉ tắt ở ~80%.
  ty_le_tat           real not null default 0.89,
  so_mau_binh_thuong  int  not null default 3,
  -- true = vượt NGƯỠNG TRÊN là xấu (CPU, RAM). false = xuống DƯỚI là xấu (đĩa còn lại).
  cao_la_xau          boolean not null default true
);

/*
 * danh_gia_nguong() — Worker gọi mỗi phút.
 *
 * Trả về việc cần làm cho từng (máy, chỉ số): mở cảnh báo mới, đóng cảnh báo cũ, hay
 * không làm gì. Hàm KHÔNG gửi mail — nó chỉ quyết định trạng thái. Việc gửi là của lớp
 * outbox, tách ra để có thể chạy lại hàm này bao nhiêu lần cũng được mà không ai bị spam.
 */
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
    -- Lấy các mẫu trong cửa sổ duration. Cột được chọn động theo chỉ số.
    select m.host_id as id,
           m.thoi_diem,
           case p_chi_so
             when 'cpu_phan_tram' then m.cpu_phan_tram
             when 'ram_phan_tram' then m.ram_phan_tram
             else null
           end as gia_tri
    from public.metrics_raw m
    where m.thoi_diem > p_bay_gio - (v_cfg.giu_trong_phut || ' minutes')::interval
      and m.thoi_diem <= p_bay_gio
  ),
  tong_hop as (
    select mau.id,
           count(*) as so_mau,
           -- Vượt LIÊN TỤC: mọi mẫu trong cửa sổ đều vượt. Chỉ cần một mẫu bình thường
           -- là chuỗi bị đứt và không tính là "giữ đủ lâu".
           bool_and(case when v_cfg.cao_la_xau then mau.gia_tri >= v_cfg.nghiem_trong
                                               else mau.gia_tri <= v_cfg.nghiem_trong end) as moi_mau_deu_nghiem_trong,
           bool_and(case when v_cfg.cao_la_xau then mau.gia_tri >= v_cfg.canh_cao
                                               else mau.gia_tri <= v_cfg.canh_cao end) as moi_mau_deu_canh_cao,
           (array_agg(mau.gia_tri order by mau.thoi_diem desc))[1] as gia_tri_moi_nhat
    from mau
    where mau.gia_tri is not null
    group by mau.id
  ),
  -- Đủ số mẫu bình thường liên tiếp gần nhất để TẮT (hysteresis).
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
    insert into public.alerts (host_id, chi_so, muc, gia_tri, nguong, bat_dau_luc)
    select q.id, p_chi_so, q.muc_can_co, q.gia_tri_moi_nhat,
           case q.muc_can_co when 'nghiem_trong' then v_cfg.nghiem_trong else v_cfg.canh_cao end,
           p_bay_gio
    from quyet_dinh q
    where q.muc_can_co is not null and q.muc_dang_mo is distinct from q.muc_can_co
    on conflict (host_id, chi_so, muc) where ket_thuc_luc is null do nothing
    returning alerts.host_id as id_mo
  ),
  dong as (
    -- CHỈ đóng khi đã hạ nhiệt đủ sâu VÀ đủ số mẫu bình thường — đây là hysteresis.
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
