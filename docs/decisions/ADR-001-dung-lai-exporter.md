# ADR-001 — Dùng lại exporter mã nguồn mở thay vì tự viết agent thu thập

- **Ngày:** 01/09/2026
- **Trạng thái:** Đã chốt

## Bối cảnh

Cần thu thập CPU/RAM/đĩa/mạng/tiến trình từ 1–3 máy Windows Server và 1–3 máy macOS, đẩy
lên cloud. Ba cách: (a) tự viết agent chạy trên từng máy · (b) agentless qua SSH/WMI/WinRM ·
(c) dùng exporter mã nguồn mở có sẵn rồi tự viết lớp gom.

## Quyết định

**Dùng `windows_exporter` (MSI) trên Windows và `node_exporter` (Homebrew) trên macOS — cả
hai license Apache-2.0. Chỉ tự viết một "collector" ~300 dòng chạy trong LAN**: quét các
exporter mỗi 60 giây, gộp thành một dòng rộng cho mỗi máy, đẩy lên Supabase qua HTTPS
outbound.

## Lý do

1. **Bẫy tên performance counter đa ngôn ngữ.** Trên Windows tiếng Việt/Nhật, chuỗi
   `'\Processor(_Total)\% Processor Time'` **lỗi** — tên counter bị dịch theo ngôn ngữ OS,
   phải map qua chỉ số ID trong registry `HKLM\...\Perflib\009`. Đây là lý do số một khiến
   agent tự viết chết ở khách hàng Việt Nam. `windows_exporter` đã xử lý xong việc này.
2. **Tiền chứng chỉ ký số.** Agent tự viết muốn cài sạch cần Apple Developer ID ~99 USD/năm
   (không có thì Gatekeeper chặn) + chứng chỉ ký Windows OV ~200–400 USD/năm (từ 6/2023 bắt
   buộc HSM). Cộng lại đắt hơn toàn bộ chi phí hạ tầng của dự án.
3. **Khối lượng code.** Tiết kiệm khoảng 60% code phía máy chủ, đổi lại chỉ phải viết lớp
   gom — mảnh duy nhất không công cụ nào làm hộ, vì cloud không chọc được vào mạng nội bộ.

**Vì sao không chọn agentless (b):** WMI/WinRM yêu cầu quyền Administrator lưu dài hạn trong
ứng dụng (rủi ro rất cao), SNMP trên Windows đã deprecated, và quan trọng nhất — cloud không
vào được LAN nên vẫn phải đặt một collector trong mạng, tức là mất luôn ưu điểm "không cần
cài gì".

## Đường nâng cấp

Xem lại nếu: chính sách công ty cấm phần mềm bên thứ ba trên máy chủ · hoặc cần chỉ số mà
exporter không cung cấp (khi đó bổ sung trong collector bằng lệnh OS, không thay cả lớp).
Lớp thu thập được thiết kế tách rời qua bảng đối chiếu `docs/architecture/metric-2-nen-tang.md`
nên đổi nguồn số liệu không phải viết lại phần còn lại.
