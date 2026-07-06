# SEO Strategy

## In scope
- Public login and entry routes (`/`, `/login`, `/select-company`)
- Public static files shipped from `artifacts/po-app/public/`
- Crawlability and indexation behavior of authenticated SPA routes when they are still publicly reachable URLs
- Source-visible technical SEO signals in the frontend shell (`artifacts/po-app/index.html`) and deployment config

## Out of scope
- Content optimization for authenticated document-management screens after login
- Admin, dashboard, accounting, and CRUD page copy quality as business content
- Backlink, Search Console, analytics, and live SERP analysis

## Target audience
- Existing customers and staff users of the document management system
- Possibly prospects who receive or share the public app URL, but there is no dedicated marketing site in this repository

## Primary keywords
- Unknown — no dedicated marketing or content pages are present in this repository

## Notes
- The app is deployed as a static Vite SPA artifact with a catch-all rewrite to `/index.html`.
- Most routes are authenticated application screens, so the main SEO risks are accidental indexation, soft-auth pages, and crawler rendering limits rather than traditional content optimization.

## Dismissed categories
- (None yet)
