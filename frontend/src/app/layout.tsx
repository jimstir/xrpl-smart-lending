import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AMLP | AI-Managed Lending Platform",
  description: "AI-Managed Lending Platform on XRPL EVM Sidechain with Native XRP Ledger Multi-Collateral Bridging",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#090d16] text-slate-100 antialiased selection:bg-cyan-500 selection:text-black">
        {children}
      </body>
    </html>
  );
}
