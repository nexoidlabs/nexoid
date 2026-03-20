import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexoid Verify",
  description: "Identity Explorer & Proof Verifier for Nexoid",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="container">
          <header className="header">
            <div>
              <h1>Nexoid Verify</h1>
              <div className="subtitle">Identity Explorer & Proof Verifier</div>
            </div>
            <nav className="nav">
              <a href="/">Lookup</a>
              <a href="/verify">Verify Proof</a>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
