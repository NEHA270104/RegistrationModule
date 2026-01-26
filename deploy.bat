@echo off
REM Quick Deploy Script - Double-click to run
REM Or run from command prompt: deploy.bat

echo.
echo ========================================
echo   BizFlow Registration Deployment
echo ========================================
echo.

cd /d "%~dp0"

REM Run PowerShell script
powershell -ExecutionPolicy Bypass -File "%~dp0deploy.ps1"

pause
