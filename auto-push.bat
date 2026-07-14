@echo off
cd /d "%~dp0"

set logfile=auto-push-log.txt

REM Check if there are any changes
git diff-index --quiet HEAD --
if %errorlevel% equ 0 (
    echo [%date% %time%] No changes - skipping >> "%logfile%"
    exit /b 0
)

REM There are changes - commit and push automatically
git add -A
git commit -m "Auto-backup: %date% %time%" >> "%logfile%" 2>&1
git push origin master >> "%logfile%" 2>&1

echo [%date% %time%] Auto-backup pushed successfully >> "%logfile%"
