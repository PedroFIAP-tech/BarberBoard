import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { RuleForm } from "@/components/items/rule-form";
import { getDb } from "@/lib/db";
import { formatCentsForInput } from "@/lib/money";
import { getEditorCatalog } from "@/server/classify";

export const metadata: Metadata = { title: "Nova regra · BarberBoard" };

export default function NovaRegraPage({ searchParams }: PageProps<"/regras/nova">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
      <NewRule searchParams={searchParams} />
    </Suspense>
  );
}

async function NewRule({ searchParams }: { searchParams: PageProps<"/regras/nova">["searchParams"] }) {
  const { valor } = await searchParams;
  await connection();
  const catalog = await getEditorCatalog(getDb());
  const amount = Number(valor);
  const amountText = Number.isInteger(amount) && amount >= 0 && valor !== undefined ? formatCentsForInput(amount) : "";

  return (
    <div className="space-y-4">
      <header>
        <Link href="/regras" className="text-sm text-muted-foreground">
          ‹ Regras de valor
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Nova regra</h1>
      </header>
      <RuleForm ruleId={null} catalog={catalog} initial={{ label: "", amountText, rows: [] }} />
    </div>
  );
}
