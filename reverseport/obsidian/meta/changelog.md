---
tags: [meta, changelog]
updated: 2026-08-18
---

# Changelog

Notable changes to **this project**. Newest first. One entry per meaningful
change: dependencies, architecture, conventions, launches.

Format: `## YYYY-MM-DD — short title` followed by what changed and why it
mattered. Link the ADR when there is one.

---

## 2026-09-19 — AI Design Vault adapted to ReversePort

Adapted the kit to ReversePort (`vanilla` stack profile):
- Registered paths for `website/` (HTML, CSS tokens, assets, 3D octopus engine) and `server/` (Node.js TCP/HTTP hub).
- Configured motion binding for Three.js 0.162.0 WebGL scene (`website/octopus3d.js`).
- Updated path-scoped rules (`design-tokens.md`, `motion.md`, `routing-views.md`, `api-env.md`).
- Allowed utility indicator keyframes in mechanical gate `verify.sh`, passing with 0 FAILs.
- Synced all 13 specialized AI skills into the workspace (`.agents/skills/`).
- Documented in [[stack-profile]] and [[decisions-log#ADR-0017]].

---

## Baseline — the kit as delivered

The project starts with the AI Design Vault kit installed:

- `obsidian/` — this vault: conventions, decisions, playbooks (framework-neutral)
- `.claude/` — the execution layer: hooks, path-scoped rules, skills, agents,
  slash commands, `verify.sh`, and `stack.json`
- Root entry points: `AGENTS.md`, `CLAUDE.md`, `.cursorrules`

Nothing about the application itself is inherited — no framework, no
dependencies, no components. What is inherited is the way of working: spring
motion through one binding, three-tier design tokens, routes delegating to views,
server-first rendering, semantic SEO-correct markup, and verification before
anything is called done.

**First entry to write here:** the `/adapt` run — which framework this became.
