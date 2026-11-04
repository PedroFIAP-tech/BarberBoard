import type { NextConfig } from "next";

// No GitHub Codespaces o navegador acessa https://<codespace>-<porta>.app.github.dev, mas o
// servidor pode receber Host = localhost. O Next recusa Server Actions quando o Origin não bate
// com o host (proteção contra CSRF). Liberamos SÓ o endereço deste Codespace, e só dentro dele;
// na Vercel/produção essas variáveis não existem e nada muda.
// O curinga do Next substitui um rótulo inteiro do host, então listamos as portas exatas.
const { CODESPACES, CODESPACE_NAME, GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: CODESPACE_DOMAIN } = process.env;
const codespaceOrigins =
  CODESPACES === "true" && CODESPACE_NAME && CODESPACE_DOMAIN
    ? [...new Set(["3000", process.env.PORT ?? "3000"])].map((port) => `${CODESPACE_NAME}-${port}.${CODESPACE_DOMAIN}`)
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
