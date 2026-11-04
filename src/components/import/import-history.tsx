import Link from "next/link";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeBR } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { IMPORT_STATUS_LABELS, plural } from "@/lib/labels";
import { listRecentImports } from "@/server/import/queries";
import { RowList } from "./parts";

export async function ImportHistory() {
  await connection();
  const imports = await listRecentImports(getDb(), 10);

  if (imports.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma importação ainda.</p>;
  }

  return (
    <RowList>
      {imports.map((item) => (
        <li key={item.id}>
          <Link href={`/importar/${item.id}`} className="flex items-center justify-between gap-3 py-3">
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{item.fileName}</span>
              <span className="block text-xs text-muted-foreground">
                {formatDateTimeBR(item.createdAt, { withYear: true })} ·{" "}
                {item.status === "PENDING"
                  ? `${plural(item.rowCount, "linha")}`
                  : `${plural(item.importedCount, "visita importada", "visitas importadas")}`}
                {item.status === "COMPLETED" && item.unclassifiedCount > 0 && ` · ${item.unclassifiedCount} a classificar`}
              </span>
            </span>
            <Badge variant={item.status === "PENDING" ? "outline" : item.status === "FAILED" ? "destructive" : "secondary"}>
              {item.status === "PENDING" ? "Continuar ›" : IMPORT_STATUS_LABELS[item.status]}
            </Badge>
          </Link>
        </li>
      ))}
    </RowList>
  );
}
