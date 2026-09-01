# GIAM_SAT_SERVER

Hệ thống giám sát tổng hợp cho máy chủ: theo dõi tài nguyên hạ tầng (CPU/RAM/ổ đĩa/mạng,
uptime) lẫn trạng thái ứng dụng, dịch vụ đang chạy, kèm cảnh báo khi vượt ngưỡng.

**Mục tiêu số một:** hệ thống tự phát hiện và báo **trước khi người dùng kêu**.
**Tiêu chí nghiệm thu:** dưới **5 cảnh báo mỗi tuần**. Vượt con số đó nghĩa là engine cảnh
báo đang hỏng, không phải hạ tầng đang xấu.

## Chạy thử ngay trên máy bạn

```bash
npm install
npm run dev        # mở http://localhost:3000
```

Không cần Docker, không cần tài khoản Supabase. Dữ liệu mẫu được nạp vào một Postgres nhúng
ngay trong tiến trình, dựng sẵn một kịch bản có nghĩa: một máy khoẻ, một máy quá tải, một
máy sắp đầy đĩa — để bạn thấy ngay giao diện có phân biệt được ba trạng thái đó không.

| Trang | Cho ai |
| ----- | ------ |
| `/` | Kỹ thuật: danh sách máy, so sánh mức tải, nhật ký cảnh báo |
| `/may/<id>` | Chi tiết một máy: biểu đồ 7 ngày kèm đường ngưỡng |
| `/lanh-dao` | Lãnh đạo: một câu kết luận, trạng thái từng phần, việc cần quyết |

## Lệnh

```bash
npm test          # 173 test, mỗi test dựng một Postgres thật trong Node
npm run typecheck
npm run build
npm run check:cau-truc   # soi cấu trúc thư mục theo .claude/scaffold.json
```

## Bắt đầu đọc từ đâu

| File | Vai trò |
| ---- | ------- |
| `CLAUDE.md` | Hiến pháp dự án: guardrails, quy tắc làm việc, trạng thái, decision log |
| `PLAN.md` | Lộ trình thi công — nguồn lộ trình DUY NHẤT |
| `docs/brd/giam-sat-he-thong.md` | Yêu cầu nghiệp vụ đầy đủ, kèm thẩm định và mặt pháp lý |
| `docs/decisions/ADR-*` | Ba quyết định kiến trúc và lý do bằng số |
| `docs/sop/SU-CO-GIAM-SAT.md` | **Vận hành khi có sự cố — viết cho người không xây hệ thống** |
| `config/nguong-canh-bao.json` | Mọi ngưỡng nghiệp vụ. Code đọc từ đây, không hardcode |

## Kiến trúc

```
VĂN PHÒNG (mạng nội bộ)                    │        CLOUD (miễn phí, độc lập với văn phòng)
[Windows] windows_exporter :9182 ─┐        │
[macOS]   node_exporter    :9100 ─┼────────┼→ [Supabase] ←── gộp + dọn partition
     └──→ [collector ~300 dòng]───┘        │       ▲   │
          gộp 1 dòng rộng/máy/60s          │       │   ▼
          HTTPS outbound, KHÔNG mở cổng vào│   [Cloudflare Worker — cron 1 phút]
                                           │    ngưỡng → duration → hysteresis →
                                           │    gom nhóm → ức chế → leo thang
                                           │            │
                                           │            ▼
                                           │   [Resend HTTP API] → email phân tầng
```

Mọi thứ ở cột phải chạy độc lập với văn phòng. Mất điện, mất mạng, hay chính collector chết
— Worker vẫn thức dậy mỗi phút, thấy "3 phút rồi không có dữ liệu mới" và gửi mail.

## Cần gì để đưa lên chạy thật

1. **Tài khoản** (đều gói miễn phí): Supabase · Cloudflare · Resend. Điền vào `.env.local`
   theo `.env.example`.
2. **Một tên miền** để cấu hình SPF/DKIM/DMARC cho subdomain gửi thư (`alerts.<tên-miền>`).
3. **Quyền cài phần mềm** trên máy Windows và máy Mac: `windows_exporter` (MSI) và
   `node_exporter` (Homebrew) — đều Apache-2.0, không tự viết agent (ADR-001).
4. **Danh sách**: URL/dịch vụ nội bộ cần theo dõi · dịch vụ bắt buộc luôn chạy trên từng
   máy · thông tin các job sao lưu · **tên nghiệp vụ cho từng máy** ("máy chủ kế toán" thay
   vì "SRV-01" — dùng trong mọi email và giao diện).
5. **Một tài khoản kết nối CSDL chỉ đọc** (không dùng tài khoản quản trị).

## Ba ràng buộc của gói miễn phí — vi phạm là phải trả tiền

1. **Phép nặng nằm trong Postgres**, không trong Worker (trần 10ms CPU mỗi lần gọi).
2. **Trình duyệt chỉ đọc bảng đã gộp** (`metrics_5m`, `metrics_1h`), không bao giờ query
   `metrics_raw` (trần 5 GB băng thông ra/tháng).
3. **Bundle giao diện dưới 3 MB nén.** Đo gần nhất: 109 kB.
