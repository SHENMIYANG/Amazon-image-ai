import './AmazonListingForm.css'
import TemplateSelector from './TemplateSelector'

export default function AmazonListingForm({ listing, onChange }) {
  // 套图模板预设 - 专业亚马逊排版风格（参考标准 7 图框架）
  const imageTemplates = {
    // 基础套图 - 专业亚马逊 7 图框架（只有图 2 展示卖点，其他图各司其职）
    basic: [
      { id: 1, name: '主图', prompt: 'Amazon main image: PURE WHITE BACKGROUND (RGB 255,255,255), product centered filling 85% of frame, professional studio lighting, NO text, NO logos, NO watermarks, NO props. Clean product photography, accurate color reproduction' },
      { id: 2, name: '核心卖点与场景融合', prompt: 'Product in most representative premium usage scene. ONE refined headline at top highlighting core value. Minimal text overlay, clean modern layout, lifestyle photography style. Only 1 key selling point shown' },
      { id: 3, name: '功能/使用步骤一览', prompt: '3-4 simple icons with brief text labels showing main functions or usage steps. Clean layout, easy to understand, professional infographic style. Focus on functionality, not selling points' },
      { id: 4, name: '尺寸/容积/重量与结构', prompt: 'Product dimension diagram with three-side measurements (inch/cm). Include capacity/weight specs. Use common objects for scale (coin, phone, soda can). Technical drawing style, clear annotations' },
      { id: 5, name: '材质与质量细节', prompt: 'Extreme close-up of material texture and craftsmanship details: connection points, handle structure, waterproof testing. Soft lighting highlights quality. Macro photography, shows premium finish' },
      { id: 6, name: '多场景/多用途拓展', prompt: 'Product in different spaces (living room, bathroom, bedroom, outdoor) OR multiple use cases. 4-grid collage or single composite. Warm lifestyle photography, shows versatility' },
      { id: 7, name: '补充场景/生活方式/套装', prompt: 'Emotional lifestyle moment: warm usage instant with human interaction, OR complete product set display. Natural lighting, authentic not staged, shows aspirational lifestyle' }
    ],
    // 信息图套图 - 强调卖点和参数（最接近 Linkfox 风格）
    infographic: [
      { id: 1, name: '主图', prompt: 'Amazon main image: pure white background RGB 255,255,255, product centered filling 85% of frame, professional studio lighting, no text no logos no watermarks' },
      { id: 2, name: '卖点总览图', prompt: 'FULL infographic layout: LARGE BOLD TITLE at top. 4-5 KEY SELLING POINTS in vertical list on left. Each has: numbered circle badge (1,2,3,4,5) + colorful icon + bold feature name + short description text. Product hero image on right. Clean modern design, high contrast, e-commerce professional style' },
      { id: 3, name: '参数详解图', prompt: 'Technical specifications infographic: organized table or grid layout with icons. Categories: Size, Weight, Material, Color, Package Contents. Each spec has icon + label + value in clear text. Light background, professional technical illustration style' },
      { id: 4, name: '对比优势图', prompt: 'Comparison infographic: "Our Product vs Others" layout. Left side (our product): green checkmarks with advantages. Right side (others): red X marks with disadvantages. Clear visual comparison, bold text labels, persuasive design' },
      { id: 5, name: '使用步骤图', prompt: 'Step-by-step guide: 3-4 numbered panels (1,2,3,4) showing how to use product. Each panel has image + short instruction text below. Clear visual flow with arrows between steps. Educational infographic style, easy to follow' },
      { id: 6, name: '场景拼贴图', prompt: '4-scene collage in 2x2 grid: product in different use scenarios. Each scene has small text label at bottom. Thin white borders between scenes. Shows versatility and multiple use cases, lifestyle photography style' },
      { id: 7, name: '品质保证图', prompt: 'Trust badges infographic: warranty info, quality certifications, customer service icons. Organized layout with icons + text. Add "100% Satisfaction Guaranteed" banner. Professional trust-building design, clean and credible' }
    ],
    // 卖点强化型 - 功能卖点驱动
    featureFocus: [
      { id: 1, name: '白底主图', prompt: 'Amazon main image: PURE WHITE BACKGROUND (RGB 255,255,255), product centered filling 85% of frame, professional studio lighting, NO text, NO logos, NO watermarks' },
      { id: 2, name: '最大卖点 Hero Feature', prompt: 'LARGE BOLD HEADLINE at top highlighting #1 selling point. Product hero shot with dramatic angle. Orange/red accent color. Arrow callouts pointing to key features. Strong visual impact, high contrast design' },
      { id: 3, name: '4-6 核心卖点图标展示', prompt: 'Vertical list of 4-6 selling points on left side. Each has: numbered circle badge (①②③④) + colorful rounded icon + bold feature name in English + short description. Product image on right. Clean layout with strong visual hierarchy' },
      { id: 4, name: '使用前后对比 / Our vs Others', prompt: 'Split comparison layout. Left side (BEFORE/OTHERS): gray tone with red X marks. Right side (AFTER/OURS): vibrant with green checkmarks. Clear before/after or competitive advantage visualization' },
      { id: 5, name: '使用步骤或安装流程', prompt: 'Step-by-step flow: numbered circles (1→2→3→4) connected by arrows. Each step has icon + short instruction text + mini product photo showing that step. Clean horizontal or vertical flow layout' },
      { id: 6, name: '多场景应用', prompt: 'Product in 3-4 different real usage environments. Real people interacting naturally. Shows versatility across different use cases. Warm authentic photography style' },
      { id: 7, name: '品牌优势 / 套装 / 售后保障', prompt: 'Trust-building layout: warranty badge, quality certification icons, customer service info, "100% Satisfaction Guaranteed" banner. Complete package contents display. Professional credible design' }
    ],
    // 生活方式套图 - 情感连接
    lifestyle: [
      { id: 1, name: '主图', prompt: 'Amazon main image: pure white background RGB 255,255,255, product centered, no text' },
      { id: 2, name: '场景拼贴图', prompt: '4-scene lifestyle collage: product in different real-world settings (home, office, outdoor, travel). Grid layout, warm natural lighting. Add title "Perfect for Every Moment" at top. Emotional appeal, aspirational lifestyle' },
      { id: 3, name: '人物使用图', prompt: 'Person using product naturally, focus on authentic interaction. Add text overlay "Easy to Use" with simple icon. Lifestyle portrait style, warm lighting, emotional connection' },
      { id: 4, name: '细节特写图', prompt: 'Macro detail shot of product texture and materials. Add callout text "Premium Quality Craftsmanship". Soft diffused lighting, high detail, professional product photography' },
      { id: 5, name: '尺寸对比图', prompt: 'Size comparison with everyday objects (hand, smartphone, coin). Add text labels showing measurements. Infographic style, clear scale reference, easy to understand' },
      { id: 6, name: '开箱展示图', prompt: 'Unboxing scene: premium packaging and all contents organized. Add title "Complete Package" at top. Shows value and quality, clean composition, gift-ready presentation' },
      { id: 7, name: '生活方式图', prompt: 'Aspirational lifestyle scene: product integrated into dream environment. Add text "Elevate Your Lifestyle" with decorative element. High-end photography style, warm inviting atmosphere, emotional appeal' }
    ],
    // 科技数码套图 - 科技感（key: technical）
    technical: [
      { id: 1, name: '主图', prompt: 'Amazon main image: pure white background, product centered, no text' },
      { id: 2, name: '功能亮点图', prompt: 'Tech infographic: LARGE TITLE "Advanced Features". 4 feature callouts with arrows pointing to product. Each has: modern tech icon + bold feature name + short spec text. Blue accent color scheme, Roboto font, clean white background, futuristic design' },
      { id: 3, name: '技术规格图', prompt: 'Technical specifications grid: organized table with icons. Categories: Performance, Connectivity, Battery, Compatibility. Each spec has icon + label + value. Modern tech aesthetic, blue accent colors, professional data visualization' },
      { id: 4, name: '内部结构图', prompt: 'Exploded view or cutaway illustration showing internal components. Labels for key parts with lines. Add text "Engineering Excellence". Technical illustration style, engineering precision, shows quality construction' },
      { id: 5, name: '使用演示图', prompt: 'Product with UI/screen interface visible showing features in use. Add text overlays explaining key functions. Modern tech environment, blue tone lighting, shows functionality clearly' },
      { id: 6, name: '配件展示图', prompt: 'All accessories and cables organized neatly. Add title "Complete Kit" with itemized list. Premium flat lay presentation, white background, shows value' },
      { id: 7, name: '场景应用图', prompt: 'Person using product in modern workspace/tech environment. Add text "Perfect for Work & Play". Clean contemporary setting, professional lifestyle photography, shows real-world use' }
    ],
    // 时尚服饰套图
    fashion: [
      { id: 1, name: '主图', prompt: 'Amazon main image: pure white background, product centered, no text' },
      { id: 2, name: '款式展示图', prompt: 'Fashion infographic: LARGE TITLE "Style & Comfort". Model wearing product with 3-4 style callouts. Each has: icon + text label pointing to features (fit, material, design element). Clean fashion editorial style, modern layout' },
      { id: 3, name: '材质特写图', prompt: 'Extreme close-up of fabric texture and stitching. Add text callouts: "Premium Fabric", "Quality Stitching". Macro photography, shows material quality and craftsmanship details' },
      { id: 4, name: '搭配建议图', prompt: 'Flat lay styling: product with complementary items/outfits. Add title "Style It Your Way" at top. Fashion editorial composition, shows coordination suggestions, aspirational aesthetic' },
      { id: 5, name: '尺码指南图', prompt: 'Size chart with body measurements and fit guide. Organized table with clear text. Add "Find Your Perfect Fit" header. Easy to read layout, helpful sizing information, professional infographic' },
      { id: 6, name: '细节工艺图', prompt: 'Close-up of construction details: seams, zippers, buttons, etc. Add text labels highlighting quality features. Shows craftsmanship, attention to detail, premium quality' },
      { id: 7, name: '生活方式图', prompt: 'Urban lifestyle fashion scene: model in natural social setting. Add text "Live in Style" with decorative element. Warm natural lighting, authentic not staged, aspirational lifestyle' }
    ],
    // 家居用品套图
    home: [
      { id: 1, name: '主图', prompt: 'Amazon main image: pure white background, product centered, no text' },
      { id: 2, name: '场景展示图', prompt: 'Product in modern home interior (living room/bedroom). Add title "Perfect for Your Home" at top. Natural window lighting, cozy inviting atmosphere, product clearly visible, warm home aesthetic' },
      { id: 3, name: '使用演示图', prompt: '3-panel step-by-step sequence showing how to use product. Each panel numbered (1,2,3) with short instruction text. Clear visual flow, educational infographic style, easy to follow' },
      { id: 4, name: '材质工艺图', prompt: 'Material and build quality close-up. Add text callouts: "Quality Materials", "Durable Construction". Soft lighting highlights texture and craftsmanship, shows value' },
      { id: 5, name: '尺寸参考图', prompt: 'Product in room context with familiar furniture for scale. Add dimension lines with measurements text. Helps visualize actual size in home, practical infographic style' },
      { id: 6, name: '包装内容图', prompt: 'Packaging and assembly guide flat lay. Add title "Easy Setup" with what\'s included list. Simple diagrams, clear instructions, shows convenience' },
      { id: 7, name: '互动场景图', prompt: 'Family/person interacting with product in warm home environment. Add text "Designed for Real Life". Natural lighting, authentic usage scene, emotional connection' }
    ],
    // 高端品牌型 - 品牌质感
    premium: [
      { id: 1, name: '白底主图', prompt: 'Amazon main image: PURE WHITE BACKGROUND, product centered, MINIMALIST composition, ultra-clean, luxury feel. Professional studio lighting with soft shadows. No text, no props. High-end product photography' },
      { id: 2, name: '品牌级 Hero Image', prompt: 'Cinematic hero shot: product with dramatic premium lighting (golden hour or studio). Large negative space. Minimalist composition. Magazine-quality photography. Subtle gradient background. NO text overlays, let the product speak' },
      { id: 3, name: '材质与工艺', prompt: 'Extreme macro detail of material quality: grain texture, stitching precision, surface finish, hand-crafted elements. Shallow depth of field. Soft directional lighting creating subtle shadows. Shows tactile quality and craftsmanship' },
      { id: 4, name: '生活方式大片', prompt: 'Aspirational lifestyle scene: product in premium environment (modern loft, luxury kitchen, designer space). Natural window light. Wide angle showing context. Editorial magazine quality. Emotional atmosphere' },
      { id: 5, name: '产品细节微距', prompt: 'Ultra-close-up detail shot of key feature: button texture, logo embossing, hinge mechanism, surface pattern. Extreme shallow DOF. Studio lighting highlighting micro-details. Premium quality perception' },
      { id: 6, name: '尺寸与空间搭配', prompt: 'Product in real room context with furniture for scale reference. Wide-angle architectural perspective. Shows how product fits in living space. Clean modern interior background. Natural ambient lighting' },
      { id: 7, name: '高端生活场景收尾', prompt: 'Dream lifestyle moment: golden hour lighting, product as hero in beautiful setting. Cinematic composition. Warm emotional tone. Aspirational yet achievable feeling. High-end editorial photography style' }
    ]
  }
  
  // 处理图片策略变更
  const handleImagePlanChange = (imageId, prompt) => {
    const newPlans = [...(listing.imagePlans || [])]
    const existingIndex = newPlans.findIndex(p => p.id === imageId)
    
    if (existingIndex >= 0) {
      newPlans[existingIndex] = { ...newPlans[existingIndex], prompt }
    } else {
      newPlans.push({ id: imageId, prompt })
    }
    
    onChange('imagePlans', newPlans)
  }
  
  // 应用套图模板
  const applyTemplate = (templateKey) => {
    if (imageTemplates[templateKey]) {
      onChange('imagePlans', imageTemplates[templateKey])
      onChange('imageType', templateKey)
    }
  }
  
  // 获取图片类型标签（标准亚马逊 7 图结构 - 匹配参考图）
  const getImagePlanLabel = (num) => {
    const labels = {
      1: '主图 - 纯白背景',
      2: '核心卖点与场景融合',
      3: '功能/使用步骤一览',
      4: '尺寸/容积/重量与结构',
      5: '材质与质量细节',
      6: '多场景/多用途拓展',
      7: '补充场景/生活方式/套装'
    }
    return labels[num] || `图片${num}`
  }
  
  // 获取图 1 默认值
  const getImagePlan1Default = () => {
    const plan1 = (listing.imagePlans || []).find(p => p.id === 1)
    return plan1?.prompt || 'Pure white background (RGB 255,255,255), product centered filling 85% of frame, no text no logos no watermarks'
  }
  
  return (
    <div className="amazon-listing-form">
      {/* 第一步：产品信息 */}
      <div className="form-section">
        <div className="section-header">
          <h3>📦 第一步：产品信息</h3>
          <span className="section-number">1/3</span>
        </div>
        <p className="section-description">
          填写产品基本信息，AI 会根据这些信息生成专业的图片策略
        </p>
        
        <div className="form-row">
          <div className="form-group full-width">
            <label>产品名称 <span className="required">*</span></label>
            <input
              type="text"
              value={listing.productName}
              onChange={(e) => onChange('productName', e.target.value)}
              placeholder="例如：Wireless Bluetooth Headphones with Noise Cancelling"
              maxLength={200}
            />
            <span className="char-count">{(listing.productName || '').length}/200</span>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>所属类目 <span className="required">*</span></label>
            <input
              type="text"
              value={listing.category}
              onChange={(e) => onChange('category', e.target.value)}
              placeholder="例如：Electronics &gt; Headphones"
            />
            <span className="help-text">英文，如 Electronics &gt; Headphones</span>
          </div>

          <div className="form-group">
            <label>目标市场 <span className="required">*</span></label>
            <select
              value={listing.marketplace}
              onChange={(e) => onChange('marketplace', e.target.value)}
            >
              <option value="">请选择</option>
              <option value="US">美国 (Amazon.com)</option>
              <option value="UK">英国 (Amazon.co.uk)</option>
              <option value="DE">德国 (Amazon.de)</option>
              <option value="FR">法国 (Amazon.fr)</option>
              <option value="IT">意大利 (Amazon.it)</option>
              <option value="ES">西班牙 (Amazon.es)</option>
            </select>
          </div>

          <div className="form-group">
            <label>尺寸规格 <span className="required">*</span></label>
            <input
              type="text"
              value={listing.dimensions}
              onChange={(e) => onChange('dimensions', e.target.value)}
              placeholder="例如：10 x 5 x 3 cm, 300g"
            />
          </div>

          <div className="form-group">
            <label>材质/工艺 <span className="required">*</span></label>
            <input
              type="text"
              value={listing.material}
              onChange={(e) => onChange('material', e.target.value)}
              placeholder="例如：ABS Plastic, Matte Finish"
            />
          </div>
        </div>

      </div>

      {/* 第二步：卖点与竞品分析 */}
      <div className="form-section">
        <div className="section-header">
          <h3>🎯 第二步：卖点</h3>
          <span className="section-number">2/3</span>
        </div>
        <p className="section-description">
          填写核心卖点，AI 会分析卖点优先级并映射到对应的图片
        </p>
        
        <div className="form-group">
          <label>目标受众（可选）</label>
          <textarea
            value={listing.targetAudience}
            onChange={(e) => onChange('targetAudience', e.target.value)}
            placeholder="描述你的目标客户群体，例如：&#10;• Parents with young children&#10;• Busy professionals&#10;• Fitness enthusiasts"
            rows={2}
          />
          <span className="help-text">帮助 AI 理解你的客户，生成更精准的图片策略</span>
        </div>

        {/* <div className="form-group">
          <label>竞品 ASIN（暂未开放）</label>
          <input
            type="text"
            value={listing.competitorAsin}
            onChange={(e) => onChange('competitorAsin', e.target.value)}
            placeholder="功能开发中，敬请期待..."
            disabled
          />
          <span className="help-text"> 竞品分析功能需要接入亚马逊 API，目前正在开发中。当前版本可忽略此字段。</span>
        </div> */}
        
        <div className="form-group">
          <label>核心卖点 <span className="required">*</span></label>
          <textarea
            value={listing.sellingPoints}
            onChange={(e) => onChange('sellingPoints', e.target.value)}
            placeholder="每行一个卖点，按重要性排序，最多 5 个：&#10;Advanced Noise Cancelling Technology&#10;40-Hour Battery Life&#10;Comfortable Over-Ear Design"
            rows={5}
          />
          <span className="char-count">
            {(listing.sellingPoints || '').split('\n').filter(s => s.trim()).length}/5 个卖点
          </span>
          <span className="help-text">AI 会为每个卖点分配优先级（高/中/低），并映射到最合适的图片</span>
        </div>
        <div className="form-group">
        <label>补充信息（可选）</label>
        <textarea
          value={listing.additionalInfo}
          onChange={(e) => onChange('additionalInfo', e.target.value)}
          placeholder="补充说明，例如：&#10;• 使用方式/步骤：第一步...第二步...&#10;• 场景图要求：希望展示在厨房、浴室等场景&#10;• 其他特殊要求..."
          rows={3}
        />
        <span className="help-text">补充使用步骤、场景要求、特殊说明等，帮助 AI 生成更精准的图片</span>
      </div>
      </div>
      
      {/* 第三步：套图策略 */}
      <div className="form-section">
        <div className="section-header">
          <h3>🖼️ 第三步：套图策略</h3>
          <span className="section-number">3/3</span>
        </div>
        <p className="section-description">
          选择营销策略 → 选择复杂度 → 点击"AI 分析"生成策略 → 可手动调整 → 生成图片
        </p>
        
        {/* 套图类型选择器 */}
        <TemplateSelector 
          selectedType={listing.imageType || 'basic'}
          onSelect={(type) => applyTemplate(type)}
          hasGeneratedPlans={listing.imagePlans && listing.imagePlans.length > 0}
          selectedComplexity={listing.complexity || 'L2'}
          onComplexityChange={(level) => onChange('complexity', level)}
        />
        
        <p className="section-help">
          <strong>💡 使用流程：</strong><br/>
          1. 选择营销策略（如"通用基础型"或"信息图型"）<br/>
          2. 选择复杂度级别（L1 极速版 / L2 标准版 / L3 精品版）<br/>
          3. 点击右上角"✨ 一键生成套图策略"按钮，AI 会根据你的产品信息生成 7 张图片的详细策略<br/>
          4. 如需调整，可手动修改下方每张图片的 prompt<br/>
          5. 切换策略时，如已有 AI 生成的策略，会提示是否覆盖
        </p>
        
        {/* 7 张图片策略详情 */}
        <div className="image-plans-container">
          <div className="image-plans-header">
            <h4> 7 张图片详细策略</h4>
            <span className="help-text">
              AI 生成的策略包含：构图、场景、色彩、文案、图标等详细参数
            </span>
          </div>
          
          {/* 图 1 - 主图 */}
          <div className="form-group image-plan-group">
            <div className="image-plan-label">
              <span className="image-badge">图 1</span>
              <span className="image-type">主图（Amazon 标准）</span>
            </div>
            <textarea
              value={getImagePlan1Default()}
              onChange={(e) => handleImagePlanChange(1, e.target.value)}
              rows={2}
            />
            <span className="help-text">✅ 纯白背景，产品居中，无文字无 LOGO，符合亚马逊主图要求</span>
          </div>
          
          {/* 图 2-7 */}
          {[2, 3, 4, 5, 6, 7].map(num => {
            const plan = listing.imagePlans?.find(p => p.id === num)
            const templatePlan = imageTemplates[listing.imageType]?.find(p => p.id === num)
            const label = getImagePlanLabel(num)
            return (
              <div key={num} className="form-group image-plan-group">
                <div className="image-plan-label">
                  <span className="image-badge">图{num}</span>
                  <span className="image-type">{label}</span>
                </div>
                <textarea
                  value={plan?.prompt || ''}
                  onChange={(e) => handleImagePlanChange(num, e.target.value)}
                  placeholder={templatePlan?.prompt || `描述图${num}的策略`}
                  rows={3}
                />
                {templatePlan && !plan?.prompt && (
                  <span className="help-text">✅ 已从"{listing.imageType}"模板填充专业排版描述</span>
                )}
                {plan?.prompt && (
                  <span className="help-text success">✅ 已自定义策略</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 已删除：产品参考图上传字段是冗余的，真正使用的是顶部的 ProductImageUploader 组件 */}
    </div>
  )
}
