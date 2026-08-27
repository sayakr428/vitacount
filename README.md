# VitaCount

Financial Operating System for US SMBs.

**Source of truth:** [project.md](./project.md) — full architecture, data model, and agentic layer spec.
Build sequence: [build-playbook.md](./build-playbook.md) (one Claude Code session per milestone).
Dashboard widget-to-data-source mapping: [dashboard-ui-spec.md](./dashboard-ui-spec.md).
Running build history: [CONTEXT_LOG.md](./CONTEXT_LOG.md).

## Repo layout

```
apps/web              Next.js app (App Router)
supabase/migrations    SQL migrations, one per module
supabase/functions     Edge Functions
packages/tool-registry  Shared tool defs (agents + MCP server)
packages/posting-engine Pure functions: business event -> journal lines
packages/ui             Shared shadcn/ui components
```

## Local development

```bash
pnpm install
pnpm dev
```

Next.js only reads env files from its own project root, so real values go in `apps/web/.env.local` (copy `apps/web/.env.example` as a starting point — the root `.env.example` is kept in sync as the canonical list). Never commit any `.env.local`.
