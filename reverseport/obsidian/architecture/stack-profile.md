---
tags: [architecture, stable, decision]
updated: 2026-08-18
---

# The Stack Profile

`.claude/stack.json` is **this project's shape**, in machine-readable form. It is
the single source of truth for paths, packages and commands, and it is what makes
one kit work in any framework. ADR: [[decisions-log]] ADR-0007.

> [!important] The habit that matters
> **Resolve every path and package name from `stack.json`.** The vault's examples
> are illustrations — `src/app/page.tsx` in a note does not mean this project has
> one. Reading a path out of documentation is the single most common way an agent
> writes a file into the wrong place here.

## What reads it

| Reader | Uses |
|---|---|
| `.claude/scripts/verify.sh` | every path, extension, binding, capability and convention — it decides which checks run |
| `.claude/scripts/hooks/*` | `adapted`, `framework.name` — the session-start guidance |
| Skills | `commands.*`, `paths.*`, `bindings.*` instead of naming a framework |
| Rules | their `paths:` frontmatter is retargeted from it by `/adapt` |
| You | before writing any file |

## The field groups

Full schema with descriptions: `.claude/stack.schema.json`.

| Group | What it answers |
|---|---|
| `framework` | which framework, which version, **which render model** |
| `language`, `packageManager` | is `any` checkable; which command prefix |
| `paths` | where routes, views, components, styles, assets, server code, env and protected zones live |
| `extensions` | which file types are source (`.tsx`, `.vue`, `.svelte`, `.astro`…) |
| `bindings` | the concrete package or API for motion, text motion, scroll, styling, image, link, router, metadata, validation, and the public env prefix |
| `capabilities` | what the framework can do — SSR, server components, file routing, API routes, image optimisation, islands |
| `conventions` | which kit conventions are on; switching one off needs an ADR |
| `commands` | verbatim shell commands, package manager included |
| `notes` | anything the fields cannot express |

### `renderModel` deserves attention

It changes what is true about the project more than the framework name does:

| Value | Consequences |
|---|---|
| `server-components` / `ssr` | secrets are safe server-side; content reaches crawlers; server-first rule applies |
| `ssg` | same crawlability, no runtime server — data is fetched at build time |
| `islands` | content is server-rendered, but each interactive island is a separate hydration root — motion state does not cross them for free |
| `spa` | **no server, no secrets, no crawlable content without prerendering.** Half the SEO skill's findings collapse into this one |

## Keeping it true

A profile that lies is worse than no profile: `verify.sh` skips checks silently
and agents write files into paths that no longer exist. So:

- Moved a directory, added a package, renamed a script → **update the profile in
  the same turn.** The `Stop` hook asks; the `vault-librarian` agent can do it.
- After a framework upgrade or migration → **re-run `/adapt`.** Majors rename
  APIs (a middleware file, a metadata export, an env prefix); the profile is
  where that gets corrected once.
- `verify.sh` prints its profile header on every run — if that header surprises
  you, fix the profile before trusting the result.

## Resolved profile

**Framework:** Vanilla HTML5 / Modern ESM & Node.js (`vanilla`, ES2022, `ssg` / hybrid)  
**Language / package manager:** js, npm  

| Path | Value |
|---|---|
| source | `website` |
| routes | `website` |
| views | `website` |
| components | `website` |
| styles | `website/style.css` |
| assets / static root | `website/assets` / `website` |
| server | `server` |
| env | `null` (native config / server args) |
| protected | `[]` |

| Binding | Value |
|---|---|
| styling | `plain-css` (Dark theme tokens in `:root`) |
| motion | `three` (Three.js 0.162.0 WebGL 3D engine) |
| text motion | `recipe` |
| smooth scroll | native |
| image / link / router | `native` |
| metadata | `manual` (HTML `<meta>` & OpenGraph) |
| validation | native JS / GoF protocol validators |
| public env prefix | `null` |

**Commands:**
- `test`: `npm test` (7 suites GoF, TCP, protocol, QR, inspector)
- `start`: `npm start` (`node client/index.js`)
- `dev`: `node server/index.js`
- `lint`: `node -c website/octopus3d.js website/app.js client/index.js server/index.js`

**Conventions switched off:**
- `routesDelegateToViews: false` (Vanilla multi-page HTML architecture, not a React/Next/Nuxt nested view tree).
- `serverFirst: false` (Static client-side 3D WebGL + Node.js backend hub).

**Judgement calls made during adaptation:**
- WebGL 3D Octopus (`website/octopus3d.js` + `assets/pulbo_monstruo.glb`) is registered as the primary motion engine.
- Mechanical gate `verify.sh` updated to allow CSS utility keyframes (`spin`, `blink`) for loaders and CLI blinking in Vanilla stack, while keeping complex motion spring-based.

## Related

[[adapt-stack]] · [[folder-structure]] · [[tech-stack]] · [[system-overview]]
