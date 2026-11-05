import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { BottomNavView, TopNavView } from "@/components/nav/app-nav";
import { BottomNavWithBadges, TopNavWithBadges } from "@/components/nav/nav-with-badges";
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
          <div className="mx-auto flex h-12 max-w-xl items-center justify-between px-4">
            <Link href="/fechamento" className="font-semibold">
              BarberBoard
            </Link>
            {/* A navegação lê o banco (selo de pendentes) e usa usePathname, que suspende em rotas
                dinâmicas: o fallback é o mesmo menu, sem destaque e sem selo. */}
            <Suspense fallback={<TopNavView pathname={null} />}>
              <TopNavWithBadges />
            </Suspense>
          </div>
        </header>
        {/* --bottom-nav-h (globals.css): altura da barra inferior no celular, 0 a partir de 768px */}
        <main className="mx-auto w-full max-w-xl flex-1 px-4 pt-5 pb-[calc(var(--bottom-nav-h)+1.25rem)]">
          {children}
        </main>
        <Suspense fallback={<BottomNavView pathname={null} />}>
          <BottomNavWithBadges />
        </Suspense>
      </body>
    </html>
  );
}
