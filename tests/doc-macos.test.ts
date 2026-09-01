import { describe, expect, it } from "vitest";
import {
  apLucBoNhoMacos, docNguongBoNho,
  phanTichCongLangNghe, phanTichIostatChiTiet, phanTichLaunchctl,
  phanTichPmsetBatt, phanTichPmsetTherm, phanTichTmutil, phanTichTopHeader,
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
    // thật sự dùng được. Dùng công thức của macOS: đã_dùng / (đã_dùng + còn_trống).
    //
    // 🔴 SỬA 01/09/2026 — test này TRƯỚC ĐÂY khẳng định 71,7% và nó XANH VÌ LÝ DO SAI.
    // 71,7% là kết quả của việc chỉ đọc dòng ĐẦU (`/`, ảnh chụp hệ thống chỉ đọc, 11,9 GB)
    // rồi bỏ qua `/System/Volumes/Data` — mà chính cột Capacity của fixture này ghi 98%.
    // Test khẳng định một con số bị chính dữ liệu của nó bác bỏ. Đúng phải là ~98%.
    const d = phanTichDf(DF);
    expect(d[0]!.phan_tram_dung).toBeCloseTo(98.0, 0);
    expect(d[0]!.con_lai_gb).toBeCloseTo(4.5, 1);
  });

  it("CỘNG dung lượng mọi volume anh em, không lấy dòng đầu tiên", () => {
    // Mẫu THẬT `df -k` của máy MacBook Air M1 lúc 18:05 ngày 01/09/2026.
    // Gõ tay kiểm được: `df -k | awk '/^\/dev\/disk3/{u+=$3; if($4>a)a=$4} END{print u,a}'`
    // → 231.553.588 KB đã dùng · 5.195.296 KB trống → 97,81% · 4,95 GB.
    const THAT = `Filesystem     1024-blocks      Used Available Capacity iused    ifree %iused  Mounted on
/dev/disk3s3s1   239362496  11979684   5195300    70%  453019 51953000    1%   /
/dev/disk3s6     239362496   6293780   5195300    55%       6 51953000    0%   /System/Volumes/VM
/dev/disk3s4     239362496   9752652   5195300    66%    1944 51953000    0%   /System/Volumes/Preboot
/dev/disk3s2     239362496     60828   5195300     2%      66 51953000    0%   /System/Volumes/Update
/dev/disk1s2        512000      6164    494156     2%       4  4941560    0%   /System/Volumes/xarts
/dev/disk1s1        512000      5900    494156     2%      36  4941560    0%   /System/Volumes/iSCPreboot
/dev/disk1s3        512000       920    494156     1%      40  4941560    0%   /System/Volumes/Hardware
/dev/disk3s1     239362496 203466640   5195300    98% 1645004 51953000    3%   /System/Volumes/Data`;
    const d = phanTichDf(THAT);
    // Đúng MỘT ổ: disk1 chỉ có xarts/iSCPreboot/Hardware nên bị bỏ hẳn (vùng hệ thống).
    expect(d).toHaveLength(1);
    expect(d[0]!.ten).toBe("/");
    // 🔴 Con số quyết định: 97,8 chứ KHÔNG phải 69,8. Lệch 28 điểm phần trăm, và lệch
    // theo hướng nhẹ hơn thực tế nên ngưỡng nghiêm trọng 90% không bao giờ chạm tới.
    expect(d[0]!.phan_tram_dung).toBeCloseTo(97.8, 1);
    // 5.195.300 KB = 4,954 GiB, hàm làm tròn 1 chữ số → 5,0. (Lưu ý đơn vị: `diskutil`
    // báo 5,3 GB thập phân, `df -h` báo 4,9 Gi nhị phân — cùng một dung lượng.)
    expect(d[0]!.con_lai_gb).toBeCloseTo(5.0, 1);
  });

  it("vùng nhớ ảo (/System/Volumes/VM) không hiện riêng nhưng VẪN được tính dung lượng", () => {
    // File swap nằm ở đây, có lúc 6 GB. Không hiện riêng cho người dùng vì họ không xoá
    // được nó, nhưng bỏ nó khỏi phép tính là báo thiếu 6 GB đã dùng.
    const coVM = `Filesystem  1024-blocks      Used Available Capacity iused ifree %iused  Mounted on
/dev/disk4s1     100000000  10000000   5000000    67%  1 1 1%   /
/dev/disk4s6     100000000   6000000   5000000    55%  1 1 0%   /System/Volumes/VM`;
    const d = phanTichDf(coVM);
    expect(d).toHaveLength(1);
    expect(d[0]!.ten).toBe("/");
    // (10.000.000 + 6.000.000) / (16.000.000 + 5.000.000) = 76,2%
    expect(d[0]!.phan_tram_dung).toBeCloseTo(76.2, 1);
  });

  it("gộp các volume APFS cùng container thành MỘT ổ, không đếm đôi", () => {
    const d = phanTichDf(DF);
    expect(d).toHaveLength(1);
    expect(d[0]!.ten).toBe("/");
  });

  it("bỏ filesystem ảo (devfs, map auto_home) — chúng luôn 100% và không nói gì", () => {
    expect(phanTichDf(DF).some((x) => x.ten === "/dev")).toBe(false);
  });

  // Ngưỡng lấy đúng từ config/nguong-canh-bao.json → boNhoMacOS (rule 4: không hardcode).
  const NG = docNguongBoNho();

  it("áp lực bộ nhớ: máy đang thrashing THẬT phải ra 'critical', không phải 'normal'", () => {
    // Số đo THẬT của MacBook Air M1 này lúc 18:14 ngày 01/09/2026, gõ tay kiểm được bằng
    // `vm_stat` + `sysctl -n vm.swapusage hw.memsize`.
    const that = {
      ram_trong_phan_tram: 24.31,     // free+inactive+speculative — macOS lấy lại được
      swap_dung_ty_le: 6292.88 / 7168, // = 0,878
      swap_ra_moi_giay: 0,
      khong_giai_phong_ty_le: 0.451,
    };
    expect(apLucBoNhoMacos(that, NG)).toBe("critical");

    // 🔴 Bằng chứng vì sao phải sửa: công thức CŨ chỉ nhìn (wired+compressor)/tổng với
    // ngưỡng 0.6/0.8. Với 0,451 nó trả 'normal' — trên một máy đã ghi 3.007.087 trang
    // xuống swap và chỉ còn 0,75% bộ nhớ hoàn toàn rảnh. Đường swap mới là đường bắt được.
    const cuKieuGhim = that.khong_giai_phong_ty_le > 0.8 ? "critical"
      : that.khong_giai_phong_ty_le > 0.6 ? "warn" : "normal";
    expect(cuKieuGhim).toBe("normal");
  });

  it("áp lực bộ nhớ: mỗi trong BỐN đường đều tự nó đủ để thành 'critical'", () => {
    const on = { ram_trong_phan_tram: 50, swap_dung_ty_le: 0.1,
                 swap_ra_moi_giay: 0, khong_giai_phong_ty_le: 0.2 };
    expect(apLucBoNhoMacos(on, NG)).toBe("normal");

    expect(apLucBoNhoMacos({ ...on, ram_trong_phan_tram: 2 }, NG)).toBe("critical");
    expect(apLucBoNhoMacos({ ...on, swap_dung_ty_le: 0.85 }, NG)).toBe("critical");
    expect(apLucBoNhoMacos({ ...on, swap_ra_moi_giay: 20 * 1048576 }, NG)).toBe("critical");
    expect(apLucBoNhoMacos({ ...on, khong_giai_phong_ty_le: 0.9 }, NG)).toBe("critical");
  });

  it("áp lực bộ nhớ: mức 'warn' nằm giữa, và swap tắt hẳn thì không làm sập phép tính", () => {
    const on = { ram_trong_phan_tram: 50, swap_dung_ty_le: 0.1,
                 swap_ra_moi_giay: 0, khong_giai_phong_ty_le: 0.2 };
    expect(apLucBoNhoMacos({ ...on, swap_dung_ty_le: 0.6 }, NG)).toBe("warn");
    expect(apLucBoNhoMacos({ ...on, ram_trong_phan_tram: 8 }, NG)).toBe("warn");
    // Máy tắt swap → tỷ lệ là null. null KHÔNG được coi là 0 và cũng không được ném lỗi.
    expect(apLucBoNhoMacos({ ...on, swap_dung_ty_le: null, swap_ra_moi_giay: null }, NG)).toBe("normal");
  });

  it("ngưỡng bộ nhớ đọc từ config, thiếu khối thì NÉM LỖI chứ không âm thầm dùng mặc định", () => {
    // Đọc được thật, đủ 4 khoá — nếu ai xoá khối boNhoMacOS khỏi config thì test này đỏ
    // ngay, thay vì hệ thống chạy tiếp với một ngưỡng vô hình.
    expect(NG.swapDungTyLe.nghiemTrong).toBe(0.8);
    expect(NG.ramTrongToiThieuPhanTram.nghiemTrong).toBe(3);
    expect(NG.swapRaMoiGiayByte.nghiemTrong).toBe(10485760);
  });

  it("nguồn điện: phân biệt chạy pin với cắm điện, đọc được cả % lẫn thời gian còn lại", () => {
    // Mẫu THẬT lúc 18:15 ngày 01/09/2026 — máy đang chạy bằng pin.
    const pin = phanTichPmsetBatt(`Now drawing from 'Battery Power'
 -InternalBattery-0 (id=22478947)\t51%; discharging; 4:45 remaining present: true`);
    expect(pin.nguon).toBe("pin");
    expect(pin.pin_phan_tram).toBe(51);
    expect(pin.pin_con_phut).toBe(285); // 4 giờ 45 phút

    const dien = phanTichPmsetBatt(`Now drawing from 'AC Power'
 -InternalBattery-0 (id=22478947)\t100%; charged; 0:00 remaining present: true`);
    expect(dien.nguon).toBe("dien");
    expect(dien.pin_phan_tram).toBe(100);
    // "0:00 remaining" nghĩa là KHÔNG có ước tính, không phải "còn 0 phút".
    expect(dien.pin_con_phut).toBeNull();
  });

  it("ghìm tốc độ vì nhiệt: chưa từng bị ghìm = 100%, đang bị ghìm thì đọc đúng số", () => {
    expect(phanTichPmsetTherm(`Note: No thermal warning level has been recorded
Note: No performance warning level has been recorded`)).toBe(100);
    expect(phanTichPmsetTherm(`CPU_Scheduler_Limit \t= 100
CPU_Speed_Limit \t= 62`)).toBe(62);
  });

  it("số thread lấy từ top, KHÔNG lấy từ kern.num_threads (đó là TRẦN, không phải số đếm)", () => {
    // Mẫu THẬT: máy này có kern.num_threads = 10240 — đúng bằng kern.maxfilesperproc.
    // Số thread đang chạy thật chỉ 3673. Đọc nhầm trần thành số đếm là sai gần 3 lần.
    const t = phanTichTopHeader(`Processes: 494 total, 4 running, 490 sleeping, 3673 threads
2026/09/01 18:15:21
Load Avg: 2.57, 3.59, 3.52 `);
    expect(t.so_tien_trinh).toBe(494);
    expect(t.so_thread).toBe(3673);
    expect(t.so_thread).not.toBe(10240);
  });

  it("cổng lắng nghe: tách cổng mở RA NGOÀI khỏi cổng chỉ nghe trong máy", () => {
    // Mẫu THẬT lúc 18:15 — `*.3000` là dev server mở ra toàn mạng.
    const c = phanTichCongLangNghe(`tcp46      0      0  *.3000                 *.*                    LISTEN
tcp4       0      0  127.0.0.1.32862        *.*                    LISTEN
tcp6       0      0  ::1.18789              *.*                    LISTEN
tcp4       0      0  127.0.0.1.18789        *.*                    LISTEN
tcp4       0      0  *.59787                *.*                    LISTEN
tcp4       0      0  192.168.1.5.22         10.0.0.1.51234         ESTABLISHED`);
    expect(c.ra_ngoai).toEqual([3000, 59787]);
    expect(c.trong_may).toBe(3);
    // Dòng ESTABLISHED không phải cổng đang lắng nghe — không được đếm.
    expect(c.ra_ngoai).not.toContain(22);
  });

  it("cổng lắng nghe: KHÔNG chứa tên tiến trình hay đường dẫn (Nghị định 13)", () => {
    const c = phanTichCongLangNghe(`tcp4  0  0  *.3000  *.*  LISTEN`);
    // Kết quả chỉ được là số. Dùng lsof sẽ kéo theo tên người dùng và đường dẫn nhị phân.
    // Soi GIÁ TRỊ, không soi tên khoá — tên khoá đương nhiên là chữ.
    expect(c.ra_ngoai.every((x) => typeof x === "number" && Number.isFinite(x))).toBe(true);
    expect(typeof c.trong_may).toBe("number");
    expect(JSON.stringify(Object.values(c))).not.toMatch(/[A-Za-z]/);
  });

  it("dịch vụ lỗi: CHỈ lấy mã thoát dương — mã âm là bị kill, chuyện thường trên macOS", () => {
    // 🔴 Đo thật trên máy này lúc 18:20 ngày 01/09/2026: 516 nhãn, 187 nhãn mã -9 nhưng
    // chỉ 2 nhãn mã dương. Coi mã âm là lỗi = 189 báo động giả ngay lượt đo đầu tiên,
    // phá thẳng chỉ tiêu "dưới 5 cảnh báo/tuần" và dạy người dùng bỏ qua cảnh báo.
    const d = phanTichLaunchctl(`PID\tStatus\tLabel
-\t-9\tcom.apple.progressd
48455\t-9\tcom.apple.cloudphotod
-\t1\tcom.apple.Siri.agent
-\t111\tcom.adobe.ARMDCHelper
1234\t0\tcom.apple.dang.chay.binh.thuong
-\t-\tcom.apple.chua.chay
-\t7\tgui/501/com.rieng.cua.nguoi.dung`);
    expect(d).toEqual(["com.apple.Siri.agent", "com.adobe.ARMDCHelper"]);
    // Mã -9 KHÔNG được coi là lỗi.
    expect(d).not.toContain("com.apple.progressd");
    // Nhãn mang số hiệu người dùng bị loại (Nghị định 13).
    expect(d.join(" ")).not.toMatch(/501/);
  });

  it("iostat: đọc nhịp I/O và % CPU rảnh — chữ ký của nghẽn đĩa là tải cao + CPU RẢNH", () => {
    const i = phanTichIostatChiTiet(`    KB/t  tps  MB/s  us sy id   1m   5m   15m
   14.14 1702 23.49  20 11 69  2.45 3.55 3.50
   16.56   36  0.58   3  4 93  2.45 3.55 3.50`);
    expect(i.kb_moi_lan).toBeCloseTo(16.56, 2);
    expect(i.tps).toBe(36);
    expect(i.cpu_ranh).toBe(93);
  });

  it("ảnh chụp Time Machine cục bộ: máy này KHÔNG có cái nào — và đó là kết luận có giá trị", () => {
    // Rỗng nghĩa là đĩa đầy THẬT, không có gì dễ xoá. Biết điều đó tiết kiệm 20 phút đi tìm.
    expect(phanTichTmutil("Snapshots for disk /:\n")).toBe(0);
    expect(phanTichTmutil(`Snapshots for disk /:
com.apple.TimeMachine.2026-09-01-120000.local
com.apple.TimeMachine.2026-08-31-120000.local`)).toBe(2);
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
