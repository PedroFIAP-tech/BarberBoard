// Navegação com selos que dependem do banco (ex.: visitas a classificar).
// Renderizada dentro de <Suspense> no layout; o fallback é a navegação sem selo.

import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { pendingBadgeCount } from "@/server/classify";
import { BottomNav, TopNav, type NavBadges } from "./app-nav";

async function badges(): Promise<NavBadges | undefined> {
  await connection();
  const pending = await pendingBadgeCount(getDb());
  return pending ? { "/classificar": pending } : undefined;
}

export async function BottomNavWithBadges() {
  return <BottomNav badges={await badges()} />;
}

export async function TopNavWithBadges() {
  return <TopNav badges={await badges()} />;
}
