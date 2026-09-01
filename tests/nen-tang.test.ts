import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

// Điều kiện CẦN cho toàn bộ test SQL của GĐ2–3: chạy được Postgres thật trong Node,
// không cần Docker, không cần tài khoản Supabase. Test này hỏng thì mọi test SQL sau
// đều vô nghĩa, nên nó phải là test đầu tiên.
describe("nền tảng test", () => {
  it("PGlite khởi động và chạy được câu truy vấn", async () => {
    const db = new PGlite();
    const ket_qua = await db.query<{ mot: number }>("SELECT 1 AS mot");
    expect(ket_qua.rows[0]?.mot).toBe(1);
    await db.close();
  });

  it("PGlite là Postgres thật — có phiên bản và hỗ trợ kiểu jsonb", async () => {
    const db = new PGlite();
    const v = await db.query<{ version: string }>("SELECT version()");
    expect(v.rows[0]?.version).toMatch(/PostgreSQL/);

    await db.exec(`CREATE TABLE thu (id int, du_lieu jsonb);
                   INSERT INTO thu VALUES (1, '{"cpu": 91.5}');`);
    const j = await db.query<{ cpu: number }>(
      `SELECT (du_lieu->>'cpu')::float8 AS cpu FROM thu WHERE id = 1`,
    );
    expect(j.rows[0]?.cpu).toBe(91.5);
    await db.close();
  });
});
