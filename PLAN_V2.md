# PLAN_V2.md — Lộ trình MVP: máy tự nói ra vấn đề của nó

> **Viết 01/09/2026.** Thay thế định hướng GĐ5–GĐ6 của `PLAN.md` v1. `PLAN.md` v1 giữ
> nguyên làm hồ sơ những gì đã xong (GĐ0–GĐ7).
>
> **Bối cảnh đã chốt với người dùng:** một máy MacBook Air M1 (sẽ thêm máy sau) · một
> người vừa là kỹ thuật vừa ra quyết định, **bỏ tách vai lãnh đạo** · giám sát cả tài
> nguyên máy, Web/API, cơ sở dữ liệu và job sao lưu · **làm lớp phiên dịch trước,
> dashboard sau**.

---

## Mục tiêu MVP — một câu

Biến hệ thống từ **"máy vẽ biểu đồ CPU"** thành **"trợ lý nói cho tôi biết chuyện gì
đang hỏng, vì sao, và tôi phải làm gì trước"**.

Phép thử cuối cùng của cả lộ trình, dùng chính máy này làm ca sống:

> Mở dashboard lúc này, nó phải hiện **MỘT** kết luận —
> *"Ổ đĩa còn 5,3 GB. Đây là nguyên nhân gốc của cả 3 cảnh báo bên dưới.
> Việc đầu tiên: dọn 24,5 GB video bỏ quên từ tháng 1/2024."* —
> **chứ không phải 3–4 cảnh báo rời rạc về CPU, RAM và swap.**

---

## Khuôn mỗi hạng mục

```
- [ ] 🔴 **1.1 — Tên hạng mục**
  - (a) làm gì — cụ thể tới tên file, tên lệnh
  - (b) tôi kiểm chứng bằng THAO TÁC nào — phải bấm được
  - (c) test tự động nào chứng minh — tên file test + điều nó khẳng định
  - (d) ước lượng thời gian
  - (e) chặn: MÁY | NGƯỜI | NGOÀI
```

🔴 = **rủi ro cao, cố ý xếp SỚM NHẤT**. Luật tick: chỉ `[x]` khi **(b) đã bấm thật** và
**(c) đã xanh theo exit code**. Xong thì xoá dòng `(e)`.

⚠️ **Đọc exit code, không đọc dòng cuối output** — `npm test; echo $?` phải là `0`. Cạm
bẫy này đã trả giá 3 lần (xem `CLAUDE.md`).

---

## VIỆC CỦA ANH — nên làm trước khi thi công

Không phải hạng mục code. Nhưng máy đang ở tình trạng nguy cấp và **thi công trên máy
thrashing sẽ chậm gấp nhiều lần** (đo thật: `du -sh ~/Library/Caches` chạy quá 5 phút).

- [ ] **Cắm sạc** — máy chủ đang chạy bằng pin 61%, còn 3h40.
- [ ] **Tắt 6 tiến trình `chrome-headless-shell` sót từ phiên test** — đang ăn 41%+27%+15% CPU.
- [ ] **Dọn 2 tệp video bỏ quên** ở `~/Library/ScreenRecordings`: 14,9 GB (17/01/2024) + 9,6 GB (07/03/2024) → **lấy lại 24,5 GB**.
- [ ] **Xoá `~/.colima`** nếu không còn dùng Docker → **14 GB** (Colima hiện không chạy).
- [ ] Mục tiêu: đĩa trống **≥ 30 GB**. Hiện còn **5,3 GB / 245 GB (97,8% đầy)**.

> Đây là thao tác **ngoài thư mục dự án** → điểm DỪNG BẮT BUỘC theo `.claude/rules/workflow.md`.
> Máy không tự làm. Máy chỉ đưa số và lệnh.

---

## GIAI ĐOẠN 0 — Sửa ba lỗi ĐO 🔴

**Vì sao giai đoạn này phải đứng trước tất cả:** lớp phiên dịch luận trên số liệu. **Số
liệu đang sai.** Không sửa trước thì mọi nhận định, mọi luật tương quan và mọi điểm sức
khỏe đều là kết luận đúng đắn rút ra từ dữ liệu sai.

**🏁 DEMO cuối GĐ0 — anh tự bấm:** chạy `GIAM_SAT_DO_MAY_NAY=1 npm run dev`, so số trên
màn hình với `df -h` và `sysctl vm.swapusage` gõ tay trong Terminal → **phải khớp**.

- [ ] 🔴 **0.1 — Sửa lỗi đo ổ đĩa: đang báo 69,8% trong khi thật là 97,8%**
  - (a) [collector/doc-macos-truc-tiep.ts:78](collector/doc-macos-truc-tiep.ts#L78) gộp mọi volume APFS theo container `disk3` rồi **giữ dòng ĐẦU TIÊN**. Dòng đầu là `/dev/disk3s3s1` gắn ở `/` — ảnh chụp hệ thống chỉ-đọc, dùng 11,9 GB / trống 5,2 GB → **69,8%**. Volume thật `/System/Volumes/Data` (194 GB, 98%) bị `if (daCo.has(container)) continue` bỏ qua. Sửa: gộp theo container thì **CỘNG cột Used của mọi volume anh em**, lấy Available **một lần** (chúng dùng chung). Kết quả đúng: `231.566.088 / (231.566.088 + 5.182.796) = 97,81%`, trống 5,31 GB — khớp `df -h` và `diskutil info disk3`.
  - (a2) ⚠️ Đây là **cùng họ** với vết sẹo đã ghi trong `CLAUDE.md` ("phần trăm đĩa APFS lệch 21 điểm"). Lần trước sửa đúng *công thức phần trăm* nhưng để lại lỗi *chọn nhầm volume*. Sai theo hướng nguy hiểm nhất: **báo nhẹ hơn thực tế, không bao giờ chạm ngưỡng**.
  - (b) Chạy `npm run dev:may-nay`, mở trang chi tiết máy → ô ổ đĩa hiện **97,8%** và **5,3 GB**. Mở Terminal gõ `df -h` → hai con số phải khớp nhau.
  - (c) `tests/doc-macos-dia.test.ts` — dùng **mẫu `df -k` thật chụp từ máy này** làm fixture, khẳng định ra 97,8% chứ không phải 69,8%. Test hồi quy vĩnh viễn.
  - (d) 0,25 ngày
  - (e) chặn: MÁY

- [ ] 🔴 **0.2 — Sửa lỗi đo áp lực bộ nhớ: báo "bình thường" trên máy đang thrashing**
  - (a) Công thức hiện tại (`doc-macos-truc-tiep.ts:168-169`) là `(wired + compressor) / tổng`, ngưỡng `>0.6 warn`, `>0.8 critical`. Đo thật: 58–61% → **`normal`**. Cùng lúc đó swap 84,8%, bộ nhớ trống **64 MB trên 8 GB**, 2,6 triệu swapouts tích lũy. `ram_phan_tram` ~82,4% cũng dưới ngưỡng 85 → **cả hai chỉ số bộ nhớ đều im lặng trên một máy đang thrash**. Nghịch lý: compressor nén càng tốt thì tỷ lệ này càng **tụt xuống** đúng lúc máy khổ nhất. Sửa thành **bốn đường vào `critical`, chỉ cần MỘT**: bộ nhớ trống ≤ 3% · swap dùng ≥ 80% · swap ra/giây ≥ 10 MB/s · (wired+compressor) ≥ 80%.
  - (b) Chạy `npm run dev:may-nay` ngay lúc này → chỉ số áp lực bộ nhớ phải hiện **"Nghiêm trọng"**, không phải "Bình thường".
  - (c) `tests/doc-macos-bo-nho.test.ts` — mẫu `vm_stat` + `vm.swapusage` thật của máy này ⇒ `ap_luc_bo_nho === "critical"`. Kèm ca ngược: máy 8 GB dùng 40%, swap 0 ⇒ `normal`.
  - (d) 0,25 ngày
  - (e) chặn: MÁY

- [ ] **0.3 — Thêm 8 chỉ số còn thiếu (và sửa một chỉ số hiểu sai)**
  - (a) `kern.num_threads` = 10240 **bằng đúng** `kern.maxfilesperproc` = 10240 → đó là **TRẦN, không phải số đếm**. Số thật lấy từ header `top -l 1 -n 0`: **499 tiến trình / 3.698 thread**. Chỉ số phải là **tỷ lệ so với trần** (36% và 24%), vì số tuyệt đối vô nghĩa với người đọc và không mang sang máy khác được. Thêm 8 chỉ số mới, tất cả bằng lệnh **chỉ đọc**: ① **swap ra/giây** (hiệu số `Swapouts` × page size — hiện luôn `null`, khiến luật thrashing chưa bao giờ nổ được) ② **nguồn điện & pin** (`pmset -g batt`) ③ **ghìm tốc độ vì nhiệt** (`pmset -g therm`) ④ tiến trình/thread theo tỷ lệ trần ⑤ **nghẽn I/O** (`iostat -c 2` cột `tps`, `KB/t` + load) ⑥ **cổng lắng nghe ra ngoài** (`netstat -an -p tcp`) ⑦ **ảnh chụp Time Machine cục bộ** (`tmutil`) ⑧ **dung lượng vùng nhớ ảo trên đĩa** (dòng `/System/Volumes/VM` của `df -k`).
  - (a2) ⚠️ **Cố ý KHÔNG dùng `lsof`** cho cổng — nó trả về tên người dùng và đường dẫn nhị phân, vi phạm Nghị định 13/2023/NĐ-CP. `netstat` chỉ trả cổng. Tương tự, lọc bỏ số hiệu người dùng (`gui/501/…`) khỏi tên dịch vụ trước khi lưu.
  - (b) Mở trang chi tiết máy → thấy dòng **"Đang chạy bằng pin — 61%, còn 3 giờ 40 phút"** và **"Cổng 3111 đang mở ra toàn mạng"**. Cắm sạc → dòng đầu đổi trong vòng 1 phút.
  - (c) `tests/doc-macos-chi-so-moi.test.ts` — parse đúng cả hai dạng `AC Power`/`Battery Power`; phân biệt `*.3111` (ra ngoài) với `127.0.0.1.18789` (chỉ trong máy); tỷ lệ thread tính theo `kern.num_threads` chứ không coi nó là số đếm. Mở rộng `tests/khong-lo-du-lieu-ca-nhan.test.ts`: khẳng định danh sách cổng **không chứa tên tiến trình hay đường dẫn**.
  - (d) 0,5 ngày
  - (e) chặn: MÁY

- [ ] **0.4 — Migration cột mới + hàm ảnh chụp sức khỏe**
  - (a) `0012_chi_so_macos.sql`: thêm cột hẹp (`nguon_dien`, `pin_phan_tram`, `pin_con_phut`, `gioi_han_toc_do_cpu`, `so_tien_trinh`, `so_thread`, `tran_tien_trinh`, `tran_thread`, `swap_ra_moi_giay`, `swap_tong_mb`) + **một** cột `chi_so_them jsonb` cho thứ dạng danh sách. `create or replace function ghi_metric` trong migration MỚI — **không sửa `0002` đã chạy** (rule 5). Thêm ràng buộc `check` chống lộ dữ liệu cá nhân cho `chi_so_them`. `0013_anh_chup_suc_khoe.sql`: hàm trả **đúng một dòng mỗi máy** với ~45 cột đã tính sẵn, gồm **độ bền bỉ tính bằng phút** (`so_phut_dia_thap`, `so_phut_swap_cao`, `so_phut_tai_cao_cpu_ranh`) dùng kỹ thuật gaps-and-islands — đếm **chuỗi liên tục gần nhất**, không phải tổng số mẫu vượt ngưỡng (đếm tổng thì một mẫu xấu từ 90 phút trước làm luật nổ mãi).
  - (a2) Hàm này **có đọc `metrics_raw`** — cửa sổ ≤ 2 giờ, đi thẳng theo khoá chính, trả về một dòng ~2 KB. Tinh thần của luật "giao diện chỉ đọc bảng gộp" là cấm **kéo dòng thô ra khỏi Postgres** và đốt băng thông, không phải cấm gộp bên trong. Phải ghi rõ trong comment hàm **và** trong ADR-004, nếu không phiên sau sẽ coi là vi phạm.
  - (b) Chạy hệ thống 10 phút → `select * from anh_chup_suc_khoe()` trả về một dòng có đủ số của máy anh.
  - (c) `tests/anh-chup-suc-khoe.test.ts` — 10 mẫu thấp → 1 mẫu bình thường → 5 mẫu thấp phải trả **5 phút**, không phải 15 · máy chưa có số liệu vẫn ra **1 dòng toàn `null`**, không biến mất khỏi báo cáo (dùng `left join lateral`).
  - (d) 1 ngày
  - (e) chặn: MÁY

---

## GIAI ĐOẠN 1 — Máy tự nói ra vấn đề của chính nó

**Vì sao giai đoạn này đứng đầu:** ba lỗ hổng nghiêm trọng nhất đều nằm ở đây, và cả ba
đều là **"đã xây xong nhưng không cắm vào đâu"**. Sửa xong thì hệ thống lần đầu tiên nói
được thành câu.

**🏁 DEMO cuối GĐ1 — anh tự bấm:** chạy `GIAM_SAT_DO_MAY_NAY=1 npm run dev`, mở
`localhost:3000` → thấy **một** cảnh báo gốc về ổ đĩa kèm câu chẩn đoán, danh sách việc
cần làm theo thứ tự, và hệ quả nếu không làm gì. Không còn cảnh báo rời rạc.

- [ ] 🔴 **1.1 — Mở đường cho văn bản đi qua**
  - (a) Bảng `alerts` hiện **không có cột nào chứa văn bản** (`0001_nen_tang.sql:92-106` — đã kiểm chứng) nên mọi câu diễn giải chết tại ranh giới này. Tạo `supabase/migrations/0012_dien_giai_khuyen_nghi.sql` thêm 4 cột: `dien_giai text`, `nguyen_nhan text`, `anh_huong text`, `khuyen_nghi jsonb`. Sửa `ghi_canh_bao_cong_viec` (`0011:32-33`) và `ghi_canh_bao_csdl` (`0011:72-73`) để **lưu `chi_tiet` sẵn có thay vì vứt đi**. Sửa `soan_thong_bao` (`0006:97-102`) in `dien_giai` thay cho `chi_so: giá_trị`.
  - (a2) 🔴 **Chống lệch hai đường văn bản.** Giao diện và email phải nói **cùng một câu**, nếu không chúng sẽ lệch nhau sau đúng một lần sửa. Nhưng viết văn tiếng Việt trong PL/pgSQL thì rất tệ, còn Worker ở Cloudflare không đọc được `config/`. Cách giải không đụng vào cỗ máy chống nhiễu: **giữ nguyên `soan_thong_bao()`** làm nhiệm vụ *quyết định gửi bao nhiêu thư cho ai* (gom nhóm · ức chế · giới hạn · cầu dao), rồi chèn **bước 6b** vào `src/engine/vong-danh-gia.ts` **viết đè thân thư** ngay trước bước gửi, dùng đúng hàm phiên dịch mà giao diện dùng. Giữ nguyên `khoa_idempotency` (không phá chống trùng), thêm `where gui_luc is null` (chạy lại vô hại), và **bọc `try/catch` — bước 6b lỗi thì thư cũ vẫn gửi**, vì một email thô còn hơn không có email.
  - (b) Chạy `npm run dev:may-nay`, xem thư cảnh báo in ra terminal: phải là câu tiếng Việt đọc hiểu được, **không còn dòng `• máy X — cpu_phan_tram: 97 (mức nghiem_trong)`**. So câu trong thư với câu trên dashboard → **phải giống hệt nhau**.
  - (c) `tests/dien-giai.test.ts` (cảnh báo backup rỗng và CSDL mất kết nối đều mang `dien_giai` tới tận outbox) · `tests/mot-nguon-van-ban.test.ts` — chạy `chayMotVong` rồi **so chuỗi**: thân thư trong `alert_notifications` chứa đúng câu mà lớp phiên dịch sinh cho giao diện; bước 6b ném lỗi ⇒ thư **vẫn gửi** với thân cũ; chạy vòng 3 lần ⇒ vẫn đúng 1 email.
  - (d) 0,75 ngày
  - (e) chặn: MÁY

- [ ] 🔴 **1.2 — Cho engine đọc nốt 18 dòng ngưỡng còn lại**
  - (a) **Nghịch lý đắt giá nhất của dự án:** `config/nguong-canh-bao.json` đã khai đủ 20 dòng ngưỡng từ ngày đầu, nhưng `danh_gia_nguong` chỉ có **2 nhánh** — `cpu_phan_tram` và `ram_phan_tram` (`0005_engine_nguong.sql:52-53`, đã kiểm chứng). **Không có một luật nào cho ổ đĩa.** Máy đang 97,8% đầy mà engine hoàn toàn mù. Mở rộng `danh_gia_nguong` thêm nhánh: `dia_phan_tram_dung` (80/90), **`dia_con_lai_gb` (20/10)**, `ap_luc_bo_nho`, `swap_dung_mb`, `cpu_hang_doi`. Thêm cột `he_dieu_hanh` vào `cau_hinh_nguong` để **bỏ luật `ram_phan_tram` cho macOS** — tài liệu của chính dự án (`docs/architecture/metric-2-nen-tang.md` §2.1) viết *"90% RAM đã dùng trên máy Mac là bình thường"*, áp 85% là nguồn báo động giả. Nối `du_bao_day_dia()` vào `chayMotVong` với ngưỡng 14/7 ngày đã khai sẵn (hàm này hiện **không ai gọi** — đã kiểm chứng).
  - (b) Chạy `npm run dev:may-nay` → phải xuất hiện cảnh báo **"Ổ đĩa còn 5,3 GB — dưới ngưỡng nghiêm trọng 10 GB"**. Rồi sửa `diaConLaiGB.nghiemTrong` trong `config/` từ 10 xuống 3, chạy lại → cảnh báo **biến mất**. Đó là bằng chứng ngưỡng thật sự đọc từ config.
  - (c) `tests/nguong-dia.test.ts` (đĩa theo % và theo GB tuyệt đối đều bắn đúng) · `tests/nguong-theo-he-dieu-hanh.test.ts` (máy macOS 92% RAM **không** sinh cảnh báo, máy Windows 92% RAM **có**) · `tests/du-bao-noi-vao-vong.test.ts` (ổ sắp đầy 6 ngày → có cảnh báo, không chỉ có hàm chạy được).
  - (d) 1 ngày
  - (e) chặn: MÁY

- [ ] 🔴 **1.3 — Luật tương quan: gộp triệu chứng về một nguyên nhân gốc**
  - (a) Đây là thứ biến hệ này từ máy đo thành trợ lý. Tạo `src/phien-dich/luat-tuong-quan.ts` — **9 luật cho macOS**, mỗi luật có: điều kiện **bắt buộc** (đủ hết mới nổ) · điều kiện **củng cố** (mỗi cái đúng nâng độ tin cậy một bậc: phỏng đoán → nhiều khả năng → chắc chắn) · danh sách mã **nuốt** · cờ `gộp hành động vào gốc`. Ưu tiên và bật/tắt đọc từ `config/phien-dich.json`; **số học ở TypeScript, hằng số ở JSON** — không làm DSL điều kiện trong JSON vì nó không typecheck được và sẽ thành ngôn ngữ lập trình thứ hai không ai bảo trì nổi.
  - (a2) **Luật số 1 chính là ca máy này** (`dia-day-keo-sup-bo-nho`, ưu tiên 100): `đĩa còn ≤ 10 GB hoặc đã dùng ≥ 95%` **VÀ** `swap dùng ≥ 80%`; ba điều kiện củng cố: `tải/nhân ≥ 0,4 trong khi CPU rảnh ≥ 60%` · `vùng nhớ ảo trên đĩa ≥ 5 GB` · `bộ nhớ trống ≤ 3%`. Máy anh khớp **3/3 → chắc chắn**, nuốt 4 triệu chứng.
  - (a3) 🔴 **Bốn chốt chặn nuốt quá tay** (xem mục Rủi ro ở cuối file) — đây là phần dễ bị bỏ qua nhất và cũng là phần nguy hiểm nhất nếu thiếu. Kèm cơ chế **"một gốc để BÁO, nhiều đòn bẩy để LÀM"**: luật thua nhưng có cờ `gộp hành động vào gốc` vẫn góp việc vào danh sách — ví dụ "6 tiến trình trình duyệt còn sót" thua luật đĩa nhưng vẫn phải nằm trong việc cần làm vì nó trả lại ~2 GB bộ nhớ.
  - (b) Chạy `npm run dev:may-nay` trên máy đang nguy cấp → dashboard hiện **một** khối kết luận duy nhất, bốn triệu chứng thụt vào dưới nhãn "bằng chứng", **không phải bốn cảnh báo ngang hàng**. Ba việc khác hệ quy chiếu (chạy pin · cổng 3111 mở · dịch vụ lặp lại) vẫn hiện riêng, không bị nuốt.
  - (c) `tests/phien-dich-tuong-quan.test.ts` — 9 nhóm ca, nạp **đúng bộ số đo thật** của máy này (đĩa 4,94 GB / 97,81% · swap 5211/6144 · tải 3,68 · CPU rảnh 86,77% · 8 nhân · bộ nhớ trống 64/8192 MB · vùng nhớ ảo 6,0 GB): ① ra đúng gốc `dia-day-keo-sup-bo-nho`, độ tin cậy `chắc chắn`, nuốt đúng 4 mã ② toàn báo cáo chỉ có **đúng 1** nhận định mức nghiêm trọng ③ **chốt ④**: thêm `backup trễ 30 giờ` ⇒ sao lưu **vẫn xuất hiện riêng** (khác trụ) ④ **chốt ③**: thêm `mất liên lạc` ⇒ không bị nuốt ⑤ **chốt ②**: hạ củng cố xuống 0/3 ⇒ độ tin cậy `phỏng đoán` ⇒ **không nuốt gì**, mọi triệu chứng báo riêng ⑥ luật thua vẫn góp hành động ⑦ **đĩa còn 40 GB + swap 85%** ⇒ gốc chuyển sang `bộ nhớ thiếu thật`, không phải đĩa ⑧ máy khoẻ ⇒ không có nhận định chính ⑨ thứ tự hành động đúng luật hiệu quả↓/rủi ro↑/thời gian↑.
  - (d) 1,5 ngày
  - (e) chặn: MÁY

- [ ] **1.4 — Từ điển hiển thị + khuyến nghị hành động**
  - (a) Tạo `config/tu-dien-giao-dien.json` — bản đồ `chi_so` → `{nhan, donVi, khuyenNghi}`. Xoá snake_case khỏi mọi thứ người đọc nhìn thấy (`page.tsx:79` hiện đang render thô `cpu_phan_tram`). Mỗi mục kèm **câu khuyến nghị hành động** và **hệ quả nếu không làm gì**. Đúng yêu cầu `.claude/rules/ngon-ngu-ui.md`: *"Thuật ngữ lấy từ điển duy nhất trong config"*.
  - (b) Mở dashboard: cột "Việc" hiện **"Mức dùng bộ xử lý"**, kèm số đo có mốc so sánh **"97% ▸ ngưỡng 95%"** (hai cột `alerts.gia_tri`/`alerts.nguong` đã có từ `0001` mà giao diện chưa hề đọc).
  - (c) `tests/tu-dien-day-du.test.ts` — mọi `chi_so` hệ có thể sinh (lấy từ `danh_sach_chi_so_nguong()` + các mã cố định `mat_lien_lac`, `dich_vu:`, `cong_viec:`, `csdl:`) đều có mục trong từ điển. Thiếu một mã là fail.
  - (d) 0,5 ngày
  - (e) chặn: MÁY

- [ ] **1.5 — Điểm sức khỏe hệ thống**
  - (a) `src/phien-dich/diem-suc-khoe.ts` — một số 0–100 kèm **câu giải thích vì sao**. **Sáu trụ** có trọng số: chỗ lưu trữ 25 · bộ nhớ 25 (hai trụ này nặng nhất vì hỏng của chúng **không tự hồi phục theo thời gian**) · bộ xử lý 15 (bận 100% vẫn *đang phục vụ*, chỉ chậm) · nguồn điện 15 (chạy pin = một cái hẹn giờ tắt máy) · mạng & dịch vụ 10 · sao lưu 10. Điểm mỗi trụ tính bằng hàm bậc thang bốn mốc, mọi mốc đọc từ `config/`. Trụ có nhiều chỉ số thì **lấy `min`, không lấy trung bình**.
  - (a2) 🔴 **Chống bẫy điểm trung bình bằng TRẦN CỨNG, không bằng trọng số lớn hơn.** Tăng trọng số chỉ *làm chậm* việc pha loãng chứ không *chặn* được: 6 trụ, một trụ 0 điểm trọng số 25 vẫn ra tổng 75 — mà 75 điểm thì không ai đi xử lý. Trần biến "một hạng mục chết" thành mệnh đề nhị phân, không thương lượng được bằng số học: trụ ≤ 10 điểm → **trần 19** · trụ ≤ 30 → trần 39 · có sự cố nghiêm trọng chưa ai nhận → trần 49 · sao lưu trễ quá 2 chu kỳ → trần 59. Hai quy tắc nữa: trụ **chưa đo được bị loại khỏi trung bình, tuyệt đối không cho 100 điểm** ("không đo được" ≠ "khoẻ" — cho 100 là cách một hệ giám sát tự khen mình trong khi đang mù); và **mất liên lạc ⇒ điểm `null`, không phải 0** ("không biết" khác "hỏng").
  - (b) Mở dashboard trên máy này → hiện **19/100 · Nguy cấp**, kèm cả **hai** con số: *"trung bình có trọng số 39 — bị kéo về 19 vì trụ chỗ lưu trữ chỉ 7/100"*. Người đọc thấy ngay cơ chế, không có cảm giác bị hộp đen chấm bừa. (Chi tiết: chỗ lưu trữ 7 · bộ nhớ 8 · bộ xử lý 95 · nguồn điện 70 · mạng 70 · sao lưu chưa đo được.)
  - (c) `tests/phien-dich-diem-suc-khoe.test.ts` — ca máy này ra **đúng 19** · **bẫy trung bình**: 5 trụ 100 điểm + 1 trụ 0 điểm ⇒ điểm ≤ 19, **không phải 83** · trụ chưa đo bị loại khỏi trung bình chứ không được cộng 100 · mất liên lạc ⇒ `null` chứ không phải 0 · đổi trọng số trong `config/` ⇒ điểm đổi theo (chứng minh không hardcode).
  - (d) 0,5 ngày
  - (e) chặn: MÁY

---

## GIAI ĐOẠN 2 — Nhìn thấy và bấm được

**🏁 DEMO cuối GĐ2 — anh tự bấm:** mở `localhost:3000`, **không bấm gì trong 2 phút** →
số liệu tự đổi. Rút mạng 4 phút → thẻ máy chuyển sọc chéo **"Mất liên lạc"** (không phải
vẫn xanh "Bình thường"). Bấm **"Tiếp nhận"** trên một cảnh báo → hàng đổi trạng thái ngay,
không tải lại trang. Đổi macOS sang chế độ tối → giao diện đổi theo.

- [ ] 🔴 **2.1 — Toán học biểu đồ + test thuần**
  - (a) Xếp sớm vì đây là **chỗ dễ sai nhất và mọi component đều dựa vào**. Tạo `src/app/bieu-do/hinh-hoc.ts` — 100% hàm thuần, 0 JSX, test được không cần DOM: `buocDep()` (chia trục 1-2-5, hiện trục Y đang không có nhãn), `phanVi()` (p50/p95/p99), **`catDoan()`**, `rutGon()` (gộp đường bằng trung bình nhưng dải bằng min/max), `vachThoiGian()`, `gomHistogram()`, `neoChuThich()`.
  - (a2) **Lỗi nguy hiểm nhất đang tồn tại:** `BieuDoDuong` hiện tại (`may/[id]/page.tsx:24`) nối `diem[i]` với `diem[i+1]` bất kể cách nhau bao lâu → **máy chết 3 tiếng được vẽ thành một đoạn thẳng đẹp đẽ, trông y hệt "tải ổn định"**. `catDoan()` sửa đúng chỗ này. Cố ý **không dùng đường cong mượt** — spline bịa ra giá trị giữa hai điểm đo, với biểu đồ giám sát đó là nói dối.
  - (b) Chưa có gì bấm ở hạng mục này — đây là nền. Kiểm chứng bằng (c).
  - (c) `tests/bieu-do-hinh-hoc.test.ts`, ~25 ca chạy dưới 50 ms: chuỗi 5 phút có khoảng trống 40 phút → **đúng 2 đoạn** (chống hồi quy lỗi "máy chết vẽ thành đường thẳng") · `rutGon` 2.016 điểm → ≤480 nhưng `max` giữ nguyên (spike không bị gộp mất) · `phanVi` đối chiếu chéo với `percentile_cont` của Postgres · ca biên: mảng rỗng, 1 điểm, mọi giá trị bằng nhau, toàn `null` — **kết quả không được chứa `NaN`** vì `d="M NaN,NaN"` khiến SVG im lặng không vẽ gì.
  - (d) 0,5 ngày
  - (e) chặn: MÁY

- [ ] 🔴 **2.2 — Nền tảng giao diện: token, khung vỏ, múi giờ**
  - (a) Mở rộng `src/app/globals.css`: bảng token đầy đủ (màu · khoảng cách thang 4px · thang chữ · bo góc · bóng), **mức trạng thái thứ 4 `khong-ro` = "Mất liên lạc"** với nền **sọc chéo** (nhận ra được cả khi in đen trắng và với người mù màu), dark mode qua `prefers-color-scheme` **tính lại màu chứ không đảo** (chữ `#b3261e` trên nền tối không đủ tương phản 4.5:1), `@media print`, `prefers-reduced-motion`. Sửa `layout.tsx` (hiện 17 dòng, **không có nav/header/footer**) thêm thanh điều hướng. Bề rộng 1100px → 1320px.
  - (a2) 🔴 **Rủi ro cao — hai bẫy deploy:** ① `src/db/nap-cau-hinh.ts:8` đọc config bằng `readFileSync(process.cwd())` — **Cloudflare Workers không có hệ tệp**, chạy local xanh, deploy đỏ. Giao diện phải **import tĩnh JSON** (`resolveJsonModule` đã bật trong `tsconfig.json:20`). ② `toLocaleString("vi-VN")` gọi trên server, Workers chạy UTC → **lệch 7 tiếng**. Thêm khối `giaoDien` vào `config/nguong-canh-bao.json` (`muiGio: "Asia/Ho_Chi_Minh"`, `nhipLamMoiGiay`, `soDiemToiDaTrenBieuDo`) và một hàm định dạng giờ duy nhất luôn khai múi giờ tường minh.
  - (b) `npm run build` exit 0 → mở trang thấy thanh điều hướng. Đổi macOS sang chế độ tối → giao diện đổi theo. `Cmd+P` → bản in đen trắng vẫn phân biệt được 4 mức.
  - (c) `tests/gio-mui-gio.test.ts` — đặt `process.env.TZ = "UTC"` rồi khẳng định giờ hiển thị vẫn là giờ Việt Nam (mô phỏng đúng môi trường Workers) · `tests/khong-hardcode-nguong.test.ts` — quét `src/app/**`, fail nếu bắt gặp số ngưỡng trần (85/95/80/90/70) trong ngữ cảnh so sánh. Canh bằng máy thay vì bằng lời dặn, vì hiện có **8 chỗ hardcode** vi phạm rule 4.
  - (d) 1 ngày
  - (e) chặn: MÁY

- [ ] **2.3 — Thẻ chỉ số, sparkline, và mức "Mất liên lạc"**
  - (a) `src/app/bieu-do/sparkline.tsx` + `src/app/giao-dien/the-chi-so.tsx` + `khoi-ket-luan.tsx`. `<TheChiSo>` có prop **`dienGiai` bắt buộc** — TypeScript ép kỷ luật "mọi con số phải có mốc so sánh + một câu diễn giải" của BRD ngay lúc compile, không bằng lời dặn. Thêm `mucTheoTuoiDuLieu()` vào `trang-thai.tsx`: máy im lặng quá `collectorImLangPhut` → mức `khong-ro`, **không được gộp vào "Bình thường"** như hiện nay.
  - (b) Ngắt Wi-Fi của máy đo thật hơn 3 phút → thẻ máy chuyển **sọc chéo "Mất liên lạc"**, không còn xanh "Bình thường".
  - (c) `tests/bieu-do-render.test.ts` dùng `renderToStaticMarkup` (`react-dom` đã là dependency, **không thêm gói nào**) — khẳng định thẻ máy im lặng 200 phút render ra chữ "Mất liên lạc", và không chuỗi nào chứa `cpu_phan_tram`.
  - (d) 0,5 ngày
  - (e) chặn: MÁY

- [ ] **2.4 — Trang `/` Sức khỏe hệ thống (gộp trang lãnh đạo vào)**
  - (a) Viết lại `src/app/page.tsx` theo **kim tự tháp ngược**: ① khối kết luận (điểm sức khỏe + câu chẩn đoán + việc cần làm đầu tiên, chiều cao cố định, **luôn hiện kể cả khi bình thường** — khối trống thì mắt không biết là "không có việc" hay "trang chưa tải") ② hàng thẻ chỉ số có sparkline ③ dải nhịp phục vụ 30 ngày ④ lưới thẻ máy ⑤ cột ngang đã sắp xếp ⑥ cảnh báo đang mở tối đa 5 dòng. Khi chỉ có **1 máy**, khối ⑤ tự chuyển từ "so sánh giữa các máy" sang **"bão hòa từng tài nguyên"** (Bộ nhớ 99% · Ổ đĩa 98% · Bộ xử lý 7%) — vẫn là cột ngang đã sắp xếp, đúng BRD F3.
  - (a2) Tuân thủ BRD: **không gauge, không biểu đồ tròn, không 2 trục Y**. "Sinh động bắt mắt" ở đây = **mật độ thông tin cao + thứ bậc thị giác rõ**, không phải màu mè. Màu chỉ dùng báo trạng thái; thấy màu = có chuyện.
  - (b) Mở `localhost:3000` → 6 khối hiện đủ, dự báo đầy đĩa hiện số ngày thật, và toàn bộ nội dung trang `/lanh-dao` cũ đã nằm trong khối ①.
  - (c) `tests/trang-tong-quan.test.ts` — render trang với dữ liệu 1 máy, khẳng định khối ⑤ hiện "bão hòa từng tài nguyên"; render với 3 máy, khẳng định nó chuyển sang so sánh giữa các máy.
  - (d) 1 ngày
  - (e) chặn: MÁY

- [ ] **2.5 — Tự làm mới + chỉ báo tuổi dữ liệu**
  - (a) `src/app/giao-dien/tu-lam-moi.tsx` — client component mỏng (~1,5 kB) gọi `router.refresh()` mỗi 30 giây, **dừng khi tab bị ẩn hoặc mất mạng** (một tab quên mở suốt đêm = 2.880 lượt đọc/ngày, đủ ăn thủng hạn mức 5 GB băng thông Supabase Free). Đồng hồ tuổi dữ liệu chạy **phía client** nên miễn nhiễm hoàn toàn với việc Workers chạy UTC. Chọn polling thay SSE vì nhịp thu thập thật là 60 giây — ghi thành `ADR-004`.
  - (a2) Cạm bẫy React 19: **không dùng `<noscript><meta http-equiv="refresh">`** làm phương án dự phòng — React 19 tự nâng `<meta>` lên `<head>` dù đặt ở đâu, nên trang sẽ tải lại toàn bộ *kể cả khi JavaScript đang chạy*, phá luôn `router.refresh()`.
  - (b) Mở trang, **không bấm gì trong 2 phút** → số liệu tự đổi. Chuyển sang tab khác → tab Network của DevTools im lặng. Dừng collector 5 phút → nhãn đổi sang **"Số liệu cũ — 5 phút trước"** màu vàng, và khối kết luận đổi sang "Không rõ tình hình".
  - (c) `npm run build` — khẳng định First Load JS tăng **dưới 3 kB** (ngân sách: hiện 103 kB, trần 130 kB).
  - (d) 0,5 ngày
  - (e) chặn: MÁY

- [ ] **2.6 — Trang chi tiết máy với biểu đồ đầy đủ**
  - (a) `src/app/bieu-do/{bieu-do-duong,histogram}.tsx` + viết lại `may/[id]/page.tsx`. Biểu đồ đường có đủ 6 thứ đang thiếu: **trục X thời gian · nhãn trục Y · dải min–max** (dùng `cpu_min`/`cpu_max` đã có sẵn trong DB mà UI chưa đọc) **· vùng ngưỡng tô màu · dấu thời điểm sự cố · khoảng mất liên lạc vẽ thành ô sọc** thay vì nối liền. Thêm **bảng USE** (Dùng / Bão hòa / Lỗi) và **histogram phân bố mức tải** — chống đúng cái bẫy "chỉ hiện trung bình" mà BRD F4 cấm: trung bình 68% che mất 12% thời gian máy chạy trên 85%. Đọc `metrics_1h` cho khoảng > 7 ngày (bảng này giữ 13 tháng và **hiện chưa ai đọc**).
  - (a2) Tooltip **không cần JavaScript**: dùng `<title>` SVG cho dải nhịp/histogram, và hover thuần CSS cho biểu đồ đường (lớp chạm là phần tử cuối trong `<svg>` nên chú thích luôn vẽ đè — SVG không có `z-index`).
  - (b) Bấm nút **"13 tháng"** → biểu đồ vẫn ≤480 cột, không lag. Dừng collector 30 phút rồi bật lại → đường **đứt đoạn** kèm ô sọc "không có số liệu". Tắt JavaScript trong DevTools → hover vẫn ra chú thích.
  - (c) `tests/bieu-do-render.test.ts` mở rộng — dữ liệu có khoảng trống → HTML chứa **đúng 2** `<path class="bd-duong">` và chuỗi "không có số liệu", và **không chứa `NaN`**.
  - (d) 1 ngày
  - (e) chặn: MÁY

- [ ] **2.7 — Trang `/canh-bao` + nút Tiếp nhận bấm được**
  - (a) `src/app/canh-bao/page.tsx` + `src/app/hanh-dong.ts` (Server Action `tiepNhanCanhBao`). Hiện bảng ghi "Chưa ai tiếp nhận" nhưng **không có nút nào để bấm** — ack chỉ làm được qua link HMAC trong email. Thêm ba số RED của chính quy trình vận hành: **số cảnh báo/tuần** (đối chiếu trần `nghiemThu.toiDaCanhBaoMoiTuan = 5` — BRD nói rõ vượt con số này nghĩa là *engine đang hỏng*, không phải hạ tầng xấu), thời gian tới lúc có người nhận, và MTTR từ view `thoi_gian_khac_phuc` (đã có, chưa hiển thị).
  - (a2) 🔴 Ghi rõ trong mã: tên người tiếp nhận **phải lấy từ phiên đăng nhập, tuyệt đối không lấy từ form** — form do trình duyệt gửi nên ai cũng sửa được, và nhật ký xử lý sự cố mà ai cũng ký hộ tên người khác thì vô giá trị. Khi có Auth thì gọi qua client đã đăng nhập để RLS còn hiệu lực — **không bao giờ `service_role`**.
  - (b) Bấm **"Tiếp nhận"** → hàng đổi sang "Đang xử lý" **không tải lại trang**. Bấm lần hai → thông báo hiền *"Việc này đã có người nhận"*, không phải màn hình lỗi. Tắt JavaScript rồi bấm lại → **vẫn chạy** (form thuần).
  - (c) `tests/tiep-nhan-tu-giao-dien.test.ts` — bấm lần 1 trả `ok: true`, lần 2 trả `ok: false` kèm câu tiếng Việt hiền (hàm `tiep_nhan_canh_bao()` cố ý trả `false` chứ không ném lỗi) · mã cảnh báo sai định dạng bị chặn trước khi chạm DB.
  - (d) 1 ngày
  - (e) chặn: MÁY

---

## GIAI ĐOẠN 3 — Giám sát đúng bốn thứ anh đã chọn

Ba bảng `dich_vu_bat_buoc`, `cong_viec_dinh_ky`, `csdl_theo_doi` hiện là **vỏ rỗng — có
hàm soát nhưng không có bộ ghi nào** (đã kiểm chứng bằng grep).

**🏁 DEMO cuối GĐ3 — anh tự bấm:** mở trang `/dich-vu`, bấm **"Quét máy này"** → hệ thống
tự liệt kê cổng đang lắng nghe, tiến trình đang chạy, job trong launchd → anh **tick chọn**
cái nào là bắt buộc. Tắt một dịch vụ đã tick → trong 2 phút có cảnh báo.

- [ ] 🔴 **3.1 — Tự phát hiện dịch vụ, cổng và job định kỳ**
  - (a) **Đổi cách tiếp cận so với BRD cũ.** BRD viết cho 6 máy ở xa nên bắt người dùng khai danh sách bằng tay — đó là lý do 4 hạng mục bị chặn nhiều tháng. Nhưng máy này **chính là** máy được giám sát, nên quét được trực tiếp: `collector/tu-phat-hien.ts` chạy `lsof -nP -iTCP -sTCP:LISTEN`, `launchctl list`, `ps -Ao comm` → đề xuất danh sách để anh tick xác nhận, ghi vào `config/dich-vu-bat-buoc.json`. **Gỡ chặn 4 hạng mục mà không cần anh cung cấp gì.**
  - (a2) Tuân thủ Nghị định 13/2023/NĐ-CP: **chỉ lưu TÊN tiến trình, cắt sạch tham số dòng lệnh** — ràng buộc `tien_trinh_khong_co_tham_so()` ở `0001:77-89` đã canh sẵn việc này ở tầng DB.
  - (b) Bấm "Quét máy này" → thấy đúng những cổng thật đang mở trên máy anh (hiện có: ControlCenter 5000/7000, rapportd 49152, node 3111). Tick 2 cái → chúng xuất hiện trong danh sách giám sát.
  - (c) `tests/tu-phat-hien.test.ts` — parser xử lý đúng output thật của `lsof`/`launchctl` (dùng fixture chụp từ máy này), và **khẳng định không có tham số dòng lệnh nào lọt vào kết quả**.
  - (d) 1 ngày
  - (e) chặn: MÁY

- [ ] **3.2 — Giám sát Web/API: còn sống và nhanh chậm ra sao**
  - (a) `collector/do-http.ts` — với mỗi URL/cổng đã tick ở 3.1: đo mã trả về, thời gian phản hồi, và **p95** (ngưỡng `httpThoiGianPhanHoiP95Ms` 500/2000 theo chuẩn Apdex **đã khai sẵn trong config, chưa có collector nào dùng**). Thêm `httpSoLanFailLienTiep` = 3 (nhịp 60 giây → báo sau ~180 giây).
  - (b) Tắt tiến trình web đang chạy → trong 3 phút dashboard hiện **"Trang web nội bộ không phản hồi"** kèm khuyến nghị. Bật lại → cảnh báo tự đóng.
  - (c) `tests/do-http.test.ts` — 3 lần fail liên tiếp mới bắn (không bắn ngay lần 1, chống nhiễu mạng) · p95 tính đúng trên mảng đã biết.
  - (d) 0,5 ngày
  - (e) chặn: MÁY

- [ ] **3.3 — Giám sát cơ sở dữ liệu**
  - (a) `collector/do-csdl.ts` ghi vào bảng `csdl_theo_doi` (đã có `soat_csdl()` chờ sẵn ở `0009:185-210`): kết nối được không, số kết nối / giới hạn, dung lượng.
  - (b) Dừng CSDL → dashboard hiện *"Kho dữ liệu không kết nối được — các phần mềm dùng nó sẽ ngừng hoạt động"* (câu này **đã viết sẵn** ở `0009:201-206` và hiện bị vứt đi trước khi tới người đọc).
  - (c) `tests/do-csdl.test.ts` — bốn ngưỡng của `soat_csdl` bắn đúng mức, và câu `chi_tiet` đi được tới bảng `alerts` (nhờ hạng mục 1.1).
  - (d) 0,5 ngày
  - (e) chặn: **NGƯỜI** — cần một tài khoản kết nối **chỉ đọc**, không dùng tài khoản quản trị.

- [ ] **3.4 — Sao lưu: báo động khi KHÔNG có tiếng ping**
  - (a) Dead-man's switch. Hàm `ghi_nhan_chay(ma, kich_thuoc_byte)` đã có ở `0009:101-112`; cần thêm một dòng `curl` vào cuối script backup của anh. Hệ thống báo khi ① job **trễ** quá chu kỳ + hạn 4 giờ ② kích thước **lệch** so với trung vị 7 ngày → nghi "backup thành công nhưng rỗng". BRD gọi đây là *"hai tính năng bị đánh giá thấp nhất nhưng giá trị cao nhất"*.
  - (b) Không chạy backup một đêm → sáng hôm sau có cảnh báo **"Sao lưu chưa chạy"**. Chạy một bản backup rỗng → cảnh báo *"có chạy nhưng dung lượng lệch 68% so với thường lệ — có thể bản sao lưu bị rỗng"*.
  - (c) `tests/backup-dead-man.test.ts` — job trễ 9 giờ với chu kỳ 24h + grace 4h → bắn; job đúng giờ nhưng nhỏ hơn trung vị 68% → bắn cảnh cáo; **cần ≥3 lần chạy mới xét lệch kích thước** (không kết luận từ 1 mẫu).
  - (d) 0,5 ngày
  - (e) chặn: **NGƯỜI** — cần biết job backup chạy ở đâu, tên script, chu kỳ; và cần anh thêm một dòng ping vào script.

- [ ] **3.5 — Trang `/dich-vu`**
  - (a) `src/app/dich-vu/page.tsx` — bốn khối: sao lưu (kèm sparkline kích thước 14 lần gần nhất) · dịch vụ bắt buộc · cơ sở dữ liệu · **dung lượng của chính hệ giám sát** (214/500 MB, ngưỡng cảnh báo 350 MB đã khai trong config).
  - (b) Mở trang → thấy đủ 4 khối với dữ liệu thật từ 3.1–3.4.
  - (c) `tests/trang-dich-vu.test.ts` — render với 1 job đúng giờ + 1 trễ + 1 nghi rỗng, khẳng định ba mức hiển thị khác nhau.
  - (d) 0,5 ngày
  - (e) chặn: MÁY (sau 3.1–3.4)

---

## GIAI ĐOẠN 4 — Hệ thống tự chạy khi không có ai ngồi trước máy

**🏁 DEMO cuối GĐ4 — anh tự bấm:** sáng hôm sau mở hộp thư → có **email 8 giờ sáng** kể
đêm qua thế nào, **kể cả khi mọi thứ bình thường**. Trong email có nút **"Đã tiếp nhận"**
bấm được từ điện thoại.

- [ ] 🔴 **4.1 — Lên lịch ba job nền đang mồ côi**
  - (a) `gop_5_phut()` và `don_partition_cu()` **không có caller nào**; hàm gộp 1 giờ **chưa được viết**; nên `metrics_1h` (giữ 13 tháng) **vĩnh viễn rỗng** và chính sách lưu trữ 3 tầng chỉ tồn tại trên giấy. Viết `gop_1_gio()` và nối cả ba vào lịch chạy trong `worker/index.ts`.
  - (b) Chạy hệ thống 2 giờ → bảng `metrics_1h` **có dữ liệu**; trang chi tiết bấm "13 tháng" đọc được. Kiểm bằng: `select count(*) from metrics_1h`.
  - (c) `tests/gop-1-gio.test.ts` — gộp idempotent (chạy 2 lần không nhân đôi) và **giữ min/max/p95** chứ không chỉ trung bình.
  - (d) 0,5 ngày
  - (e) chặn: MÁY

- [ ] **4.2 — Email 8 giờ sáng + nút Tiếp nhận trong thư**
  - (a) `src/email/soan-cho-lanh-dao.ts` (194 dòng, viết tốt nhất dự án, có `canQuyetGi` và so sánh kỳ trước) **chỉ được gọi từ test** — chưa bao giờ chạy thật. Nối vào lịch. Anh đã bỏ tách vai nên gộp thành **một** email: khối đầu là kết luận không thuật ngữ, khối sau là chi tiết kỹ thuật. Chèn `taoLinkTiepNhan` (`src/email/ky-link.ts:23`, hiện **chỉ dùng trong test**) vào thân thư — cơ chế ack + leo thang 30 phút hiện đang **dựa vào một cái nút không tồn tại**.
  - (b) Đặt giờ gửi lùi 2 phút, chờ → nhận thư. Bấm nút trong thư từ **điện thoại** → dashboard trên máy tính đổi sang "Đang xử lý".
  - (c) `tests/digest-sang.test.ts` — gửi **cả khi mọi thứ bình thường** (BRD: *"không nhận được email sáng = coi như hệ giám sát đã chết"*) · thư luôn chứa link ack có chữ ký HMAC hợp lệ · không từ nào trong danh sách `TU_CAM` lọt vào khối kết luận.
  - (d) 0,5 ngày
  - (e) chặn: **NGOÀI** — cần khoá API Resend + một tên miền để cấu hình SPF/DKIM/DMARC. **Làm được phần soạn thư và test ngay bây giờ**, chỉ khâu gửi thật là chờ.

---

## GIAI ĐOẠN 5 — Dọn nợ tài liệu

**🏁 DEMO cuối GĐ5:** mở `docs/brd/giam-sat-he-thong.md` §1 → mô tả đúng máy anh đang có,
không còn "2–6 máy chủ văn phòng". Phiên làm việc sau **không hỏi lại anh danh sách máy
Windows không tồn tại**.

- [ ] **5.1 — Viết lại BRD §1/§4 và cập nhật não dự án**
  - (a) Sửa `docs/brd/giam-sat-he-thong.md` §1 (phạm vi: một máy macOS, đường nâng lên nhiều máy) và §2 (bỏ vai lãnh đạo tách rời). Cập nhật `CLAUDE.md` mục TRẠNG THÁI và CHỜ NGOÀI (từ 7 mục xuống còn 2: tài khoản CSDL chỉ đọc, khoá Resend). Điền tên người vận hành vào `docs/sop/SU-CO-GIAM-SAT.md:8` — tài liệu tự ghi *"chưa điền là chưa bàn giao"*.
  - (b) Đọc lại BRD §1: mô tả khớp với thực tế. Mở `CLAUDE.md`: danh sách CHỜ NGOÀI chỉ còn 2 dòng.
  - (c) `npm run check:cau-truc` exit 0.
  - (d) 0,5 ngày
  - (e) chặn: MÁY

---

## KHÔNG LÀM Ở PHIÊN BẢN NÀY — kèm lý do

| Không làm | Vì sao |
|---|---|
| **Uptime Kuma trên máy nội bộ thứ hai** | Chỉ có một máy. Đặt "đồng hồ canh" trên chính máy được giám sát là vi phạm ADR-003 — máy chết thì đồng hồ cũng chết. Hoãn tới khi có máy thứ hai. |
| **Phân quyền 3 vai + đăng nhập** | Anh đã chốt bỏ tách vai. Migration `0010` **giữ nguyên trong DB** (đã trả tiền rồi, xoá tốn công hơn giữ), chỉ không xây UI đăng nhập. |
| **Nhánh Windows** (`windows_exporter`, `Win32_Service`) | Không có máy Windows. Giữ schema 2 nền tảng, không thi công. |
| **Trang `/lanh-dao` riêng** | Gộp vào `/`. Giữ file lại làm **bản in / bản chuyển tiếp** (thêm `@media print`), không đầu tư thêm. |
| **Playwright / test end-to-end trình duyệt** | Kéo theo vài trăm MB trình duyệt và một tầng CI mới. Ba nhóm test thuần ở GĐ2 đã phủ đúng chỗ dễ sai nhất. Thêm khi và chỉ khi: có người thứ hai dùng hệ thống, hoặc một lỗi giao diện lọt ra sản phẩm **hai lần**. |
| **Thư viện biểu đồ** (recharts, chart.js…) | Bundle hiện **103 kB / trần 3 MB nén**. Mọi thứ cần vẽ đều làm được bằng SVG thuần trong vài chục dòng. Giữ lợi thế này. |
| **Đường cong mượt (spline) trên biểu đồ** | Spline bịa ra giá trị giữa hai điểm đo. Với biểu đồ giám sát đó là nói dối. Dùng polyline thẳng. |
| **Gauge, đồng hồ kim, biểu đồ tròn, 2 trục Y** | BRD F2–F5 cấm. 2 trục Y tạo tương quan giả. |
| **Migration `0012b` bổ sung cột bão hòa vào `metrics_5m`** | `gop_5_phut()` không gộp `cpu_hang_doi`, `swap_vao_moi_giay`, `mang_goi_loi` nên bảng USE sẽ có ô **"(chưa gộp)"**. Nói thẳng là chưa có dữ liệu còn hơn để trống cho người đọc tưởng là 0. Tách thành hạng mục riêng cần duyệt (rule 5). |
| **Tự động dọn đĩa / tự chạy lệnh khắc phục** | Máy giám sát **không được tự xoá dữ liệu của người dùng**. Lớp phiên dịch chỉ *đề nghị* — mọi `HanhDong` bắt buộc có `rủi ro` + `giải thích rủi ro`, và **không hành động nào tự chạy**. Ngoài các lệnh chỉ đọc đã có, không thêm `exec` nào. |
| **DSL điều kiện trong JSON** | Ranh giới đã chốt: **hằng số ở JSON, số học ở TypeScript**. Nhét điều kiện luật vào JSON thì không typecheck được, không test được, và sẽ thành ngôn ngữ lập trình thứ hai không ai bảo trì nổi. Muốn thêm luật thì sửa `luat-tuong-quan.ts` và viết test. |
| **Phát hiện bất thường bằng học máy / baseline động** | Chưa đủ dữ liệu lịch sử (`metrics_1h` còn rỗng). Xét lại sau khi có 3 tháng dữ liệu thật. |

---

## Tổng kết

| GĐ | Nội dung | Ước lượng | Hạng mục 🔴 |
|---|---|---|---|
| **0** | **Sửa ba lỗi ĐO** — không có nó thì mọi thứ sau đều luận trên số sai | **2 ngày** | **0.1, 0.2** |
| 1 | Máy tự nói ra vấn đề (lớp phiên dịch) | 4,25 ngày | 1.1, 1.2, 1.3 |
| 2 | Nhìn thấy và bấm được (dashboard) | 5,5 ngày | 2.1, 2.2 |
| 3 | Giám sát dịch vụ, web, CSDL, sao lưu | 3 ngày | 3.1 |
| 4 | Tự chạy khi không có ai | 1 ngày | 4.1 |
| 5 | Dọn nợ tài liệu | 0,5 ngày | — |
| | **Tổng** | **≈ 16,25 ngày công** | **9 hạng mục rủi ro cao — 7 nằm ở GĐ0–2** |

### Rủi ro lớn nhất của kế hoạch này — và cách chặn

**Lớp tương quan có thể biến thành lớp GIẤU CẢNH BÁO.** Đây là kiểu hỏng tệ nhất vì nó
*im lặng* và trông rất gọn gàng. Bốn chốt chặn bắt buộc, đã đưa vào hạng mục 1.3:

1. Luật phải **khai báo tường minh** nó nuốt mã nào — không nuốt ngầm.
2. Nhận định `phỏng đoán` (chưa đủ điều kiện củng cố) **chỉ được xếp hạng, không được nuốt**.
3. **Không bao giờ nuốt `mất liên lạc`** — máy im lặng luôn phải báo riêng.
4. **Chỉ nuốt trong cùng một trụ**: "đĩa đầy" tuyệt đối không được nuốt "sao lưu thất bại"
   hay "chứng chỉ hết hạn" dù chúng cùng xảy ra.

Cộng thêm một chỉ số tự giám sát: nếu lớp tương quan gộp **> 70%** số phát hiện trong 2
tuần, hệ thống tự cảnh báo *"đang nuốt quá nhiều"* — cùng tinh thần với trần 5 cảnh
báo/tuần.

### Ba cửa phải kiểm trước khi tick bất kỳ hạng mục nào

1. **Không `service_role` ở collector** — mỗi máy một token, ghi qua RPC, RLS chặn phần còn lại.
2. **Không lưu dữ liệu cá nhân** — tiến trình chỉ lưu TÊN, cắt tham số dòng lệnh (Nghị định 13/2023/NĐ-CP).
3. **Ba trần gói miễn phí** — phép nặng trong Postgres · trình duyệt chỉ đọc bảng gộp · bundle dưới 3 MB nén (ngân sách đặt ở **130 kB**, hiện 103 kB).

### Mốc nghiệm thu toàn dự án

**Dưới 5 cảnh báo/tuần**, đo liên tục 2 tuần. Vượt con số đó nghĩa là **engine đang hỏng
(phải chỉnh ngưỡng)**, không phải "hạ tầng đang xấu".

Và một mốc mới của bản v2: **đưa email cho một người không làm kỹ thuật, hỏi 3 câu —
*hệ thống có ổn không · cái gì sắp hỏng · cần làm gì trước*. Họ phải trả lời đúng cả 3
mà không hỏi lại.**
