@echo off
chcp 65001 >nul
title Amazon Image Studio - 启动脚本

echo ========================================
echo   Amazon Image Studio 启动程序
echo ========================================
echo.

:: 检查 Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js
    echo.
    echo 请先安装 Node.js 20 LTS 或更高版本
    echo 下载地址：https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [检查] Node.js 已安装
node --version
echo.

:: 检查前端依赖
if not exist "frontend\node_modules" (
    echo [安装] 首次运行，正在安装前端依赖...
    cd frontend
    call npm ci
    if %errorlevel% neq 0 (
        echo [错误] 前端依赖安装失败
        cd ..
        pause
        exit /b 1
    )
    cd ..
) else (
    echo [检查] 前端依赖已安装
)

:: 检查后端依赖
if not exist "backend\node_modules" (
    echo [安装] 首次运行，正在安装后端依赖...
    cd backend
    call npm ci --production
    if %errorlevel% neq 0 (
        echo [错误] 后端依赖安装失败
        cd ..
        pause
        exit /b 1
    )
    cd ..
) else (
    echo [检查] 后端依赖已安装
)

echo.
echo ========================================
echo   正在启动服务...
echo ========================================
echo.
echo 前端：http://localhost:5173
echo 后端：http://localhost:3001
echo.
echo 提示：在浏览器右上角设置中配置 API Key
echo.
echo 按 Ctrl+C 停止服务
echo.

:: 启动服务
call npm run dev

pause
