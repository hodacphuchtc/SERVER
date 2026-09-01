# GHI CHÚ — Thư mục skill riêng của dự án

Thư mục này dành cho skill GẮN CHẶT với nghiệp vụ/schema/quy ước của ĐÚNG dự án này
(vd: sinh CRUD theo schema riêng, ma trận phân quyền riêng, mẫu báo cáo riêng).

**Luật (từ CLAUDE.md toàn cục — đọc trước khi tạo skill mới ở đây):**

1. Kiểm tra `~/.claude/skills/` trước: `ls ~/.claude/skills/`.
2. Đã có skill cùng tên hoặc cùng mục đích ở toàn cục → KHÔNG tạo bản trong dự án —
   dùng thẳng bản toàn cục.
3. Cần sửa hành vi skill toàn cục → sửa bản toàn cục, không rẽ nhánh bản riêng.
4. CẤM chép nguyên bộ skill bên thứ ba vào dự án — cài một lần ở toàn cục.

Vì sao: bản trùng khiến mô tả skill bị nạp HAI lần mỗi session (tốn context vô ích) và
tạo hai phiên bản lệch nhau — sửa một bên thì bên kia âm thầm cũ đi.
