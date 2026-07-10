# ClinicalOS Development Rules

## Git Workflow

- Never commit directly to main.
- Always work on a feature branch.
- Use Conventional Commits.
- Push only after all tests pass.
- Open a Pull Request when a feature is complete.
- Never merge unless I explicitly request it.

## Coding Rules

- Preserve business rules unless I explicitly approve changes.
- Avoid breaking API contracts.
- Avoid unnecessary schema changes.
- Prefer the smallest safe change.
- Reuse existing architecture before creating new abstractions.
- Keep company/site permission isolation intact.

## Performance

- Never optimize based on assumptions.
- Measure first.
- Identify the bottleneck.
- Optimize only the proven bottleneck.
- Remove temporary instrumentation before committing.

## Testing

- Run TypeScript checks.
- Run ESLint.
- Run all applicable unit tests.
- Run integration tests when applicable.
- Never commit if tests fail.

## Architecture

- Keep services cohesive.
- Avoid duplicated queries.
- Parallelize only independent reads.
- Keep writes deterministic and ordered.
- Reuse existing project patterns before introducing new abstractions.

## Documentation

- Update documentation when behavior changes.
- Use clear Conventional Commit messages.
- Create comprehensive Pull Request descriptions.

## UI

- Follow the existing design system.
- Prefer consistency over redesign.
- Show proper loading states.
- Show proper empty states.
- Show actionable error messages.

## Security

- Respect RLS.
- Never bypass authorization.
- Never weaken permission checks.

# Clinical Research Domain Rules

- A Study must be approved before Subjects can be created.
- Subjects must always follow the approved Visit Template.
- Visit sequencing is driven by visit_order and required predecessors, never visit names.
- Timeline and audit entries are required for state-changing actions.
- Multi-company isolation must always be preserved.
- Site isolation must always be preserved.
- Every mutation must remain auditable.
- Maintain compatibility with AI-generated studies.

# Product Roadmap Priorities

Current development priority:

1. Visit Calendar
2. Document Center
3. Task Engine
4. EDC
5. Reports
6. Patient Portal
7. Sponsor Portal

Avoid implementing lower-priority features unless I explicitly request them.

# AI Behavior

- Ask before making architectural decisions.
- Do not introduce speculative optimizations.
- Explain tradeoffs before major refactors.
- Prefer production-ready implementations over prototypes.
- Before adding new modules, search the codebase to verify the feature does not already exist.
- Prefer extending existing components and services over creating duplicate functionality.
- If a requested feature already exists partially, complete and harden it instead of rebuilding it.
- Keep the project modular, scalable, and maintainable.
- Think like a senior software architect building a commercial SaaS CTMS product.

These rules are mandatory unless explicitly overridden by the user.
