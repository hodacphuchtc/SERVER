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

- **GĐ0 (01/09/2026)** — khung dự án + tài liệu yêu cầu:
  - 0.1 Bộ khung chuẩn (skill `khoi-tao-du-an`).
  - 0.2 BRD `docs/brd/giam-sat-he-thong.md` (317 dòng).
  - 0.3 ADR-001/002/003 · `tech-defaults.md` (stack chốt) · `config/nguong-canh-bao.json` ·
    viết lại `.claude/rules/workflow.md` cho đúng dự án này · PLAN.md có đủ GĐ1–6.

### ĐANG DỞ

- Chưa có hạng mục nào đang dở.

### BƯỚC TIẾP THEO (theo thứ tự)

1. **GĐ1 — cầm máu bằng Uptime Kuma** (1 ngày). ⛔ Đang chặn: cần danh sách URL nội bộ,
   tài khoản SMTP, và quyền chạy Docker trên một máy nội bộ.
2. **GĐ2.3 — schema DB + token mỗi máy + RLS** (làm được ngay, không chờ ai).
3. GĐ2.1/2.2 — hai spike rủi ro cao (macOS metrics, Cloudflare Worker 10ms CPU).

### CHỜ NGOÀI (thiếu key/env/dịch vụ — ghi vào đây rồi làm tiếp, đừng dừng)

Bảy thứ đang chặn, xếp theo mức độ chặn nhiều hạng mục nhất:

1. **Danh sách URL/dịch vụ nội bộ cần theo dõi + một tài khoản SMTP** — để Uptime Kuma gửi
   mail. *Chặn: GĐ1 toàn bộ (hạng mục 1.1).*
2. **Quyền chạy Docker trên một máy nội bộ** — nơi đặt Uptime Kuma. *Chặn: 1.1, 1.2.*
3. **Quyền cài phần mềm trên máy Mac và máy Windows** — để cài `node_exporter` và
   `windows_exporter`. *Chặn: 2.1, 2.2, 2.4.*
4. **Thông tin các job backup** (chạy ở đâu, tên script, chu kỳ) — để gắn dead-man's switch.
   *Chặn: 1.2, 4.2.*
5. **Danh sách dịch vụ bắt buộc luôn chạy trên từng máy** + **tên nghiệp vụ cho từng máy**
   ("máy chủ kế toán" thay vì "SRV-01"). *Chặn: 4.1, 5.2.*
6. **Tài khoản Supabase + Cloudflare + Resend** (đều gói miễn phí) và **một tên miền** để
   cấu hình SPF/DKIM/DMARC cho subdomain `alerts.<tenmien>`. *Chặn: 2.2, 3.4, 6.1.*
7. **Tài khoản kết nối CSDL chỉ đọc** — không dùng tài khoản quản trị. *Chặn: 4.3.*

Chưa có 7 thứ trên vẫn làm được: 2.3 (schema + RLS), 3.x (engine viết bằng SQL + test),
6.2–6.4 (giao diện, chạy với dữ liệu giả).

## QUYẾT ĐỊNH QUAN TRỌNG

| Ngày | Quyết định | Lý do |
| ---- | ---------- | ----- |
| 01/09/2026 | Dùng bộ khung chuẩn từ skill `khoi-tao-du-an` | Tái dùng hệ điều hành đã kiểm chứng: não 4 tầng, nghiệm thu bằng DEMO, decision log, sổ sẹo |
| 01/09/2026 | Stack: Next.js (App Router) + TypeScript + Supabase + Vercel | Stack quen thuộc; Supabase Realtime hợp bài toán đẩy số liệu giám sát theo thời gian thực. Chốt chính thức bằng ADR-001 ở hạng mục 0.3 |
| 01/09/2026 | Kiến trúc ĐƠN KHỐI, không chia `modules/` | Một nghiệp vụ duy nhất (giám sát) — chia module lúc này là chi phí thừa; tách khi xuất hiện nghiệp vụ thứ hai |
| 01/09/2026 | Chép đủ 8 handle B1→B6 (gồm `reset_db` + 2 handle B6) | Có Supabase là có DB, và sớm muộn sẽ deploy — để sẵn rẻ hơn bổ sung sau |

## CẢNH BÁO / CẠM BẪY (đã trả giá, đừng lặp lại)

- (chưa có — mỗi lần trả giá, ghi 1 dòng: **bài học in đậm** + vì sao, để session sau
  không lặp lại)
