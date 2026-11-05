import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import {
  saveFeeAction,
  saveProductAction,
  saveServiceAction,
  toggleProductAction,
  toggleServiceAction,
} from "@/app/catalogo/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDb } from "@/lib/db";
import { PAYMENT_METHOD_LABELS } from "@/lib/labels";
import { formatBps, formatBpsForInput, formatBRL, formatCentsForInput } from "@/lib/money";
import { cn } from "@/lib/utils";
import { listFees, listProducts, listServices, type ProductRow, type ServiceRow } from "@/server/catalog";

export const metadata: Metadata = { title: "Catálogo · BarberBoard" };

const TABS = [
  { key: "servicos", label: "Serviços" },
  { key: "produtos", label: "Produtos" },
  { key: "taxas", label: "Taxas" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const inputClass = "h-11 w-full rounded-lg border bg-background px-3 text-base";

export default function CatalogoPage({ searchParams }: PageProps<"/catalogo">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando o catálogo…</p>}>
      <Catalog searchParams={searchParams} />
    </Suspense>
  );
}

async function Catalog({ searchParams }: { searchParams: PageProps<"/catalogo">["searchParams"] }) {
  const sp = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === sp.aba) ? (sp.aba as TabKey) : "servicos";
  await connection();
  const db = getDb();

  return (
    <div className="space-y-4">
      <header className="space-y-3">
        <h1 className="text-xl font-semibold">Catálogo</h1>
        <nav aria-label="Abas do catálogo" className="grid grid-cols-3 rounded-lg border p-1">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/catalogo?aba=${t.key}`}
              aria-current={t.key === tab ? "page" : undefined}
              className="flex h-10 items-center justify-center rounded-md text-sm text-muted-foreground aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground"
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </header>

      <Feedback ok={sp.ok} erro={sp.erro} aviso={sp.aviso} />

      {tab === "servicos" && <ServicesTab services={await listServices(db)} />}
      {tab === "produtos" && <ProductsTab products={await listProducts(db)} />}
      {tab === "taxas" && <FeesTab fees={await listFees(db)} />}
    </div>
  );
}

function Feedback({ ok, erro, aviso }: { ok?: string | string[]; erro?: string | string[]; aviso?: string | string[] }) {
  const text = (v?: string | string[]) => (typeof v === "string" && v ? v : null);
  return (
    <>
      {text(ok) && (
        <Alert>
          <AlertDescription>{text(ok)}</AlertDescription>
        </Alert>
      )}
      {text(aviso) && (
        <Alert className="border-amber-300 text-amber-800 dark:text-amber-300">
          <AlertDescription className="text-inherit">{text(aviso)}</AlertDescription>
        </Alert>
      )}
      {text(erro) && (
        <Alert variant="destructive">
          <AlertDescription>{text(erro)}</AlertDescription>
        </Alert>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function ItemCard({ summary, inactive, children }: { summary: ReactNode; inactive: boolean; children: ReactNode }) {
  return (
    <details className={cn("rounded-xl border bg-card", inactive && "opacity-60")}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 [&::-webkit-details-marker]:hidden">
        {summary}
      </summary>
      <div className="space-y-3 border-t px-4 py-3">{children}</div>
    </details>
  );
}

// ─── Serviços ───────────────────────────────────────────────────────────────

function ServiceFields({ service }: { service?: ServiceRow }) {
  return (
    <>
      <Field label="Nome">
        <input name="name" required maxLength={60} defaultValue={service?.name} className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Tipo">
          <select name="category" defaultValue={service?.category ?? "MAIN"} className={inputClass}>
            <option value="MAIN">Principal</option>
            <option value="EXTRA">Extra</option>
          </select>
        </Field>
        <Field label="Preço (R$)">
          <input
            name="price"
            required
            inputMode="decimal"
            autoComplete="off"
            placeholder="40,00"
            defaultValue={service ? formatCentsForInput(service.defaultPriceCents) : ""}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Duração (minutos, opcional)">
        <input name="duration" inputMode="numeric" autoComplete="off" defaultValue={service?.durationMin ?? ""} className={inputClass} />
      </Field>
    </>
  );
}

function ServicesTab({ services }: { services: ServiceRow[] }) {
  const groups = [
    { title: "Principais", items: services.filter((s) => s.category === "MAIN") },
    { title: "Extras", items: services.filter((s) => s.category === "EXTRA") },
  ];
  return (
    <div className="space-y-4">
      <details className="rounded-xl border bg-card">
        <summary className="flex min-h-12 cursor-pointer items-center px-4 font-medium">+ Adicionar serviço</summary>
        <form action={saveServiceAction} className="space-y-3 border-t px-4 py-3">
          <ServiceFields />
          <Button type="submit" className="h-11 w-full">
            Adicionar
          </Button>
        </form>
      </details>

      {groups.map((g) => (
        <section key={g.title} className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">{g.title}</h2>
          {g.items.length === 0 && <p className="text-sm text-muted-foreground">Nenhum.</p>}
          {g.items.map((s) => (
            <ItemCard
              key={s.id}
              inactive={!s.active}
              summary={
                <>
                  <span className="min-w-0 truncate font-medium">
                    {s.name} {!s.active && <Badge variant="outline">desativado</Badge>}
                  </span>
                  <span className="shrink-0 tabular-nums">{formatBRL(s.defaultPriceCents)}</span>
                </>
              }
            >
              <form action={saveServiceAction} className="space-y-3">
                <input type="hidden" name="id" value={s.id} />
                <ServiceFields service={s} />
                <Button type="submit" className="h-11 w-full">
                  Salvar
                </Button>
              </form>
              <form action={toggleServiceAction.bind(null, s.id, !s.active)}>
                <Button type="submit" variant="ghost" className="h-11 w-full text-muted-foreground">
                  {s.active ? "Desativar (some do lançamento, fica no histórico)" : "Reativar"}
                </Button>
              </form>
            </ItemCard>
          ))}
        </section>
      ))}
      <p className="text-xs text-muted-foreground">Mudar um preço não altera visitas já lançadas: o preço fica guardado em cada visita.</p>
    </div>
  );
}

// ─── Produtos ───────────────────────────────────────────────────────────────

function marginText(p: ProductRow) {
  if (!p.margin) return "sem custo";
  const pct = p.margin.marginBps === null ? "" : ` (${formatBps(p.margin.marginBps)})`;
  return `margem ${formatBRL(p.margin.marginCents)}${pct}`;
}

function ProductFields({ product }: { product?: ProductRow }) {
  return (
    <>
      <Field label="Nome">
        <input name="name" required maxLength={60} defaultValue={product?.name} className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Preço de venda (R$)">
          <input
            name="price"
            required
            inputMode="decimal"
            autoComplete="off"
            placeholder="35,00"
            defaultValue={product ? formatCentsForInput(product.priceCents) : ""}
            className={inputClass}
          />
        </Field>
        <Field label="Custo (R$, opcional)">
          <input
            name="cost"
            inputMode="decimal"
            autoComplete="off"
            placeholder="17,50"
            defaultValue={product?.costCents != null ? formatCentsForInput(product.costCents) : ""}
            className={inputClass}
          />
        </Field>
      </div>
    </>
  );
}

function ProductsTab({ products }: { products: ProductRow[] }) {
  return (
    <div className="space-y-4">
      <details className="rounded-xl border bg-card">
        <summary className="flex min-h-12 cursor-pointer items-center px-4 font-medium">+ Adicionar produto</summary>
        <form action={saveProductAction} className="space-y-3 border-t px-4 py-3">
          <ProductFields />
          <Button type="submit" className="h-11 w-full">
            Adicionar
          </Button>
        </form>
      </details>

      {products.length === 0 && <p className="text-sm text-muted-foreground">Nenhum produto cadastrado.</p>}
      <div className="space-y-2">
        {products.map((p) => (
          <ItemCard
            key={p.id}
            inactive={!p.active}
            summary={
              <>
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {p.name} {!p.active && <Badge variant="outline">desativado</Badge>}
                  </span>
                  <span className={cn("block text-xs", p.margin && p.margin.marginCents < 0 ? "text-destructive" : "text-muted-foreground")}>
                    {marginText(p)}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">{formatBRL(p.priceCents)}</span>
              </>
            }
          >
            <form action={saveProductAction} className="space-y-3">
              <input type="hidden" name="id" value={p.id} />
              <ProductFields product={p} />
              <Button type="submit" className="h-11 w-full">
                Salvar
              </Button>
            </form>
            <form action={toggleProductAction.bind(null, p.id, !p.active)}>
              <Button type="submit" variant="ghost" className="h-11 w-full text-muted-foreground">
                {p.active ? "Desativar (some do lançamento, fica no histórico)" : "Reativar"}
              </Button>
            </form>
          </ItemCard>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Produto sem custo fica fora do cálculo de margem.</p>
    </div>
  );
}

// ─── Taxas ──────────────────────────────────────────────────────────────────

function FeesTab({ fees }: { fees: { method: keyof typeof PAYMENT_METHOD_LABELS; feeBps: number }[] }) {
  return (
    <div className="space-y-2">
      {fees.map((f) => (
        <form key={f.method} action={saveFeeAction} className="flex items-end gap-2 rounded-xl border bg-card p-3">
          <input type="hidden" name="method" value={f.method} />
          <label className="flex-1 space-y-1">
            <span className="text-sm font-medium">{PAYMENT_METHOD_LABELS[f.method]}</span>
            <span className="flex items-center gap-1.5">
              <input
                name="percent"
                required
                inputMode="decimal"
                autoComplete="off"
                defaultValue={formatBpsForInput(f.feeBps)}
                aria-label={`Taxa de ${PAYMENT_METHOD_LABELS[f.method]} em %`}
                className={inputClass}
              />
              <span className="text-sm text-muted-foreground">%</span>
            </span>
          </label>
          <Button type="submit" variant="outline" className="h-11">
            Salvar
          </Button>
        </form>
      ))}
      <p className="text-xs text-muted-foreground">
        Taxa da maquininha cobrada sobre o valor da visita. A taxa nova vale para as próximas visitas (inclusive as
        importadas); as já lançadas guardam a taxa do dia.
      </p>
    </div>
  );
}
