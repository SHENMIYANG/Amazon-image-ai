# 生成规则说明

## 7 张图片生成规则

根据亚马逊规范，自动生成 7 张商品主图：

### 图片 1：主图（Main Image）

**要求**:
- 纯白背景（RGB 255,255,255）
- 产品占据画面 85% 以上
- 清晰展示产品全貌
- 无文字、无水印、无道具

**Prompt 模板**:
```
Professional product photography of [产品名称], pure white background, studio lighting, 
high resolution, commercial quality, product occupies 85% of frame, no text, no watermark, 
no props, front view, centered composition
```

### 图片 2：侧面图（Side View）

**要求**:
- 展示产品侧面细节
- 纯白背景
- 突出产品轮廓

**Prompt 模板**:
```
Professional product photography of [产品名称] from side angle, pure white background, 
studio lighting, show product profile and depth, clean composition
```

### 图片 3：背面图（Back View）

**要求**:
- 展示产品背面设计
- 纯白背景
- 细节清晰

**Prompt 模板**:
```
Professional product photography of [产品名称] from back view, pure white background, 
show back design and features, studio quality
```

### 图片 4：顶部图（Top View）

**要求**:
- 俯视角度
- 展示顶部布局
- 纯白背景

**Prompt 模板**:
```
Professional product photography of [产品名称] from top view, bird's eye perspective, 
pure white background, show top layout and design
```

### 图片 5：细节图（Detail Shot）

**要求**:
- 特写镜头
- 突出核心卖点
- 展示材质工艺

**Prompt 模板**:
```
Close-up detail shot of [产品名称], focus on [核心卖点/材质], show texture and quality, 
macro photography, pure white background, professional lighting
```

### 图片 6：场景图（Lifestyle Image 1）

**要求**:
- 产品在实际使用场景中
- 自然光线
- 符合目标受众审美

**Prompt 模板**:
```
Lifestyle photography of [产品名称] in use, [场景要求], natural lighting, 
realistic environment, targeting [目标受众], warm and inviting atmosphere
```

### 图片 7：场景图（Lifestyle Image 2）

**要求**:
- 另一个使用场景
- 展示产品多功能性
- 情感共鸣

**Prompt 模板**:
```
Lifestyle photography of [产品名称] in different scenario, [场景要求], 
show product versatility, targeting [目标受众], professional composition
```

---

## A+ 页面图片生成规则

### Banner 图（970x600）

**要求**:
- 品牌故事展示
- 高质量场景图
- 情感共鸣

**Prompt**:
```
Amazon A+ Content banner image for [产品名称], brand storytelling, 
high quality lifestyle scene, professional photography, emotional connection, 
970x600 aspect ratio
```

### 功能对比图（970x600）

**要求**:
- 产品功能对比
- 清晰直观
- 专业设计

**Prompt**:
```
Product feature comparison chart for [产品名称], clean infographic style, 
professional design, highlight key features and benefits, 970x600
```

### 尺寸规格图（970x600）

**要求**:
- 产品尺寸标注
- 多角度展示
- 清晰易读

**Prompt**:
```
Product dimension diagram for [产品名称], technical illustration style, 
show measurements from multiple angles, clear labels, 970x600
```

### 使用场景图（970x600）

**要求**:
- 多场景展示
- 生活方式呈现
- 高质量摄影

**Prompt**:
```
Product usage scenarios for [产品名称], collage of 3-4 different use cases, 
lifestyle photography, professional quality, 970x600
```

### 细节特写图（970x600）

**要求**:
- 材质工艺展示
- 微距摄影
- 品质感

**Prompt**:
```
Close-up detail shots of [产品名称], macro photography, show material quality 
and craftsmanship, premium feel, 970x600
```

---

## 风格选择器规则

### 8 种预设风格

| 风格 | 色调 | 光线 | 适用产品 |
|------|------|------|---------|
| 简约现代 | 冷色调、黑白灰 | 柔和均匀 | 电子产品、家居用品 |
| 商务专业 | 深蓝、灰色 | 专业布光 | 办公用品、商务用品 |
| 科技感 | 蓝色、紫色渐变 | 霓虹光效 | 数码产品、智能设备 |
| 温馨家居 | 暖黄、米色 | 自然光 | 家居装饰、生活用品 |
| 自然清新 | 绿色、大地色 | 自然光 | 有机产品、个护用品 |
| 奢华高端 | 金色、黑色 | 聚光灯 | 奢侈品、高端产品 |
| 运动活力 | 橙色、红色 | 动态光效 | 运动用品、户外装备 |
| 可爱卡通 | 粉色、马卡龙色 | 柔光 | 儿童用品、礼品 |

### 风格应用规则

风格会影响：
1. **背景色调**: 根据风格选择合适背景
2. **光线效果**: 调整光线类型和强度
3. **构图方式**: 选择符合风格的构图
4. **后期调色**: 添加风格化滤镜

---

## Prompt 组装规则

### 完整 Prompt 结构

```
[风格前缀] + [产品类型] + [核心卖点] + [构图要求] + [光线要求] + [背景要求] + [质量要求]
```

### 示例

**产品**: Wireless Bluetooth Headphones
**风格**: 科技感
**卖点**: Noise Cancelling, 40H Battery

**生成的 Prompt**:
```
Professional product photography with futuristic tech style, 
Wireless Bluetooth Headphones with advanced noise cancelling technology and 40-hour battery life, 
dynamic angle showing product features, LED accent lighting with blue tones, 
dark gradient background, ultra high resolution, commercial quality, 8k
```

---

## 合规检查规则

### 亚马逊图片规范

**主图要求**:
- ✅ 纯白背景（RGB 255,255,255）
- ✅ 产品占据 85% 以上画面
- ✅ 无文字、无水印
- ✅ 无道具、无模特
- ✅ 清晰、专业、高质量

**违规检测**:
- ❌ 非纯白背景
- ❌ 产品太小
- ❌ 包含文字或水印
- ❌ 包含道具或模特
- ❌ 模糊或低质量

### A+ 页面要求

- ✅ 图片尺寸符合要求
- ✅ 无外部链接
- ✅ 无促销信息
- ✅ 无联系方式
- ✅ 内容真实准确

---

## 分辨率规则

### 推荐分辨率

| 用途 | 分辨率 | 长宽比 |
|------|--------|--------|
| 主图 | 1500x1500 | 1:1 |
| A+ Banner | 970x600 | 1.62:1 |
| A+ 功能图 | 970x600 | 1.62:1 |
| 场景图 | 1500x1500 | 1:1 |

### 分辨率选择

- **最小**: 1000x1000（亚马逊最低要求）
- **推荐**: 1500x1500（最佳显示效果）
- **最大**: 2048x2048（超高清）

---

## 批量生成规则

### 并发控制

- 默认并发数：3 张同时生成
- 最大并发数：5 张
- 总数量：7 张（主图）或 5 张（A+ 图）

### 错误处理

- 单张失败不影响其他图片
- 自动重试失败的图片（最多 3 次）
- 显示每张图的状态（等待中/生成中/已完成/失败）

### 进度显示

```
总进度：[████████░░] 5/7
- 图 1: ✅ 完成
- 图 2: ✅ 完成
- 图 3: 🔄 生成中...
- 图 4: ⏳ 等待中
- 图 5: ⏳ 等待中
- 图 6: ❌ 失败（重试中）
- 图 7: ⏳ 等待中
```

---

## 文件命名规则

### 主图命名

```
[ASIN 或产品名]_main_01.jpg  - 主图
[ASIN 或产品名]_side_02.jpg  - 侧面图
[ASIN 或产品名]_back_03.jpg  - 背面图
[ASIN 或产品名]_top_04.jpg   - 顶部图
[ASIN 或产品名]_detail_05.jpg - 细节图
[ASIN 或产品名]_life_06.jpg  - 场景图 1
[ASIN 或产品名]_life_07.jpg  - 场景图 2
```

### A+ 图片命名

```
[ASIN 或产品名]_aplus_banner_01.jpg
[ASIN 或产品名]_aplus_feature_02.jpg
[ASIN 或产品名]_aplus_dimension_03.jpg
[ASIN 或产品名]_aplus_scenario_04.jpg
[ASIN 或产品名]_aplus_detail_05.jpg
```

---

## 更新日志

- **2026-06-05**: 初始版本，支持 7 张主图和 5 张 A+ 图生成
- 后续将支持更多图片类型和自定义规则
