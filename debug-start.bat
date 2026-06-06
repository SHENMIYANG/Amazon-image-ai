@echo off
title Amazon Image Studio - Debug

echo ========================================
echo   Amazon Image Studio - Debug Mode
echo ========================================
echo.

echo [1] Checking Node.js...
where node
echo Node version:
node --version
echo.

echo [2] Checking npm...
where npm
echo npm version:
npm --version
echo.

echo [3] Checking current directory...
cd
echo.

echo [4] Checking if node_modules exist...
if exist "frontend\node_modules" (
    echo [OK] frontend\node_modules exists
) else (
    echo [MISSING] frontend\node_modules NOT found!
)

if exist "backend\node_modules" (
    echo [OK] backend\node_modules exists
) else (
    echo [MISSING] backend\node_modules NOT found!
)
echo.

echo [5] Testing npm run dev...
echo This will show the actual error:
echo.
call npm run dev

echo.
echo ========================================
echo Script finished with error code: %errorlevel%
echo ========================================
pause
