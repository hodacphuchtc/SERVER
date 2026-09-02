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

## TRẠNG THÁI (cập nhật 01/09/2026 — cuối phiên 2)

🔴 **Lộ trình đang chạy là `PLAN_V2.md`.** `PLAN.md` giữ làm hồ sơ GĐ0–GĐ7 đã xong.
Bàn giao chi tiết cho phiên sau: khối "BÀN GIAO PHIÊN GẦN NHẤT" ở đầu `PLAN.md`.

### ĐÃ XONG

- **PLAN.md GĐ0–GĐ7** (phiên 1): thu thập 2 nền tảng · lưu trữ 3 tầng · engine ngưỡng có
  duration/hysteresis · chống nhiễu · leo thang · ack/MTTR · dự báo đầy đĩa · giám sát
  dịch vụ/backup/CSDL · phân quyền RLS · giao diện 3 trang · vòng đánh giá · Worker · SOP.
- **PLAN_V2 GĐ0 trọn vẹn** (0.1–0.4): sửa 3 lỗi ĐO (đĩa báo 69,8% thay vì 97,8% · áp lực
  bộ nhớ trả "normal" khi đang thrashing · `kern.num_threads` là TRẦN không phải số đếm),
  thêm 15 chỉ số macOS, migration `0012` (cột + chốt chặn dữ liệu cá nhân) và `0013`
  (`anh_chup_suc_khoe()` — một dòng mỗi máy, độ bền bỉ bằng gaps-and-islands).
- **PLAN_V2 1.1 + 1.2**: `alerts` có cột văn bản nên câu diễn giải đi được tới người đọc ·
  engine đọc đủ ngưỡng (đĩa theo % và theo GB, swap, áp lực bộ nhớ, tải, pin, nhiệt) ·
  ngưỡng tách theo hệ điều hành (bỏ `ram_phan_tram` cho macOS) · `du_bao_day_dia()` cuối
  cùng cũng có người gọi · email có nút "Đã tiếp nhận" ký HMAC.
- **246 test xanh** (từ 191), typecheck exit 0. Đã push 3 commit: `e2b0726`, `0eccf3b`,
  `128c96e`. **Tiến độ PLAN_V2: 6/24 hạng mục — 25%.**

### ĐANG DỞ

- **PLAN_V2 hạng mục 1.3** `(dở)` — engine luật tương quan XONG, 13 test xanh
  (`src/phien-dich/luat-tuong-quan.ts`), nhưng **chưa nối vào email/giao diện** nên dòng (b)
  chưa bấm được. Không tick theo cảm giác.

### BƯỚC TIẾP THEO (theo thứ tự)

1. **Nối 1.3 vào đầu ra** — chèn bước 6b vào `src/engine/vong-danh-gia.ts`, viết đè
   `than_thu` bằng nhận định gốc. Khuôn đã ghi ở PLAN_V2 mục 1.1(a2). Lệnh: `/B3_thi_cong`.
2. **1.4 từ điển hiển thị** (`config/tu-dien-giao-dien.json`) và **1.5 điểm sức khỏe**
   (trần cứng, không dùng trọng số lớn).
3. **GĐ2 — dashboard**, 7 hạng mục. (Đĩa đã dọn: 37,7 GB trống — chạy dev server thoải mái.)

### CHỜ NGOÀI (chỉ còn 2 — đã giảm từ 7)

Bối cảnh mới đã chốt: **một máy macOS**, bỏ tách vai lãnh đạo, bỏ nhánh Windows và Uptime
Kuma khỏi phạm vi v2 (xem PLAN_V2 mục "KHÔNG LÀM"). Năm mục chờ cũ vì thế không còn hiệu lực.

1. **Tài khoản CSDL chỉ đọc** — *chặn 3.3.*
2. **Tên script backup + chu kỳ**, và thêm một dòng ping vào script — *chặn 3.4.*
3. *(NGOÀI)* **Khoá Resend + một tên miền** — *chặn 4.2. Phần soạn thư làm được ngay.*

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
| 01/09/2026 | Phạm vi v2: MỘT máy macOS, bỏ tách vai lãnh đạo | Người dùng vừa là kỹ thuật vừa ra quyết định; BRD cũ giả định 2–6 máy văn phòng + CEO — giả định đó không đúng thực tế, và nó là gốc của 5/7 mục "chờ ngoài" |
| 01/09/2026 | Lớp phiên dịch HYBRID: SQL trả sự thật, TypeScript ra nhận định | Worker Cloudflare trần 10ms CPU nên phép nặng phải ở Postgres; nhưng viết văn tiếng Việt trong PL/pgSQL rất tệ và làm ở hai nơi sẽ lệch sau đúng một lần sửa |
| 01/09/2026 | Hằng số ở JSON, SỐ HỌC ở TypeScript | DSL điều kiện trong JSON không typecheck được, không test được, và sẽ thành ngôn ngữ lập trình thứ hai không ai bảo trì nổi |
| 01/09/2026 | Ngưỡng truyền vào hàm SQL bằng THAM SỐ, không viết số trong SQL | `coalesce(..., 10)` trong SQL chính là ngưỡng vô hình: sửa `config/` không có tác dụng mà không ai biết |
| 01/09/2026 | Điểm sức khỏe dùng TRẦN CỨNG, không dùng trọng số lớn | Tăng trọng số chỉ làm chậm việc pha loãng: 6 trụ, một trụ 0 điểm trọng số 25 vẫn ra tổng 75 — mà 75 điểm thì không ai đi xử lý |

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
- **TEST CŨ CÓ THỂ XANH VÌ LÝ DO SAI — sửa TEST, đừng sửa code cho vừa test.** Ba test từng
  đòi email phải chứa mã snake_case (`cpu_phan_tram`, `cong_viec:...`), và một test khẳng
  định đĩa 71,7% trong khi cột `Capacity` của chính fixture đó ghi 98%. Trước khi sửa code
  vì test đỏ, hỏi: **test này có đang mã hoá một cái lỗi không?**
- **DỌN ĐĨA MÁY NÀY** (đo 01/09/2026, đường dẫn để khỏi dò lại):
  `~/Library/ScreenRecordings` **33 GB / 5 tệp**, ba tệp lớn nhất là
  `DD115C0F-…` 14 GB (17/01/2024) · `0BBE5A2D-…` 10 GB (29/04/2023) ·
  `64FE7AB4-…` 9 GB (07/03/2024) — vào bằng `Cmd+Shift+G` rồi dán `~/Library/ScreenRecordings`.
  Thêm `~/.colima` 14 GB (Colima KHÔNG chạy) · `Application Support`: Claude 10 GB, Zalo 9,6 GB.
  **Không có snapshot Time Machine cục bộ** — đĩa đầy là thật, không có gì dễ xoá.
