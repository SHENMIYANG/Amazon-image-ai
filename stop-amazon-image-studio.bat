@echo off
title Amazon Image Studio - Stop

echo ========================================
echo   Stopping Amazon Image Studio...
echo ========================================
echo.

:: Stop Node processes
echo [Stop] Terminating Node processes...

taskkill /F /IM node.exe 2>nul
if %errorlevel% equ 0 (
    echo [OK] Services stopped
) else (
    echo [INFO] No running Node processes found
)

echo.
echo Press any key to close this window...
pause
