@echo off
title Amazon Image Studio - Stop

echo ========================================
echo   Stopping Amazon Image Studio...
echo ========================================
echo.

:: ============================================================
:: Step 1: Kill all Node processes
:: ============================================================
echo [Step 1/3] Stopping ALL Node processes...
taskkill /F /IM node.exe >nul 2>nul

if %errorlevel% equ 0 (
    echo [OK] All Node processes terminated successfully
) else (
    echo [INFO] No running Node processes found
    echo This is normal if services are not running.
)
echo.

:: ============================================================
:: Step 2: Verify ports are released
:: ============================================================
echo [Step 2/3] Verifying port status...
echo.

:: Check port 3001
netstat -ano | findstr ":3001" >nul 2>nul
if %errorlevel% equ 0 (
    echo [WARN] Port 3001 is STILL in use!
    echo Some process may be blocking it.
    echo.
    echo Processes using port 3001:
    netstat -ano | findstr ":3001"
    echo.
    echo To manually kill the process:
    echo   1. Note the PID (last column above)
    echo   2. Run: taskkill /F /PID ^<PID^>
    echo.
) else (
    echo [OK] Port 3001 is FREE
)

echo.

:: Check port 5173
netstat -ano | findstr ":5173" >nul 2>nul
if %errorlevel% equ 0 (
    echo [WARN] Port 5173 is STILL in use!
    echo Some process may be blocking it.
    echo.
    echo Processes using port 5173:
    netstat -ano | findstr ":5173"
    echo.
    echo To manually kill the process:
    echo   1. Note the PID (last column above)
    echo   2. Run: taskkill /F /PID ^<PID^>
    echo.
) else (
    echo [OK] Port 5173 is FREE
)

echo.

:: ============================================================
:: Step 3: Summary
:: ============================================================
echo [Step 3/3] Cleanup complete!
echo.
echo ========================================
echo   Stop Complete!
echo ========================================
echo.
echo All Node processes have been terminated.
echo.
echo Next steps:
echo - To restart: Double-click start-amazon-image-studio.bat
echo - If ports are still in use: Restart your computer
echo.
pause
