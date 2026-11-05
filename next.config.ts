import type { NextConfig } from "next";

// No GitHub Codespaces, o proxy da porta encaminha a requisição com x-forwarded-host =
// <codespace>-3000.app.github.dev e reescreve o Origin para localhost:3000. Como os dois não batem,
// o Next recusa a Server Action (proteção contra CSRF). Só DENTRO de um Codespace, liberamos essas
// origens; na Vercel/produção as variáveis não existem e a verificação padrão continua valendo.
const { CODESPACES, CODESPACE_NAME, GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: CODESPACE_DOMAIN } = process.env;
const ports = [...new Set(["3000", process.env.PORT ?? "3000"])];
const codespaceOrigins =
  CODESPACES === "true" && CODESPACE_NAME && CODESPACE_DOMAIN
    ? [
        ...ports.map((port) => `localhost:${port}`),
        // O curinga do Next substitui um rótulo inteiro do host, então listamos as portas exatas.
        ...ports.map((port) => `${CODESPACE_NAME}-${port}.${CODESPACE_DOMAIN}`),
      ]
    : [];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    serverActions: {
      // Upload do Histórico de Comandas do App Barber (o serviço também recusa acima de 4 MB).
      // 30 dias ≈ 230 KB; o limite da Vercel para o corpo da requisição é 4,5 MB.
      bodySizeLimit: "4mb",
      allowedOrigins: codespaceOrigins,
    },
  },
  // A tela inicial é o Fechamento do dia. Redirecionar aqui (e não numa page.tsx que só chama
  // redirect()) evita o aviso de validação de navegação do Next 16 em desenvolvimento.
  redirects() {
    return [{ source: "/", destination: "/fechamento", permanent: false }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
