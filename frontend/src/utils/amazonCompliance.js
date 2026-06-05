/**
 * 亚马逊图片合规检查规则
 * 根据亚马逊官方图片要求制定
 */

// 主图合规检查
export function checkMainImageCompliance(imagePlan, listing) {
  const issues = []
  const warnings = []

  // 规则 1：主图必须是纯白背景 (RGB 255,255,255)
  if (imagePlan.id === 1) {
    if (imagePlan.colorTone && !imagePlan.colorTone.toLowerCase().includes('white')) {
      issues.push('主图（图 1）必须使用纯白背景 (Pure White Background)')
    }
  }

  // 规则 2：产品必须占据画布 85% 以上
  if (imagePlan.id === 1) {
    if (imagePlan.composition && !imagePlan.composition.toLowerCase().includes('85%')) {
      warnings.push('建议：产品应占据画布 85% 以上')
    }
  }

  // 规则 3：不能有文字、水印、边框
  if (imagePlan.elements) {
    const forbiddenElements = ['text', 'logo', 'watermark', 'border', 'frame', '文字', '水印', '边框']
    forbiddenElements.forEach(forbidden => {
      if (imagePlan.elements.toLowerCase().includes(forbidden)) {
        issues.push(`主图不能包含"${forbidden}"元素`)
      }
    })
  }

  // 规则 4：图片分辨率至少 1000x1000
  // 这个在生成时控制

  // 规则 5：不能有其他物体（除非是展示使用场景）
  if (imagePlan.id === 1 && imagePlan.scene) {
    const allowedScenes = ['white', 'plain', 'simple', '纯白', '白色']
    const hasAllowedScene = allowedScenes.some(scene => 
      imagePlan.scene.toLowerCase().includes(scene)
    )
    if (!hasAllowedScene) {
      warnings.push('主图建议只展示产品本身，避免复杂场景')
    }
  }

  return { issues, warnings }
}

// 辅图合规检查（图 2-7）
export function checkSupportingImageCompliance(imagePlan, listing) {
  const issues = []
  const warnings = []

  // 规则：不能侵犯版权
  if (imagePlan.elements) {
    const copyrightRisks = ['disney', 'marvel', 'nike', 'apple', '品牌 logo', '卡通人物']
    copyrightRisks.forEach(risk => {
      if (imagePlan.elements.toLowerCase().includes(risk)) {
        warnings.push(`可能涉及版权风险："${risk}"`)
      }
    })
  }

  // 规则：不能有不实宣传
  if (imagePlan.elements) {
    const falseClaims = ['best seller', '#1', 'guaranteed', 'cure', '治疗', '最佳', '第一']
    falseClaims.forEach(claim => {
      if (imagePlan.elements.toLowerCase().includes(claim)) {
        warnings.push(`可能涉及不实宣传："${claim}"`)
      }
    })
  }

  return { issues, warnings }
}

// A+ 页面图合规检查
export function checkAplusCompliance(imagePlan, listing) {
  const issues = []
  const warnings = []

  // 规则：文字不能超过图片 20%
  if (imagePlan.elements && imagePlan.elements.toLowerCase().includes('text')) {
    warnings.push('A+ 图文字面积建议不超过 20%')
  }

  // 规则：不能有外部链接或二维码
  if (imagePlan.elements) {
    const forbiddenItems = ['qr code', 'url', 'website', 'email', '二维码', '网址', '邮箱']
    forbiddenItems.forEach(item => {
      if (imagePlan.elements.toLowerCase().includes(item)) {
        issues.push(`A+ 图不能包含"${item}"`)
      }
    })
  }

  return { issues, warnings }
}

// 批量合规检查
export function batchComplianceCheck(imagePlans, listing, imageType) {
  const results = {
    totalIssues: 0,
    totalWarnings: 0,
    images: []
  }

  imagePlans.forEach(plan => {
    let checkResult

    if (imageType === 'main' || imageType === 'both') {
      if (plan.id === 1) {
        checkResult = checkMainImageCompliance(plan, listing)
      } else {
        checkResult = checkSupportingImageCompliance(plan, listing)
      }
    } else if (imageType === 'aplus') {
      checkResult = checkAplusCompliance(plan, listing)
    }

    if (checkResult) {
      results.images.push({
        imageId: plan.id,
        issues: checkResult.issues,
        warnings: checkResult.warnings
      })
      results.totalIssues += checkResult.issues.length
      results.totalWarnings += checkResult.warnings.length
    }
  })

  return results
}
