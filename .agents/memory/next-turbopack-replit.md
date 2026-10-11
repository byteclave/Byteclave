---
name: Next.js Turbopack on Replit
description: Workspace TypeScript module resolution and proxied HMR behavior for Next.js apps.
---

For Next.js apps that transpile workspace TypeScript packages, use extensionless relative imports. TypeScript may accept `.js` specifiers for `.ts` source through extension substitution while Turbopack fails to resolve them. Replit's proxied preview also uses `127.0.0.1` as the dev-resource origin, so include it in `allowedDevOrigins` to enable HMR.

**Why:** Production builds initially failed despite passing TypeScript checks, and the preview blocked HMR until its loopback origin was allowed.

**How to apply:** When connecting a local TypeScript package to a Next app, verify both `next build` and the proxied preview; use extensionless imports and permit the preview's loopback origin.
