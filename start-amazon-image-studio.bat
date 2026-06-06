@echo off
cd /d "%~dp0"
title Amazon Image Studio

echo ========================================
echo   Amazon Image Studio - Startup
echo ========================================
echo.

echo [Step 1/5] Checking Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Node.js NOT FOUND!
    echo Install from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js found
node --version
npm --version
echo.

echo [Step 2/5] Cleaning old Node processes...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul
echo [OK] Cleaned
echo.

echo [Step 3/5] Validating project structure...
if not exist "package.json" (
    echo [ERROR] Root package.json NOT found!
    pause
    exit /b 1
)
echo [OK] Root package.json found

if not exist "frontend\package.json" (
    echo [ERROR] frontend\package.json NOT found!
    pause
    exit /b 1
)
echo [OK] Frontend package.json found

if not exist "backend\package.json" (
    echo [ERROR] backend\package.json NOT found!
    pause
    exit /b 1
)
echo [OK] Backend package.json found
echo.

echo [Step 4/5] Checking dependencies...
echo.

if not exist "node_modules" (
    echo [INFO] Installing root dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Root install FAILED!
        pause
        exit /b 1
    )
    echo [OK] Root dependencies installed
) else (
    echo [OK] Root dependencies found
)
echo.

if not exist "frontend\node_modules" (
    echo [INFO] Installing frontend dependencies...
    pushd frontend
    call npm install
    if %errorlevel% neq 0 (
        popd
        echo [ERROR] Frontend install FAILED!
        pause
        exit /b 1
    )
    popd
    echo [OK] Frontend dependencies installed
) else (
    echo [OK] Frontend dependencies found
)
echo.

if not exist "backend\node_modules" (
    echo [INFO] Installing backend dependencies...
    pushd backend
    call npm install --production
    if %errorlevel% neq 0 (
        popd
        echo [ERROR] Backend install FAILED!
        pause
        exit /b 1
    )
    popd
    echo [OK] Backend dependencies installed
) else (
    echo [OK] Backend dependencies found
)
echo.

echo [Step 5/5] Starting services...
echo.
echo ========================================
echo   Starting...
echo ========================================
echo Frontend: http://localhost:5173
echo Backend: http://localhost:3001
echo.
echo Press Ctrl+C to stop
echo.

call npm run dev

echo.
echo [ERROR] Failed to start!
echo Error code: %errorlevel%
echo.
pause
exit /b 1
