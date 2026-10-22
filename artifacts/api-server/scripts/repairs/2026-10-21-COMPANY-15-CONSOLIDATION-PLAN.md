# Company consolidation plan — REVIEW ONLY (no COMMIT)

**Status:** Analysis complete. **No destructive SQL was executed.**

---

## 0) Critical ID correction (local machine)

On local `BizoneDB` (read-only check 2026-10-21):

| id | name | email | database_name |
|----|------|-------|---------------|
| **15** | SVS Infotech | svsinfotech@gmail.com | null |
| **20** | LMsoftware solutions | lmsoftwaresolutions@gmail.com | null |
| **23** | Spsynet | spsynet@gmail.com | `bizone_spsynet` (**DB missing locally**) |
| **24** | spsysnet | spsysnet@gmail.com | `bizone_spsysnet` (exists) |

Your requested migrate **15 → 20** on this master database would merge **SVS Infotech into LMsoftware**. That is **wrong** and must not run.

Your listed row counts (accounts 56, SO 8, settings PO=9/INV=7/…) match the **tenant-local orphan** problem already documented for:

- `bizone_spsynet` → remap **15 → 23** (script ready, defaults to `ROLLBACK`)
- `bizone_spsysnet` → remap **15 → 24** (already largely applied locally)

If Plesk uses different IDs (you believe keep = **20**), run the identity queries in §1 **on Plesk** first and only then adapt `TO_COMPANY_ID`.

---

## 1) How multi-tenant workflow works

```
Signup (slug)
  → CREATE DATABASE bizone_<slug>
  → insert companies row on MASTER with database_name = bizone_<slug>
  → copy/seed company row + roles/settings/user into TENANT DB

Login
  → read user from MASTER (login_credentials)
  → session.companyId = users.company_id / user_companies
  → every /api/* request (except auth): openCompanyPool(session.companyId)
       if companies.database_name set → queries run on TENANT DB
       else → queries run on shared MASTER

API list endpoints
  → WHERE company_id = session.companyId
```

So empty UI means one of:

1. **Wrong `company_id` in session** vs rows’ `company_id` (orphan 15 vs live 23/24/20)
2. **Wrong database** (session company points at tenant DB that is empty / missing, while data sits elsewhere)
3. **Migrations not the main issue** — routing + company_id mismatch is

### Why local “Spsynet” shows no data

- User `spsynet@gmail.com` → company **23** → `database_name = bizone_spsynet`
- Local Postgres: **`bizone_spsynet` does not exist**
- Middleware catches connect failure → falls back to shared `BizoneDB`
- Shared has **no** business rows for `company_id = 23` → empty lists

### Why `spsysnet` (company 24) can show data locally

- Tenant DB `bizone_spsysnet` exists
- Business rows already under `company_id = 24` (remap previously applied)
- Leftover: `audit_logs` still `company_id=15` (115), duplicate `financial_years` for 15

### Why Plesk can show empty with same login

Most likely on Plesk:

1. Login company is the **new** duplicate (20 / 23 / 24)
2. All historical rows still have `company_id = 15` **inside the tenant DB**
3. App correctly filters by session company → **0 rows**

Migrations being “wrong” is secondary; the live filter is `session.companyId`.

---

## 2) Do NOT run 15→20 on master BizoneDB

Master counts for 15 vs 20 (business tables): **only** roles/settings/FY/users/user_companies — no accounts/SO/customers. Consolidating them does nothing for Spsynet and risks corrupting two unrelated companies.

---

## 3) Correct migration target (from your counts)

| Environment | Database to connect | FROM | KEEP | Script |
|-------------|---------------------|------|------|--------|
| Spsynet tenant (planned) | `bizone_spsynet` | 15 | **23** | `2026-10-21-spsynet-remap-company15-to-23.sql` |
| spsysnet tenant (local) | `bizone_spsysnet` | 15 | **24** | mostly done; leftover FY/audit only |
| Plesk (if keep really is 20) | tenant DB named in `companies.database_name` | 15 | **20** | adapt same SQL: replace 23→20, rename checks |

### Conflict handling (same in all variants)

| Table | Action |
|-------|--------|
| Business tables with only co15 data | `UPDATE … SET company_id = KEEP WHERE company_id = 15` |
| `roles` | Keep KEEP roles; map user `role_id` 177→KEEP admin, etc.; delete co15 roles after refs cleared |
| `financial_years` | Keep KEEP FY; do **not** move co15 FY if same dates; delete co15 FY only if **zero** refs |
| `settings` | `GREATEST` merge counters into KEEP settings; delete co15 settings after |
| `users` / `user_companies` | **Do not** move KEEP login; leave as-is |
| `audit_logs` | Prefer **preserve** `company_id=15` (history) unless you explicitly want them under KEEP |
| `companies` id 15 | Delete only when no remaining FK refs |

Existing script for 15→23 already encodes safe counter merge + SO dangling link cleanup + count gates + defaults to **`ROLLBACK`**.

---

## 4) Recommended order (inside tenant DB only)

1. `pg_dump` tenant DB (custom format) + SHA256 — see `2026-10-21-spsynet-BACKUP-REQUIRED.md`
2. Connect to **tenant** database (not `BizoneDB`)
3. Run identity `DO $$ … RAISE EXCEPTION` gates
4. Remap business `company_id` 15 → KEEP
5. Merge settings counters
6. Remap any `users.role_id` still on co15 roles → KEEP roles
7. Drop co15 roles / settings / FY if unreferenced
8. Verify counts
9. Optionally `DELETE FROM companies WHERE id = 15`
10. Only then change `ROLLBACK` → `COMMIT`

---

## 5) Application confirmation (no hardcode)

After remap, with login company = KEEP:

- `req.session.companyId` = KEEP (`auth.ts` login / select-company)
- `app.ts` middleware opens tenant pool for that company
- Routes use `eq(table.companyId, req.session.companyId)` → rows now KEEP → UI fills

No need to hardcode 15.

---

## 6) Immediate local fix for empty Spsynet (company 23)

Separate from consolidation:

1. Either create/restore database `bizone_spsynet` and ensure data uses `company_id = 23`, **or**
2. Point company 23 at an existing DB that holds the data, **or**
3. Clear `database_name` only if data truly lives on shared master under 23 (it does not today)

Until `bizone_spsynet` exists (or `database_name` is corrected), Spsynet login will stay empty locally.

---

## 7) What you should run on Plesk (read-only first)

```sql
SELECT current_database();
SELECT id, name, email, database_name FROM companies ORDER BY id;

-- pick KEEP id from the live login company, then:
SELECT table_name,
       count(*) FILTER (WHERE company_id = 15) AS c15,
       count(*) FILTER (WHERE company_id = :KEEP) AS c_keep
FROM (
  -- generate via information_schema in a script; or use inspect-company-15-vs-20.mjs
) s;
```

Send back:

- `current_database()`
- companies rows for Spsynet duplicates
- keep company id actually used by login (`users.company_id` for that email)

Then we adapt the SQL to **15 → that KEEP id** and you review before COMMIT.

---

## Files already in repo

- `scripts/repairs/2026-10-21-spsynet-remap-company15-to-23.sql` — full gated migration, ends in `ROLLBACK`
- `scripts/repairs/2026-10-21-spsysnet-co15-to-24-and-restore-invoices.sql` — spsysnet variant
- `scripts/repairs/2026-10-21-spsynet-BACKUP-REQUIRED.md` — backup gate

**Do not COMMIT until backup verified.**
