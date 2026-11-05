# Modelo de prompt para cada etapa

Todo prompt de etapa segue este molde.

```
# Etapa X: <nome>

## Contexto
Leia CLAUDE.md e docs/ARQUITETURA.md antes de começar.
Estado atual: <o que já está pronto e commitado>
Por que esta etapa: <o problema real que ela resolve, de preferência com a fala do barbeiro>

## Arquitetura desta etapa
- Camadas afetadas: <domain / server / app / prisma>
- Models novos ou alterados: <...>
- Arquivos novos: <...>
- Fluxo: <passo a passo de como o dado anda>

## Regras de negócio
<só as que importam pra esta etapa>

## Fora do escopo
<o que NÃO fazer agora>

## Critérios de aceite
- <comportamento que tem que funcionar>
- <teste que tem que passar>

## Como trabalhar
Plano primeiro e espere aprovação. Migration nova. Nada no Supabase.
Código completo dos arquivos alterados. Atualize o ARQUITETURA.md. Sem commit.
```
