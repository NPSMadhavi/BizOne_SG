---
name: Page layout max-widths
description: Consistent max-width rules for all pages — user preference, enforced across all modules
---

## Rule

**All pages (reports, lists, forms, views)** → NO `max-w-*` and NO `mx-auto` on the page root container.

The shell's `<main className="flex-1 min-w-0 p-4 md:p-6 xl:p-8 overflow-auto">` already provides all edge padding. Pages must fill the full available content width.

**Why:** User complained twice about gutters. First pass standardised to max-w-7xl / max-w-[1600px] — still left whitespace. Second pass stripped all max-w-* + mx-auto from every page root in one sed sweep (~50 files). Pages now fill the shell's content area completely.

**How to apply:** New page root divs must NOT have `max-w-*` or `mx-auto`. Use `space-y-6 animate-in fade-in ...` (or similar) only. Dialogs, search bars, and inner sub-components are exempt (max-w-md, max-w-sm, max-w-lg etc. are fine inside cards/dialogs).
