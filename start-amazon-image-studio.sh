#!/bin/bash

echo "========================================"
echo "  Amazon Image Studio 启动程序"
echo "========================================"
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "[错误] 未检测到 Node.js"
    echo ""
    echo "请先安装 Node.js 20 LTS 或更高版本"
    echo "下载地址：https://nodejs.org/"
    echo ""
    exit 1
fi

echo "[检查] Node.js 已安装"
node --version
echo ""

# 检查前端依赖
if [ ! -d "frontend/node_modules" ]; then
    echo "[安装] 首次运行，正在安装前端依赖..."
    cd frontend
    npm ci
    if [ $? -ne 0 ]; then
        echo "[错误] 前端依赖安装失败"
        cd ..
        exit 1
    fi
    cd ..
else
    echo "[检查] 前端依赖已安装"
fi

# 检查后端依赖
if [ ! -d "backend/node_modules" ]; then
    echo "[安装] 首次运行，正在安装后端依赖..."
    cd backend
    npm ci --production
    if [ $? -ne 0 ]; then
        echo "[错误] 后端依赖安装失败"
        cd ..
        exit 1
    fi
    cd ..
else
    echo "[检查] 后端依赖已安装"
fi

echo ""
echo "========================================"
echo "  正在启动服务..."
echo "========================================"
echo ""
echo "前端：http://localhost:5173"
echo "后端：http://localhost:3001"
echo ""
echo "提示：在浏览器右上角设置中配置 API Key"
echo ""
echo "按 Ctrl+C 停止服务"
echo ""

# 启动服务
npm run dev
