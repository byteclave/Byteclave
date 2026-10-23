---
name: Next.js Turbopack on Replit
description: Workspace TypeScript module resolution and proxied HMR behavior for Next.js apps.
---

For Next.js apps that transpile workspace TypeScript packages, use extensionless relative imports. TypeScript may accept `.js` specifiers for `.ts` source through extension substitution while Turbopack fails to resolve them. Replit's proxied preview also uses `127.0.0.1` as the dev-resource origin, so include it in `allowedDevOrigins` to enable HMR. Regional preview hosts can be nested (for example, `*.riker.replit.dev`); a broad `*.replit.dev` entry may not match them.

**Why:** Production builds initially failed despite passing TypeScript checks, and the preview blocked HMR until its loopback origin was allowed. A later workflow log reported a blocked regional origin despite the general Replit wildcard.

**How to apply:** When connecting a local TypeScript package to a Next app, verify both `next build` and the proxied preview; use extensionless imports, permit the preview's loopback origin, and add a regional wildcard when logs show a nested Replit host rather than pinning an ephemeral hostname.
