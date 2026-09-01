# PLAN.md — Lộ trình GIAM_SAT_SERVER (khởi tạo 01/09/2026)

> **Nguyên tắc đọc file này:** đây là NGUỒN LỘ TRÌNH DUY NHẤT của dự án — không đẻ file kế
> hoạch riêng; cần mở rộng thì đánh số con ngay tại đây (vd 2.1b, 3B.1). Mỗi Giai đoạn (GĐ)
> kết thúc bằng một DEMO mà người dùng tự bấm thử được — không nghiệm thu bằng lời "đã viết
> xong". Mỗi hạng mục có 4 dòng: (a) làm gì, (b) người dùng kiểm chứng bằng thao tác nào,
> (c) test tự động nào chạy, (d) ước lượng thời gian. Hạng mục 🔴 = rủi ro cao, cố tình xếp
> SỚM. **Luật tick:** chỉ tick ✅ khi (b) đã bấm thật và (c) đã xanh — cấm tick theo cảm
> giác; hạng mục dở ghi `(dở — dừng ở: ...)`. Xong MỘT hạng mục → tick → báo cáo 3 dòng →
> đi tiếp theo GÓI (luật: `.claude/rules/workflow.md`); chỉ dừng ở điểm DỪNG BẮT BUỘC.
>
> **Nguồn thiết kế chi tiết:** `docs/brd/` + `docs/decisions/ADR-*`. Quy tắc bắt buộc:
> `.claude/rules/`.

---

## GIAI ĐOẠN 0 — Khung dự án + tài liệu yêu cầu (ước lượng: 1,1 ngày)

**DEMO kết thúc GĐ:** bạn mở `docs/brd/giam-sat-he-thong.md` đọc và xác nhận nó mô tả đúng
bài toán của bạn; chạy `node scripts/check-structure.mjs` thấy in ✅ và exit 0.

- [x] **0.1 — Khởi tạo bộ khung chuẩn** ✅ (01/09/2026 — sinh bởi skill `khoi-tao-du-an`)
  - (a) CLAUDE.md + PLAN.md + `.claude/{rules,agents,skills,commands,settings}` + docs/ +
    config/ + `scripts/check-structure.mjs` + scaffold.json.
  - (b) Người dùng mở cây thư mục thấy đủ cấu trúc; đọc được CLAUDE.md bằng Tiếng Việt.
  - (c) `node scripts/check-structure.mjs` in ✅ toàn bộ, exit 0.
  - (d) 0,1 ngày.

- [x] **0.2 — Viết BRD đầu tiên** ✅ (01/09/2026)
  - (a) `docs/brd/giam-sat-he-thong.md`: bài toán, người dùng, phạm vi In/Out, danh mục
    tính năng A–H, chính sách cảnh báo, thẩm định 6 mục.
  - (b) Bạn đọc và xác nhận phần "vấn đề viết lại bằng ngôn ngữ của tôi" đúng ý bạn.
  - (c) (tài liệu — không có test tự động.)
  - (d) 0,5 ngày.

- [x] **0.3 — Chốt stack + lập lộ trình chi tiết** ✅ (01/09/2026)
  - (a) Điền `.claude/rules/tech-defaults.md`; viết ADR-001 (dùng lại exporter), ADR-002
    (lưu bảng rộng), ADR-003 (đồng hồ cảnh báo ở cloud); ghi ngưỡng khởi điểm vào
    `config/nguong-canh-bao.json`; viết lại `.claude/rules/workflow.md` cho đúng dự án
    này; bổ sung GĐ 1..6 vào chính file này.
  - (b) Bạn duyệt danh sách giai đoạn + thứ tự ưu tiên (🔴 xếp sớm).
  - (c) `node scripts/check-structure.mjs` xanh và đếm đủ 3 ADR; `grep -rn "SATA\|Teky" .claude/rules/`
    không còn dòng nào.
  - (d) 0,5 ngày.

- [x] **0.4 — Dựng nền chạy được trên LOCAL** ✅ (01/09/2026)
  - (a) `package.json` + `tsconfig.json` + `vitest.config.ts`. Cài ĐÚNG thứ cần cho GĐ2–3,
    **chưa cài Next.js** (chỉ GĐ6 mới cần): `typescript`, `vitest`, `@types/node`,
    `@electric-sql/pglite` (Postgres nhúng chạy trong Node — cho phép chạy migration và
    test RLS thật mà KHÔNG cần Docker, không cần tài khoản Supabase). Script `npm test`,
    `npm run typecheck`. Cài theo trình tự an toàn: `npm install --package-lock-only`
    (chỉ giải phụ thuộc, không tải, không chạy script) → quét `package.json` +
    `package-lock.json` bằng skill `quet-ma-doc` → verdict XANH mới `npm install
    --ignore-scripts` (chặn `postinstall` — đường lây phổ biến nhất của npm).
  - (b) Bạn chạy `npm test` thấy test mẫu xanh, `npm run typecheck` không lỗi.
  - (c) `tests/nen-tang.test.ts` — khẳng định PGlite khởi động được và chạy được một câu
    `SELECT 1`; đây là điều kiện cần cho mọi test SQL của GĐ2–3.
  - (d) 0,5 ngày.

---

## GIAI ĐOẠN 1 — CẦM MÁU: biết trước khi nhân viên kêu (ước lượng: 1 ngày)

> **Vì sao giai đoạn này đứng riêng và đứng đầu.** Nỗi đau đã khai là *"nhân viên kêu thì
> mới biết"*. Nỗi đau đó chữa được trong 1 ngày bằng đồ cài sẵn — không có lý do gì bắt nó
> chờ hết 5 giai đoạn còn lại. Mọi thứ sau GĐ1 phục vụ mục tiêu KHÁC: giúp lãnh đạo ra
> quyết định.

**DEMO kết thúc GĐ:** bạn rút dây mạng một máy chủ (hoặc tắt một dịch vụ) → **trong vòng 2
phút hộp thư quản trị nhận được email báo**, ghi rõ dịch vụ nào chết và từ lúc nào.

- [ ] 🔴 **1.1 — Dựng Uptime Kuma và cấu hình giám sát từ ngoài**
  - (a) Chạy Uptime Kuma bằng Docker trên một máy nội bộ (`docker run -d --restart=always
    -p 3001:3001 -v uptime-kuma:/app/data louislam/uptime-kuma:1`). Tạo monitor cho từng
    website/API nội bộ: kiểu HTTP(s), nhịp 60s, **Retries = 3** (báo sau ~180s, không báo
    ngay lần fail đầu — chống báo động giả khi mạng chớp). Bật **Certificate Expiry
    Notification**. Khai kênh thông báo Email (SMTP) tới hộp thư quản trị.
  - (b) Bạn mở `http://<máy-nội-bộ>:3001`, thấy danh sách dịch vụ toàn màu xanh. Sau đó tắt
    một dịch vụ bất kỳ, bấm đồng hồ đợi → **email về trong ~3 phút**, tiêu đề ghi tên dịch
    vụ. Bật lại → nhận email "khôi phục".
  - (c) Không có test tự động (đồ cài sẵn, không phải code của ta). Bằng chứng là ảnh chụp
    email nhận được, lưu vào `docs/brd/bang-chung/`.
  - (d) 0,5 ngày.
  - (e) chặn: NGƯỜI — cần bạn cung cấp danh sách URL nội bộ cần theo dõi + một tài khoản
    SMTP để Kuma gửi mail.

- [ ] **1.2 — Dead-man's switch cho sao lưu và job định kỳ**
  - (a) Trong Uptime Kuma tạo monitor kiểu **Push** cho mỗi job backup (Heartbeat Interval =
    chu kỳ job + grace 2–4 giờ). Sửa script backup: dòng cuối cùng, **chỉ chạy khi backup
    thành công**, gọi `curl -fsS -m 10 <push-url>`. Nguyên tắc: không có tiếng ping =
    báo động, thay vì chờ ai đó nhớ đi kiểm tra.
  - (b) Bạn đổi tên file script backup cho nó chạy hỏng một đêm → sáng hôm sau có email
    *"Backup máy chủ kế toán chưa chạy"*. Trả lại tên cũ → đêm sau monitor xanh lại.
  - (c) Không có test tự động. Bằng chứng: ảnh chụp email.
  - (d) 0,5 ngày.
  - (e) chặn: NGƯỜI — cần biết các job backup hiện đang chạy ở đâu, tên script, chu kỳ.

**🏁 MỐC "hết mù" (hết GĐ1):** không còn sự cố nào của dịch vụ có HTTP mà phải chờ nhân viên
báo. Đo bằng: sự cố tiếp theo, email đến TRƯỚC tin nhắn của nhân viên.

---

## GIAI ĐOẠN 2 — Thu thập số liệu 2 nền tảng (ước lượng: 5 ngày)

**DEMO kết thúc GĐ:** bạn mở bảng `metrics_raw` trên Supabase, thấy **số liệu của cả máy
Windows lẫn máy Mac** chảy vào mỗi phút. Sau đó bạn tắt collector → 3 phút sau nhận email
*"Không nhận được số liệu từ hệ thống giám sát"*.

- [~] 🔴 **2.1 — SPIKE: đo xem `node_exporter` trên macOS thật sự lấy được gì** *(dở — dừng ở: bảng đối chiếu `docs/architecture/metric-2-nen-tang.md` đã viết đủ, không ô nào trống, và parser + 30 test đã chạy trên fixture của cả 2 OS. CHỜ: chạy `node_exporter` trên máy Mac THẬT để xác nhận tên metric khớp — đây mới là phần "spike")*
  - (a) Đây là **mắt xích yếu nhất của toàn dự án** nên làm ngay đầu tiên. `brew install
    node_exporter` trên máy Mac, chạy, rồi `curl -s localhost:9100/metrics` và đối chiếu:
    có đủ CPU, RAM, đĩa, mạng không? Tên metric darwin **khác Linux** (không có
    `node_memory_MemAvailable_bytes`). Viết kết quả thành bảng đối chiếu
    `docs/architecture/metric-2-nen-tang.md`: mỗi chỉ số nghiệp vụ → tên metric trên
    Windows → tên metric trên macOS → công thức tính. Chỉ số nào darwin không có thì ghi
    rõ và đề xuất cách thay (gọi `vm_stat`/`sysctl` trong collector).
  - (b) Bạn mở `docs/architecture/metric-2-nen-tang.md` thấy bảng đầy đủ, không ô nào ghi
    "chưa biết". Ô nào không lấy được phải có dòng phương án thay thế.
  - (c) `tests/metric-mapping.test.ts` — nạp file mẫu `/metrics` đã lưu của cả 2 OS, khẳng
    định mọi chỉ số trong bảng đều rút ra được số hợp lệ (không `NaN`, không `undefined`).
  - (d) 1 ngày.
  - (e) chặn: NGƯỜI — cần quyền cài phần mềm trên máy Mac.

- [ ] 🔴 **2.2 — SPIKE: chứng minh Cloudflare Worker gói miễn phí chạy nổi vòng đánh giá**
  - (a) Gói free giới hạn **10ms CPU mỗi lần gọi**. Dựng một Worker thử: cron 1 phút → gọi
    một hàm RPC Postgres đánh giá ngưỡng cho 6 máy × 40 chỉ số → đo `wall time` và CPU
    time trong log. Nếu vượt 10ms CPU thì đẩy thêm phần tính toán xuống SQL (thời gian chờ
    I/O **không** tính vào CPU time). Ghi kết quả đo vào ADR-003.
  - (b) Bạn mở Cloudflare dashboard → Workers → Logs, thấy 10 lần chạy liên tiếp đều
    **không có lỗi "Exceeded CPU limit"**, và cột CPU time đều dưới 10ms.
  - (c) `tests/worker-danh-gia.test.ts` — gọi hàm đánh giá với bộ dữ liệu 6 máy × 40 chỉ số
    giả lập, khẳng định trả về đúng danh sách vi phạm và chạy dưới 10ms CPU.
  - (d) 1 ngày.
  - (e) chặn: NGOÀI — cần tài khoản Cloudflare (miễn phí).

- [x] **2.3 — Schema cơ sở dữ liệu + token riêng mỗi máy + RLS** ✅ (01/09/2026)
  - (a) Migration tạo: `hosts` (id, tên nghiệp vụ, hệ điều hành, mức quan trọng, token đã
    băm, lần đẩy dữ liệu cuối), `metrics_raw` **bảng RỘNG** (một dòng = một snapshot của
    một máy tại một nhịp, ~40 cột, partition theo ngày), `alerts`, `alert_notifications`.
    **Bật RLS chặn hết**, chỉ mở đúng một hàm RPC `ghi_metric(token, payload)` cho phép
    `INSERT` vào đúng `host_id` khớp token. **Tuyệt đối không dùng `service_role` ở
    collector** — xem ADR và §7.2 của BRD.
  - (b) Bạn thử gọi API Supabase bằng token của máy A nhưng ghi cho `host_id` của máy B →
    **bị từ chối**. Thử đọc bảng `hosts` bằng khóa anon → **không thấy dòng nào**.
  - (c) `tests/rls-ghi-metric.test.ts` — 4 ca: token đúng ghi được · token của máy khác bị
    từ chối · token sai bị từ chối · khóa anon không đọc được `hosts`.
  - (d) 1 ngày.

- [~] **2.4 — Collector: quét exporter, gộp một dòng rộng, đẩy lên cloud** *(dở — dừng ở: `collector/` đã xong đủ vòng đời + hàng đợi mất mạng + 16 test, kể cả test nối hai đầu chứng minh payload qua được mọi ràng buộc schema. CHỜ: đóng gói chạy nền (winsw / LaunchDaemon) và chạy trên máy thật)*
  - (a) `collector/index.ts` (~300 dòng): mỗi 60 giây quét tất cả exporter đã khai trong
    `config/may-chu.json` → chuyển theo bảng đối chiếu của 2.1 → gộp thành **một dòng rộng
    cho mỗi máy** → POST một request duy nhất lên RPC `ghi_metric`. **Cắt bỏ tham số dòng
    lệnh của tiến trình, chỉ giữ tên** (lý do pháp lý — Nghị định 13, xem BRD §7.3). Đóng
    gói chạy nền: Windows Service qua `winsw`, macOS qua LaunchDaemon. Có retry + hàng đợi
    tại chỗ khi mất mạng, tối đa 30 phút.
  - (b) Bạn mở Supabase → Table Editor → `metrics_raw`, thấy **dòng mới xuất hiện mỗi phút
    cho từng máy**, cột CPU/RAM/đĩa có số hợp lý. Rút mạng máy chạy collector 5 phút rồi
    cắm lại → dữ liệu 5 phút đó được đẩy bù, không mất.
  - (c) `tests/collector.test.ts` — nạp file `/metrics` mẫu của cả 2 OS, khẳng định gộp ra
    đúng một dòng rộng đúng kiểu dữ liệu; test hàng đợi khi mạng lỗi; **test khẳng định
    tham số dòng lệnh KHÔNG lọt vào payload**.
  - (d) 1,5 ngày.
  - (e) chặn: MÁY (sau khi 2.1 và 2.3 xong).

- [x] **2.5 — Dead-man's switch cho chính collector** ✅ (01/09/2026)
  - (a) Hàm SQL chạy theo Worker cron: máy nào có `lan_day_du_lieu_cuoi` cũ hơn **3 phút**
    → tạo cảnh báo mức nghiêm trọng *"Mất liên lạc với máy X"*. **Logic này chạy trên
    cloud, không nằm trong collector** — collector chết thì nó không tự báo được.
  - (b) Bạn tắt collector → **3 phút sau nhận email**. Bật lại → nhận email khôi phục.
  - (c) `tests/mat-lien-lac.test.ts` — dựng dữ liệu có mốc thời gian cũ 4 phút, khẳng định
    hàm sinh đúng 1 cảnh báo; mốc mới 1 phút thì không sinh cảnh báo nào.
  - (d) 0,5 ngày.

---

## GIAI ĐOẠN 3 — Lưu trữ và engine cảnh báo có kỷ luật (ước lượng: 5 ngày)

> **Đây là giai đoạn quyết định dự án sống hay chết.** Bỏ bớt phần chống nhiễu ở đây để
> "làm nhanh cho kịp" thì sau bàn giao 2 tuần email thành rác và không ai đọc nữa — hệ
> thống chết mà không ai tuyên bố. Mục tiêu định lượng: **dưới 5 cảnh báo/tuần**.

**DEMO kết thúc GĐ:** bạn chạy một chương trình ép CPU một máy lên 100% trong 6 phút →
**đúng MỘT email** tới hộp thư quản trị (không phải 6 email), và **không có email nào** tới
lãnh đạo. Ép tiếp 2 máy nữa cùng lúc → vẫn chỉ **một** email, liệt kê cả 3 máy.

- [x] **3.1 — Ba tầng lưu trữ + dọn dữ liệu cũ bằng DROP PARTITION** ✅ (01/09/2026)
  - (a) Bảng gộp `metrics_5m` và `metrics_1h`, mỗi dòng lưu **min/max/avg/p95** (không chỉ
    avg — avg 5 phút che mất spike CPU 100% kéo dài 40 giây). Job gộp chạy mỗi 5 phút.
    Dọn dữ liệu cũ bằng **`DROP PARTITION`, không bao giờ `DELETE`** (xóa 100 triệu dòng
    bằng DELETE gây bloat và autovacuum kéo hàng giờ). Giữ: raw 7 ngày · 5m 90 ngày ·
    1h 13 tháng. Thêm cảnh báo nội bộ khi dung lượng DB vượt **350 MB / 500 MB**.
  - (b) Bạn mở Supabase → Database → thấy 3 bảng có dữ liệu, và `metrics_raw` chỉ chứa
    đúng 7 ngày gần nhất. Xem Reports → Database size vẫn dưới 150 MB.
  - (c) `tests/gop-so-lieu.test.ts` — nạp 300 dòng thô của 1 giờ, khẳng định gộp ra đúng 12
    dòng 5 phút với min/max/avg/p95 đúng số học.
  - (d) 1 ngày.

- [x] 🔴 **3.2 — Engine ngưỡng: duration + hysteresis (chống nhấp nháy)** ✅ (01/09/2026)
  - (a) Hàm SQL đánh giá: mỗi chỉ số đọc ngưỡng từ `config/nguong-canh-bao.json`, **chỉ bắn
    khi vượt LIÊN TỤC đủ thời gian** (CPU/RAM 5 phút · đĩa 10–15 phút · mất liên lạc 3
    phút). **Hysteresis:** bắn ở 90% nhưng chỉ tắt ở 80% **và** cần 2–3 mẫu bình thường
    liên tiếp. Ngưỡng RAM cho macOS dùng **memory pressure + tốc độ swap**, KHÔNG dùng
    "% đã dùng" (macOS cache rất hung, 90% là bình thường — dùng nhầm sẽ báo động giả
    liên tục).
  - (b) Bạn ép CPU lên 100% trong **3 phút rồi thả** → **không có email nào** (chưa đủ 5
    phút). Ép **6 phút** → có email. Sau khi thả, CPU về 85% → cảnh báo **chưa tắt**; về
    dưới 80% hai nhịp liên tiếp → mới nhận email khôi phục.
  - (c) `tests/nguong-duration.test.ts` + `tests/hysteresis.test.ts` — chuỗi giá trị giả
    lập theo thời gian, khẳng định số cảnh báo sinh ra đúng bằng kỳ vọng ở từng ca:
    vượt 3 phút = 0 cảnh báo · vượt 6 phút = 1 · nhấp nháy quanh ngưỡng 10 lần = 1.
  - (d) 1,5 ngày.

- [x] 🔴 **3.3 — Gom nhóm, ức chế, giới hạn tốc độ, cầu dao** ✅ (01/09/2026)
  - (a) **Gom nhóm:** nhiều cảnh báo trong 60 giây → một email có bảng. **Ức chế:** máy đã
    "mất liên lạc" thì chặn toàn bộ cảnh báo con của máy đó (đừng báo "CPU cao" cho một
    máy vừa mất điện); cảnh báo nghiêm trọng chặn cảnh báo cảnh cáo cùng máy.
    **Giới hạn:** tối đa 10 email/5 phút toàn hệ thống — **tự chặn phía mình, không dựa vào
    trần 100 mail/ngày của Resend** (dựa vào họ thì bị khoá đúng lúc cần nhất).
    **Cầu dao:** hơn 20 cảnh báo trong 5 phút → gửi **một** email *"SỰ CỐ DIỆN RỘNG"* rồi
    chuyển sang chế độ tóm tắt.
  - (b) Bạn rút mạng cả 3 máy cùng lúc → nhận **một** email liệt kê 3 máy, **không** nhận
    thêm email "CPU không đo được" của từng máy.
  - (c) `tests/gom-nhom.test.ts`, `tests/uc-che.test.ts`, `tests/cau-dao.test.ts` — mỗi test
    đưa vào một chùm cảnh báo và khẳng định **số email sinh ra**, không phải số cảnh báo.
  - (d) 1 ngày.

- [~] **3.4 — Gửi email qua Resend + hàng đợi outbox + phân tầng người nhận** *(dở — dừng ở: outbox + leo thang phân tầng đã xong và có test; phần gọi HTTP API của Resend chờ tài khoản + tên miền)*
  - (a) Ghi vào bảng `alert_notifications` trước, Worker gửi sau (**outbox** — chống gửi
    trùng khi function timeout giữa chừng), có khoá idempotency
    `hash(máy + chỉ số + mức)`. Gọi **HTTP API của Resend, KHÔNG dùng SMTP**: Vercel/Worker
    đóng băng tác vụ nền ngay khi trả response, lệnh SMTP chưa `await` xong sẽ chết giữa
    handshake — **không lỗi, không log, không email**. Phân tầng: quản trị nhận mọi mức;
    **lãnh đạo chỉ nhận khi mức nghiêm trọng chưa ai xử lý sau 30 phút**. Nội dung mail
    dùng **tên nghiệp vụ** ("máy chủ kế toán"), không dùng hostname/IP thật.
  - (b) Bạn gây một sự cố nghiêm trọng và **không bấm gì cả** → quản trị nhận ngay; đúng 30
    phút sau lãnh đạo mới nhận. Lặp lại nhưng bấm "Đã tiếp nhận" ở phút thứ 10 → lãnh đạo
    **không** nhận email nào.
  - (c) `tests/outbox.test.ts` (gọi 2 lần cùng khoá idempotency chỉ sinh 1 bản ghi gửi) +
    `tests/leo-thang.test.ts` (có ack thì không leo thang; không ack thì leo sau 30 phút).
  - (d) 1 ngày.
  - (e) chặn: NGOÀI — cần tài khoản Resend + một tên miền để cấu hình SPF/DKIM/DMARC
    (khuyến nghị subdomain riêng `alerts.<tenmien>` để tách uy tín khỏi mail kinh doanh).

- [x] **3.5 — Ghi nhận xử lý sự cố (ack) và tính MTTR** ✅ (01/09/2026)
  - (a) Mỗi email có nút "Đã tiếp nhận" (link ký số, không cần đăng nhập). Lưu ai bấm, lúc
    nào, khi nào cảnh báo tự tắt → tính thời gian khắc phục trung bình.
  - (b) Bạn bấm nút trong email → mở trang xác nhận, và sự cố đó chuyển sang "đang xử lý".
  - (c) `tests/ack.test.ts` — link hợp lệ ghi nhận đúng; link đã dùng hoặc hết hạn bị từ chối.
  - (d) 0,5 ngày.

---

## GIAI ĐOẠN 4 — Giám sát ứng dụng, dịch vụ, sao lưu (ước lượng: 4 ngày)

**DEMO kết thúc GĐ:** bạn dừng một dịch vụ Windows bắt buộc → nhận cảnh báo trong 2 phút.
Bạn tạo một file backup rỗng thay cho file thật → nhận cảnh báo *"bản sao lưu bất thường,
nhỏ hơn 70% so với trung bình 7 ngày"*.

- [ ] **4.1 — Dịch vụ và tiến trình bắt buộc luôn chạy**
  - (a) Khai trong `config/dich-vu-bat-buoc.json` danh sách dịch vụ theo từng máy. Collector
    đọc `Win32_Service` (lọc `State='Stopped' AND StartMode='Auto'`) trên Windows và danh
    sách tiến trình trên macOS, đẩy kèm dòng metric. Engine bắn cảnh báo ngay khi thiếu.
  - (b) Bạn dừng một dịch vụ trong Services.msc → **2 phút sau có email**. Bật lại → email
    khôi phục.
  - (c) `tests/dich-vu-bat-buoc.test.ts` — dữ liệu giả lập thiếu 1 dịch vụ sinh đúng 1 cảnh
    báo; đủ dịch vụ sinh 0.
  - (d) 1 ngày.
  - (e) chặn: NGƯỜI — cần bạn liệt kê dịch vụ nào là bắt buộc trên máy nào.

- [ ] **4.2 — Sao lưu: dead-man's switch + phát hiện bản sao lưu rỗng**
  - (a) Nâng cấp phần Push của GĐ1 vào hệ thống chính: script backup ping kèm **kích thước
    file**. Engine so với **trung vị 7 ngày**, lệch quá ±30% thì cảnh cáo, quá ±60% thì
    nghiêm trọng. Đây là bẫy phổ biến nhất: script thoát mã 0 nhưng file 0 byte, và không
    ai biết cho tới ngày cần phục hồi.
  - (b) Bạn thay bản backup đêm bằng file rỗng → sáng hôm sau có email cảnh báo. Trả lại
    file bình thường → hết cảnh báo.
  - (c) `tests/backup-kich-thuoc.test.ts` — chuỗi 7 ngày kích thước ổn định rồi một ngày
    còn 10%: khẳng định sinh cảnh báo mức nghiêm trọng.
  - (d) 1 ngày.
  - (e) chặn: NGƯỜI — cần sửa script backup để thêm dòng ping (bạn hoặc IT làm).

- [ ] **4.3 — Job định kỳ khác + cơ sở dữ liệu ở mức cơ bản**
  - (a) Cùng cơ chế Push cho các scheduled task / cron quan trọng. Với CSDL: đo kết nối
    được không, số kết nối đang mở, dung lượng. **Không** làm phân tích truy vấn chậm ở
    phiên bản này.
  - (b) Bạn tắt dịch vụ CSDL → nhận cảnh báo *"Kho dữ liệu không kết nối được"*.
  - (c) `tests/db-co-ban.test.ts` — giả lập lỗi kết nối sinh đúng 1 cảnh báo nghiêm trọng.
  - (d) 1 ngày.
  - (e) chặn: NGƯỜI — cần thông tin kết nối CSDL (tài khoản chỉ đọc, không dùng tài khoản
    quản trị).

- [x] **4.4 — Dự báo ngày đầy đĩa** ✅ (01/09/2026)
  - (a) Hồi quy tuyến tính trên 7 ngày dung lượng đĩa → ước lượng số ngày còn lại. Cảnh báo
    khi **dự báo đầy dưới 7 ngày**, kèm câu tiếng Việt *"Máy chủ kế toán sắp hết chỗ lưu —
    khoảng 6 ngày nữa"*. Hữu ích hơn ngưỡng tĩnh rất nhiều: nó biến giám sát thành phòng
    ngừa và cho bạn thời gian duyệt tiền mua ổ cứng.
  - (b) Bạn tạo một file lớn giả để đĩa đầy nhanh trong 2 ngày → email báo số ngày còn lại
    giảm dần theo đúng thực tế.
  - (c) `tests/du-bao-day-dia.test.ts` — chuỗi dung lượng tăng đều 1 GB/ngày, đĩa còn 6 GB:
    khẳng định dự báo trả về 6 ngày ±1.
  - (d) 1 ngày.

---

## GIAI ĐOẠN 5 — Email cho lãnh đạo (ước lượng: 3 ngày)

> **Đây là kênh chính đến lãnh đạo, không phải dashboard.** Lý do: không ai có thói quen mở
> một trang web để nghe tin tốt. Thứ đến được với lãnh đạo là thứ tự tìm đến họ.

**DEMO kết thúc GĐ:** sáng thứ Hai bạn mở hộp thư, thấy **đúng một email 5 dòng tiếng Việt**,
đọc hiểu ngay mà không cần hỏi ai. Đưa cho một người không làm kỹ thuật đọc → họ nói đúng
được hệ thống tuần qua ổn hay không và có việc gì cần quyết.

- [ ] **5.1 — Digest 8h sáng — gửi CẢ KHI mọi thứ bình thường**
  - (a) Email hằng ngày gom toàn bộ cảnh báo mức cảnh cáo trong 24 giờ. **Bắt buộc gửi kể
    cả khi không có gì bất thường**: *"Đêm qua 6/6 máy bình thường, backup thành công lúc
    02:14"*. Lý do: im lặng tuyệt đối không phân biệt được với hệ thống đã chết — đây
    chính là cách hệ giám sát tự chứng minh nó còn sống.
  - (b) Sáng hôm sau bạn nhận đúng một email, kể cả ngày không có sự cố nào.
  - (c) `tests/digest.test.ts` — ngày không sự cố vẫn sinh đúng 1 email và nội dung có dòng
    xác nhận "bình thường"; ngày có 12 cảnh báo cũng chỉ sinh 1 email.
  - (d) 1 ngày.
  - (e) chặn: MÁY.

- [ ] **5.2 — Email tóm tắt tuần cho lãnh đạo, viết bằng ngôn ngữ quản trị**
  - (a) Sáng thứ Hai. **Không một thuật ngữ kỹ thuật nào** — không "p95", không "5xx",
    không "swap". Đúng 5 khối: ① một câu kết luận ("Tuần qua hệ thống hoạt động ổn định")
    ② thời gian ngưng phục vụ **quy ra phút** kèm so sánh tuần trước ③ số nhân viên bị
    chặn việc ④ **những gì sắp hỏng** kèm đếm ngược ("chứng chỉ bảo mật hết hạn sau 12
    ngày — khách sẽ thấy cảnh báo 'trang web không an toàn'") ⑤ một câu "cần bạn quyết
    gì". Mọi con số phải có mốc so sánh, con số trần trụi bị cấm.
  - (b) **Nghiệm thu bằng người, không bằng code:** đưa email cho một người không làm kỹ
    thuật, hỏi 3 câu — *tuần qua có ổn không · có gì sắp hỏng không · có việc gì cần sếp
    quyết không*. Họ phải trả lời đúng cả 3 mà không hỏi lại.
  - (c) `tests/email-lanh-dao.test.ts` — khẳng định nội dung sinh ra **không chứa** danh
    sách từ cấm (`p95`, `5xx`, `swap`, `exporter`, `CPU`, hostname), và mọi con số đều đi
    kèm mốc so sánh.
  - (d) 2 ngày.
  - (e) chặn: NGƯỜI — cần bạn chốt danh sách người nhận và đặt tên nghiệp vụ cho từng máy
    ("máy chủ kế toán" thay vì "SRV-01").

---

## GIAI ĐOẠN 6 — Trang kỹ thuật và phân quyền (ước lượng: 5 ngày)

**DEMO kết thúc GĐ:** bạn mở trang web, xem được biểu đồ 7 ngày của từng máy và so sánh
được các máy với nhau. Đăng nhập bằng tài khoản Lãnh đạo → **không vào được** trang kỹ thuật.

- [ ] 🔴 **6.1 — SPIKE: đưa Next.js lên Cloudflare Pages gói miễn phí**
  - (a) Gói free giới hạn **bundle 3 MB nén**. Dựng bản Next.js tối giản, deploy qua
    `@opennextjs/cloudflare`, đo kích thước bundle. Vượt trần → chuyển sang trang tĩnh +
    gọi Supabase từ trình duyệt; vẫn vượt → **phương án lùi đã định sẵn: tự host trên máy
    công ty** (mất khả năng xem từ nhà, **không** mất cảnh báo vì engine nằm ở cloud).
  - (b) Bạn mở URL Cloudflare Pages trên điện thoại, thấy trang chạy thật.
  - (c) `tests/kich-thuoc-bundle.test.ts` — chạy build rồi khẳng định bundle dưới 3 MB nén.
  - (d) 1 ngày.
  - (e) chặn: NGOÀI — cần tài khoản Cloudflare.

- [ ] **6.2 — Đăng nhập và ba vai**
  - (a) Supabase Auth. Ba vai: **Lãnh đạo** (chỉ trang tổng quan + email), **Quản trị**
    (đầy đủ), **Xem** (chỉ đọc). Chặn ở tầng RLS, không chỉ ẩn nút trên giao diện.
  - (b) Bạn đăng nhập bằng tài khoản Lãnh đạo rồi **gõ thẳng URL trang kỹ thuật** vào thanh
    địa chỉ → bị chặn, không phải chỉ không thấy menu.
  - (c) `tests/phan-quyen.test.ts` — 3 vai × 3 trang = 9 ca, khẳng định đúng ma trận quyền
    ở tầng dữ liệu.
  - (d) 1 ngày.
  - (e) chặn: MÁY.

- [ ] **6.3 — Trang tổng quan các máy + biểu đồ xu hướng**
  - (a) Danh sách máy kèm trạng thái; bấm vào một máy ra biểu đồ **đường** CPU/RAM/đĩa/mạng
    7 ngày **có vẽ đường ngưỡng**. Đọc từ `metrics_5m`/`metrics_1h`, **không bao giờ query
    bảng thô từ trình duyệt** (Supabase free chỉ 5 GB băng thông/tháng).
  - (b) Bạn bấm vào một máy, kéo khoảng thời gian, thấy biểu đồ khớp với sự cố đã xảy ra
    hôm trước.
  - (c) `tests/trang-may.test.ts` — render với dữ liệu mẫu, khẳng định gọi đúng bảng gộp
    (không gọi `metrics_raw`) và vẽ đủ số điểm.
  - (d) 1,5 ngày.
  - (e) chặn: MÁY.

- [ ] **6.4 — So sánh giữa các máy + nhật ký cảnh báo**
  - (a) **Cột ngang đã sắp xếp** để so sánh các máy (không dùng biểu đồ tròn, không gauge —
    mắt người đọc độ dài chính xác, đọc góc và diện tích thì không). Bảng nhật ký cảnh báo
    kèm trạng thái xử lý và thời gian khắc phục.
  - (b) Bạn mở trang so sánh, nhìn một cái là biết máy nào đang tải nặng nhất.
  - (c) `tests/so-sanh-may.test.ts` — khẳng định danh sách trả về đã sắp xếp giảm dần theo
    chỉ số đang chọn.
  - (d) 1,5 ngày.
  - (e) chặn: MÁY.

---

## KHÔNG LÀM Ở PHIÊN BẢN NÀY (v1) — kèm lý do

| Không làm | Vì sao |
|---|---|
| **Trang tổng quan cho CEO** (điểm sức khỏe, timeline sự cố, dải dịch vụ nghiệp vụ) | Chuyển sang v2 **có chủ đích**: kênh đến lãnh đạo ở v1 là EMAIL (GĐ5). Dashboard chỉ đáng xây sau khi email đã chứng minh lãnh đạo thật sự đọc |
| **Quy đổi thiệt hại ra tiền** | Cần dữ liệu doanh thu; và cần số liệu lịch sử thật mới ước lượng đúng. Bạn đã chốt để v2 |
| **Ảnh chụp màn hình lúc lỗi** | **Rủi ro pháp lý** — trang lỗi có thể đang hiển thị dữ liệu khách hàng; chụp rồi đẩy sang máy chủ nước ngoài là tạo kho dữ liệu cá nhân xuyên biên giới (Nghị định 13/2023/NĐ-CP) |
| **Phân tích CSDL sâu** (truy vấn chậm, lock, index thiếu) | Khác nghề, cần chuyên môn DBA — và **chưa ai kêu đau về nó** |
| **Im lặng theo lịch bảo trì** | Chỉ đáng làm khi đã có đủ cảnh báo để cần im lặng. Làm sớm là tối ưu thứ chưa tồn tại |
| **Sửa ngưỡng qua giao diện** | 2–6 máy thì sửa `config/nguong-canh-bao.json` nhanh hơn xây màn hình quản trị |
| **Nhiệt độ / SMART ổ cứng** | Hay, nhưng không giải quyết nỗi đau nào đang có |
| **Ứng dụng desktop** (Electron/Tauri) | Bạn đã chốt: web + PWA là đủ |
| **Tự phát hiện máy mới trong mạng** | 2–6 máy thì khai tay trong `config/may-chu.json` nhanh hơn, và ít rủi ro bảo mật hơn |

---

## Tổng kết lộ trình

| GĐ | Nội dung | Ước lượng | Hạng mục 🔴 |
|---|---|---|---|
| 1 | Cầm máu bằng Uptime Kuma | 1 ngày | 1.1 |
| 2 | Thu thập 2 nền tảng | 5 ngày | 2.1, 2.2 |
| 3 | Lưu trữ + engine cảnh báo | 5 ngày | 3.2, 3.3 |
| 4 | Ứng dụng, dịch vụ, sao lưu | 4 ngày | — |
| 5 | Email cho lãnh đạo | 3 ngày | — |
| 6 | Trang kỹ thuật + phân quyền | 5 ngày | 6.1 |
| | **Tổng** | **23,5 ngày công ≈ 4,7 tuần** | **6 hạng mục rủi ro cao — 5 trong số đó nằm ở GĐ1–3** |

**🏁 MỐC NGHIỆM THU TOÀN DỰ ÁN — một con số duy nhất: dưới 5 cảnh báo/tuần**, đo liên tục
trong 2 tuần sau khi bàn giao. Vượt con số đó nghĩa là engine cảnh báo đang hỏng (phải chỉnh
ngưỡng), **không** phải "hạ tầng đang xấu".

**Ba việc phải làm trước khi coi là bàn giao xong** (chống bus factor = 1):
1. Ghi tên người chịu trách nhiệm vận hành vào `CLAUDE.md` **và chân trang dashboard**.
2. Viết `docs/sop/SU-CO-GIAM-SAT.md` cho người *không* xây hệ thống: cách khởi động lại
   collector, cách xoay token, cách tắt cảnh báo khi bảo trì.
3. Trỏ Uptime Kuma giám sát chính hệ giám sát — hai hệ canh nhau, hỏng một vẫn còn một.
