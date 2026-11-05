// Destinos da navegação. Ao entregar uma tela, mude `ready` para true: ela aparece na barra
// inferior (celular) e no cabeçalho (iPad/computador). Telas ainda não feitas ficam ocultas.

import { Calculator, ChartColumn, ListChecks, Tags, Upload, Wallet, type LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  ready: boolean;
};

/** Barra principal: Fechamento · Classificar · Importar (+ "Mais"). */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/fechamento", label: "Fechamento", icon: Calculator, ready: true },
  { href: "/classificar", label: "Classificar", icon: ListChecks, ready: true },
  { href: "/importar", label: "Importar", icon: Upload, ready: true },
];

/** Itens do menu "Mais". */
export const MORE_NAV: NavItem[] = [
  { href: "/catalogo", label: "Catálogo", icon: Tags, ready: true },
  { href: "/despesas", label: "Despesas", icon: Wallet, ready: false },
  { href: "/dashboard", label: "Dashboard", icon: ChartColumn, ready: false },
];

/** Só as telas prontas; "Mais" só aparece se tiver pelo menos um item pronto. */
export function visibleNav(primary: NavItem[] = PRIMARY_NAV, more: NavItem[] = MORE_NAV) {
  const readyMore = more.filter((i) => i.ready);
  return { primary: primary.filter((i) => i.ready), more: readyMore, showMore: readyMore.length > 0 };
}

/** O destino está ativo na rota atual? "/importar" vale para "/importar" e "/importar/abc". */
export function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
