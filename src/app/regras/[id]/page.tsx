import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { rowsFromItems } from "@/components/items/editor-rows";
import { RuleForm } from "@/components/items/rule-form";
import { getDb } from "@/lib/db";
import { formatCentsForInput } from "@/lib/money";
import { getEditorCatalog } from "@/server/classify";
import { getRule } from "@/server/rules";

export const metadata: Metadata = { title: "Editar regra · BarberBoard" };

export default function EditarRegraPage({ params }: PageProps<"/regras/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
      <EditRule params={params} />
    </Suspense>
  );
}

async function EditRule({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const db = getDb();
  const rule = await getRule(db, id);
  if (!rule) notFound();
  const catalog = await getEditorCatalog(db, {
    serviceIds: rule.items.flatMap((i) => (i.serviceId ? [i.serviceId] : [])),
    productIds: rule.items.flatMap((i) => (i.productId ? [i.productId] : [])),
  });

  return (
    <div className="space-y-4">
      <header>
        <Link href="/regras" className="text-sm text-muted-foreground">
          ‹ Regras de valor
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Editar regra</h1>
        <p className="text-sm text-muted-foreground">Mudar a regra não altera as visitas já classificadas por ela.</p>
      </header>
      <RuleForm
        ruleId={rule.id}
        catalog={catalog}
        initial={{ label: rule.label, amountText: formatCentsForInput(rule.amountCents), rows: rowsFromItems(rule.items) }}
      />
    </div>
  );
}
