# Bảng đối chiếu chỉ số — Windows Server vs macOS

> Nguồn: `windows_exporter` (Prometheus community, Apache-2.0) và `node_exporter` (darwin).
> Đây là tài liệu ĐIỀU KHIỂN: `collector/doc-metric.ts` triển khai đúng bảng này, và
> `tests/metric-mapping.test.ts` khẳng định mọi dòng đều rút ra được số hợp lệ.
>
> ⚠️ **darwin là nền tảng hạng hai của mọi công cụ giám sát.** Tên metric khác Linux hẳn —
> không có `node_memory_MemAvailable_bytes`. Mọi ô "macOS" dưới đây phải được đối chiếu với
> tên metric THẬT trên máy Mac của công ty ở hạng mục 2.1, không được suy từ Linux ra.

## 1. CPU

| Chỉ số | Windows | macOS | Công thức |
|---|---|---|---|
| `cpu_phan_tram` | `windows_cpu_time_total{mode="idle"}` | `node_cpu_seconds_total{mode="idle"}` | `100 × (1 − Δidle / Δtổng)` giữa 2 lần quét. **Bắt buộc dùng hiệu số** — giá trị tuyệt đối là bộ đếm tích lũy từ lúc khởi động, đọc thẳng ra số vô nghĩa |
| `cpu_hang_doi` | `windows_system_processor_queue_length` | `node_load1` | Windows không có load average; hàng đợi tiến trình là thứ tương đương gần nhất |
| `tai_trung_binh_15p` | *(không có)* | `node_load15` | Windows để `null` — thà bỏ trống còn hơn bịa một con số |

## 2. Bộ nhớ

| Chỉ số | Windows | macOS | Công thức |
|---|---|---|---|
| `ram_tong_mb` | `windows_cs_physical_memory_bytes` | `node_memory_total_bytes` | `/ 1048576` |
| `ram_con_lai_mb` | `windows_os_physical_memory_free_bytes` | `node_memory_free_bytes + node_memory_inactive_bytes` | macOS coi bộ nhớ inactive là *có thể lấy lại*; không cộng vào là báo động giả liên tục |
| `ram_phan_tram` | `100 × (1 − free/total)` | như trên | 🔴 **KHÔNG dùng số này để cảnh báo trên macOS** — xem §2.1 |
| `swap_dung_mb` | suy từ `windows_os_paging_free_bytes` | `node_memory_swap_used_bytes` | |
| `swap_vao_moi_giay` | *(không có)* | `node_memory_swapped_in_pages_total` | Hiệu số × 4096 byte/trang. **Đây mới là chỉ số cảnh báo RAM thật của macOS** |
| `ap_luc_bo_nho` | *(không có)* | suy từ `node_memory_wired_bytes` + `compressed_bytes` + tốc độ swap | `normal` / `warn` / `critical` |

### 2.1 Vì sao macOS không được cảnh báo theo "% RAM đã dùng"

macOS cache rất hung: nó chủ động lấp gần hết RAM trống bằng file cache, vì RAM rỗng là RAM
lãng phí. **90% RAM đã dùng trên máy Mac là trạng thái bình thường**, không phải dấu hiệu
quá tải. Dùng ngưỡng 85%/95% như Windows sẽ sinh báo động giả liên tục — và sau hai tuần
thì không ai đọc email nữa, tức là mất luôn cả những cảnh báo thật.

Chỉ số đúng cho macOS là **áp lực bộ nhớ** và **tốc độ swap-in**: máy chỉ thật sự thiếu RAM
khi nó phải đọc dữ liệu ngược từ đĩa lên.

## 3. Đĩa

| Chỉ số | Windows | macOS |
|---|---|---|
| `con_lai_gb` | `windows_logical_disk_free_bytes{volume}` | `node_filesystem_avail_bytes{mountpoint}` |
| `tong_gb` | `windows_logical_disk_size_bytes{volume}` | `node_filesystem_size_bytes{mountpoint}` |
| `phan_tram_dung` | `100 × (1 − free/size)` | như trên |
| `do_tre_doc_ms` | `windows_logical_disk_read_seconds_total ÷ read_requests_total` | `node_disk_read_time_seconds_total ÷ node_disk_reads_completed_total` |

Bỏ qua filesystem ảo (`tmpfs`, `devfs`, `autofs`, `overlay`) — chúng luôn gần đầy và không
nói lên điều gì về sức khỏe máy.

## 4. Mạng

| Chỉ số | Windows | macOS |
|---|---|---|
| `mang_vao_byte_moi_giay` | `windows_net_bytes_received_total{nic}` | `node_network_receive_bytes_total{device}` |
| `mang_ra_byte_moi_giay` | `windows_net_bytes_sent_total{nic}` | `node_network_transmit_bytes_total{device}` |
| `mang_goi_loi` | `windows_net_packets_received_errors_total` | `node_network_receive_errs_total` |
| `mang_goi_tong` | `windows_net_packets_received_total` | `node_network_receive_packets_total` |

Đều là bộ đếm tích lũy → phải lấy hiệu số chia cho khoảng thời gian. Bỏ interface loopback.

## 5. Máy và dịch vụ

| Chỉ số | Windows | macOS |
|---|---|---|
| `uptime_giay` | `windows_system_system_up_time` (mốc khởi động, giây từ epoch) | `node_boot_time_seconds` |
| `dich_vu_thieu` | `windows_service_state{name,state}` — lọc dịch vụ khai trong `config/` mà `state != "running"` | so tên tiến trình với danh sách khai trong `config/` |

## 6. Tiến trình — điều cấm

`windows_exporter` (collector `process`) và `node_exporter` đều **không** trả tham số dòng
lệnh, nên đường rò này đóng sẵn ngay ở nguồn. Collector vẫn phải tự cắt: chỉ giữ **tên**, bỏ
đường dẫn. `CHECK` constraint trong `metrics_raw` là hàng rào cuối
(Nghị định 13/2023/NĐ-CP — BRD §8.1).

## 7. Chỉ số darwin KHÔNG có — đã xác định phương án thay

| Thiếu trên macOS | Thay bằng |
|---|---|
| Hàng đợi tiến trình | `node_load1` |
| Trạng thái dịch vụ kiểu Windows Service | so danh sách tiến trình với `config/dich-vu-bat-buoc.json` |
| Nhiệt độ / SMART | không làm ở v1 (BRD §5.2) |

**Không ô nào trong tài liệu này được để trống hoặc ghi "chưa biết".** Chỉ số nào exporter
không cung cấp thì phải có dòng phương án thay — đó là điều kiện nghiệm thu của hạng mục 2.1.
