import { classifyAllAction, classifyOneAction } from "@/app/classificar/actions";
import { Button } from "@/components/ui/button";
import type { ClassifyOption } from "@/domain/visit-items";

const optionValue = (o: ClassifyOption) => (o.kind === "RULE" ? `rule:${o.ruleId}` : `service:${o.serviceId}`);

/** Botões de um toque para UMA visita (funcionam sem JavaScript: cada um é um formulário). */
export function OneTapOptions({ appointmentId, options, returnTo }: { appointmentId: string; options: ClassifyOption[]; returnTo: string }) {
  return (
    <>
      {options.map((o) => (
        <form key={optionValue(o)} action={classifyOneAction}>
          <input type="hidden" name="appointmentId" value={appointmentId} />
          <input type="hidden" name="option" value={optionValue(o)} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <Button type="submit" variant="outline" className="h-11" title={o.kind === "RULE" ? o.detail : undefined}>
            {o.label}
          </Button>
        </form>
      ))}
    </>
  );
}

/** "Aplicar a todas de R$ X" com uma opção. */
export function ApplyAllOptions({ amountCents, count, options }: { amountCents: number; count: number; options: ClassifyOption[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <form key={optionValue(o)} action={classifyAllAction}>
          <input type="hidden" name="amountCents" value={amountCents} />
          <input type="hidden" name="option" value={optionValue(o)} />
          <Button type="submit" variant="secondary" className="h-11">
            Todas ({count}) = {o.label}
          </Button>
        </form>
      ))}
    </div>
  );
}
