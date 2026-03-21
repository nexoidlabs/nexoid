import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { WalletButton } from "./wallet-button";
import { ThemeToggle } from "./theme-toggle";
import { NetworkSelector } from "./network-selector";
import { Sidebar } from "./sidebar";

export const metadata: Metadata = {
  title: "Nexoid Admin",
  description: "Identity & Delegation Registry Management",
};

// Blocking script to apply theme before first paint — prevents flash
const themeScript = `
(function() {
  try {
    var t = localStorage.getItem('nexoid-theme');
    if (t === 'light' || t === 'dark') {
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch(e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>
          <div className="app-shell">
            <Sidebar />
            <div className="main-content">
              <header className="topbar">
                <div className="topbar-left">
                  <div>
                    <h1>Admin Console</h1>
                    <div className="breadcrumb">Identity & Delegation Registry</div>
                  </div>
                </div>
                <div className="topbar-right">
                  <ThemeToggle />
                  <NetworkSelector />
                  <WalletButton />
                </div>
              </header>
              <div className="page-content">
                {children}
              </div>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
