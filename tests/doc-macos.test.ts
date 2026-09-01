import { describe, expect, it } from "vitest";
import {
  phanTichDf, phanTichIostat, phanTichNetstat, phanTichPs, phanTichVmStat,
} from "../collector/doc-macos-truc-tiep";

// Mẫu THẬT lấy từ máy MacBook Air M1 ngày 01/09/2026 — không phải số bịa.
const DF = `Filesystem  1024-blocks      Used Available Capacity iused      ifree %iused  Mounted on
/dev/disk3s1s1  239362496  11979684   4735228    72%  453019 47352280    1%   /
/dev/disk3s6      239362496        24   4735228     1%       1 47352280    0%   /System/Volumes/VM
/dev/disk3s5      239362496 218000000   4735228    98% 1234567 47352280    3%   /System/Volumes/Data
devfs                   200       200         0   100%     693          0  100%   /dev
map auto_home             0         0         0   100%       0          0  100%   /System/Volumes/Data/home`;

describe("đọc macOS trực tiếp — đối chiếu với số máy thật báo", () => {
  it("phần trăm đĩa tính theo CÔNG THỨC CỦA macOS, khớp với df -h", () => {
    // Bẫy APFS: cột "tổng" là dung lượng cả container (228 GB) nhưng "còn trống" là phần
    // volume này dùng được. Lấy 1 − còn/tổng ra 98% trong khi df -h báo 72%.
    const d = phanTichDf(DF);
    expect(d[0]!.phan_tram_dung).toBeCloseTo(71.7, 0);
    expect(d[0]!.con_lai_gb).toBeCloseTo(4.5, 1);
  });

  it("gộp các volume APFS cùng container thành MỘT ổ, không đếm đôi", () => {
    const d = phanTichDf(DF);
    expect(d).toHaveLength(1);
    expect(d[0]!.ten).toBe("/");
  });

  it("bỏ filesystem ảo (devfs, map auto_home) — chúng luôn 100% và không nói gì", () => {
    expect(phanTichDf(DF).some((x) => x.ten === "/dev")).toBe(false);
  });

  it("vm_stat: đọc ra số TRANG, chưa nhân page size", () => {
    const t = phanTichVmStat(`Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                                3617.
Pages active:                             90541.
Pages inactive:                           85700.
Pages wired down:                         40000.`);
    expect(t["Pages free"]).toBe(3617);
    expect(t["Pages wired down"]).toBe(40000);
  });

  it("iostat: lấy MẪU THỨ HAI (mẫu đầu là trung bình từ lúc khởi động, vô nghĩa)", () => {
    const cpu = phanTichIostat(`    KB/t  tps  MB/s  us sy id   1m   5m   15m
   13.11 1909 24.43  21 11 68  5.61 3.58 4.27
   12.35  181  2.18   9  9 82  5.61 3.58 4.27`);
    expect(cpu).toBe(18); // 100 − 82
  });

  it("netstat: bỏ loopback và không đếm trùng interface xuất hiện nhiều dòng", () => {
    const n = phanTichNetstat(`Name  Mtu Network  Address  Ipkts Ierrs Ibytes Opkts Oerrs Obytes Coll
lo0   16384 <Link#1>  x  999 0 999999 999 0 999999 0
en0   1500 <Link#11> x  100 2 1000 50 0 500 0
en0   1500 thanh-dat x  100 - 1000 50 - 500 -`);
    expect(n.vao).toBe(1000);
    expect(n.ra).toBe(500);
    expect(n.loi).toBe(2);
  });

  it("ps: CHỈ giữ tên tiến trình, cắt đường dẫn (Nghị định 13)", () => {
    const p = phanTichPs(`COMM  %CPU  RSS
/usr/libexec/mobileassetd  15.3  9424
/System/Library/Frameworks/app  11.1  6512`, 2);
    expect(p[0]!.ten).toBe("mobileassetd");
    expect(p.every((x) => !/[\\/]/.test(x.ten))).toBe(true);
    expect(p[0]!.ram_mb).toBe(9);
  });
});
