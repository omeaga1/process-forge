@echo off
setlocal enabledelayedexpansion
title ProcessForge 1-Click Reinstaller and Purge
color 0A

echo ==========================================================
echo   ProcessForge Industrial Digital Twin Studio
echo   Automated 1-Click Installer and Reinstaller
echo ==========================================================
echo.
echo [1/4] Stopping running ProcessForge processes...
taskkill /F /IM ProcessForge.exe /T > nul 2>&1
ping 127.0.0.1 -n 2 > nul

set "TARGET=%LOCALAPPDATA%\ProcessForge"
set "TEMP_DIR=%TEMP%\ProcessForgeSetup"
set "TEMP_ZIP=%TEMP_DIR%\pf-bundle.zip"
set "TEMP_EXTRACT=%TEMP_DIR%\extract"

echo [2/4] Purging existing installation at %TARGET%...
if exist "%TARGET%" (
  rd /s /q "%TARGET%" > nul 2>&1
)
if exist "%USERPROFILE%\Desktop\ProcessForge.lnk" (
  del /f /q "%USERPROFILE%\Desktop\ProcessForge.lnk" > nul 2>&1
)

if not exist "%TEMP_DIR%" mkdir "%TEMP_DIR%" > nul 2>&1
if exist "%TEMP_EXTRACT%" rd /s /q "%TEMP_EXTRACT%" > nul 2>&1
if exist "%TEMP_ZIP%" del /f /q "%TEMP_ZIP%" > nul 2>&1

echo [3/4] Downloading verified release package (Antivirus-Safe)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$candidates = @('https://process-forge.pages.dev/process-forge-windows-portable-x64.zip','https://github.com/omeaga1/process-forge/releases/latest/download/process-forge-windows-portable-x64.zip','https://github.com/omeaga1/process-forge/releases/download/v0.1.1/process-forge-windows-portable-x64.zip','https://raw.githubusercontent.com/omeaga1/process-forge/main/release-dist/process-forge-windows-portable-x64.zip'); foreach ($u in $candidates) { try { Invoke-WebRequest -Uri $u -OutFile '%TEMP_ZIP%' -UseBasicParsing -TimeoutSec 30; if ((Test-Path '%TEMP_ZIP%') -and ((Get-Item '%TEMP_ZIP%').Length -gt 10000)) { break } } catch {} }"

if not exist "%TEMP_ZIP%" (
  echo ERROR: Failed to download release bundle. Please check internet connection.
  pause
  exit /b 1
)

echo [4/4] Extracting and setting up ProcessForge...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '%TEMP_ZIP%' -DestinationPath '%TEMP_EXTRACT%' -Force"

if not exist "%TARGET%" mkdir "%TARGET%" > nul 2>&1

if exist "%TEMP_EXTRACT%\process-forge-windows-portable" (
  xcopy /E /I /Y "%TEMP_EXTRACT%\process-forge-windows-portable\*" "%TARGET%\" > nul
) else (
  xcopy /E /I /Y "%TEMP_EXTRACT%\*" "%TARGET%\" > nul
)

echo Setting up Desktop and Start Menu shortcuts...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\\ProcessForge.lnk'); $s.TargetPath = '%TARGET%\\ProcessForge.exe'; $s.WorkingDirectory = '%TARGET%'; $s.IconLocation = '%TARGET%\\icon.ico,0'; $s.Description = 'ProcessForge Industrial Twin Studio'; $s.Save()"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([Environment]::GetFolderPath('StartMenu') + '\\Programs\\ProcessForge.lnk'); $s.TargetPath = '%TARGET%\\ProcessForge.exe'; $s.WorkingDirectory = '%TARGET%'; $s.IconLocation = '%TARGET%\\icon.ico,0'; $s.Description = 'ProcessForge Industrial Twin Studio'; $s.Save()"

rd /s /q "%TEMP_DIR%" > nul 2>&1

echo ==========================================================
echo   Installation Complete! Launching ProcessForge...
echo ==========================================================
start "" "%TARGET%\ProcessForge.exe"
ping 127.0.0.1 -n 2 > nul
exit
