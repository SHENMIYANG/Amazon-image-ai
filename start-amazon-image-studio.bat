@echo off
title Amazon Image Studio - Start

echo ========================================
echo   Amazon Image Studio - Startup
echo ========================================
echo.

:: Step 1: Check Node.js
echo [Step 1] Checking Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Node.js NOT FOUND!
    echo.
    echo Please install Node.js 20 LTS or higher first.
    echo Download: https://nodejs.org/
    echo.
    echo Install Node.js, then run this script again.
    echo.
    pause
    exit /b 1
)
echo [OK] Node.js found
node --version
echo.

:: Step 2: Clean old processes
echo [Step 2] Cleaning old Node processes...
taskkill /F /IM node.exe >nul 2>nul
timeout /t 2 /nobreak >nul
echo [OK] Cleaned
echo.

:: Step 3: Check dependencies
echo [Step 3] Checking dependencies...

:: Install root dependencies first (concurrently, etc.)
if not exist "node_modules" (
    echo [INFO] Installing root dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] Root install FAILED!
        echo.
        pause
        exit /b 1
    )
    echo [OK] Root dependencies installed
) else (
    echo [OK] Root dependencies found
)
echo.

if not exist "frontend\node_modules" (
    echo [INFO] Frontend dependencies NOT installed, installing now...
    echo This may take 2-3 minutes on first run.
    echo.
    pushd frontend
    call npm install
    if %errorlevel% neq 0 (
        popd
        echo.
        echo [ERROR] Frontend install FAILED!
        echo Check your internet connection and try again.
        echo.
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
    echo [INFO] Backend dependencies NOT installed, installing now...
    pushd backend
    call npm install --production
    if %errorlevel% neq 0 (
        popd
        echo.
        echo [ERROR] Backend install FAILED!
        echo.
        pause
        exit /b 1
    )
    popd
    echo [OK] Backend dependencies installed
) else (
    echo [OK] Backend dependencies found
)

echo.
echo ========================================
echo   Starting services...
echo ========================================
echo.
echo Frontend: http://localhost:5173
echo Backend:  http://localhost:3001
echo.
echo IMPORTANT:
echo - Do NOT close this black window!
echo - To stop: press Ctrl+C in this window
echo - Or double-click: stop-amazon-image-studio.bat
echo.
echo Starting now...
echo.

:: Step 4: Start services
call npm run dev

:: If we reach here, npm run dev returned an error
echo.
echo ========================================
echo [ERROR] Failed to start!
echo ========================================
echo.
echo Error code: %errorlevel%
echo.
echo Possible causes:
echo 1. Port 3001 or 5173 already in use
echo 2. Dependencies corrupted
echo 3. Node.js version too old
echo.
echo Try this:
echo 1. Double-click stop-amazon-image-studio.bat
echo 2. Then run this script again
echo.
pause
exit /b 1
