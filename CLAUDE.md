# GIAM_SAT_SERVER

## GUARDRAILS (tuân thủ tuyệt đối)

1. KHÔNG đọc/ghi/in `.env*`, `secrets/**`, token, key, password.
2. Dữ liệu cá nhân/nhạy cảm của người dùng cuối: không đưa vào prompt/log/seed/output.
3. Không chạy production/migration/deploy khi chưa duyệt.
4. Tuân thủ `.claude/rules/module-boundaries.md`. Dự án ĐƠN KHỐI (không có `modules/`)
   nên chỉ rule 4 (hằng số nghiệp vụ đọc từ `config/`) và rule 5 (migration) có hiệu lực —
   vi phạm là lỗi nghiêm trọng, dừng lại và hỏi.
5. Ngôn ngữ giao diện/tài liệu: Tiếng Việt (chi tiết: `.claude/rules/ngon-ngu-ui.md`).

## DỰ ÁN

Hệ thống giám sát tổng hợp cho máy chủ: theo dõi tài nguyên hạ tầng (CPU/RAM/ổ đĩa/mạng, uptime) lẫn trạng thái ứng dụng, dịch vụ đang chạy, kèm cảnh báo khi vượt ngưỡng.
Nguồn yêu cầu: `docs/brd/`. Lộ trình thi công: `PLAN.md` gốc dự án (checkbox, khuôn 4 dòng).
Quyết định kiến trúc: `docs/decisions/ADR-*`. Stack: Next.js (App Router) + TypeScript + Supabase (Postgres/Auth/Realtime) + Vercel.

## QUYỀN TỰ CHỦ (đã được cấp)

- Mọi thao tác TRONG thư mục dự án (chạy lệnh, sửa file, test/build): tự làm, KHÔNG hỏi lại.
- NGOẠI LỆ = DỪNG BẮT BUỘC (mọi mode): commit/push · deploy · migration production ·
  ghi/xóa DỮ LIỆU THẬT · tác động ra ngoài thư mục dự án · việc ngoài plan đã duyệt —
  và phải nói rõ làm gì, vì sao cần duyệt. Chi tiết: `.claude/rules/workflow.md`.

## XỬ LÝ MÂU THUẪN CHỈ DẪN

- Một skill/rule nói khác plan hiện hành hoặc CLAUDE.md → DỪNG, trình bày cả hai phía,
  hỏi tôi. Không tự chọn, không tự hoà giải, không "tổng hợp cả hai".

## QUY TẮC LÀM VIỆC

- Trước khi sửa code trong thư mục nào: ĐỌC `OVERVIEW.md` của thư mục đó (`docs/`, `config/`).
- Mode do máy tự phân tích rồi báo 1 dòng `Mode: <plan|tự chạy|hỏi> — vì <lý do>`;
  ma trận R-cao/C-cao ở `.claude/rules/workflow.md`.
- Hằng số/ngưỡng nghiệp vụ: đọc từ `config/`, không hardcode.
- Sau build: chạy test/build thật, không xác nhận suông.
- Thi công theo PLAN.md kiểu GÓI: xong MỘT hạng mục → tick checkbox (CHỈ khi đã kiểm
  chứng) → báo cáo 3 dòng (đã làm / kiểm chứng / tiếp theo) → đi tiếp, KHÔNG dừng chờ;
  báo cáo tổng hợp cuối gói; chỉ dừng ở điểm DỪNG BẮT BUỘC.
- Quy trình 6 bước theo handle: `/B1_y_tuong` → `/B2_lo_trinh` → `/B3_thi_cong` →
  `/B4_nghiem_thu` → `/B5_luu_code` → `/B6_trien_khai` + `/B6_xuat_ban`.
  Phát triển & test trên LOCAL; chỉ `/B6_xuat_ban` mới đưa lên môi trường thật (cổng
  2 lớp qua Preview).
- Đầu phiên dùng `/mo_session`, cuối phiên dùng `/dong_session`.
- Chi tiết: `.claude/rules/` (workflow, security, module-boundaries, tech-defaults,
  ngon-ngu-ui).

## TRẠNG THÁI (cập nhật 01/09/2026)

### ĐÃ XONG

- **GĐ0** khung + BRD + 3 ADR + nền test (PGlite).
- **GĐ2–6 phần MÁY**: thu thập 2 nền tảng · lưu trữ 3 tầng · engine ngưỡng có
  duration/hysteresis · chống nhiễu (gom nhóm, ức chế, giới hạn, cầu dao) · leo thang phân
  tầng · ack/MTTR · dự báo đầy đĩa · giám sát dịch vụ/backup/CSDL · email cho lãnh đạo ·
  phân quyền 3 vai chặn ở RLS · giao diện 3 trang.
- **GĐ7** vòng đánh giá nối các mảnh · Cloudflare Worker · route tiếp nhận · SOP vận hành ·
  đo và giám sát THẬT máy đang chạy.
- **191 test xanh**, typecheck + build exit 0. Đã push `cac5ab2` lên
  https://github.com/hodacphuchtc/SERVER.

### ĐANG DỞ

- **PLAN_V2.md** (lộ trình MVP mới, duyệt 01/09/2026): xong GĐ0 trọn vẹn (4/4) và
  GĐ1 hạng mục 1.1 + 1.2. Còn 1.3 (luật tương quan), 1.4 (từ điển), 1.5 (điểm sức khỏe),
  rồi GĐ2–GĐ5. Toàn bộ test xanh sau mỗi hạng mục.

### BƯỚC TIẾP THEO (theo thứ tự)

1. **PLAN_V2 hạng mục 1.3** — luật tương quan: gộp "đĩa đầy + swap cao + RAM cạn + tải cao
   trong khi CPU rảnh" thành MỘT nguyên nhân gốc. Máy thật hiện đẻ 3 cảnh báo cho cùng
   một sự cố — đã đo được, xem mục CẢNH BÁO.
2. **1.4 từ điển hiển thị** và **1.5 điểm sức khỏe**.
3. **GĐ2 — dashboard** (7 hạng mục).

### CHỜ NGOÀI (thiếu key/env/dịch vụ — ghi vào đây rồi làm tiếp, đừng dừng)

Bảy thứ đang chặn, xếp theo mức độ chặn nhiều hạng mục nhất:

1. **Danh sách URL/dịch vụ nội bộ + một tài khoản SMTP** — *chặn 1.1.*
2. **Quyền chạy Docker trên một máy nội bộ** — *chặn 1.1, 1.2.*
3. **Quyền cài phần mềm trên máy Mac và Windows** (`node_exporter`, `windows_exporter`) —
   *chặn 2.1, 2.4.*
4. **Thông tin các job backup** (chạy ở đâu, tên script, chu kỳ) — *chặn 1.2, 4.2.*
5. **Danh sách dịch vụ bắt buộc** + **tên nghiệp vụ cho từng máy** — *chặn 4.1, 5.2.*
6. **Tài khoản Cloudflare + Resend** + **một tên miền** (SPF/DKIM/DMARC cho
   `alerts.<tenmien>`) — *chặn 2.2, 3.4, 6.1.*
7. **Tài khoản kết nối CSDL chỉ đọc** — *chặn 4.3.*

## QUYẾT ĐỊNH QUAN TRỌNG

| Ngày | Quyết định | Lý do |
| ---- | ---------- | ----- |
| 01/09/2026 | Dùng bộ khung chuẩn từ skill `khoi-tao-du-an` | Tái dùng hệ điều hành đã kiểm chứng: não 4 tầng, nghiệm thu bằng DEMO, decision log, sổ sẹo |
| 01/09/2026 | Stack: Next.js (App Router) + TypeScript + Supabase + Vercel | Stack quen thuộc; Supabase Realtime hợp bài toán đẩy số liệu giám sát theo thời gian thực. Chốt chính thức bằng ADR-001 ở hạng mục 0.3 |
| 01/09/2026 | Kiến trúc ĐƠN KHỐI, không chia `modules/` | Một nghiệp vụ duy nhất (giám sát) — chia module lúc này là chi phí thừa; tách khi xuất hiện nghiệp vụ thứ hai |
| 01/09/2026 | Chép đủ 8 handle B1→B6 (gồm `reset_db` + 2 handle B6) | Có Supabase là có DB, và sớm muộn sẽ deploy — để sẵn rẻ hơn bổ sung sau |
| 01/09/2026 | PGlite làm nền test VÀ nguồn dữ liệu cho giao diện | Postgres thật chạy trong Node ⇒ test migration + RLS thật, và `npm run dev` xem được ngay mà không cần Docker lẫn tài khoản Supabase |
| 01/09/2026 | Chế độ `GIAM_SAT_DO_MAY_NAY=1` đo chính máy đang chạy bằng lệnh macOS | Xem được cả dây chuyền hoạt động trên một máy CÓ THẬT trước khi có tài khoản nào — và chính nó lộ ra 5 lỗi mà fixture không bắt được |
| 01/09/2026 | Bump `next` 15.1.3 → 15.5.25 | npm cảnh báo CVE-2025-66478 ở bản cũ |

## CẢNH BÁO / CẠM BẪY (đã trả giá, đừng lặp lại)

- 🔴 **ĐỌC EXIT CODE, đừng đọc dòng cuối output.** Mắc 3 lần trong một phiên: `npm run
  typecheck | tail` rồi `&& echo OK` luôn báo xanh vì `tail` thành công. Có lần đã commit
  với `typecheck exit=2`. Luôn `cmd >/dev/null 2>&1; echo $?`.
- 🔴 **KHÔNG chạy `npm install` chồng lên tiến trình đang chạy.** Hai lần khởi động lệnh
  thứ hai khi lệnh đầu chưa xong ⇒ hai tiến trình giành `node_modules`, `next` bị xoá dở
  ba lượt, mất ~20 phút. Kiểm `ps aux | grep "[n]pm install"` trước, chạy đúng MỘT lệnh.
- 🔴 **`new URL(..., import.meta.url)` vỡ dưới webpack của Next** — nó thay lớp `URL` bằng
  polyfill riêng nên `fileURLToPath` ném `ERR_INVALID_ARG_TYPE` lúc build. Mắc 2 lần
  (`nap-migration.ts`, `nap-cau-hinh.ts`). Dùng `join(process.cwd(), ...)`.
  Riêng `.pathname` còn tệ hơn: nó giữ mã hoá phần trăm nên đường dẫn có dấu cách
  ("VIBE CODE") thành "VIBE%20CODE".
- 🔴 **CHẠY TRÊN MÁY THẬT LỘ 5 LỖI mà 184 test và toàn bộ fixture không bắt được**: page
  size 16384 trên Apple Silicon (nhân cứng 4096 là sai gấp 4 lần, và sai theo hướng KHÔNG
  BAO GIỜ chạm ngưỡng) · phần trăm đĩa APFS lệch 21 điểm so với `df -h` · bộ đếm mạng tích
  lũy bị trả ra dưới cái tên "mỗi giây" · swap là số thập phân trong cột số nguyên · cảnh
  báo hiện sai chỉ số ("69,8% nghiêm trọng" trong khi lý do thật là còn 4 GB).
  **Bài học: fixture chỉ chứng minh code chạy đúng với dữ liệu mình tưởng tượng.**
- **Test XANH VÌ LÝ DO SAI còn nguy hiểm hơn test đỏ.** Ba test hysteresis từng xanh trong
  khi ghi đè cùng mốc thời gian, mà `ghi_metric` cố ý `on conflict do nothing` — dữ liệu
  giai đoạn sau bị bỏ qua âm thầm và test đang kiểm dữ liệu giai đoạn đầu.
- **Mọi bộ phận xanh không có nghĩa hệ thống chạy.** Trước GĐ7, `grep` cho thấy không file
  nguồn nào gọi các hàm SQL theo trình tự; `soat_cong_viec()` chỉ trả về vấn đề rồi rơi
  vào hư không nên backup trễ không bao giờ thành email.
