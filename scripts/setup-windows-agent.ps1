<#
.SYNOPSIS
    BizOne Singapore ERP - Windows Scheduled Backup Agent Setup & Configuration Tool.
    Configures local destination folder, saves persistent credentials, and registers Windows Task Scheduler.

.DESCRIPTION
    - Provides a native Windows GUI Folder Browser Dialog to select any drive/folder (e.g. D:\BizOneBackups).
    - Validates server connection and authenticates company-scoped credentials.
    - Saves configuration persistently to agent-config.json so you never have to re-enter it.
    - Automatically creates/updates a Windows Scheduled Task with:
        * Daily/Weekly schedule (e.g. 02:30 AM)
        * 'StartWhenAvailable' flag (ensures missed backups run as soon as your PC turns on)
        * Overlap prevention ('IgnoreNew')
    - Offers an optional immediate test download with SHA-256 integrity verification.

.EXAMPLE
    # Interactive setup (opens folder browser dialog):
    powershell.exe -ExecutionPolicy Bypass -File .\scripts\setup-windows-agent.ps1

    # Automated / Scripted setup:
    powershell.exe -ExecutionPolicy Bypass -File .\scripts\setup-windows-agent.ps1 -Folder "D:\BizOneBackups" -ServerUrl "http://localhost:8080" -CompanyId 23 -Time "02:30" -TestDownload
#>

param(
    [string]$Folder = "",
    [string]$ServerUrl = "http://localhost:8080",
    [int]$CompanyId = 0,
    [string]$CompanySlug = "",
    [string]$AgentKey = "bizone-backup-sync-key",
    [string]$Time = "02:30",
    [string]$AmPm = "",
    [string]$Frequency = "Daily",
    [switch]$TestDownload,
    [switch]$Interactive = $true
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$configFile = Join-Path $scriptDir "agent-config.json"
$agentScript = Join-Path $scriptDir "windows-backup-agent.ps1"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "BizOne Singapore ERP - Windows Backup Agent Setup" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

# Step 1: Resolve Local Destination Folder
if (-not $Folder) {
    # Check existing config
    if (Test-Path $configFile) {
        try {
            $existing = Get-Content -Path $configFile -Raw | ConvertFrom-Json
            if ($existing.DestinationDir) {
                $Folder = $existing.DestinationDir
            }
        } catch {}
    }

    if (-not $Folder) {
        $Folder = "C:\BizOneBackups"
    }

    # If run in an interactive session, prompt with GUI Folder Browser
    if ($Host.UI.RawUI -and [Environment]::UserInteractive) {
        try {
            Add-Type -AssemblyName System.Windows.Forms
            $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
            $dialog.Description = "Select or Create Destination Folder for BizOne Backups (e.g. D:\BizOneBackups)"
            $dialog.SelectedPath = $Folder
            $dialog.ShowNewFolderButton = $true

            Write-Host "Opening Windows Folder Browser Dialog..." -ForegroundColor Yellow
            $result = $dialog.ShowDialog()
            if ($result -eq [System.Windows.Forms.DialogResult]::OK -and $dialog.SelectedPath) {
                $Folder = $dialog.SelectedPath
            }
        } catch {
            Write-Host "GUI dialog unavailable; using path: $Folder" -ForegroundColor Gray
        }
    }
}

# Ensure drive and directory exist
try {
    if (-not (Test-Path $Folder)) {
        New-Item -ItemType Directory -Path $Folder -Force | Out-Null
    }
    Write-Host "[OK] Destination Folder Verified: $Folder" -ForegroundColor Green
} catch {
    Write-Host "[!] Could not create or access $($Folder): $($_.Exception.Message)" -ForegroundColor Red
    $Folder = "C:\BizOne_Backups"
    New-Item -ItemType Directory -Path $Folder -Force | Out-Null
    Write-Host "Fallback to: $Folder" -ForegroundColor Yellow
}

# Step 2: Validate Server Connection and Authentication
$ServerUrl = $ServerUrl.TrimEnd("/")
Write-Host "Testing connection to BizOne ERP Server ($ServerUrl)..." -ForegroundColor Yellow

$statusQuery = ""
if ($CompanyId -gt 0) { $statusQuery = "?companyId=$CompanyId" }
elseif ($CompanySlug) { $statusQuery = "?companySlug=$CompanySlug" }

$statusUrl = "$ServerUrl/api/system-backups/agent/status$statusQuery"
$statusHeaders = @{ "x-backup-agent-key" = $AgentKey }

try {
    $statusRes = Invoke-RestMethod -Uri $statusUrl -Headers $statusHeaders -Method GET -TimeoutSec 15 -UseBasicParsing
    if (-not $statusRes.authenticated) {
        throw "Authentication failed. Server rejected agent key."
    }
    $resolvedCompanyId = $statusRes.company.id
    $resolvedCompanyName = $statusRes.company.name
    Write-Host "[OK] Connected to Server for: $resolvedCompanyName (ID: $resolvedCompanyId)" -ForegroundColor Green
    if ($CompanyId -eq 0) { $CompanyId = $resolvedCompanyId }
} catch {
    Write-Host "[WARN] Server connection test failed: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "Continuing configuration with specified settings..." -ForegroundColor Gray
}

# Step 3: Save Configuration Persistently in agent-config.json
$configObj = [ordered]@{
    ServerUrl       = $ServerUrl
    CompanyId       = $CompanyId
    CompanySlug     = $CompanySlug
    DestinationDir  = $Folder
    AgentKey        = $AgentKey
    Time            = $Time
    Frequency       = $Frequency
    LastConfiguredAt = (Get-Date).ToString("o")
}

$configJson = ConvertTo-Json $configObj -Depth 3
Set-Content -Path $configFile -Value $configJson -Force
Write-Host "[OK] Persistent configuration saved to: $configFile" -ForegroundColor Green

# Step 4: Register or Update Windows Task Scheduler Task
$taskName = "BizOne_Backup_Download_Comp$CompanyId"
Write-Host "Configuring Windows Task Scheduler Task: $taskName..." -ForegroundColor Yellow

try {
    # Check if task already exists and unregister cleanly
    $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existingTask) {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false | Out-Null
        Write-Host "  Removed previous task definition" -ForegroundColor Gray
    }

    # Parse schedule time (supports HH:mm, 12-hr with AM/PM, or 24-hr)
    $hour = 2
    $minute = 30
    $detectedAmPm = ""
    if ($Time -match '^(\d{1,2}):(\d{2})(?:\s*([AaPp][Mm]))?') {
        $hour = [int]$Matches[1]
        $minute = [int]$Matches[2]
        if ($Matches[3]) { $detectedAmPm = $Matches[3] }
    }

    $effectiveAmPm = if ($AmPm) { $AmPm.ToUpper().Trim() } elseif ($detectedAmPm) { $detectedAmPm.ToUpper().Trim() } else { "" }
    if ($effectiveAmPm -eq "PM" -and $hour -lt 12) {
        $hour += 12
    } elseif ($effectiveAmPm -eq "AM" -and $hour -eq 12) {
        $hour = 0
    }
    $triggerTime = (Get-Date).Date.AddHours($hour).AddMinutes($minute)

    # Action: invoke PowerShell agent script with bypass
    $actionArg = "-ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File `"$agentScript`" -ConfigPath `"$configFile`""
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $actionArg

    # Trigger: Daily / Weekly
    if ($Frequency -eq "Weekly") {
        $trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At $triggerTime
    } else {
        $trigger = New-ScheduledTaskTrigger -Daily -At $triggerTime
    }

    # Settings: StartWhenAvailable (catch missed runs!), IgnoreNew (no overlap)
    $settings = New-ScheduledTaskSettingsSet `
        -StartWhenAvailable `
        -MultipleInstances IgnoreNew `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -ExecutionTimeLimit (New-TimeSpan -Hours 2)

    # Principal: run as current logged on user with normal permissions
    $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

    Register-ScheduledTask `
        -TaskName $taskName `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -Principal $principal `
        -Description "BizOne Singapore ERP Automatic Backup Download Agent for Company $CompanyId" | Out-Null

    Write-Host "[OK] Windows Scheduled Task successfully registered!" -ForegroundColor Green
    Write-Host "  Task Name : $taskName" -ForegroundColor Cyan
    Write-Host "  Trigger   : $Frequency at $(('{0:D2}:{1:D2}' -f $hour, $minute))" -ForegroundColor Cyan
    Write-Host "  Policy    : Runs automatically even if computer was asleep/offline at scheduled time" -ForegroundColor Cyan
} catch {
    Write-Host "[WARN] Could not register Scheduled Task automatically (may need elevation): $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "  You can run PowerShell as Administrator or execute agent manually." -ForegroundColor Gray
}

# Step 5: Optional Test Download
if ($TestDownload) {
    Write-Host "`nRunning Test Download Now..." -ForegroundColor Yellow
    & powershell.exe -ExecutionPolicy Bypass -File $agentScript -ConfigPath $configFile
}

Write-Host "========================================================" -ForegroundColor Green
Write-Host "Setup Completed Successfully!" -ForegroundColor Green
Write-Host "Local Backup Folder: $Folder" -ForegroundColor White
Write-Host "========================================================" -ForegroundColor Green
