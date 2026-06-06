@echo off
cd /d "%~dp0"
echo Step 1: Node check
where node >nul 2>nul && echo OK || echo FAIL
echo Step 2: Version
node --version
npm --version
echo Step 3: After version
timeout /t 3
echo Step 4: Done
pause
