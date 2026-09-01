import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Giám sát hệ thống",
  description: "Theo dõi máy chủ và cảnh báo sớm",
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <div className="bao">{children}</div>
      </body>
    </html>
  );
}
