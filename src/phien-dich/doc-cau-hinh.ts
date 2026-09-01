import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CauHinhPhienDich } from "./luat-tuong-quan";

/**
 * Nạp cấu hình lớp phiên dịch từ `config/phien-dich.json`.
 *
 * Dựng đường dẫn bằng `join(process.cwd(), …)`, KHÔNG dùng `new URL(..., import.meta.url)`:
 * webpack của Next thay lớp URL bằng polyfill riêng nên `fileURLToPath` ném
 * ERR_INVALID_ARG_TYPE lúc build. Dự án đã mắc bẫy này hai lần.
 */
const DUONG_DAN = join(process.cwd(), "config", "phien-dich.json");

/**
 * 🔴 KHÔNG có giá trị mặc định dự phòng.
 *
 * Một `?? 0.8` nằm im trong code CHÍNH LÀ một ngưỡng hardcode (vi phạm rule 4), và nó hỏng
 * theo kiểu tệ nhất: hệ thống vẫn chạy, không ai biết ngưỡng đang là con số nào, và sửa
 * config không có tác dụng gì. Thiếu khoá thì ném lỗi nêu đích danh khoá thiếu.
 */
export function docCauHinhPhienDich(): CauHinhPhienDich {
  const cfg = JSON.parse(readFileSync(DUONG_DAN, "utf8")) as Partial<CauHinhPhienDich>;

  const thieu = (["nguongTuongQuan", "tienTrinhTamThoi", "congChoPhepRaNgoai",
                  "luatTuongQuan", "tuGiamSat"] as const).filter((k) => cfg[k] === undefined);
  if (thieu.length) {
    throw new Error(`config/phien-dich.json thiếu khoá: ${thieu.join(", ")}`);
  }

  const canCo = [
    "taiMoiNhan", "cpuRanhToiThieuDeCoiLaNghenIO", "ramTrongToiThieuPhanTram",
    "diaPhanTramCoiLaDay", "vungBoNhoAoChiemGB", "tienTrinhSotCpuToiThieu",
    "tienTrinhSotPhutToiThieu", "soDichVuLoiCanhCao", "pinPhanTramCanhCao",
    "pinConPhutCanhCao", "choTroiChoCapNhatGB", "soThreadTyLeTranCanhCao",
  ] as const;
  const thieuNguong = canCo.filter((k) => typeof cfg.nguongTuongQuan![k] !== "number");
  if (thieuNguong.length) {
    throw new Error(`config/phien-dich.json → nguongTuongQuan thiếu: ${thieuNguong.join(", ")}`);
  }

  return cfg as CauHinhPhienDich;
}
