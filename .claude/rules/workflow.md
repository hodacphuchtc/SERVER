# Quy trình làm việc với Claude Code — GIAM_SAT_SERVER

> **Viết lại 01/09/2026.** Bản trước do skill khởi tạo chép nguyên từ một dự án khác và mô
> tả kiến trúc module, thư mục kế hoạch nhiều file, và các script tiến độ **không tồn tại ở
> dự án này** — phiên sau đọc nó sẽ đi tick sổ vào file không có thật. Nếu bạn thấy file này
> nhắc tới thứ gì không tồn tại trong cây thư mục, đó là dấu hiệu nó lại bị chép đè: sửa
> ngay, đừng làm theo.

## Đặc điểm dự án — đọc trước khi áp bất kỳ luật nào

- **ĐƠN KHỐI, không có `modules/`.** Rule module-boundaries chỉ áp dụng rule 4 (hằng số đọc
  từ `config/`) và rule 5 (migration).
- **`PLAN.md` ở gốc là NGUỒN LỘ TRÌNH DUY NHẤT.** Không có thư mục `Plan/`, không có file
  tiến độ máy sinh, không có script sinh tiến độ. Tiến độ = số ô đã tick
  trong `PLAN.md`.
- **Đủ 8 handle** `B1`→`B6` + `reset_db` trong `.claude/commands/`.
- **3 sub-agent** trong `.claude/agents/`: `researcher`, `code-reviewer`, `qa-tester`.

## Bộ handle giai đoạn

`/B1_y_tuong` bàn + phản biện (Plan Mode, KHÔNG code) → `/B2_lo_trinh` ghi hạng mục vào
`PLAN.md` chờ DUYỆT → `/B3_thi_cong` code theo GÓI trên LOCAL → `/B4_nghiem_thu` đòi bằng
chứng → `/B5_luu_code` commit + push → `/B6_trien_khai` cấu hình hạ tầng + `/B6_xuat_ban`
đưa lên môi trường thật. `/reset_db` khi cần làm sạch dữ liệu test.
Mở/đóng phiên dùng `/mo_session` · `/dong_session` (bản TOÀN CỤC, không chép vào dự án).

## Plan Mode — bắt buộc khi

- Feature mới, task phức tạp, đụng ≥ 3 file, thay đổi schema/migration.
- Trình plan → chờ người dùng duyệt → mới thực hiện. Không "vừa plan vừa code".

## Thi công theo GÓI (cắm máy)

Plan đã duyệt = duyệt CẢ GÓI. Người dùng rời máy được; máy réo khi thật sự cần người.

- Tự chạy liền các hạng mục TRONG plan; **mỗi hạng mục xong phải lint/test XANH mới đi
  tiếp** — test xanh thay cho người duyệt từng bước.
- Tick checkbox trong `PLAN.md` + báo cáo 3 dòng mỗi mục (đã làm / kiểm chứng / tiếp theo)
  nhưng **KHÔNG dừng chờ**; báo cáo tổng hợp cuối gói.
- **DỪNG BẮT BUỘC chờ duyệt khi:** commit/push GitHub · deploy · migration production ·
  ghi/xóa/vô hiệu hóa DỮ LIỆU THẬT · **cài đặt hoặc thay đổi cấu hình trên MÁY CHỦ đang
  chạy** (ngoài thư mục dự án) · việc phát sinh NGOÀI phạm vi plan.
- **Thiếu key/env/dịch vụ ngoài → GOM, đừng dừng:** ghi vào mục "CHỜ NGOÀI" trong TRẠNG
  THÁI của `CLAUDE.md` kèm rõ *cần gì, để làm gì*, rồi chuyển sang hạng mục khác. Chỉ dừng
  khi TẤT CẢ hạng mục còn lại đều bị chặn — khi đó in danh sách "cần gì để mở khóa".
- Việc chạy dài (build, e2e, quét lớn) → chạy nền, làm tiếp hạng mục khác rồi quay lại.
- Script vặt viết bằng `node` (đã pre-approve), **KHÔNG dùng `python3`**.

## Khuôn hạng mục trong PLAN.md — 5 dòng

Mỗi hạng mục bắt buộc đủ:

```
- [ ] 🔴 **2.1 — Tên hạng mục**
  - (a) làm gì — cụ thể tới tên file, tên lệnh
  - (b) người dùng kiểm chứng bằng THAO TÁC nào (phải bấm được, không phải "đã viết xong")
  - (c) test tự động nào chứng minh — ghi tên file test và điều nó khẳng định
  - (d) ước lượng thời gian
  - (e) chặn: MÁY | NGƯỜI | NGOÀI — kèm lý do một dòng
```

`🔴` = rủi ro cao, **cố tình xếp SỚM**, không để cuối.

**Dòng `(e)` dùng đúng ba nhãn, không tự chế thêm:**

- **`MÁY`** — không có gì chặn, giao là làm được ngay hôm nay.
- **`NGƯỜI`** — chờ quyết định · chờ một cái TÊN · chờ quyền truy cập · nghiệm thu phải
  dùng thật.
- **`NGOÀI`** — chờ mua / mở tài khoản / bên thứ ba (token, tên miền, tài khoản Cloudflare).

🔴 **Nhãn nói CÁI GÌ ĐANG CHẶN, không nói việc đó có phải code hay không.** Một hạng mục
code thuần nhưng đang chờ tài khoản Cloudflare thì nhãn là `NGOÀI`.

**Khi đóng một hạng mục:** tick `[x]` và **xóa dòng `(e)`** — xong rồi thì không còn gì chặn.

## Luật tick

Chỉ tick ✅ khi **(b) đã bấm thật** và **(c) đã xanh**. Cấm tick theo cảm giác. Hạng mục dở
ghi `(dở — dừng ở: ...)`.

## Verification Loop

- Sau mỗi thay đổi có ý nghĩa: chạy `npm test` / `npm run lint` / `npm run build` thật.
- KHÔNG xác nhận "đã xong" khi chưa có bằng chứng lệnh chạy pass.
- Test fail → hỏi root cause trước (code mới sai / test lỗi thời / fixture / environment /
  dependency), không xóa test vội.

## Ba cửa riêng của dự án này — kiểm trước khi tick bất kỳ hạng mục nào đụng tới chúng

1. **Không `service_role` ở collector.** Mỗi máy một token riêng, ghi qua RPC, RLS chặn
   phần còn lại. Có test khẳng định token máy A không ghi được cho máy B.
2. **Không lưu dữ liệu cá nhân.** Tiến trình chỉ lưu TÊN (cắt tham số dòng lệnh); URL cắt
   hoặc băm query string; **không chụp màn hình trang lỗi**. Nghị định 13/2023/NĐ-CP —
   BRD §8.1.
3. **Ba trần của gói miễn phí** (`.claude/rules/tech-defaults.md`): phép nặng nằm trong
   Postgres · trình duyệt chỉ đọc bảng gộp · bundle dưới 3 MB nén.

## Session Handoff

| Thời điểm | Việc phải làm |
| --------- | ------------- |
| Mở session | `/mo_session` — đọc `CLAUDE.md` + `PLAN.md` → báo trạng thái, bước tiếp theo |
| Session lớn | Vào Plan Mode lên kế hoạch phiên, chốt thứ tự ưu tiên |
| Context | Auto-compact tự lo; phiên dài thì chủ động `/compact` ở mốc nghỉ giữa 2 hạng mục — giữ lại: kiến trúc/schema/danh sách file/quyết định. Mở lại phiên: `claude --continue` |
| Đóng session | `/dong_session` — tick `PLAN.md`, cập nhật TRẠNG THÁI/QUYẾT ĐỊNH/CẢNH BÁO của `CLAUDE.md`, tắt tài nguyên |

## Sub-agents

- Dùng cho việc "đào bới": đọc nhiều file, log dài, nghiên cứu phương án, review kiến trúc.
- Main session chỉ nhận kết luận theo khung: Objective / Files inspected / Key findings /
  Risks / Recommendation / Next steps.
- KHÔNG dùng subagent cho việc sửa 1 dòng.

## Git

- **Commit/push: luôn hỏi trước** (theo `.claude/settings.json`).
- Stage theo ĐƯỜNG DẪN, hạn chế `git add -A`.
- Hook `.githooks/pre-commit` chạy gitleaks fail-closed. Kẹt thật một lần:
  `CHO_QUA_GITLEAKS=1 git commit …` (grep được trong lịch sử, khác `--no-verify` vô danh).
- Merge conflict: giải thích ý nghĩa nghiệp vụ hai bên trước, sửa sau khi duyệt.
- Dự án một người, một luồng — **chưa cần worktree song song**. Khi nào cần dev song song
  thì bổ sung luật vào đây, đừng áp luật của dự án khác.
