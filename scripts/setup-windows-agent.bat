@echo off
title BizOne Windows Backup Agent Setup
echo ========================================================
echo   BizOne Singapore ERP - Windows Backup Agent Setup
echo ========================================================
echo.
cd /d "%~dp0"
powershell.exe -ExecutionPolicy Bypass -NoProfile -File ".\setup-windows-agent.ps1"
echo.
pause

