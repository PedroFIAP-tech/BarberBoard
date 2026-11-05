"use client";

// Navegação do app: barra inferior fixa no celular e links no cabeçalho a partir de 768px.
//
// Com cacheComponents, usePathname() suspende em rotas com parâmetro dinâmico (ex.: /importar/[id]).
// Por isso o layout envolve BottomNav/TopNav em <Suspense> usando BottomNavView/TopNavView com
// pathname={null} como fallback: os mesmos links, só sem o destaque da tela atual.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Ellipsis } from "lucide-react";
import { cn } from "@/lib/utils";
import { isActive, visibleNav, type NavItem } from "./nav-items";

/** Selos por destino (ex.: { "/classificar": 12 }). */
export type NavBadges = Record<string, number>;

export function BottomNav({ badges }: { badges?: NavBadges }) {
  return <BottomNavView pathname={usePathname()} badges={badges} />;
}

export function TopNav({ badges }: { badges?: NavBadges }) {
  return <TopNavView pathname={usePathname()} badges={badges} />;
}

function Badge({ count }: { count?: number }) {
  if (!count) return null;
  return (
    <span className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[0.65rem] leading-5 font-semibold text-white tabular-nums">
      <span className="sr-only">, </span>
      {count > 99 ? "99+" : count}
      <span className="sr-only"> pendentes</span>
    </span>
  );
}

const tabClass =
  "flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[0.7rem] font-medium text-muted-foreground transition-colors aria-[current=page]:text-foreground";

function Tab({ item, pathname, badge, onNavigate }: { item: NavItem; pathname: string | null; badge?: number; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={isActive(pathname, item.href) ? "page" : undefined}
      className={cn(tabClass, "relative")}
    >
      <Icon aria-hidden className="size-5" />
      <span className="flex items-center">
        {item.label}
        <Badge count={badge} />
      </span>
    </Link>
  );
}

export function BottomNavView({ pathname, badges }: { pathname: string | null; badges?: NavBadges }) {
  const { primary, more, showMore } = visibleNav();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = more.some((item) => isActive(pathname, item.href));

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {showMore && moreOpen && (
        <ul className="absolute inset-x-0 bottom-full border-t bg-background shadow-lg">
          {more.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  aria-current={isActive(pathname, item.href) ? "page" : undefined}
                  className="flex h-12 items-center gap-3 px-5 text-sm text-muted-foreground aria-[current=page]:font-medium aria-[current=page]:text-foreground"
                >
                  <Icon aria-hidden className="size-5" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <ul className="mx-auto grid max-w-xl auto-cols-fr grid-flow-col">
        {primary.map((item) => (
          <li key={item.href}>
            <Tab item={item} pathname={pathname} badge={badges?.[item.href]} onNavigate={() => setMoreOpen(false)} />
          </li>
        ))}
        {showMore && (
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen((open) => !open)}
              aria-expanded={moreOpen}
              aria-current={moreActive ? "page" : undefined}
              className={tabClass}
            >
              <Ellipsis aria-hidden className="size-5" />
              Mais
            </button>
          </li>
        )}
      </ul>
    </nav>
  );
}

export function TopNavView({ pathname, badges }: { pathname: string | null; badges?: NavBadges }) {
  const { primary, more } = visibleNav();
  return (
    <nav aria-label="Navegação" className="hidden items-center gap-1 md:flex">
      {[...primary, ...more].map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(pathname, item.href) ? "page" : undefined}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-muted-foreground transition-colors",
              "hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground",
            )}
          >
            <Icon aria-hidden className="size-4" />
            {item.label}
            <Badge count={badges?.[item.href]} />
          </Link>
        );
      })}
    </nav>
  );
}
