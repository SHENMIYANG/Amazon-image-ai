#!/bin/bash

echo "===================================="
echo "  电商图片生成工具 - 开发环境启动"
echo "===================================="
echo ""

# 检查 .env 文件
if [ ! -f "backend/.env" ]; then
    echo "⚠️  警告：backend/.env 不存在"
    echo "   请先配置 OpenAI API Key"
    echo "   复制 backend/.env.example 并修改"
    echo ""
    read -p "按任意键继续或 Ctrl+C 退出..."
fi

echo "✅ 前端：http://localhost:5173"
echo "✅ 后端：http://localhost:3001"
echo "✅ API 健康检查：http://localhost:3001/api/health"
echo ""
echo "按 Ctrl+C 停止所有服务"
echo "===================================="
echo ""

npm run dev
