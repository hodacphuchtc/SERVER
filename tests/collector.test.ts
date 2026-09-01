import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { Collector, type CauHinhCollector, type GuiHttp } from "../collector/collector.js";
import { napMigration, taoPartitionNgay } from "../src/db/nap-migration.js";

const doc = (ten: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${ten}`, import.meta.url)), "utf8");

const T0 = new Date("2026-09-01T10:00:00Z");
const phut = (n: number) => new Date(T0.getTime() + n * 60_000);

const CAU_HINH: CauHinhCollector = {
  url_ghi_metric: "https://vi-du.supabase.co/rest/v1/rpc/ghi_metric",
  may: [
    { ten_nghiep_vu: "máy chủ kế toán", he_dieu_hanh: "windows",
      url_exporter: "http://10.0.0.11:9182/metrics", token: "token-ke-toan-0123456789abcdefghij" },
    { ten_nghiep_vu: "máy chủ thiết kế", he_dieu_hanh: "macos",
      url_exporter: "http://10.0.0.12:9100/metrics", token: "token-thiet-ke-0123456789abcdefghij" },
  ],
};

/** Exporter giả: nhịp đầu trả file "trước", các nhịp sau trả file "sau". */
function taoLayMetric(hong: Set<string> = new Set()) {
  const lan = new Map<string, number>();
  return async (url: string) => {
    if (hong.has(url)) throw new Error("ECONNREFUSED");
    const n = (lan.get(url) ?? 0) + 1;
    lan.set(url, n);
    const win = url.includes("9182");
    if (n === 1) return doc(win ? "windows-exporter.txt" : "node-exporter-darwin.txt");
    return doc(win ? "windows-exporter-sau.txt" : "node-exporter-darwin-sau.txt");
  };
}

function taoGuiHttp(kichBan: () => { ok: boolean; trang_thai: number } | Error) {
  const daGui: Array<{ url: string; than: any }> = [];
  const gui: GuiHttp = async (url, than) => {
    const kq = kichBan();
    if (kq instanceof Error) throw kq;
    if (kq.ok) daGui.push({ url, than });
    return kq;
  };
  return { gui, daGui };
}

const OK = () => ({ ok: true, trang_thai: 200 });

describe("collector — quét, gộp, đẩy", () => {
  it("nhịp ĐẦU TIÊN không đẩy gì: chưa có mốc so sánh để tính hiệu số", async () => {
    const { gui, daGui } = taoGuiHttp(OK);
    const c = new Collector(CAU_HINH, taoLayMetric(), gui);
    const r = await c.chayMotNhip(T0);
    expect(r.da_gui).toBe(0);
    expect(daGui).toHaveLength(0);
  });

  it("nhịp thứ hai đẩy ĐÚNG 1 request cho mỗi máy — không phải 40 request từng chỉ số", async () => {
    const { gui, daGui } = taoGuiHttp(OK);
    const c = new Collector(CAU_HINH, taoLayMetric(), gui);
    await c.chayMotNhip(T0);
    const r = await c.chayMotNhip(phut(1));

    expect(r.da_gui).toBe(2);
    expect(daGui).toHaveLength(2);
    // Một dòng RỘNG mang cả chục chỉ số trong một request (ADR-002).
    const than = daGui[0]!.than.p_so_lieu;
    expect(than).toHaveProperty("cpu_phan_tram");
    expect(than).toHaveProperty("ram_phan_tram");
    expect(than).toHaveProperty("dia");
    expect(than).toHaveProperty("thoi_diem");
  });

  it("gửi kèm token của ĐÚNG máy đó, không dùng chung một khóa", async () => {
    const { gui, daGui } = taoGuiHttp(OK);
    const c = new Collector(CAU_HINH, taoLayMetric(), gui);
    await c.chayMotNhip(T0);
    await c.chayMotNhip(phut(1));
    const token = daGui.map((x) => x.than.p_token);
    expect(token).toEqual([
      "token-ke-toan-0123456789abcdefghij",
      "token-thiet-ke-0123456789abcdefghij",
    ]);
    // Không có dấu vết nào của khóa toàn quyền.
    expect(JSON.stringify(daGui)).not.toMatch(/service_role/);
  });

  it("dùng đúng bộ chuyển đổi theo hệ điều hành", async () => {
    const { gui, daGui } = taoGuiHttp(OK);
    const c = new Collector(CAU_HINH, taoLayMetric(), gui);
    await c.chayMotNhip(T0);
    await c.chayMotNhip(phut(1));

    const win = daGui[0]!.than.p_so_lieu;
    const mac = daGui[1]!.than.p_so_lieu;
    expect(win.tai_trung_binh_15p).toBeNull();      // Windows không có load average
    expect(mac.tai_trung_binh_15p).toBeCloseTo(2.1); // macOS có
    expect(mac.ap_luc_bo_nho).not.toBeNull();        // chỉ macOS có áp lực bộ nhớ
    expect(win.ap_luc_bo_nho).toBeNull();
  });

  it("một máy chết KHÔNG làm sập cả nhịp — máy còn lại vẫn được đẩy", async () => {
    const { gui, daGui } = taoGuiHttp(OK);
    const c = new Collector(CAU_HINH, taoLayMetric(new Set(["http://10.0.0.11:9182/metrics"])), gui);
    await c.chayMotNhip(T0);
    const r = await c.chayMotNhip(phut(1));

    expect(r.loi).toHaveLength(1);
    expect(r.loi[0]!.may).toBe("máy chủ kế toán");
    expect(daGui).toHaveLength(1); // máy Mac vẫn đi
  });
});

describe("collector — hàng đợi khi mất mạng", () => {
  it("mất mạng 5 nhịp rồi có lại: đẩy bù đủ, KHÔNG mất dữ liệu", async () => {
    let mangHong = false;
    const { gui, daGui } = taoGuiHttp(() =>
      mangHong ? new Error("ENETUNREACH") : { ok: true, trang_thai: 200 });
    const c = new Collector(CAU_HINH, taoLayMetric(), gui);

    await c.chayMotNhip(T0);          // nhịp mồi
    mangHong = true;
    for (let i = 1; i <= 5; i++) await c.chayMotNhip(phut(i));
    expect(c.soTrongHangDoi).toBe(10); // 5 nhịp × 2 máy
    expect(daGui).toHaveLength(0);

    mangHong = false;
    const r = await c.chayMotNhip(phut(6));
    expect(r.da_gui).toBe(12);         // 10 tồn đọng + 2 của nhịp này
    expect(c.soTrongHangDoi).toBe(0);
  });

  it("hàng đợi có TRẦN: mất mạng qua đêm không ăn hết RAM máy chủ", async () => {
    const { gui } = taoGuiHttp(() => new Error("ENETUNREACH"));
    const c = new Collector({ ...CAU_HINH, toi_da_hang_doi: 6 }, taoLayMetric(), gui);
    await c.chayMotNhip(T0);
    for (let i = 1; i <= 50; i++) await c.chayMotNhip(phut(i));
    expect(c.soTrongHangDoi).toBe(6);
  });

  it("khi tràn thì BỎ BẢN CŨ NHẤT, giữ lại diễn biến gần nhất", async () => {
    let mangHong = true;
    const { gui, daGui } = taoGuiHttp(() =>
      mangHong ? new Error("ENETUNREACH") : { ok: true, trang_thai: 200 });
    const c = new Collector({ ...CAU_HINH, toi_da_hang_doi: 2 }, taoLayMetric(), gui);
    await c.chayMotNhip(T0);
    for (let i = 1; i <= 5; i++) await c.chayMotNhip(phut(i));

    mangHong = false;
    await c.chayMotNhip(phut(6));
    const moc = daGui.map((x) => x.than.p_so_lieu.thoi_diem);
    // Hai bản còn lại phải là của nhịp 5, không phải nhịp 1.
    expect(moc[0]).toBe(phut(5).toISOString());
    expect(moc).not.toContain(phut(1).toISOString());
  });

  it("lỗi 500 thì GIỮ LẠI thử sau; lỗi 401 thì BỎ, không nghẽn dữ liệu tốt phía sau", async () => {
    const ma: number[] = [500, 401];
    let i = 0;
    const { gui } = taoGuiHttp(() => {
      const m = ma[Math.min(i++, ma.length - 1)]!;
      return { ok: false, trang_thai: m };
    });
    const c = new Collector(CAU_HINH, taoLayMetric(), gui);
    await c.chayMotNhip(T0);

    const r1 = await c.chayMotNhip(phut(1));
    expect(r1.hang_doi_hien_tai).toBe(2); // 500 → giữ cả hai

    const r2 = await c.chayMotNhip(phut(2));
    expect(r2.loi.some((x) => /bị từ chối, mã 401/.test(x.ly_do))).toBe(true);
    expect(c.soTrongHangDoi).toBe(0);     // 401 → bỏ, không giữ mãi
  });
});

describe("collector — dữ liệu đẩy lên được DB thật chấp nhận", () => {
  let db: PGlite;

  beforeEach(async () => {
    db = new PGlite();
    await napMigration(db);
    await taoPartitionNgay(db, T0);
    for (const m of CAU_HINH.may) {
      await db.query(
        `insert into public.hosts (ten_nghiep_vu, he_dieu_hanh, token_bam)
         values ($1, $2, encode(sha256(convert_to($3,'utf8')),'hex'))`,
        [m.ten_nghiep_vu, m.he_dieu_hanh, m.token],
      );
    }
  });

  it("payload của collector đi lọt ghi_metric và qua được mọi ràng buộc của schema", async () => {
    // Đây là phép kiểm nối hai đầu: bộ chuyển đổi sinh ra đúng thứ mà schema chấp nhận.
    // Không có nó thì hai bên có thể lệch nhau mà cả hai bộ test đều xanh.
    const gui: GuiHttp = async (_url, than) => {
      const t = than as { p_token: string; p_so_lieu: unknown };
      await db.query(`select public.ghi_metric($1, $2::jsonb)`, [
        t.p_token, JSON.stringify(t.p_so_lieu),
      ]);
      return { ok: true, trang_thai: 200 };
    };
    const c = new Collector(CAU_HINH, taoLayMetric(), gui);
    await c.chayMotNhip(T0);
    await c.chayMotNhip(phut(1));

    const r = await db.query<{ n: number }>(`select count(*)::int as n from public.metrics_raw`);
    expect(r.rows[0]!.n).toBe(2);

    const d = await db.query<{ cpu_phan_tram: number; dia: unknown[] }>(
      `select cpu_phan_tram, dia from public.metrics_raw
        where host_id = (select id from public.hosts where ten_nghiep_vu = 'máy chủ kế toán')`);
    expect(d.rows[0]!.cpu_phan_tram).toBeCloseTo(14.29, 1);
    expect(d.rows[0]!.dia).toHaveLength(2);

    // Và lan_day_du_lieu_cuoi được cập nhật → dead-man's switch có nguồn để soát.
    const h = await db.query<{ n: number }>(
      `select count(*)::int as n from public.hosts where lan_day_du_lieu_cuoi is not null`);
    expect(h.rows[0]!.n).toBe(2);
  });
});
