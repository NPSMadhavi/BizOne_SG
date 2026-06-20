---
name: Page layout max-widths
description: Consistent max-width rules for all pages — user preference, enforced across all modules
---

## Rule

**Report / list / view / dashboard pages** → `max-w-7xl mx-auto`
**Form pages (new / edit with many fields)** → `max-w-[1600px] mx-auto`

**Why:** User explicitly complained about large white spaces on left and right caused by narrower constraints (max-w-3xl, max-w-4xl, max-w-5xl, max-w-6xl). All pages were standardised in one pass.

**How to apply:** Every new page must use one of these two values on its root wrapper div. Never use max-w-3xl / max-w-4xl / max-w-5xl / max-w-6xl at the page root level. Dialogs and inner components are exempt.
