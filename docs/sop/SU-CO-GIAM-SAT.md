# SOP — Vận hành hệ giám sát khi có sự cố

> **Viết cho người KHÔNG xây hệ thống này.** Bạn không cần hiểu code để làm theo.
> BRD §8.4 xếp tài liệu này là một trong ba việc bắt buộc trước khi coi là bàn giao xong —
> lý do: hệ giám sát tự xây là *thêm một hệ thống nữa cần được giám sát*, và nếu chỉ một
> người biết nó chạy thế nào thì người đó nghỉ hai tuần là hệ thống chết âm thầm.

**Người chịu trách nhiệm vận hành:** _(điền tên + số điện thoại — chưa điền là chưa bàn giao)_

---

## 1. Làm sao biết hệ giám sát còn sống?

**Dấu hiệu số một: email tóm tắt 8h sáng.** Nó được gửi **mỗi ngày, kể cả khi mọi thứ bình
thường** ("Đêm qua 6/6 máy bình thường, backup thành công lúc 02:14").

🔴 **Không nhận được email sáng = coi như hệ giám sát đã chết**, cho tới khi chứng minh
ngược lại. Im lặng tuyệt đối không phân biệt được với "không có gì xảy ra" — đó chính là
kiểu hỏng mà cả hệ thống này được thiết kế để chống.

Hai bước kiểm khi mất email sáng:

1. Mở dashboard. Cột "số liệu mới nhất" của từng máy có cập nhật trong vòng 5 phút không?
   - **Không** → collector chết. Xem §2.
   - **Có** → số liệu vẫn về, vấn đề nằm ở khâu gửi email. Xem §4.
2. Kiểm Uptime Kuma (lớp quan sát độc lập). Nếu Kuma cũng im thì cả hai lớp cùng chết —
   gần như chắc chắn mất điện hoặc mất mạng ở văn phòng.

## 2. Collector chết (không còn số liệu mới)

Collector là chương trình nhỏ chạy nền trong mạng nội bộ, quét các máy chủ rồi đẩy số liệu
lên cloud.

**Trên máy Windows:**

```
1. Bấm Win + R, gõ: services.msc
2. Tìm dòng "GiamSatCollector"
3. Chuột phải → Restart
4. Nếu trạng thái là "Stopped" và Restart không lên: chuột phải → Properties → tab Log On
   → kiểm tài khoản chạy dịch vụ còn hạn mật khẩu không.
```

**Trên máy Mac:**

```bash
sudo launchctl kickstart -k system/vn.congty.giamsat.collector
# xem nhật ký nếu vẫn không lên:
tail -50 /var/log/giamsat-collector.log
```

**Sau khi khởi động lại:** chờ 2 phút rồi mở dashboard. Cột "số liệu mới nhất" phải nhảy.
Nếu vẫn không, kiểm exporter còn sống không: mở trình duyệt trên chính máy đó vào
`http://localhost:9182/metrics` (Windows) hoặc `http://localhost:9100/metrics` (Mac) —
phải thấy một trang đầy chữ. Trang trắng nghĩa là exporter chết, không phải collector.

## 3. Xoay token của một máy

**Khi nào phải xoay:**

- Máy chạy collector bị nghi nhiễm mã độc, hoặc bị mất/đánh cắp.
- Nhân sự phụ trách kỹ thuật nghỉ việc.
- Token lỡ bị dán vào chat, email, hay ảnh chụp màn hình.

Token của mỗi máy chỉ ghi được số liệu của **đúng máy đó** (không phải khoá toàn quyền),
nên rủi ro có giới hạn — nhưng vẫn phải xoay.

**Cách làm** (chạy trên Supabase → SQL Editor):

```sql
select public.xoay_token('máy chủ kế toán', '<token-mới-ít-nhất-32-ký-tự>');
```

Sau đó cập nhật token mới vào file cấu hình của collector trên máy đó rồi khởi động lại
(§2). Token cũ **chết ngay lập tức** — máy sẽ báo "mất liên lạc" cho tới khi bạn cập nhật
xong. Đó là hành vi đúng.

## 4. Không nhận được email dù hệ thống vẫn chạy

Thư được ghi vào hàng đợi trước rồi mới gửi, nên thư không mất — chỉ là chưa đi.

```sql
-- Thư đang kẹt và lý do:
select tao_luc, tieu_de, loi
from public.alert_notifications
where gui_luc is null
order by tao_luc desc limit 20;
```

| Cột `loi` ghi gì | Nghĩa là | Làm gì |
|---|---|---|
| `resend trả mã 401` | Khoá API sai hoặc đã bị thu hồi | Tạo khoá mới trên Resend, cập nhật biến môi trường của Worker |
| `resend trả mã 429` | Vượt hạn mức gửi | Gói miễn phí giới hạn 100 thư/ngày. Vượt mức này là dấu hiệu engine cảnh báo đang hỏng — xem §6 |
| `khong_co_dia_chi_nhan` | Chưa khai địa chỉ cho vai nhận | Kiểm biến `HOP_THU_QUAN_TRI` / `HOP_THU_LANH_DAO` |
| Trống, thư vẫn nằm đó | Worker không chạy | Kiểm Cloudflare → Workers → Logs. Không có lượt chạy nào trong 5 phút = cron chết |

Hệ thống tự thử lại mỗi phút, nên sửa xong là thư tự đi, không cần làm gì thêm.

## 5. Tắt cảnh báo khi bảo trì có kế hoạch

Trước khi tắt máy chủ để bảo trì, tắt theo dõi máy đó để khỏi làm phiền cả đội:

```sql
update public.hosts set dang_theo_doi = false where ten_nghiep_vu = 'máy chủ kế toán';
```

🔴 **Bật lại NGAY khi bảo trì xong:**

```sql
update public.hosts set dang_theo_doi = true where ten_nghiep_vu = 'máy chủ kế toán';
```

Quên bật lại là máy đó **không còn được giám sát** mà không ai biết — và dashboard vẫn xanh
vì nó không đếm máy đã tắt theo dõi. Đặt hẹn giờ điện thoại trước khi tắt.

## 6. Email cảnh báo quá nhiều

Chỉ tiêu nghiệm thu của hệ thống là **dưới 5 cảnh báo mỗi tuần**. Vượt con số đó nghĩa là
**engine cảnh báo đang hỏng, không phải hạ tầng đang xấu**.

```sql
-- Chỉ số nào ồn nhất trong 7 ngày qua:
select chi_so, count(*) as so_lan
from public.alerts
where bat_dau_luc > now() - interval '7 days'
group by chi_so order by so_lan desc;
```

Chỉ số nào đứng đầu thì nới ngưỡng của nó trong `config/nguong-canh-bao.json` — tăng
`canhCao`/`nghiemTrong`, hoặc tăng `giuTrongPhut` để nó phải vượt ngưỡng lâu hơn mới báo.
Sửa xong chạy `npm test` rồi nạp lại cấu hình.

**Đừng bao giờ "chữa" bằng cách tắt cảnh báo.** Tắt đi thì tuần sau không ai nhớ đã tắt gì.

## 7. Khi nào phải chuyển sang gói trả phí

Hệ thống chạy trên gói miễn phí. Ba mốc phải nâng gói:

| Dấu hiệu | Mốc | Làm gì |
|---|---|---|
| Email cảnh báo "kho dữ liệu sắp đầy" | DB vượt **350 MB** / trần 500 MB | Nâng Supabase Pro (~25 USD/tháng) hoặc giảm thời gian giữ lịch sử trong `config` |
| Thêm máy chủ mới | Quá **~15 máy** | Nâng Supabase Pro |
| Cần giữ lịch sử quá 13 tháng | — | Nâng Supabase Pro |

Nâng gói **chỉ là đổi biến môi trường**, không phải viết lại — đây là ràng buộc thiết kế đã
chốt từ đầu (ADR-002).

## 8. Kiểm tra định kỳ — mỗi tháng một lần, 10 phút

Hệ giám sát không được kiểm thì cũng hỏng âm thầm như thứ nó đang canh.

1. **Gây một sự cố giả**: tắt theo dõi rồi bật lại một máy, hoặc dừng một dịch vụ không
   quan trọng trong 6 phút. **Phải nhận được email.** Không nhận được là dây chuyền cảnh
   báo đã đứt ở đâu đó — tìm theo §4.
2. **Kiểm sao lưu cấu hình**: GitHub Actions chạy hằng tuần, mở tab Actions xem lượt chạy
   gần nhất có xanh không.
3. **Kiểm dung lượng**: Supabase → Reports → Database size, so với mốc 350 MB ở §7.
4. **Đọc lại chỉ tiêu <5 cảnh báo/tuần** (§6).

Ghi ngày kiểm vào bảng dưới:

| Ngày kiểm | Người kiểm | Sự cố giả có báo không | Ghi chú |
|---|---|---|---|
| | | | |
