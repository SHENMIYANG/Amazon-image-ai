@echo off
title Amazon Image Studio - Stop

echo ========================================
echo   Stopping Amazon Image Studio...
echo ========================================
echo.

:: Step 1: Kill all Node processes
echo [Step 1] Stopping ALL Node processes...
taskkill /F /IM node.exe >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] Node processes terminated
) else (
    echo [INFO] No running Node processes found
)
echo.

:: Step 2: Check if ports are still in use
echo [Step 2] Checking port 3001...
netstat -ano | findstr ":3001" >nul 2>nul
if %errorlevel% equ 0 (
    echo [WARN] Port 3001 is still in use!
    echo Some process may be blocking it.
    echo.
    echo To find the process:
    echo netstat -ano ^| findstr ":3001"
    echo.
) else (
    echo [OK] Port 3001 is free
)

echo.
echo [Step 3] Checking port 5173...
netstat -ano | findstr ":5173" >nul 2>nul
if %errorlevel% equ 0 (
    echo [WARN] Port 5173 is still in use!
    echo Some process may be blocking it.
    echo.
    echo To find the process:
    echo netstat -ano ^| findstr ":5173"
    echo.
) else (
    echo [OK] Port 5173 is free
)

echo.
echo ========================================
echo   Stop Complete!
echo ========================================
echo.
echo You can now restart the services.
echo.
pause
