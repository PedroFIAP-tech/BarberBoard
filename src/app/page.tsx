import { redirect } from "next/navigation";

// Por enquanto a importação é a tela principal. Quando o Fechamento do dia existir, ele vira a home.
export default function Home() {
  redirect("/importar");
}
