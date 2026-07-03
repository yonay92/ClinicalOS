# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ClinicalOS is an enterprise SaaS platform for clinical research operations, combining CTMS, eRegulatory, Business Rules Engine, Clinical Intelligence, Task Center, Enterprise Document Center, and Analytics.

Full specification lives in `docs/`. Always read the relevant doc before implementing anything — reference it explicitly when making decisions.

Key references:

- Architecture: `@docs/SYSTEM_ARCHITECTURE.md`
- Development plan & sprints: `@docs/DEVELOPMENT_PLAN.md`
- Business rules: `@docs/BUSINESS_RULES_01_Core_Workflow.md` (through `_12_Edge_Cases.md`)
- **Business Rule Engine schema**: `@docs/BUSINESS_RULE_ENGINE.md` ← read before implementing any rule or BRE call
- Database schema: `@docs/DATABASE_Part_01_Core_SaaS_Users_Roles_Sites.md` (through `_05`)
- UI/UX specs: `@docs/UI_UX_01_Design_System.md` (through `_16`)
- Supabase setup: `@docs/SUPABASE_SETUP.md`
- Security: `@docs/SECURITY.md`
- Testing: `@docs/TESTING.md`
- Clinical Intelligence agents: `@docs/CI_01_Architecture.md` (through `_10`)
- **AI provider & model config**: `@docs/AI_PROVIDER_ARCHITECTURE.md` ← read before implementing any AI agent
- **Notifications**: `@docs/NOTIFICATIONS.md` ← defines tables, event catalog, and dispatch service
- **User invitations**: `@docs/INVITATIONS.md` ← defines invite flow, token lifecycle, acceptance API

## Tech Stack

- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Edge Functions, Realtime)
- **Package manager**: pnpm
- **Tests**: Vitest, Playwright, React Testing Library
- **Deploy**: Vercel (auto-deploy on main)

## Repository Structure

```
/app          Next.js app router pages and API routes
/components   Shared UI components
/features     Feature-based modules (one folder per domain)
/lib          Utilities and shared logic
/services     Service layer (business logic, not UI)
/hooks        React hooks
/types        TypeScript type definitions
/supabase     migrations/, seed/, functions/, policies/
/docs         Full specification — source of truth
/public       Static assets
```

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY   ← NEVER expose to the frontend
```

## Architecture Rules (non-negotiable)

1. **Multi-tenant isolation**: Every business table has `company_id`. Site-scoped tables also have `site_id`. Never return data across company boundaries.
2. **RLS is mandatory**: Enable Row Level Security on every business table. Never disable it. Never bypass it.
3. **Security is not frontend**: Frontend filters are UX only. Real enforcement is at DB (RLS) + API + service layers.
4. **AI never writes directly**: Flow is `User Action → AI Analysis → User Review → Business Rules → DB Update`. AI suggestions must go through an approval step.
5. **Every module integrates with**: Audit Trail, Task Engine, Analytics, and Clinical Intelligence (where applicable).
6. **No company-specific logic**: Everything must be configurable. No hardcoded tenant values.
7. **UUID primary keys everywhere**.
8. **Schema changes via migrations only**: Never modify production schema manually. Store all changes in `/supabase/migrations/`.
9. **Strict TypeScript**: No `any`. Server-side validation required. Clean Architecture, feature-based modules, no duplicated business logic.

## Sprint Workflow

Implement one sprint at a time. Before writing code, run `/implement-sprint` to read specs and propose a plan. See sprint sequence in `@docs/DEVELOPMENT_PLAN.md`.

**Definition of Done (every sprint):**

- Unit + integration tests pass (Vitest)
- End-to-end tests pass (Playwright)
- Responsive UI
- Audit Trail writes
- Permissions validated
- Business Rules trigger where applicable

## Phase 0 Setup Checklist

When scaffolding the Next.js app (`pnpm create next-app`), also set up:

- ESLint (Next.js includes it; configure `eslint.config.mjs` with TypeScript rules)
- Prettier (`pnpm add -D prettier`) with a `.prettierrc` and a `format` script in `package.json`: `"format": "prettier --write"`
- pnpm install
- `.env.local` with the three Supabase env vars

The format-on-edit hook in `.claude/settings.json` auto-activates once `package.json` exists with a `format` script.

## Branch Naming

`feature/sprint-N-module-name` — e.g. `feature/sprint-1-auth`, `feature/sprint-3-subjects`

## Behavioral Rules

- **Propose a plan before implementing any sprint** — list what will be built and wait for approval.
- **Reference the relevant `docs/` file** when making architecture or implementation decisions.
- **Never generate placeholder or TODO code** — every function must be fully implemented or explicitly flagged for a follow-up sprint.
