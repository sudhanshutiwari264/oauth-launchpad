import type { Metadata } from "next";
import { Caveat } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

// Used only for the small hand-written-style annotation in the homepage
// hero illustration - everything else uses the system font stack.
const caveat = Caveat({ subsets: ["latin"], variable: "--font-caveat" });

export const metadata: Metadata = {
  title: "OAuth Launchpad",
  description: "Find OAuth setup guides for any app",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={caveat.variable}>
      <body className="flex min-h-screen flex-col">
        <Header />
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
