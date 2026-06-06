@echo off
cd /d "%~dp0"
title Amazon Image Studio

echo ========================================
echo   Amazon Image Studio - Quick Start
echo ========================================
echo.

echo Cleaning old processes...
taskkill /F /IM node.exe >nul 2>nul
timeout /t 1 /nobreak >nul

echo Starting services...
echo Frontend: http://localhost:5173
echo Backend: http://localhost:3001
echo.
echo Press Ctrl+C to stop
echo.

call npm run dev
