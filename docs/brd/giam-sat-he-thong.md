# BRD — Hệ thống giám sát máy chủ GIAM_SAT_SERVER

- **Ngày lập:** 01/09/2026 · **Phiên bản:** 1.0 · **Trạng thái:** đã duyệt
- **Nguồn:** phỏng vấn `/B1_y_tuong` ngày 01/09/2026 + 2 nghiên cứu nền tảng
- **Lộ trình thi công:** `PLAN.md` · **Quyết định kiến trúc:** `docs/decisions/ADR-001..003`

---

## 1. Bài toán

Công ty vận hành 2–6 máy chủ (1–3 Windows Server + 1–3 macOS) đặt tại văn phòng, có
Internet. Trên đó chạy website/API nội bộ, cơ sở dữ liệu, một số tiến trình bắt buộc luôn
sống, và các job sao lưu định kỳ.

**Cơn đau: sự cố chỉ được biết khi nhân viên kêu.** Thời gian phát hiện đang được đo bằng
"bao lâu thì có người đủ bực để đi báo" — hàng giờ ban ngày, tới sáng hôm sau nếu hỏng ban
đêm. Sao lưu và job định kỳ còn tệ hơn: chúng hỏng **âm thầm** và chỉ lộ ra đúng lúc cần
phục hồi.

### 1.1 Vấn đề viết lại bằng ngôn ngữ của đội thực hiện

> Công ty không thiếu công cụ vẽ biểu đồ CPU. Thứ đang thiếu là **một lớp phiên dịch**:
> biến hàng chục con số kỹ thuật thành *một câu tiếng Việt nói rõ chuyện gì sắp hỏng, ảnh
> hưởng phần nào của việc kinh doanh, và còn bao lâu để xử lý* — rồi tự gửi câu đó cho đúng
> người, đúng lúc, đúng mức độ, mà không làm phiền tới mức bị bỏ qua.

## 2. Người dùng

| Vai | Ai | Cần gì | Kênh chính |
|---|---|---|---|
| **Quản trị** | Người phụ trách kỹ thuật | Biết ngay khi có sự cố, đủ chi tiết để xử lý | Email tức thì + trang kỹ thuật |
| **Lãnh đạo** | CEO / ban lãnh đạo, **không rành kỹ thuật** | Biết hệ thống có ổn không, cái gì sắp hỏng, cần duyệt gì | **Email định kỳ** (xem §7.6) |
| **Xem** | Nhân sự liên quan | Tra cứu trạng thái | Trang web, chỉ đọc |

## 3. Kết quả mong muốn (theo thứ tự giá trị)

1. Hệ thống tự phát hiện và báo **trước khi người dùng kêu**.
2. Cảnh báo **phân tầng**: quản trị nhận ngay; lãnh đạo chỉ nhận khi nghiêm trọng kéo dài.
3. Lãnh đạo đọc hiểu được tình trạng hệ thống và ra được quyết định (duyệt tiền nâng cấp,
   quyết định có chạy chiến dịch lớn không).

**Tiêu chí nghiệm thu toàn dự án — một con số duy nhất: dưới 5 cảnh báo/tuần**, đo liên tục
2 tuần sau bàn giao. Vượt con số đó nghĩa là engine cảnh báo đang hỏng (phải chỉnh ngưỡng),
KHÔNG phải "hạ tầng đang xấu".

## 4. Dữ kiện đã chốt khi phỏng vấn (01/09/2026)

| Câu hỏi | Trả lời |
|---|---|
| Quy mô & OS | 1–3 Windows Server **và** 1–3 macOS (≈2–6 máy, 2 nền tảng) |
| Nơi đặt máy | Văn phòng, **có Internet** → agent đẩy số liệu ra ngoài được |
| Cần giám sát | Phần cứng + Website/API nội bộ + CSDL + Tiến trình/dịch vụ + Sao lưu & job định kỳ |
| Ứng dụng desktop | **Không cần** — web + PWA là đủ |
| Phát hiện sự cố hiện tại | Nhân viên kêu thì mới biết |
| Người nhận cảnh báo | **Phân tầng**: kỹ thuật ngay → lãnh đạo khi nghiêm trọng kéo dài |
| Thời gian | 3–6 tuần cho bản dùng thật đầu tiên |
| Dữ liệu lên cloud | **Được phép** |
| Chi phí vận hành | **0 đồng** (chốt lượt 2) |
| Lớp thu thập | **Dùng exporter có sẵn**, không tự viết agent |
| Quy thiệt hại ra tiền | **Để v2** |

## 5. Phạm vi

### 5.1 In — làm ở v1

Chín nhóm tính năng, chi tiết ở §6. Tóm tắt: thu thập 2 nền tảng · giám sát phần cứng ·
giám sát ứng dụng/dịch vụ/sao lưu · engine cảnh báo có kỷ luật · email phân tầng + digest ·
email tuần cho lãnh đạo · trang kỹ thuật · phân quyền 3 vai · lưu trữ 3 tầng.

### 5.2 Out — KHÔNG làm ở v1, kèm lý do

| Không làm | Vì sao |
|---|---|
| Trang tổng quan cho CEO (điểm sức khỏe, timeline sự cố) | Chuyển v2 **có chủ đích** — kênh đến lãnh đạo ở v1 là EMAIL (§7.6). Dashboard chỉ đáng xây sau khi email chứng minh lãnh đạo thật sự đọc |
| Quy đổi thiệt hại ra tiền | Cần dữ liệu doanh thu + số liệu lịch sử thật mới ước lượng đúng |
| **Ảnh chụp màn hình lúc lỗi** | **Rủi ro pháp lý** — xem §8.1 |
| Phân tích CSDL sâu (truy vấn chậm, lock) | Khác nghề, cần chuyên môn DBA, **và chưa ai kêu đau về nó** |
| Im lặng theo lịch bảo trì | Chỉ đáng làm khi đã có đủ cảnh báo để cần im lặng — làm sớm là tối ưu thứ chưa tồn tại |
| Sửa ngưỡng qua giao diện | 2–6 máy thì sửa `config/nguong-canh-bao.json` nhanh hơn xây màn hình |
| Nhiệt độ / SMART | Không giải quyết nỗi đau nào đang có |
| Ứng dụng desktop | Đã chốt: web + PWA đủ |
| Tự dò máy mới trong mạng | Khai tay nhanh hơn và ít rủi ro bảo mật hơn ở quy mô này |

## 6. Danh mục tính năng

### Nhóm A — Thu thập số liệu

| Mã | Tính năng | v1 |
|---|---|---|
| A1 | `windows_exporter` (MSI) trên Windows, `node_exporter` (brew) trên macOS | ✅ |
| A2 | **Collector** Node ~300 dòng trong LAN: quét exporter 60s → gộp 1 dòng rộng/máy → POST HTTPS | ✅ |
| A3 | **Dead-man's switch cho chính collector** — cloud báo nếu >3 phút không nhận dữ liệu | ✅ |
| A4 | Danh mục máy: tên nghiệp vụ, vai trò, mức quan trọng (sống còn / quan trọng / phụ) | ✅ |
| A5 | Tự phát hiện máy mới | ❌ v2 |

### Nhóm B — Giám sát phần cứng

| Mã | Chỉ số | WARNING / CRITICAL, giữ trong | v1 |
|---|---|---|---|
| B1 | CPU % + hàng đợi tiến trình | 85% / 95%, giữ **5 phút** | ✅ |
| B2 | RAM — **macOS dùng memory pressure + tốc độ swap, KHÔNG dùng "% used"** (macOS cache rất hung, 90% là bình thường); Windows dùng `Available MBytes` + `% Committed` | 85% / 95%, giữ **2 phút** | ✅ |
| B3 | Ổ đĩa: % dùng **và** GB tuyệt đối còn lại | 80% / 90%; **và** <20GB / <10GB | ✅ |
| B4 | **Dự báo ngày đầy đĩa** (hồi quy tuyến tính 7 ngày) | dự báo đầy **< 7 ngày** | ✅ |
| B5 | Độ trễ đĩa | >20ms / >50ms, giữ 5 phút | ✅ |
| B6 | Mạng: throughput, tỉ lệ lỗi gói, interface down | lỗi >0,1% gói; >80% băng thông | ✅ |
| B7 | Uptime máy + phát hiện khởi động lại ngoài kế hoạch | mỗi lần reboot bất ngờ | ✅ |
| B8 | Top tiến trình ăn CPU/RAM (**chỉ tên, KHÔNG tham số dòng lệnh** — §8.1) | — | ✅ |
| B9 | Nhiệt độ / SMART | — | ❌ v2 |

### Nhóm C — Giám sát ứng dụng & dịch vụ

| Mã | Tính năng | Ngưỡng | v1 |
|---|---|---|---|
| C1 | HTTP check website/API nội bộ | p95 >500ms / >2s (chuẩn Apdex); 3 lần fail liên tiếp = down | ✅ |
| C2 | SSL sắp hết hạn | 30 / 14 / **7 ngày** (Let's Encrypt: 21/14/7) | ✅ |
| C3 | Tên miền sắp hết hạn | 30 ngày | ✅ |
| C4 | Dịch vụ/tiến trình bắt buộc chạy | chết là báo ngay | ✅ |
| C5 | **Sao lưu — dead-man's switch** (job ping URL khi thành công; không ping = báo động) | trễ > chu kỳ + grace 2–4h | ✅ |
| C6 | **Backup "thành công nhưng rỗng"** — so kích thước với trung vị 7 ngày | ±30% / ±60% | ✅ |
| C7 | Job định kỳ khác — cùng cơ chế C5 | | ✅ |
| C8 | CSDL: kết nối được không, số connection, dung lượng | | ✅ |
| C9 | CSDL sâu: truy vấn chậm, lock | | ❌ v2 |

> **C5 + C6 là hai tính năng bị đánh giá thấp nhất nhưng giá trị cao nhất.** "Backup fail âm
> thầm 3 đêm" nghĩa là thời gian mất dữ liệu chấp nhận được thực tế là 72 giờ chứ không phải
> 1 giờ — và chỉ biết vào đúng ngày cần phục hồi. Bẫy phổ biến nhất: script thoát mã 0 nhưng
> file 0 byte.

### Nhóm D — Engine cảnh báo (phần quyết định hệ thống có bị bỏ xó không)

| Mã | Tính năng | Số cụ thể | v1 |
|---|---|---|---|
| D1 | Ngưỡng đọc từ `config/nguong-canh-bao.json`, đặt được theo từng máy | — | ✅ |
| D2 | **Duration** — giữ ngưỡng X phút mới báo | CPU/RAM 5' · đĩa 10–15' · mất liên lạc 3' | ✅ |
| D3 | **Hysteresis** — bắn ở 90%, tắt ở 80% + cần 2–3 mẫu OK liên tiếp | diệt nhấp nháy | ✅ |
| D4 | **Grouping** — nhiều cảnh báo trong 60s → 1 email | | ✅ |
| D5 | **Inhibition** — máy mất liên lạc thì chặn mọi cảnh báo con của nó; nghiêm trọng chặn cảnh cáo | | ✅ |
| D6 | **Escalation** — quản trị ngay; **lãnh đạo chỉ khi nghiêm trọng chưa ai xử lý sau 30 phút** | | ✅ |
| D7 | **Rate limit + cầu dao** — tối đa 10 email/5' toàn hệ thống; >20 cảnh báo/5' → 1 email "SỰ CỐ DIỆN RỘNG" | tự chặn phía mình, KHÔNG dựa trần 100 mail/ngày của Resend | ✅ |
| D8 | **Outbox pattern** — ghi bảng trước, worker gửi sau + khoá idempotency | chống gửi trùng khi function timeout | ✅ |
| D9 | Ack + tính thời gian khắc phục | | ✅ |
| D10 | Im lặng theo lịch bảo trì | | ❌ v2 |
| D11 | **Triệu chứng vs nguyên nhân** — chỉ triệu chứng báo gấp; nguyên nhân (CPU cao) vào digest | nguyên tắc Google SRE | ✅ |

### Nhóm E — Email cho lãnh đạo (kênh chính, thay cho dashboard ở v1)

| Mã | Tính năng | v1 |
|---|---|---|
| E1 | **Digest 8h sáng — gửi CẢ KHI mọi thứ bình thường** ("Đêm qua 6/6 máy bình thường, backup thành công lúc 02:14") | ✅ |
| E2 | **Email tóm tắt tuần**, 5 khối, không một thuật ngữ kỹ thuật nào | ✅ |
| E3 | Trang tổng quan CEO (điểm sức khỏe 2 lớp, timeline sự cố, dải dịch vụ nghiệp vụ) | ❌ v2 |

**Ba kỷ luật bắt buộc của mọi thứ gửi tới lãnh đạo:**
1. **Không một thuật ngữ kỹ thuật nào** — không `p95`, `5xx`, `swap`, `exporter`, hostname.
2. **Mọi con số phải có mốc so sánh + một câu diễn giải.** "Uptime 99,3%" là vô nghĩa;
   *"99,3% — dưới mục tiêu 99,9%, tháng thứ 3 liên tiếp đi xuống"* mới ra quyết định được.
3. **Chỉ 3 màu, luôn kèm biểu tượng và nhãn chữ** — ~8% nam giới mù màu đỏ-lục (WCAG 1.4.1
   cấm dùng màu làm phương tiện duy nhất). Dùng cam-đỏ thay đỏ thuần, xanh lam-lục thay
   xanh lá thuần. Phải đọc được khi in đen trắng.

### Nhóm F — Trang kỹ thuật

| Mã | Nội dung | Biểu đồ ✅ / ❌ |
|---|---|---|
| F1 | Danh sách máy + trạng thái | thẻ số + màu |
| F2 | Xu hướng CPU/RAM/đĩa/mạng | ✅ **đường** + đường ngưỡng · ❌ cột, gauge, 2 trục Y (tạo tương quan giả) |
| F3 | So sánh giữa các máy | ✅ **cột ngang đã sắp xếp** · ❌ tròn, radar, gauge (không xếp chồng để so được) |
| F4 | Phân bố thời gian phản hồi | ✅ histogram / p50-p95-p99 · ❌ **chỉ hiện trung bình** (che đuôi chậm) |
| F5 | Uptime | ✅ số lớn + dải nhịp theo ngày · ❌ tròn/gauge |
| F6 | Nhật ký cảnh báo + trạng thái xử lý | bảng |

> **Tránh gauge/đồng hồ kim và biểu đồ tròn.** Chúng bắt mắt người ước lượng góc và diện
> tích — hai thứ con người đọc rất không chính xác.

### Nhóm G — Nền tảng

| Mã | Tính năng | v1 |
|---|---|---|
| G1 | Đăng nhập + 3 vai (Lãnh đạo / Quản trị / Xem), **chặn ở tầng RLS chứ không chỉ ẩn nút** | ✅ |
| G2 | Lưu trữ 3 tầng + partition (§9) | ✅ |
| G3 | Subdomain gửi riêng `alerts.<tenmien>` + SPF/DKIM/DMARC (`p=none` → 2 tuần → `p=quarantine`) | ✅ |
| G4 | Sửa ngưỡng qua UI · nhật ký thao tác | ❌ v2 |

## 7. Thẩm định (vai luật sư phía đối lập)

### 7.1 Khả thi kỹ thuật: 6,5/10

**Làm được ngay (8–9):** windows_exporter chín muồi · collector ~300 dòng là code tầm
thường · bảng rộng trên Postgres · engine ngưỡng bằng SQL · trang kỹ thuật.

**Rủi ro vừa (5–7):** `node_exporter` trên **macOS là mắt xích yếu nhất** — darwin ít
collector hơn, tên metric khác hẳn, chỉ số bộ nhớ hay gây hiểu nhầm.

**Ba ràng buộc gói miễn phí — chúng định hình kiến trúc:**

| Ràng buộc | Hệ quả bắt buộc |
|---|---|
| Cloudflare Workers Free **10ms CPU/lần gọi** | **Toàn bộ phép đánh giá viết bằng SQL trong Postgres**, Worker chỉ gọi RPC rồi gửi mail (chờ I/O không tính vào CPU time) |
| Workers Free **bundle 3 MB nén** | Dashboard làm tĩnh + gọi Supabase từ trình duyệt, không SSR nặng |
| Supabase Free **5 GB băng thông ra/tháng** | Trình duyệt **chỉ đọc bảng đã gộp**, tuyệt đối không query bảng thô |

### 7.2 Ba rủi ro lớn nhất

**① Xây xong rồi bị bỏ xó — mất trắng toàn bộ công.** Chết *êm*: email dần bị lọc sang thư
mục khác, dashboard 3 tuần không ai mở, rồi collector chết mà không ai nhận ra — trong khi
vẫn tin mình đang được bảo vệ.
*Phòng:* nhóm D đầy đủ + chỉ tiêu <5 cảnh báo/tuần · **digest gửi cả khi bình thường** (im
lặng tuyệt đối không phân biệt được với đã chết) · mỗi tháng gây một sự cố giả để kiểm dây
chuyền cảnh báo.

**② Khóa `service_role` trên máy công ty bị lấy — toàn quyền ghi/xóa DB.** Bất kỳ ai chạm
được máy chạy collector đều có toàn quyền cơ sở dữ liệu.
*Phòng:* **không bao giờ để `service_role` ở collector** · mỗi máy một token riêng, ghi qua
RPC chỉ cho `INSERT` đúng `host_id` · RLS chặn phần còn lại · token xoay được.

**③ Dữ liệu cá nhân lọt vào số liệu rồi bị đẩy ra nước ngoài** — xem §8.1.

**④ (nền) Collector chết → dashboard xanh giả.** Không có dữ liệu mới bị hiểu nhầm là
"không có vấn đề". *Phòng:* A3 dead-man's switch, **logic chạy ở cloud chứ không ở collector**.

### 7.3 Kết luận

**NÊN LÀM, nhưng đã sửa hướng ở 3 chỗ** trước khi lập lộ trình: ① kênh chính đến lãnh đạo là
EMAIL, không phải dashboard ② tách v0 "cầm máu" làm ngay ngày đầu thay vì bắt nỗi đau chờ 6
tuần ③ ghi nhận "0 đồng" thực chất tốn 2–4 giờ người/tháng.

**Cảnh báo giữ nguyên: bỏ nhóm D để "làm nhanh cho kịp" là dự án chết trong 2 tuần sau bàn
giao** — không vì lỗi kỹ thuật, mà vì email thành rác. Nhóm D là điều kiện sống.

## 8. Pháp lý, bảo mật, vận hành

### 8.1 Pháp lý — Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân

Số liệu CPU/RAM/đĩa vô hại. Nhưng có **ba đường rò thật**, và cả ba đều phải bịt bằng code:

| Đường rò | Bắt buộc |
|---|---|
| **Danh sách tiến trình** chứa tên tài khoản, tham số dòng lệnh có đường dẫn chứa tên người | Chỉ lưu **tên tiến trình**, cắt bỏ tham số. Có test khẳng định tham số không lọt vào payload |
| **HTTP check** ghi URL — query string có thể chứa email, số điện thoại, mã khách | **Băm hoặc cắt query string** trước khi lưu |
| **Ảnh chụp màn hình lúc lỗi** | **KHÔNG LÀM Ở V1.** Trang lỗi ứng dụng nội bộ có thể đang hiển thị dữ liệu khách hàng; chụp rồi đẩy sang máy chủ nước ngoài là tự tạo kho dữ liệu cá nhân xuyên biên giới |

### 8.2 Bảo mật

- Exporter mở port 9182/9100 **không xác thực** → bind interface nội bộ + firewall chỉ cho
  IP collector.
- Email cảnh báo chứa tên máy và IP nội bộ → **dùng tên nghiệp vụ ("máy chủ kế toán") thay
  hostname thật** — vừa an toàn hơn vừa đúng tinh thần ngôn ngữ quản trị.
- Không `service_role` ở collector (§7.2 ②).

### 8.3 Chi phí vận hành thật

Tiền mặt 0 đồng. Chi phí thật là **2–4 giờ người/tháng**: vá exporter, vá Uptime Kuma (tự
host là tự chịu trách nhiệm CVE), tinh chỉnh ngưỡng, dọn dữ liệu. Gói free có trần cứng:
quá ~15 máy hoặc muốn giữ lịch sử >13 tháng là phải trả tiền → **thiết kế sao cho nâng gói
chỉ là đổi biến môi trường, không phải viết lại**.

### 8.4 Ai bảo trì — chống bus factor = 1

Hệ giám sát tự xây là *thêm một hệ thống nữa* cần được giám sát. Ba việc bắt buộc trước khi
coi là bàn giao xong:
1. Ghi tên người chịu trách nhiệm vào `CLAUDE.md` **và chân trang dashboard**.
2. Viết `docs/sop/SU-CO-GIAM-SAT.md` cho người *không* xây nó: khởi động lại collector, xoay
   token, tắt cảnh báo khi bảo trì.
3. Trỏ Uptime Kuma giám sát chính hệ giám sát — hai hệ canh nhau.

## 9. Kiến trúc

```
VĂN PHÒNG (mạng nội bộ)                    │        CLOUD (miễn phí, độc lập với văn phòng)
                                           │
[Windows Server] windows_exporter :9182 ─┐ │
[macOS]          node_exporter    :9100 ─┼─┼→ [Supabase Free] ←── gộp + dọn partition
[Uptime Kuma]    HTTP/SSL/backup ping   ─┘ │        ▲   │
        └──→ [COLLECTOR ~300 dòng]─────────┼────────┘   │
             gộp 1 dòng rộng/máy/60s       │            ▼
             HTTPS outbound                │   [Cloudflare Worker — cron 1 phút]
             (KHÔNG mở cổng vào LAN)       │    ngưỡng → duration → hysteresis
                                           │    → gom nhóm → ức chế → leo thang
                                           │            │
                                           │            ▼
                                           │   [Resend HTTP API] → email phân tầng
                                           │
                                           │   [Cloudflare Pages] Next.js: /ky-thuat
```

**Điểm mấu chốt:** mọi thứ ở cột phải chạy độc lập với văn phòng. Mất điện, mất mạng, hay
chính collector chết — Worker vẫn thức dậy mỗi phút, thấy "3 phút rồi không có dữ liệu mới"
và gửi mail. Đó là lý do đồng hồ **không** được đặt trong LAN.

### 9.1 Ba nguyên tắc lưu trữ — vi phạm là chết hiệu năng

1. **Bảng RỘNG, tuyệt đối không EAV.** 1 dòng = 1 snapshot/máy/nhịp với ~40 cột. Tiết kiệm
   **8–10 lần** dung lượng vì chi phí header + index chia đều cho 40 giá trị thay vì 1.
2. **Batch insert** — 1 request/máy/nhịp mang 40 giá trị.
3. **Xóa dữ liệu cũ bằng `DROP PARTITION`, KHÔNG bao giờ `DELETE`** — `DELETE` 100 triệu
   dòng gây bloat + autovacuum kéo hàng giờ.

### 9.2 Ba tầng lưu trữ và ước lượng dung lượng (6 máy)

| Tầng | Nhịp | Giữ | Số dòng | Dung lượng |
|---|---|---|---|---|
| `metrics_raw` | 60s | 7 ngày | 60K | ~24 MB |
| `metrics_5m` (min/max/avg/p95) | 5 phút | 90 ngày | 155K | ~62 MB |
| `metrics_1h` | 1 giờ | 13 tháng | 57K | ~23 MB |
| | | | **Tổng** | **~110 MB / 500 MB** |

Luôn lưu **min/max/avg/p95**, không chỉ avg — avg 5 phút che mất spike CPU 100% kéo dài 40
giây, tức là che đúng thứ cần nhìn. Cảnh báo nội bộ khi DB vượt **350 MB** (70% trần).

## 10. Thứ dùng lại, không code lại

| Việc | Dùng lại | License | Lý do |
|---|---|---|---|
| Metric Windows | `windows_exporter` (MSI) | Apache-2.0 | Đã xử lý bẫy tên counter đa ngôn ngữ (xem ADR-001) |
| Metric macOS | `node_exporter` (Homebrew) | Apache-2.0 | Chính thức, ổn định |
| Uptime + SSL + dead-man's-switch | **Uptime Kuma** (Docker) | MIT | 5 phút cài, thay được C1/C2/C5 |
| Gửi email | **Resend HTTP API** | — | Worker/Vercel đóng băng tác vụ nền khi trả response → **SMTP chết giữa handshake: không lỗi, không log, không email** |
