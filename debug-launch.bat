@echo off
cd /d "%~dp0"
title Amazon Image Studio - Debug

echo ========================================
echo   Amazon Image Studio - Debug Mode
echo ========================================
echo.

echo [Step 1/5] Checking Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js NOT FOUND!
    goto :error
)
echo [OK] Node.js found
node --version
npm --version
echo.

echo [Step 2/5] Cleaning old processes...
taskkill /F /IM node.exe >nul 2>nul
timeout /t 2 /nobreak >nul
echo [OK] Cleaned
echo.

echo [Step 3/5] Validating project structure...
if not exist "package.json" (
    echo [ERROR] Root package.json NOT found!
    goto :error
)
echo [OK] Root package.json found

if not exist "frontend\package.json" (
    echo [ERROR] frontend\package.json NOT found!
    goto :error
)
echo [OK] Frontend package.json found

if not exist "backend\package.json" (
    echo [ERROR] backend\package.json NOT found!
    goto :error
)
echo [OK] Backend package.json found
echo.

echo [Step 4/5] Checking dependencies...
if not exist "node_modules" (
    echo [INFO] Installing root dependencies...
    call npm install
    if %errorlevel% neq 0 goto :error
    echo [OK] Installed
) else (
    echo [OK] Found
)

if not exist "frontend\node_modules" (
    echo [INFO] Installing frontend dependencies...
    pushd frontend && call npm install && popd
    if %errorlevel% neq 0 goto :error
    echo [OK] Installed
) else (
    echo [OK] Found
)

if not exist "backend\node_modules" (
    echo [INFO] Installing backend dependencies...
    pushd backend && call npm install --production && popd
    if %errorlevel% neq 0 goto :error
    echo [OK] Installed
) else (
    echo [OK] Found
)
echo.

echo [Step 5/5] Starting services...
echo Frontend: http://localhost:5173
echo Backend: http://localhost:3001
echo.
echo Press Ctrl+C to stop
echo.

call npm run dev

:error
echo.
echo ========================================
echo   ERROR OCCURRED!
echo ========================================
echo Error code: %errorlevel%
echo.
echo Press any key to see details...
pause >nul
echo.
echo Current directory: %cd%
echo.
dir /b
echo.
pause
