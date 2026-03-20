import type { Metadata } from "next";
import "./globals.css";
import { ThemeToggle } from "./theme-toggle";

export const metadata: Metadata = {
  title: "Nexoid Verify",
  description: "Identity Explorer & Proof Verifier for Nexoid",
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
        <div className="container">
          <header className="header">
            <div className="header-brand">
              <img src="/nexoid-labs-logo.png" alt="Nexoid Labs" className="header-logo" />
              <div className="subtitle">Verify</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <ThemeToggle />
              <nav className="nav">
                <a href="/">Lookup</a>
                <a href="/verify">Verify Proof</a>
              </nav>
            </div>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
