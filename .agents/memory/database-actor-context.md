---
name: Database actor context
description: How application services should satisfy ByteClave's database-level actor checks.
---

When an authenticated account service updates protected user data, set the transaction-local `app.actor_user_id` to the authenticated account ID before the write. Do so only after password verification and role/permission checks; never take this actor ID from request input.

**Why:** The database protects the provisioned Owner account and rejects even a successful sign-in's last-login timestamp update if the transaction does not identify the authenticated Owner.

**How to apply:** Review every service transaction that updates `users` or writes actor-aware audit history. Set the transaction-local actor context before protected writes while preserving the SQL triggers as the authorization boundary.
