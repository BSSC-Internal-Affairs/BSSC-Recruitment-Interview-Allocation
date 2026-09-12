import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "BSSC · Find your interview moment",
  description:
    "Meet the BSSC community. Tell us about yourself and reserve your interview time.",
  icons: {
    icon: { url: "/bssc-logo.png", type: "image/png" },
    apple: "/bssc-logo.png",
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
