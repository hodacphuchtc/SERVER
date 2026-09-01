-- 0001 — Nền tảng: danh mục máy, số liệu thô, cảnh báo.
--
-- Ba quyết định đã chốt, đừng đảo ngược mà không sửa ADR:
--  • Bảng RỘNG (một dòng = một snapshot/máy/nhịp), KHÔNG EAV — ADR-002. Dạng EAV tốn
--    8–10 lần dung lượng vì header + index gánh cho từng giá trị thay vì chia cho ~40.
--  • Partition theo NGÀY, dọn bằng DROP PARTITION chứ không DELETE — ADR-002.
--  • Collector KHÔNG có service_role. Đường ghi DUY NHẤT là hàm ghi_metric(), host_id
--    được SUY RA từ token chứ không do người gọi khai — BRD §7.2 ②.

-- ─────────────────────────── Danh mục máy chủ ───────────────────────────
create table if not exists public.hosts (
  id                     uuid primary key default gen_random_uuid(),
  -- Tên NGHIỆP VỤ ("máy chủ kế toán"), không phải hostname. Đây là thứ hiện trong email
  -- và giao diện: vừa an toàn hơn (không lộ sơ đồ hạ tầng) vừa đúng ngôn ngữ quản trị.
  ten_nghiep_vu          text        not null unique,
  he_dieu_hanh           text        not null check (he_dieu_hanh in ('windows', 'macos')),
  muc_quan_trong         text        not null default 'quan_trong'
                                     check (muc_quan_trong in ('song_con', 'quan_trong', 'phu')),
  -- Chỉ lưu BĂM của token, không bao giờ lưu token thật.
  token_bam              text        not null unique,
  token_tao_luc          timestamptz not null default now(),
  lan_day_du_lieu_cuoi   timestamptz,
  dang_theo_doi          boolean     not null default true,
  tao_luc                timestamptz not null default now()
);

comment on column public.hosts.token_bam is
  'sha256 hex của token. Xoay token = ghi băm mới + cập nhật token_tao_luc.';

-- ─────────────────────────── Số liệu thô (bảng RỘNG) ───────────────────────────
create table if not exists public.metrics_raw (
  thoi_diem               timestamptz not null,
  host_id                 uuid        not null references public.hosts(id) on delete cascade,

  -- CPU
  cpu_phan_tram           real,
  cpu_hang_doi            real,          -- Windows: Processor Queue Length; macOS: load 1 phút
  tai_trung_binh_15p      real,

  -- Bộ nhớ. macOS KHÔNG dùng ram_phan_tram để cảnh báo (cache rất hung, 90% là bình
  -- thường) — dùng ap_luc_bo_nho + swap_vao_moi_giay. Xem config/nguong-canh-bao.json.
  ram_phan_tram           real,
  ram_tong_mb             integer,
  ram_con_lai_mb          integer,
  swap_dung_mb            integer,
  swap_vao_moi_giay       bigint,
  ap_luc_bo_nho           text check (ap_luc_bo_nho in ('normal', 'warn', 'critical')),

  -- Đĩa: một máy có nhiều ổ nên để jsonb, giữ được "một dòng một snapshot".
  -- Dạng: [{"ten":"C:","tong_gb":500,"con_lai_gb":42,"phan_tram_dung":91.6,
  --         "do_tre_doc_ms":8.2,"do_tre_ghi_ms":11.0}]
  dia                     jsonb       not null default '[]'::jsonb,

  -- Mạng
  mang_vao_byte_moi_giay  bigint,
  mang_ra_byte_moi_giay   bigint,
  mang_goi_loi            bigint,
  mang_goi_tong           bigint,

  -- Máy
  uptime_giay             bigint,
  thoi_diem_khoi_dong     timestamptz,

  -- Tiến trình ăn tài nguyên nhất. CHỈ TÊN — cấm tham số dòng lệnh (dữ liệu cá nhân,
  -- Nghị định 13/2023/NĐ-CP, BRD §8.1). Ràng buộc này được canh bằng máy ở dưới.
  tien_trinh_top          jsonb       not null default '[]'::jsonb,

  -- Dịch vụ bắt buộc đang thiếu: ["SQLSERVER","Spooler"]
  dich_vu_thieu           jsonb       not null default '[]'::jsonb,

  primary key (host_id, thoi_diem)
) partition by range (thoi_diem);

-- Chặn bằng MÁY chứ không bằng lời dặn: tiến trình chỉ được có đúng 3 khoá, và "ten"
-- không được chứa dấu cách + gạch ngang kiểu tham số dòng lệnh, cũng không chứa dấu /
-- hay \ (đường dẫn có thể lộ tên người dùng).
create or replace function public.tien_trinh_khong_co_tham_so(p jsonb)
returns boolean language sql immutable as $$
  select coalesce(bool_and(
           (select count(*) from jsonb_object_keys(x) k where k not in ('ten','cpu','ram_mb')) = 0
           and (x->>'ten') !~ '[\\/]'
           and (x->>'ten') !~ '\s-{1,2}\w'
         ), true)
  from jsonb_array_elements(p) x;
$$;

alter table public.metrics_raw
  add constraint tien_trinh_khong_lo_du_lieu_ca_nhan
  check (public.tien_trinh_khong_co_tham_so(tien_trinh_top));

-- ─────────────────────────── Cảnh báo ───────────────────────────
create table if not exists public.alerts (
  id              uuid primary key default gen_random_uuid(),
  host_id         uuid references public.hosts(id) on delete cascade,
  chi_so          text        not null,          -- 'cpu_phan_tram', 'mat_lien_lac', ...
  muc             text        not null check (muc in ('canh_cao', 'nghiem_trong')),
  gia_tri         real,
  nguong          real,
  -- Một cảnh báo là một KHOẢNG, không phải một sự kiện: mở ra rồi đóng lại.
  bat_dau_luc     timestamptz not null default now(),
  ket_thuc_luc    timestamptz,
  tiep_nhan_luc   timestamptz,
  tiep_nhan_boi   text,
  -- Chống trùng: cùng máy + chỉ số + mức thì chỉ được có MỘT cảnh báo đang mở.
  van_mo          boolean generated always as (ket_thuc_luc is null) stored
);

create unique index if not exists alerts_mot_canh_bao_dang_mo
  on public.alerts (host_id, chi_so, muc) where ket_thuc_luc is null;

create table if not exists public.alert_notifications (
  id              uuid primary key default gen_random_uuid(),
  -- Outbox: ghi vào đây TRƯỚC, worker gửi SAU. Chống gửi trùng khi function timeout
  -- giữa chừng — BRD §6 nhóm D8.
  khoa_idempotency text       not null unique,
  loai            text        not null check (loai in ('canh_bao', 'khoi_phuc', 'digest', 'tuan', 'dien_rong')),
  nguoi_nhan      text[]      not null,
  tieu_de         text        not null,
  than_thu        text        not null,
  tao_luc         timestamptz not null default now(),
  gui_luc         timestamptz,
  loi             text
);

-- ─────────────────────────── RLS: chặn hết, chỉ mở đúng một cửa ───────────────────────────
alter table public.hosts               enable row level security;
alter table public.metrics_raw         enable row level security;
alter table public.alerts              enable row level security;
alter table public.alert_notifications enable row level security;

-- FORCE để chủ bảng cũng không lách được — nếu không, một lỗi cấu hình khiến app chạy
-- bằng owner là RLS im lặng vô hiệu.
alter table public.hosts               force row level security;
alter table public.metrics_raw         force row level security;
alter table public.alerts              force row level security;
alter table public.alert_notifications force row level security;

-- KHÔNG tạo policy nào cho anon/authenticated ở migration này: mặc định là cấm sạch.
-- Quyền đọc cho giao diện sẽ mở ở migration của GĐ6, theo đúng ba vai.
