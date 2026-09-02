# src/phien-dich — Lớp phiên dịch

Biến con số thành **nhận định**: chuyện gì đang xảy ra · vì sao · nếu không làm gì thì sao ·
làm gì bây giờ. Đây là mệnh đề trung tâm của BRD §1, và là thứ phân biệt hệ này với một
công cụ vẽ biểu đồ CPU.

## Ranh giới kiến trúc (ADR-004)

> **Postgres trả về SỰ THẬT ĐÃ TỔNG HỢP. TypeScript biến sự thật thành NHẬN ĐỊNH.**

- **SQL** (`anh_chup_suc_khoe()` — migration 0013): phép nặng — gộp, gaps-and-islands, trích
  jsonb. Ở đó vì Cloudflare Worker chỉ có 10ms CPU mỗi lượt gọi.
- **TypeScript** (thư mục này): hàm **THUẦN**, không I/O, không đọc giờ hệ thống. Nhờ vậy
  test nó là test số học — chạy trong mili-giây, không cần dựng PGlite.

## File

| File | Vai trò |
|---|---|
| `kieu.ts` | Kiểu dữ liệu. `AnhChup` = một dòng của `anh_chup_suc_khoe()`. `NhanDinh` phải trả lời đủ bốn câu. |
| `luat-tuong-quan.ts` | 9 luật + `chonNguyenNhanGoc()` với **bốn chốt chặn**. |
| `doc-cau-hinh.ts` | Nạp `config/phien-dich.json`. **Không có giá trị mặc định dự phòng** — thiếu khoá thì ném lỗi. |
| `phat-hien.ts` | Đổi `alerts` → `PhatHien` (bảng ánh xạ chỉ số → mã + trụ), và `tuAnhChupSql()` đổi một dòng SQL → `AnhChup`. |
| `soan-thu.ts` | Soạn tiêu đề + thân thư theo kim tự tháp ngược. |
| `index.ts` | `phienDich()` — cửa duy nhất. Giao diện và email dùng CHUNG hàm này. |

## Nối vào đầu ra: bước 6b

`src/engine/vong-danh-gia.ts` gọi lớp này ở **bước 6b**, giữa "gom nhóm" và "leo thang":
nó **viết đè** `than_thu` của thư chưa gửi. Cố ý đè lên thay vì soạn thẳng trong SQL —
cỗ máy chống nhiễu (gom nhóm · ức chế · cầu dao) là logic tập hợp, SQL làm tốt và đã có
11 test canh; còn viết văn tiếng Việt trong PL/pgSQL thì rất tệ.

Ba tính chất phải giữ khi sửa bước này: `khoa_idempotency` không đổi · `where gui_luc is
null` · bọc `try/catch` — **bước 6b hỏng thì thư CŨ VẪN GỬI**, và `TomTatVong.phien_dich_loi`
nói rõ đã suy giảm chứ không im lặng.

## Ba lỗi đã trả giá ở đây

1. **Ánh xạ lệch âm thầm.** Luật khai nuốt mã `cpu_hang_doi` nhưng bảng ánh xạ sinh ra
   `tai_cao` → mã chết, không bao giờ khớp, không có lỗi nào bật ra. Test
   `phien-dich-noi-dau-ra` canh đúng chỗ này.
2. **Hình dạng SQL ≠ TypeScript.** `anh_chup_suc_khoe()` gom danh sách vào `chi_so_them`
   (jsonb); ép kiểu thẳng `as never` giấu chỗ khác nhau tới lúc chạy mới sập. Luôn đi qua
   `tuAnhChupSql()`.
3. **Khử trùng so nhầm không gian tên.** `goc.ma` là MÃ LUẬT, `p.ma` là MÃ PHÁT HIỆN —
   so hai cái đó không bao giờ khớp, nên triệu chứng gốc bị in hai lần. So `chi_so`.

## Bốn chốt chặn — đừng gỡ cái nào

Lớp tương quan có thể biến thành lớp **giấu** cảnh báo. Đó là kiểu hỏng tệ nhất vì nó **im
lặng** và trông rất gọn gàng.

1. Luật phải **khai báo tường minh** nó nuốt mã nào. Không nuốt ngầm.
2. Nhận định mức `phong_doan` chỉ được **xếp hạng**, không được nuốt.
3. **Không bao giờ** nuốt `mat_lien_lac` — không đo được KHÁC với khoẻ.
4. Chỉ nuốt các **trụ đã KHAI BÁO** trong `tru_duoc_nuot` (mặc định: chỉ trụ của chính
   luật). "Đĩa đầy" khai vắt qua bộ nhớ và bộ xử lý vì đó là dây chuyền nhân quả thật,
   nhưng KHÔNG khai "sao lưu" — nên nó tuyệt đối không nuốt được "sao lưu thất bại".
   Cấm tuyệt đối vắt trụ thì buộc phải gán triệu chứng bộ nhớ vào trụ lưu trữ, tức bóp
   méo dữ liệu cho vừa luật.

Kèm một chỉ số tự giám sát trong config (`tuGiamSat.tyLeGopToiDa`): gộp quá 70% số phát
hiện thì hệ thống phải tự cảnh báo về chính nó.

## Ranh giới config

**HẰNG SỐ ở JSON, SỐ HỌC ở TypeScript.** Một DSL điều kiện trong JSON thì không typecheck
được, không test được, và sẽ thành ngôn ngữ lập trình thứ hai không ai bảo trì nổi. Muốn
thêm luật thì sửa `luat-tuong-quan.ts` và viết test.

## Ca kiểm thử sống

`tests/phien-dich-tuong-quan.test.ts` dùng ảnh chụp **thật** của MacBook Air M1 lúc 18:55
ngày 01/09/2026. Bốn triệu chứng (đĩa còn 3,9 GB · đĩa 98,3% · swap 87,8% · tải 2,82 trong
khi CPU rảnh 75%) phải gộp thành **một** nguyên nhân gốc, còn "máy chạy pin" thì **không**
được gộp vì khác trụ.
