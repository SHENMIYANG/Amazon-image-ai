@echo off
cd /d "%~dp0"
echo ========================================
echo   DEBUG MODE - µ÷ÊÔÄ£Ê½
echo ========================================
echo.

echo [DEBUG 1] Current directory: %CD%
echo.

echo [DEBUG 2] Checking Node.js...
where node
echo Node exit code: %errorlevel%
echo.

echo [DEBUG 3] Node version...
node --version
echo.

echo [DEBUG 4] npm version...
npm --version
echo.

echo [DEBUG 5] Cleaning processes...
taskkill /F /IM node.exe
echo Taskkill exit code: %errorlevel%
echo.

echo [DEBUG 6] Waiting 2 seconds...
timeout /t 2
echo.

echo [DEBUG 7] Checking files...
dir package.json
dir frontend\package.json
dir backend\package.json
echo.

echo [DEBUG 8] Starting services...
echo This will take a moment...
echo.

call npm run dev

echo.
echo [DEBUG 9] If you see this, npm returned an error
echo Error code: %errorlevel%
echo.
pause
