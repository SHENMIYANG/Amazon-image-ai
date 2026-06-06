@echo off
cd /d "%~dp0"
title Amazon Image Studio

echo ========================================
echo   Amazon Image Studio - Startup
echo ========================================
echo.

echo Checking Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js NOT FOUND!
    echo Install from: https://nodejs.org/
    pause
    exit /b 1
)
echo [OK] Node.js found
echo.

echo Starting services...
echo Frontend: http://localhost:5173
echo Backend: http://localhost:3001
echo.
echo Press Ctrl+C to stop
echo.

npx concurrently --kill-others --names "BACKEND,FRONTEND" --prefix-colors "cyan,green" "cd backend ^&^& npm start" "cd frontend ^&^& npm run dev"

pause
