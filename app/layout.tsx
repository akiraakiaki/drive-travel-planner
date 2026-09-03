import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ドライブトラベルプランナー",
  description: "自動車専用。行きたい場所から、実際に成立するドライブ旅程を組み立てる",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen font-body">
        <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-12">
          {children}
        </div>
      </body>
    </html>
  );
}
