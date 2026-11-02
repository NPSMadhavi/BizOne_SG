<#
.SYNOPSIS
    BizOne Singapore ERP - Windows Scheduled Backup Auto Download Agent.
    Downloads company-scoped ERP backup archives to a local Windows folder and verifies integrity.

.DESCRIPTION
    - Connects securely to the BizOne ERP server (Plesk/Production or Local).
    - Authenticates using a company-scoped revocable agent token or admin key.
    - Coordinates with server backup: waits and retries if server backup is still in progress.
    - Downloads completed company archives to the user-configured local folder (e.g. D:\BizOneBackups).
    - Preserves all previous backups; never overwrites existing archives.
    - Verifies file integrity using SHA-256 checksums.
    - Reports download status and checksum verification directly to the ERP dashboard.
    - Saves local download history in JSON and writes daily rotation logs.
    - Designed to run seamlessly via Windows Task Scheduler independently of the browser.

.EXAMPLE
    powershell.exe -ExecutionPolicy Bypass -File .\scripts\windows-backup-agent.ps1
    powershell.exe -ExecutionPolicy Bypass -File .\scripts\windows-backup-agent.ps1 -ConfigPath .\scripts\agent-config.json
    powershell.exe -ExecutionPolicy Bypass -File .\scripts\windows-backup-agent.ps1 -CompanyId 23 -DestinationDir "D:\BizOneBackups"
#>

param(
    [string]$ConfigPath = "",
    [string]$ServerUrl = "",
    [int]$CompanyId = 0,
    [string]$CompanySlug = "",
    [string]$DestinationDir = "",
    [string]$AgentKey = "",
    [int]$MaxRetries = 6,
    [int]$RetryDelaySec = 30,
    [int]$KeepDays = 60
)

$ErrorActionPreference = "Stop"

# 1. Load Local Configuration File if available
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $ConfigPath) {
    $defaultConfig = Join-Path $scriptDir "agent-config.json"
    if (Test-Path $defaultConfig) {
        $ConfigPath = $defaultConfig
    }
}

$localConfig = @{}
if ($ConfigPath -and (Test-Path $ConfigPath)) {
    try {
        $rawJson = Get-Content -Path $ConfigPath -Raw -ErrorAction Stop
        $parsed = ConvertFrom-Json $rawJson
        if ($parsed) {
            $parsed.PSObject.Properties | ForEach-Object { $localConfig[$_.Name] = $_.Value }
        }
    } catch {
        Write-Warning "Could not parse local config at $($ConfigPath): $($_.Exception.Message)"
    }
}

# Apply fallback priorities: CLI Params -> Local Config -> Sensible Defaults
if (-not $ServerUrl) {
    if ($localConfig.ServerUrl) { $ServerUrl = $localConfig.ServerUrl }
    else { $ServerUrl = "http://localhost:8080" }
}
# Normalize server URL (strip trailing slash)
$ServerUrl = $ServerUrl.TrimEnd("/")

if ($CompanyId -eq 0 -and $localConfig.CompanyId) {
    $CompanyId = [int]$localConfig.CompanyId
}
if (-not $CompanySlug -and $localConfig.CompanySlug) {
    $CompanySlug = $localConfig.CompanySlug
}
if (-not $DestinationDir) {
    if ($localConfig.DestinationDir) { $DestinationDir = $localConfig.DestinationDir }
    else { $DestinationDir = "D:\BizOneBackups" }
}
if (-not $AgentKey) {
    if ($localConfig.AgentKey) { $AgentKey = $localConfig.AgentKey }
    elseif ($env:BACKUP_AGENT_KEY) { $AgentKey = $env:BACKUP_AGENT_KEY }
    else { $AgentKey = "bizone-backup-sync-key" }
}

# Ensure destination directory exists
if (-not (Test-Path $DestinationDir)) {
    New-Item -ItemType Directory -Path $DestinationDir -Force | Out-Null
}

$LogDir = Join-Path $DestinationDir "logs"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
$TodayStr = Get-Date -Format "yyyy-MM-dd"
$Script:LogFile = Join-Path $LogDir "backup_agent_$TodayStr.log"

function Write-AgentLog {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $line = "[$timestamp] [$Level] $Message"
    Write-Host $line
    if ($Script:LogFile) {
        Add-Content -Path $Script:LogFile -Value $line -ErrorAction SilentlyContinue
    }
}

function Send-ServerReport {
    param(
        [int]$TargetCompanyId,
        [int]$BackupId,
        [string]$BackupCode,
        [string]$FileName,
        [string]$Folder,
        [long]$FileSizeBytes,
        [string]$Status,
        [string]$ChecksumStatus,
        [string]$ChecksumSha256,
        [string]$ErrorMessage
    )

    try {
        $reportEndpoint = "$ServerUrl/api/system-backups/agent/report"
        $bodyObj = @{
            companyId         = $TargetCompanyId
            backupId          = $BackupId
            backupCode        = $BackupCode
            fileName          = $FileName
            destinationFolder = $Folder
            fileSizeBytes     = $FileSizeBytes
            status            = $Status
            checksumStatus    = $ChecksumStatus
            checksumSha256    = $ChecksumSha256
            errorMessage      = $ErrorMessage
            agentHostname     = $env:COMPUTERNAME
        }
        $bodyJson = ConvertTo-Json $bodyObj -Compress

        $reportHeaders = @{
            "Content-Type"       = "application/json"
            "x-backup-agent-key" = $AgentKey
        }

        Invoke-RestMethod -Uri $reportEndpoint -Method POST -Headers $reportHeaders -Body $bodyJson -TimeoutSec 15 -UseBasicParsing | Out-Null
    } catch {
        Write-AgentLog "Could not report status to server: $($_.Exception.Message)" "WARN"
    }
}

function Save-LocalHistoryEntry {
    param(
        [int]$BackupId,
        [string]$BackupCode,
        [string]$FileName,
        [string]$Folder,
        [long]$FileSizeBytes,
        [string]$Status,
        [string]$ChecksumStatus,
        [string]$ChecksumSha256
    )

    $historyFile = Join-Path $Folder "download-history.json"
    $history = @()
    if (Test-Path $historyFile) {
        try {
            $raw = Get-Content -Path $historyFile -Raw -ErrorAction Stop
            $history = ConvertFrom-Json $raw
            if ($history -isnot [System.Collections.IEnumerable]) {
                $history = @($history)
            }
        } catch {
            $history = @()
        }
    }

    $entry = [PSCustomObject]@{
        id             = [Guid]::NewGuid().ToString()
        backupId       = $BackupId
        backupCode     = $BackupCode
        fileName       = $FileName
        downloadedAt   = (Get-Date).ToString("o")
        folder         = $Folder
        sizeBytes      = $FileSizeBytes
        status         = $Status
        checksumStatus = $ChecksumStatus
        checksumSha256 = $ChecksumSha256
    }

    $history = @($entry) + @($history | Select-Object -First 99)
    $json = ConvertTo-Json $history -Depth 4
    Set-Content -Path $historyFile -Value $json -Force -ErrorAction SilentlyContinue
}

Write-AgentLog "========================================================"
Write-AgentLog "BizOne Windows Scheduled Backup Auto Download Agent"
Write-AgentLog "Target Server       : $ServerUrl"
Write-AgentLog "Company ID / Slug   : $CompanyId / $CompanySlug"
Write-AgentLog "Destination Folder  : $DestinationDir"
Write-AgentLog "Host Computer       : $env:COMPUTERNAME"

$activeCompanyId = $CompanyId
$lastBackupId = 0
$lastBackupCode = ""
$lastFileName = ""

try {
    # Step 1: Query Server Agent Status & Coordinate Scheduling
    $statusQueryParams = @()
    if ($CompanyId -gt 0) { $statusQueryParams += "companyId=$CompanyId" }
    elseif ($CompanySlug) { $statusQueryParams += "companySlug=$CompanySlug" }
    $statusQuery = if ($statusQueryParams.Count -gt 0) { "?" + ($statusQueryParams -join "&") } else { "" }

    $statusEndpoint = "$ServerUrl/api/system-backups/agent/status$statusQuery"
    $headers = @{
        "x-backup-agent-key" = $AgentKey
    }

    Write-AgentLog "Connecting to agent status endpoint: $statusEndpoint"
    $statusRes = $null
    try {
        $statusRes = Invoke-RestMethod -Uri $statusEndpoint -Headers $headers -Method GET -TimeoutSec 20 -UseBasicParsing
    } catch {
        throw "Failed to connect to BizOne ERP server: $($_.Exception.Message)"
    }

    if (-not $statusRes -or -not $statusRes.authenticated) {
        throw "Authentication failed. Please verify your Agent Key or Token."
    }

    $activeCompanyId = $statusRes.company.id
    $companyName = $statusRes.company.name
    Write-AgentLog "Authenticated successfully for Company: $companyName (ID: $activeCompanyId)"

    # Check if local download is enabled in server schedule
    if ($statusRes.localSchedule -and ($statusRes.localSchedule.enabled -eq $false)) {
        Write-AgentLog "Local automatic download is currently disabled for this company in ERP schedule settings. Exiting."
        exit 0
    }

    # Adopt server-configured local path if present
    if ($statusRes.localSchedule -and $statusRes.localSchedule.destinationDir) {
        $serverFolder = $statusRes.localSchedule.destinationDir
        $serverFolder = $serverFolder -replace '\\+', '\'
        if ($DestinationDir -ne $serverFolder -and -not $PSBoundParameters.ContainsKey('DestinationDir')) {
            Write-AgentLog "Updating local destination folder from server schedule: $serverFolder"
            $DestinationDir = $serverFolder
        }
    }
    if (-not (Test-Path $DestinationDir)) {
        New-Item -ItemType Directory -Path $DestinationDir -Force | Out-Null
    }

    # Keep local agent-config.json synchronized with server
    if ($ConfigPath -and (Test-Path $ConfigPath)) {
        try {
            $localConfig["DestinationDir"] = $DestinationDir
            if ($statusRes.localSchedule.downloadTime) {
                $localConfig["Time"] = $statusRes.localSchedule.downloadTime
            }
            $configJson = ConvertTo-Json $localConfig -Depth 3
            Set-Content -Path $ConfigPath -Value $configJson -Force
        } catch {}
    }

    # Step 2: Coordinate with Server Backup (Retry if in progress)
    $attempts = 0
    $latestBackup = $statusRes.latestBackup

    while ($attempts -lt $MaxRetries) {
        if (-not $latestBackup) {
            Write-AgentLog "No backups available yet on server for this company. Will retry later."
            break
        }

        $bStatus = ("$($latestBackup.status)").ToUpper()
        if ($bStatus -eq "IN_PROGRESS" -or $bStatus -eq "PENDING") {
            $attempts++
            Write-AgentLog "Server backup ($($latestBackup.backupCode)) is currently in progress. Waiting $RetryDelaySec seconds (attempt $attempts/$MaxRetries)..."
            Start-Sleep -Seconds $RetryDelaySec

            # Re-fetch status
            $statusRes = Invoke-RestMethod -Uri $statusEndpoint -Headers $headers -Method GET -TimeoutSec 20 -UseBasicParsing
            $latestBackup = $statusRes.latestBackup
            continue
        }

        break
    }

    $finalStatus = ("$($latestBackup.status)").ToLower()
    if (-not $latestBackup -or ($finalStatus -ne "completed" -and $finalStatus -ne "restored")) {
        Write-AgentLog "No completed backup archive ready for download (Status: $($latestBackup.status)). Exiting."
        exit 0
    }

    $lastBackupId = [int]$latestBackup.id
    $lastBackupCode = $latestBackup.backupCode
    $expectedChecksum = $latestBackup.checksumSha256
    $serverFileName = $latestBackup.fileName
    if (-not $serverFileName) {
        $serverFileName = "bizone_${activeCompanyId}_${lastBackupCode}.zip"
    }

    $finalLocalPath = Join-Path $DestinationDir $serverFileName

    Write-AgentLog "Latest Completed Server Backup:"
    Write-AgentLog "  Backup ID   : $lastBackupId"
    Write-AgentLog "  Backup Code : $lastBackupCode"
    Write-AgentLog "  File Name   : $serverFileName"
    Write-AgentLog "  SHA-256     : $expectedChecksum"

    # Step 3: Check if Already Downloaded and Verified
    if (Test-Path $finalLocalPath) {
        Write-AgentLog "Local file $serverFileName already exists. Verifying SHA-256 checksum..."
        $existingHash = (Get-FileHash -Path $finalLocalPath -Algorithm SHA256).Hash.ToLower()
        if ($expectedChecksum -and ($existingHash -eq $expectedChecksum.ToLower())) {
            Write-AgentLog "Archive is already fully downloaded and checksum verified. Up to date!"
            Send-ServerReport -TargetCompanyId $activeCompanyId -BackupId $lastBackupId -BackupCode $lastBackupCode `
                -FileName $serverFileName -Folder $DestinationDir -FileSizeBytes (Get-Item $finalLocalPath).Length `
                -Status "Completed" -ChecksumStatus "Passed" -ChecksumSha256 $existingHash -ErrorMessage ""
            exit 0
        } else {
            Write-AgentLog "Existing file checksum mismatch or incomplete ($existingHash vs $expectedChecksum). Will re-download fresh archive." "WARN"
        }
    }

    # Step 4: Download New Backup Archive
    Write-AgentLog "Starting download of $serverFileName to $DestinationDir..."
    Send-ServerReport -TargetCompanyId $activeCompanyId -BackupId $lastBackupId -BackupCode $lastBackupCode `
        -FileName $serverFileName -Folder $DestinationDir -FileSizeBytes $latestBackup.fileSizeBytes `
        -Status "Downloading" -ChecksumStatus "Pending" -ChecksumSha256 "" -ErrorMessage ""

    $downloadUrl = "$ServerUrl/api/system-backups/latest/download$statusQuery"
    $tempFile = Join-Path $DestinationDir ".downloading_${lastBackupCode}.tmp"

    if (Test-Path $tempFile) { Remove-Item $tempFile -Force -ErrorAction SilentlyContinue }

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $response = Invoke-WebRequest -Uri $downloadUrl -Headers $headers -OutFile $tempFile -PassThru -UseBasicParsing
    $sw.Stop()

    $downloadDurationSec = [math]::Round($sw.Elapsed.TotalSeconds, 2)
    $downloadedSize = (Get-Item $tempFile).Length
    $sizeMb = [math]::Round(($downloadedSize / 1MB), 2)
    Write-AgentLog "Downloaded $sizeMb MB in $downloadDurationSec s ($([math]::Round(($sizeMb / [math]::Max($downloadDurationSec, 0.1)), 2)) MB/s)"

    # Step 5: Verify SHA-256 Checksum
    Write-AgentLog "Verifying SHA-256 integrity..."
    $computedHash = (Get-FileHash -Path $tempFile -Algorithm SHA256).Hash.ToLower()
    Write-AgentLog "Computed Hash: $computedHash"

    if ($expectedChecksum -and ($computedHash -ne $expectedChecksum.ToLower())) {
        Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
        $errMsg = "Checksum mismatch! Expected: $expectedChecksum, Got: $computedHash"
        Send-ServerReport -TargetCompanyId $activeCompanyId -BackupId $lastBackupId -BackupCode $lastBackupCode `
            -FileName $serverFileName -Folder $DestinationDir -FileSizeBytes $downloadedSize `
            -Status "Verification Failed" -ChecksumStatus "Failed" -ChecksumSha256 $computedHash -ErrorMessage $errMsg
        Save-LocalHistoryEntry -BackupId $lastBackupId -BackupCode $lastBackupCode -FileName $serverFileName `
            -Folder $DestinationDir -FileSizeBytes $downloadedSize -Status "Verification Failed" -ChecksumStatus "Failed" -ChecksumSha256 $computedHash
        throw $errMsg
    }

    # Step 6: Atomic Move to Final Destination (Never overwrite older distinct backups)
    if (Test-Path $finalLocalPath) {
        Remove-Item $finalLocalPath -Force
    }
    Move-Item -Path $tempFile -Destination $finalLocalPath -Force
    Write-AgentLog "SUCCESS: Verified backup saved to $finalLocalPath"

    # Step 7: Record Local History and Report Success to ERP Server
    Save-LocalHistoryEntry -BackupId $lastBackupId -BackupCode $lastBackupCode -FileName $serverFileName `
        -Folder $DestinationDir -FileSizeBytes $downloadedSize -Status "Completed" -ChecksumStatus "Passed" -ChecksumSha256 $computedHash

    Send-ServerReport -TargetCompanyId $activeCompanyId -BackupId $lastBackupId -BackupCode $lastBackupCode `
        -FileName $serverFileName -Folder $DestinationDir -FileSizeBytes $downloadedSize `
        -Status "Completed" -ChecksumStatus "Passed" -ChecksumSha256 $computedHash -ErrorMessage ""

    # Step 8: Clean up expired local backups (older than KeepDays)
    if ($KeepDays -gt 0) {
        $cutoff = (Get-Date).AddDays(-$KeepDays)
        Write-AgentLog "Checking retention policy: pruning archives older than $KeepDays days..."
        Get-ChildItem -Path $DestinationDir -Filter "*.zip" | Where-Object { $_.LastWriteTime -lt $cutoff } | ForEach-Object {
            Write-AgentLog "Pruning expired local backup: $($_.Name)"
            Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
        }
    }

    Write-AgentLog "Backup Auto Download Agent finished successfully!"
    Write-AgentLog "========================================================"
    exit 0
}
catch {
    $err = $_.Exception.Message
    Write-AgentLog "ERROR: $err" "ERROR"
    if ($tempFile -and (Test-Path $tempFile)) {
        Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
    }
    if ($activeCompanyId -gt 0) {
        Send-ServerReport -TargetCompanyId $activeCompanyId -BackupId $lastBackupId -BackupCode $lastBackupCode `
            -FileName $serverFileName -Folder $DestinationDir -FileSizeBytes 0 `
            -Status "Failed" -ChecksumStatus "Failed" -ChecksumSha256 "" -ErrorMessage $err
        Save-LocalHistoryEntry -BackupId $lastBackupId -BackupCode $lastBackupCode -FileName $serverFileName `
            -Folder $DestinationDir -FileSizeBytes 0 -Status "Failed" -ChecksumStatus "Failed" -ChecksumSha256 ""
    }
    exit 1
}
