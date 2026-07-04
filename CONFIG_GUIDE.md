# ⚙️ API 配置说明

## 📋 配置总览

本项目使用**两个独立的 API 配置**：

| 用途 | 配置项 | 推荐服务商 | 免费额度 |
|------|--------|------------|----------|
| **图像生成** | `IMAGE_GEN_*` | claudex.me / OpenAI | - |
| **Agent 文本分析** | `AGENT_*` | 智谱 AI / Gemini / Groq | 2000 万 Token / 1500 请求/天 |

---

## 🔧 配置步骤

### 1. 图像生成配置（必需）

用于 GPT-Image-2 生成产品图片。

#### 方案 A: claudex.me（当前使用）

```env
IMAGE_GEN_API_KEY=sk-your-api-key-here  # ⚠️ 替换为你的真实密钥
IMAGE_GEN_BASE_URL=https://claudex.me/v1
IMAGE_GENERATION_MODEL=gpt-image-2
```

#### 方案 B: OpenAI 官方

```env
IMAGE_GEN_API_KEY=sk-proj-xxxxxxxxxxxxx
IMAGE_GEN_BASE_URL=https://api.openai.com/v1
IMAGE_GENERATION_MODEL=gpt-image-2
```

---

### 2. Agent 文本分析配置（可选）

用于 AI 智能分析产品、生成套图策略。

#### 方案 A: 智谱 AI（推荐）⭐⭐⭐⭐⭐

**优势**:
- ✅ 2000 万 Token 永久免费
- ✅ GLM-4-Flash 完全免费
- ✅ OpenAI 兼容格式
- ✅ 中文优化好

**步骤**:
1. 访问 https://open.bigmodel.cn/
2. 注册账号
3. 创建 API Key
4. 配置到 `.env`:

```env
AGENT_API_KEY=你的智谱 AI_API_KEY
AGENT_BASE_URL=https://open.bigmodel.cn/api/paas/v4/
AGENT_MODEL=glm-4-flash
```

---

#### 方案 B: Google Gemini ⭐⭐⭐⭐

**优势**:
- ✅ 1500 请求/天 免费
- ✅ Gemini 2.0 Flash 质量高
- ✅ 多模态能力强

**步骤**:
1. 访问 https://aistudio.google.com/
2. 注册账号
3. 创建 API Key
4. 配置到 `.env`:

```env
AGENT_API_KEY=你的 Gemini_API_KEY
AGENT_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
AGENT_MODEL=gemini-2.0-flash
```

---

#### 方案 C: Groq ⭐⭐⭐

**优势**:
- ✅ 14000 请求/天 免费
- ✅ 速度最快（<100ms）
- ✅ Llama 3.3 70B 质量好

**步骤**:
1. 访问 https://console.groq.com/
2. 注册账号
3. 创建 API Key
4. 配置到 `.env`:

```env
AGENT_API_KEY=你的 Groq_API_KEY
AGENT_BASE_URL=https://api.groq.com/openai/v1
AGENT_MODEL=llama-3.3-70b-versatile
```

---

#### 方案 D: DeepSeek ⭐⭐⭐⭐

**优势**:
- ✅ 新用户赠送大量 Token
- ✅ 性价比最高
- ✅ 中文能力强

**步骤**:
1. 访问 https://platform.deepseek.com/
2. 注册账号
3. 创建 API Key
4. 配置到 `.env`:

```env
AGENT_API_KEY=你的 DeepSeek_API_KEY
AGENT_BASE_URL=https://api.deepseek.com/v1
AGENT_MODEL=deepseek-chat
```

---

## 📝 完整 .env 示例

```env
# ===========================================
# 图像生成 API 配置
# ===========================================
IMAGE_GEN_API_KEY=sk-4949f86a91db7bd5198ef102ba4b92674a38e2f52de82941afa4c86b1f002bb6
IMAGE_GEN_BASE_URL=https://claudex.me/v1
IMAGE_GENERATION_MODEL=gpt-image-2

# ===========================================
# Agent 文本分析 API 配置（智谱 AI - 推荐）
# ===========================================
AGENT_API_KEY=your-zhipu-api-key-here
AGENT_BASE_URL=https://open.bigmodel.cn/api/paas/v4/
AGENT_MODEL=glm-4-flash

# ===========================================
# 后端服务配置
# ===========================================
BACKEND_PORT=3001
NODE_ENV=development
```

---

## 🧪 测试配置

### 测试图像生成 API
```bash
curl -X POST http://localhost:3001/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "listing":{"productName":"Test"},
    "imagePlans":[{"id":1,"prompt":"test"}],
    "referenceImages":[]
  }'
```

### 测试 Agent 分析 API
```bash
curl -X POST http://localhost:3001/api/agent-analyze \
  -H "Content-Type: application/json" \
  -d '{
    "productName":"Test Product",
    "sellingPoints":"Feature 1\nFeature 2",
    "imageType":"basic",
    "complexity":"L2"
  }'
```

---

##  常见问题

### Q1: claudex.me 不支持文本模型怎么办？
**A**: 使用智谱 AI、Google Gemini、Groq 或 DeepSeek 等替代方案。

### Q2: 如何知道哪个 API 可用？
**A**: 运行测试脚本：
```bash
cd backend
node test-all-models.js
```

### Q3: 免费额度够用吗？
**A**: 
- 智谱 AI：2000 万 Token ≈ 10 万次分析
- Google Gemini：1500 请求/天 ≈ 4.5 万次/月
- Groq：14000 请求/天 ≈ 42 万次/月

### Q4: 可以只用图像生成，不用 Agent 分析吗？
**A**: 可以！Agent 分析是可选功能。如果不配置 `AGENT_*`，前端仍然可以手动填写图片策略。

### Q5: Agent 分析消耗多少 Token？
**A**: 
- L1 极速版：~1000-1500 tokens
- L2 标准版：~1500-2500 tokens
- L3 精品版：~2500-4000 tokens

---

## 📊 成本对比

| 服务商 | 免费额度 | 超出后价格 | 推荐度 |
|--------|----------|------------|--------|
| 智谱 AI | 2000 万 Token | ¥0.001/1K | ⭐⭐⭐⭐⭐ |
| Google Gemini | 1500 请求/天 | $0.000125/1K | ⭐⭐⭐⭐ |
| Groq | 14000 请求/天 | $0.00005/1K | ⭐⭐⭐⭐ |
| DeepSeek | 新用户赠送 | ¥0.002/1K | ⭐⭐⭐⭐ |

---

## 🚀 快速开始

1. **编辑 `backend/.env`**
2. **填入你的 API Key**
3. **重启后端**: `npm run dev`
4. **测试功能**

---

**🎉 配置完成！现在 Agent 分析功能应该可以正常工作了！**
