@echo off
setlocal
if "%~1"=="" (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\server.ps1" -Port 3000
) else (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\server.ps1" %*
)
