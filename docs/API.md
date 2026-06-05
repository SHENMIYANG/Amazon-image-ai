# API 配置说明

## 获取 OpenAI API Key

### 步骤

1. **访问 OpenAI 平台**
   - 网址：https://platform.openai.com
   - 登录或注册账号

2. **创建 API Key**
   - 点击右上角头像 → **View API keys**
   - 点击 **Create new secret key**
   - 复制并保存 Key（只显示一次）

3. **充值账户**
   - 访问 https://platform.openai.com/account/billing
   - 添加支付方式
   - 充值至少 $1

### GPT-Image-2 定价

| 分辨率 | 价格（每张） |
|--------|-------------|
| 1024x1024 | $0.040 |
| 1024x1536 | $0.060 |
| 1536x1024 | $0.060 |

**生成 7 张主图成本**: 约 $0.28

---

## 配置 API

### 方法一：通过界面配置（推荐）

1. **打开设置**
   - 访问应用后，点击右上角 **⚙️** 图标

2. **填写配置**
   ```
   API Endpoint: https://api.openai.com/v1
   API Key: sk-proj-xxxxxxxxxxxxx
   Model: gpt-image-2
   ```

3. **测试连接**
   - 点击 **测试连接** 按钮
   - 显示"连接成功"即配置完成

4. **保存配置**
   - 配置自动保存到浏览器 localStorage
   - 下次访问无需重新配置

### 方法二：环境变量配置（后端代理）

创建 `backend/.env` 文件：

```env
# OpenAI API 配置
OPENAI_API_KEY=sk-proj-your-api-key-here
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-image-2

# 服务配置
BACKEND_PORT=3001
NODE_ENV=production
```

---

## 使用 OpenAI 兼容接口

本应用支持任何兼容 OpenAI API 格式的服务商。

### 常见兼容接口

#### 1. Azure OpenAI

```
API Endpoint: https://YOUR_RESOURCE.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT
API Key: YOUR_AZURE_KEY
Model: gpt-image-2 (或你的部署名称)
```

#### 2. 本地部署（如 Ollama）

```
API Endpoint: http://localhost:11434/v1
API Key: ollama (或留空)
Model: 你的本地模型名称
```

#### 3. 其他云服务商

```
API Endpoint: https://api.xxx.com/v1
API Key: YOUR_KEY
Model: 对应模型名称
```

---

## 测试 API Key

### 在应用中测试

1. 打开设置界面
2. 点击 **测试连接** 按钮
3. 查看测试结果

### 手动测试（curl）

```bash
curl https://api.openai.com/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-proj-YOUR_KEY" \
  -d '{
    "model": "gpt-image-2",
    "prompt": "A product photo of wireless headphones",
    "n": 1,
    "size": "1024x1024"
  }'
```

### 使用 Node.js 测试

```javascript
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: 'sk-proj-YOUR_KEY'
})

const response = await openai.images.generate({
  model: 'gpt-image-2',
  prompt: 'A product photo',
  n: 1,
  size: '1024x1024'
})

console.log(response.data[0].url)
```

---

## 常见问题

### 1. API Key 无效

**错误信息**: `Invalid API key`

**原因**:
- Key 格式错误
- Key 已过期或被删除
- 账户欠费

**解决**:
- 重新创建 API Key
- 检查账户余额
- 确认 Key 复制完整

### 2. 模型不可用

**错误信息**: `Model not found` 或 `The model does not exist`

**原因**:
- 模型名称拼写错误
- 该模型未在你的账户中开通

**解决**:
- 确认模型名称：`gpt-image-2`
- 检查 OpenAI 平台是否可用
- 联系 OpenAI 支持

### 3. 速率限制

**错误信息**: `Rate limit exceeded`

**原因**:
- 短时间内请求过多
- 账户配额不足

**解决**:
- 等待几分钟后重试
- 升级账户配额
- 减少并发数量

### 4. 余额不足

**错误信息**: `Insufficient quota`

**解决**:
- 访问 https://platform.openai.com/account/billing
- 充值账户
- 检查是否有未付账单

---

## 安全提示

⚠️ **重要安全建议**:

1. **不要分享 API Key**
   - 不要将 Key 提交到 Git
   - 不要发送给他人
   - 不要在公开场合展示

2. **使用环境变量**
   - 将 Key 保存在 `.env` 文件
   - 将 `.env` 添加到 `.gitignore`

3. **定期轮换 Key**
   - 定期删除旧 Key
   - 创建新 Key

4. **监控使用情况**
   - 定期检查使用量
   - 设置使用提醒
   - 发现异常及时冻结

5. **限制访问**
   - 生产环境添加认证
   - 限制 IP 访问
   - 设置速率限制

---

## 费用优化

1. **批量生成**: 一次性生成 7 张，减少重复请求
2. **降低分辨率**: 测试时使用较小分辨率
3. **缓存结果**: 避免重复生成相同图片
4. **监控用量**: 设置每月预算提醒
5. **使用预览**: 先用低成本模型预览效果

---

## 技术支持

- **OpenAI 官方文档**: https://platform.openai.com/docs
- **API 参考**: https://platform.openai.com/docs/api-reference
- **状态页面**: https://status.openai.com
- **社区支持**: https://community.openai.com
