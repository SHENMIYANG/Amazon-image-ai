@echo off
setlocal enabledelayedexpansion
cls

echo ====================================
echo   Ecommerce Image Gen - Dev Mode
echo ====================================
echo.

REM Check .env
if not exist "backend\.env" (
    echo Warning: backend\.env not found
    echo Please configure OpenAI API Key first
    echo.
)

echo Starting backend...
echo.

REM Start backend in background
start /b cmd /k "cd backend ^&^& npm run dev"

echo Waiting for backend to start...
timeout /t 3 /nobreak >nul

echo.
echo Starting frontend...
echo.

REM Start frontend in background
start /b cmd /k "cd frontend ^&^& npm run dev"

timeout /t 3 /nobreak >nul

echo.
echo ====================================
echo   Services Starting...
echo ====================================
echo.
echo Frontend: http://localhost:5173
echo Backend:  http://localhost:3001
echo Health:   http://localhost:3001/api/health
echo.
echo Services running in background
echo Close this window to exit
echo ====================================
echo.

REM Keep window open
cmd /k
