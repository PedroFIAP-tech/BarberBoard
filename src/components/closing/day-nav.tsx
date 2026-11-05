"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDayKeyBR, formatDayLongBR, shiftDayKey } from "@/lib/dates";

const arrow = cn(buttonVariants({ variant: "outline" }), "size-11 shrink-0 p-0");

/** Dia anterior · dia escolhido (toque abre o calendário) · próximo dia. */
export function DayNav({ dayKey, today }: { dayKey: string; today: string }) {
  const router = useRouter();
  const isToday = dayKey === today;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Link href={`/fechamento?dia=${shiftDayKey(dayKey, -1)}`} aria-label="Dia anterior" className={arrow}>
          <ChevronLeft aria-hidden />
        </Link>

        <label className="relative flex min-h-11 flex-1 cursor-pointer flex-col items-center justify-center rounded-lg text-center hover:bg-muted">
          <span className="text-base leading-tight font-semibold first-letter:uppercase">{formatDayLongBR(dayKey)}</span>
          <span className="text-xs text-muted-foreground">{isToday ? "Hoje" : formatDayKeyBR(dayKey)}</span>
          <input
            type="date"
            value={dayKey}
            max={today}
            onChange={(e) => e.target.value && router.push(`/fechamento?dia=${e.target.value}`)}
            aria-label="Escolher o dia"
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>

        {dayKey < today ? (
          <Link href={`/fechamento?dia=${shiftDayKey(dayKey, 1)}`} aria-label="Próximo dia" className={arrow}>
            <ChevronRight aria-hidden />
          </Link>
        ) : (
          <span aria-hidden className={cn(arrow, "pointer-events-none opacity-30")}>
            <ChevronRight />
          </span>
        )}
      </div>
      {!isToday && (
        <p className="text-center">
          <Link href="/fechamento" className="text-sm text-muted-foreground underline underline-offset-4">
            Voltar para hoje
          </Link>
        </p>
      )}
    </div>
  );
}
