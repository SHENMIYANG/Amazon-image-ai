@echo off
title Amazon Image Studio - 停止服务

echo ========================================
echo   正在停止 Amazon Image Studio...
echo ========================================
echo.

:: 查找并结束 Node 进程
echo [停止] 正在结束 Node 进程...

taskkill /F /IM node.exe 2>nul
if %errorlevel% equ 0 (
    echo [成功] 服务已停止
) else (
    echo [提示] 未找到运行中的 Node 进程
)

echo.
echo 按任意键关闭此窗口...
pause >nul
