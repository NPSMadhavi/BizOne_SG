# Backup gate — bizone_spsynet

**Status (2026-10-21):** No verified `bizone_spsynet` dump was found under the project tree or common backup folders. **Do not execute the remap SQL until a dump exists and is verified.**

`pg_dump` is available at:

`C:\Program Files\PostgreSQL\18\bin\pg_dump.exe`

## Create backup (operator run — not executed by agent)

```powershell
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outDir = "C:\Users\USER\OneDrive\Netopsys Projects\Biz1_sg_29Sep\BizOne_SG\artifacts\api-server\scripts\repairs\backups"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$out = Join-Path $outDir "bizone_spsynet-$stamp.dump"

# Use the same host/user as DATABASE_URL in api-server .env (do not commit passwords).
& "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" `
  --format=custom `
  --file=$out `
  --dbname=bizone_spsynet

Get-FileHash $out -Algorithm SHA256 | Format-List
& "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" --list $out | Select-Object -First 20
```

## Verify

1. Dump file size > 0
2. SHA256 recorded
3. `pg_restore --list` shows expected tables (`sales_orders`, `expenses`, `customers`, …)

## Rollback after a committed remap

```powershell
# DROP/recreate or restore into empty bizone_spsynet — operator choice; example:
& "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" `
  --clean --if-exists `
  --dbname=bizone_spsynet `
  $out
```

Never restore into `BizoneDB` or another tenant database.
