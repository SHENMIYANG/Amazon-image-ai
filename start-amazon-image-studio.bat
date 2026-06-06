@echo off
title Amazon Image Studio - Start

echo ========================================
echo   Amazon Image Studio - Startup
echo ========================================
echo.

:: ============================================================
:: Step 1: Check Node.js
:: ============================================================
echo [Step 1/5] Checking Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Node.js NOT FOUND!
    echo.
    echo Please install Node.js 20 LTS or higher first.
    echo Download: https://nodejs.org/
    echo.
    echo After installation, RESTART the terminal and try again.
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js found
node --version

:: Check npm version
npm --version >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] npm NOT FOUND!
    echo Node.js installation may be corrupted.
    echo.
    pause
    exit /b 1
)

echo.

:: ============================================================
:: Step 2: Clean old processes
:: ============================================================
echo [Step 2/5] Cleaning old Node processes...
taskkill /F /IM node.exe >nul 2>nul
timeout /t 2 /nobreak >nul
echo [OK] Cleaned
echo.

:: ============================================================
:: Step 3: Validate package.json files exist
:: ============================================================
echo [Step 3/5] Validating project structure...

if not exist "package.json" (
    echo [ERROR] Root package.json NOT found!
    echo Project may be corrupted or incomplete.
    echo.
    pause
    exit /b 1
)
echo [OK] Root package.json found

if not exist "frontend\package.json" (
    echo [ERROR] frontend\package.json NOT found!
    echo Project may be corrupted or incomplete.
    echo.
    pause
    exit /b 1
)
echo [OK] Frontend package.json found

if not exist "backend\package.json" (
    echo [ERROR] backend\package.json NOT found!
    echo Project may be corrupted or incomplete.
    echo.
    pause
    exit /b 1
)
echo [OK] Backend package.json found

echo.

:: ============================================================
:: Step 4: Install dependencies (if needed)
:: ============================================================
echo [Step 4/5] Checking and installing dependencies...
echo.

:: --- Root dependencies ---
if not exist "node_modules" (
    echo [INFO] Root dependencies NOT found, installing...
    echo This may take 1-2 minutes.
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] Root dependency installation FAILED!
        echo Possible causes:
        echo   - Network connection issue
        echo   - npm registry unreachable
        echo   - package.json corrupted
        echo.
        echo Try again or check your internet connection.
        echo.
        pause
        exit /b 1
    )
    echo [OK] Root dependencies installed
) else (
    echo [OK] Root dependencies already installed
)
echo.

:: --- Frontend dependencies ---
if not exist "frontend\node_modules" (
    echo [INFO] Frontend dependencies NOT found, installing...
    echo This may take 2-3 minutes on first run.
    echo.
    pushd frontend
    call npm install
    if %errorlevel% neq 0 (
        popd
        echo.
        echo [ERROR] Frontend dependency installation FAILED!
        echo Possible causes:
        echo   - Network connection issue
        echo   - npm registry unreachable
        echo   - package.json corrupted
        echo.
        echo Try again or check your internet connection.
        echo.
        pause
        exit /b 1
    )
    popd
    echo [OK] Frontend dependencies installed
) else (
    echo [OK] Frontend dependencies already installed
)
echo.

:: --- Backend dependencies ---
if not exist "backend\node_modules" (
    echo [INFO] Backend dependencies NOT found, installing...
    echo.
    pushd backend
    call npm install --production
    if %errorlevel% neq 0 (
        popd
        echo.
        echo [ERROR] Backend dependency installation FAILED!
        echo Possible causes:
        echo   - Network connection issue
        echo   - npm registry unreachable
        echo   - package.json corrupted
        echo.
        echo Try again or check your internet connection.
        echo.
        pause
        exit /b 1
    )
    popd
    echo [OK] Backend dependencies installed
) else (
    echo [OK] Backend dependencies already installed
)
echo.

:: ============================================================
:: Step 5: Start services
:: ============================================================
echo [Step 5/5] Starting services...
echo.
echo ========================================
echo   Services Starting...
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

call npm run dev

:: If we reach here, npm run dev returned an error
echo.
echo ========================================
echo [ERROR] Failed to start services!
echo ========================================
echo.
echo Error code: %errorlevel%
echo.
echo Common causes and solutions:
echo.
echo 1. PORT ALREADY IN USE
echo    Solution: Double-click stop-amazon-image-studio.bat
echo    Then try again.
echo.
echo 2. DEPENDENCIES CORRUPTED
echo    Solution: Delete node_modules folders and re-run.
echo.
echo 3. NODE.JS VERSION TOO OLD
echo    Solution: Install Node.js 20 LTS or higher.
echo.
echo 4. API KEY NOT CONFIGURED
echo    Solution: Create backend\.env with your API key.
echo.
pause
exit /b 1
