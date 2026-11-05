// Peças visuais compartilhadas pelas telas (sem lógica de negócio).

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Seção recolhível. Usa <details> nativo: funciona sem JavaScript e é leve no celular. */
export function Section({
  title,
  count,
  defaultOpen = false,
  tone = "default",
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  tone?: "default" | "warning" | "danger";
  children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group rounded-xl border bg-card">
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium",
          "[&::-webkit-details-marker]:hidden",
          tone === "warning" && "text-amber-700 dark:text-amber-400",
          tone === "danger" && "text-destructive",
        )}
      >
        <span>
          {title}
          {count !== undefined && <span className="ml-1.5 text-muted-foreground">({count})</span>}
        </span>
        <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="border-t px-4 py-3">{children}</div>
    </details>
  );
}

/** Número grande com legenda, para os totais da prévia. */
export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** Linha de lista: título à esquerda, valor à direita, detalhe embaixo. */
export function Row({ title, value, detail }: { title: ReactNode; value?: ReactNode; detail?: ReactNode }) {
  return (
    <li className="py-2">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate">{title}</span>
        {value !== undefined && <span className="shrink-0 font-medium tabular-nums">{value}</span>}
      </div>
      {detail && <div className="mt-0.5 text-xs text-muted-foreground">{detail}</div>}
    </li>
  );
}

export function RowList({ children }: { children: ReactNode }) {
  return <ul className="divide-y">{children}</ul>;
}
