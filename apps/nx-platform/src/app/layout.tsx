import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { WalletButton } from "./wallet-button";

export const metadata: Metadata = {
  title: "Nexoid Admin",
  description: "Identity & Delegation Registry Management",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="container">
            <header className="header">
              <div>
                <h1>Nexoid Admin</h1>
                <div className="subtitle">Identity & Delegation Registry</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <nav className="nav" style={{ border: "none", marginBottom: 0 }}>
                  <a href="/">Dashboard</a>
                  <a href="/identities">Identities</a>
                  <a href="/delegations">Delegations</a>
                  <a href="/approvals">Approvals</a>
                  <a href="/wallet">Wallet</a>
                </nav>
                <WalletButton />
              </div>
            </header>
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
