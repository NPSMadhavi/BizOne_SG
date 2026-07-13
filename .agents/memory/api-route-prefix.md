---
name: API route path prefix convention
description: Express routes must NOT include /api/ prefix — the app mounts them at app.use("/api", router)
---

All Express route handlers must be defined WITHOUT the `/api/` prefix.

**Why:** The main Express app mounts the router at `app.use("/api", routes_default)` (see `artifacts/api-server/src/index.ts`). Express strips the mount prefix before matching child routes, so a handler defined as `router.get("/api/projects", ...)` will never match — it would need to match `/api/api/projects`.

**How to apply:** Always define routes as `/projects`, `/vouchers/:id`, etc. — never as `/api/projects`, `/api/vouchers/:id`.

**Confirmed bug:** The projects/vouchers routes were initially written with `/api/projects` prefix, causing silent 404s even though the router was correctly registered. The built bundle showed the routes existed but they never matched incoming requests.
