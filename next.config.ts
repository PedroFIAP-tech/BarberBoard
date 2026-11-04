import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    serverActions: {
      // Upload do Histórico de Comandas do App Barber (o serviço também recusa acima de 4 MB).
      // 30 dias ≈ 230 KB; o limite da Vercel para o corpo da requisição é 4,5 MB.
      bodySizeLimit: "4mb",
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
