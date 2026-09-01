-- 0008 — Dự báo ngày đầy đĩa bằng hồi quy tuyến tính.
--
-- Vì sao cái này đáng giá hơn hẳn ngưỡng tĩnh: "đĩa đã dùng 85%" không nói được cần làm
-- gì và khi nào — 85% mà ổn định hai năm nay thì không phải việc gấp, còn 60% mà tăng
-- 3GB/ngày thì tuần sau dừng hệ thống. Câu "còn khoảng 6 ngày nữa đầy" mới là thứ đưa
-- được cho lãnh đạo để duyệt tiền mua ổ cứng TRƯỚC KHI hỏng.
--
-- Postgres có sẵn regr_slope() nên không cần thư viện gì. Đơn vị: GB mỗi ngày.

create or replace function public.du_bao_day_dia(
  p_cua_so_ngay int default 7,
  p_bay_gio timestamptz default now()
)
returns table (
  may_id uuid, ten_may text, ten_o text,
  con_lai_gb real, gb_moi_ngay numeric, con_bao_nhieu_ngay numeric, dien_giai text
)
language plpgsql as $$
begin
  return query
  with mau as (
    select m.host_id,
           d.value->>'ten'                    as o,
           (d.value->>'con_lai_gb')::float8   as con_lai,
           extract(epoch from m.thoi_diem) / 86400.0 as ngay
    from public.metrics_raw m
    cross join lateral jsonb_array_elements(m.dia) d
    where m.thoi_diem > p_bay_gio - (p_cua_so_ngay || ' days')::interval
      and m.thoi_diem <= p_bay_gio
      and (d.value->>'con_lai_gb') is not null
  ),
  hoi_quy as (
    select mau.host_id,
           mau.o,
           count(*)                                   as so_mau,
           -- Âm = đang đầy dần. Đổi dấu cho dễ đọc: gb_moi_ngay dương = mỗi ngày mất
           -- bằng đó GB.
           -regr_slope(mau.con_lai, mau.ngay)         as gb_moi_ngay,
           (array_agg(mau.con_lai order by mau.ngay desc))[1] as con_lai_moi_nhat
    from mau
    group by mau.host_id, mau.o
    -- Dưới 3 mẫu thì hồi quy là bịa. Thà không trả lời còn hơn trả lời sai một cách
    -- đầy thuyết phục.
    having count(*) >= 3
  )
  select h.id, h.ten_nghiep_vu, r.o,
         r.con_lai_moi_nhat::real,
         round(r.gb_moi_ngay::numeric, 2),
         case when r.gb_moi_ngay > 0
              then round((r.con_lai_moi_nhat / r.gb_moi_ngay)::numeric, 1)
              else null end,
         case
           when r.gb_moi_ngay <= 0 then
             format('Ổ %s trên %s: dung lượng ổn định hoặc đang giảm dần, chưa có nguy cơ.',
                    r.o, h.ten_nghiep_vu)
           else
             format('Ổ %s trên %s sắp hết chỗ lưu — còn khoảng %s ngày (đang dùng thêm %s GB mỗi ngày).',
                    r.o, h.ten_nghiep_vu,
                    round((r.con_lai_moi_nhat / r.gb_moi_ngay)::numeric, 0),
                    round(r.gb_moi_ngay::numeric, 1))
         end
  from hoi_quy r
  join public.hosts h on h.id = r.host_id
  where h.dang_theo_doi;
end $$;

comment on function public.du_bao_day_dia(int, timestamptz) is
  'Câu dien_giai viết sẵn bằng ngôn ngữ quản trị để dùng thẳng trong email cho lãnh đạo.';
