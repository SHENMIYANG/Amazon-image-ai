# 架构设计文档

## 技术架构图

```
┌─────────────────────────────────────────────────────────┐
│                      用户浏览器                          │
│                   http://localhost:5173                  │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              前端 (React + Vite)                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  AmazonListingForm  - 产品信息录入               │   │
│  │  StyleSelector      - 8 种风格选择                │   │
│  │  SettingsModal      - API 配置界面                │   │
│  │  ImagePlanCard      - 图片方案展示               │   │
│  │  ComplianceCheck    - 合规性检查                 │   │
│  └──────────────────────────────────────────────────┘   │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP API
                     │ POST /api/generate
                     │ POST /api/upload
                     │ GET  /api/test-api-key
                     ▼
┌─────────────────────────────────────────────────────────┐
│              后端 (Express + Node.js)                    │
│  ┌──────────────────────────────────────────────────┐   │
│  │  routes/generate.js    - 图片生成接口            │   │
│  │  routes/upload.js      - 文件上传接口            │   │
│  │  routes/testApiKey.js  - API Key 测试接口         │   │
│  └──────────────────────────────────────────────────┘   │
│                     │                                    │
│                     ▼                                    │
│           ┌──────────────────┐                          │
│           │  OpenAI API      │                          │
│           │  /v1/images      │                          │
│           │  gpt-image-2     │                          │
│           └──────────────────┘                          │
└─────────────────────────────────────────────────────────┘
```

## 核心组件说明

### 前端组件

| 组件 | 文件 | 功能 |
|------|------|------|
| AmazonListingForm | `frontend/src/components/AmazonListingForm.jsx` | 9 字段产品信息表单 |
| StyleSelector | `frontend/src/components/StyleSelector.jsx` | 8 种预设风格选择 |
| SettingsModal | `frontend/src/components/SettingsModal.jsx` | API 配置弹窗 |
| ImagePlanCard | `frontend/src/components/ImagePlanCard.jsx` | 7 张图片方案卡片 |
| ComplianceCheckPanel | `frontend/src/components/ComplianceCheckPanel.jsx` | 亚马逊合规检查 |
| GenerateButton | `frontend/src/components/GenerateButton.jsx` | 生成按钮 + 进度显示 |
| TaskGrid | `frontend/src/components/TaskGrid.jsx` | 任务网格布局 |

### 后端接口

| 接口 | 文件 | 方法 | 功能 |
|------|------|------|------|
| `/api/generate` | `backend/routes/generate.js` | POST | 生成图片 |
| `/api/upload` | `backend/routes/upload.js` | POST | 上传产品参考图 |
| `/api/test-api-key` | `backend/routes/testApiKey.js` | POST | 测试 API Key 有效性 |
| `/api/health` | `backend/server.js` | GET | 健康检查 |

## 数据流

### 1. 图片生成流程

```
用户填写表单 → 选择风格 → 点击生成
         ↓
前端组装 Prompt (产品信息 + 7 张 ImagePlan)
         ↓
POST /api/generate (发送完整 Prompt)
         ↓
后端调用 OpenAI GPT-Image-2 API
         ↓
接收生成的图片 URL
         ↓
下载到本地 /uploads 目录
         ↓
返回前端展示
```

### 2. API 配置流程

```
用户点击右上角⚙️图标
         ↓
打开 SettingsModal 弹窗
         ↓
填写 API Endpoint / API Key / Model
         ↓
点击"测试连接"
         ↓
POST /api/test-api-key
         ↓
后端验证 API Key 有效性
         ↓
保存配置到 localStorage
```

## 状态管理

- **前端状态**: React useState + props 传递
- **API 配置**: localStorage 持久化
- **表单数据**: 组件内部状态，提交时组装

## 安全设计

1. **API Key 不暴露**: 后端代理调用，Key 保存在服务器端
2. **CORS 限制**: 仅允许本地或配置域名访问
3. **文件上传限制**: 仅允许图片格式，大小限制
4. **错误处理**: 统一的错误捕获和日志记录

## 性能优化

1. **并发控制**: 7 张图片并发生成，减少总等待时间
2. **图片缓存**: 生成的图片本地缓存，避免重复生成
3. **懒加载**: 组件按需加载
4. **构建优化**: Vite 打包，代码分割

## 扩展性设计

- **风格扩展**: 新增风格只需在 `StyleSelector.jsx` 添加配置
- **接口扩展**: 新增图片类型只需在 `generate.js` 添加逻辑
- **多平台支持**: 预留了售卖国家字段，支持未来扩展多站点
