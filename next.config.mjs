/** @type {import('next').NextConfig} */
export default {
  // PGlite là gói WebAssembly chạy phía máy chủ — không được đóng gói vào bundle trình
  // duyệt, vừa vô nghĩa vừa thổi bay trần 3 MB nén của Cloudflare Workers Free.
  serverExternalPackages: ["@electric-sql/pglite"],
};
