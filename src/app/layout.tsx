import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BarberBoard",
  description: "Fechamento de caixa e dashboard da barbearia",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <header className="sticky top-0 z-10 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur">
          <nav className="mx-auto flex h-12 max-w-xl items-center justify-between px-4">
            <Link href="/" className="font-semibold">
              BarberBoard
            </Link>
            <Link href="/importar" className="text-sm text-muted-foreground hover:text-foreground">
              Importar
            </Link>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-xl flex-1 px-4 py-5">{children}</main>
      </body>
    </html>
  );
}
