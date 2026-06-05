import './ComplianceCheck.css'

export default function ComplianceCheckPanel({ listing, imagePlans, imageType }) {
  if (!listing || !imagePlans || imagePlans.length === 0) {
    return null
  }

  // 检查必填字段
  const requiredFields = ['productName', 'category', 'targetAudience', 'sellingPoints', 'marketplace']
  const missingFields = requiredFields.filter(field => !listing[field])

  if (missingFields.length > 0) {
    return (
      <div className="compliance-result">
        <div className="compliance-summary has-issues">
          ⚠️ 请先填写完整 Listing 信息
        </div>
        <div className="compliance-image-result">
          <p>缺少字段：{missingFields.join(', ')}</p>
        </div>
      </div>
    )
  }

  // 执行合规检查
  const checkResult = window.amazonCompliance.batchComplianceCheck(
    imagePlans,
    listing,
    imageType
  )

  if (!checkResult || checkResult.images.length === 0) {
    return (
      <div className="compliance-result">
        <div className="compliance-summary pass">
          ✅ 合规检查通过
        </div>
      </div>
    )
  }

  return (
    <div className="compliance-result">
      <div className={`compliance-summary ${checkResult.totalIssues > 0 ? 'has-issues' : 'pass'}`}>
        {checkResult.totalIssues > 0 ? (
          <span>⚠️ 发现 {checkResult.totalIssues} 个合规问题，{checkResult.totalWarnings} 个警告</span>
        ) : (
          <span>✅ 合规检查通过 ({checkResult.totalWarnings} 个建议)</span>
        )}
      </div>

      {checkResult.images.map(img => (
        (img.issues.length > 0 || img.warnings.length > 0) && (
          <div key={img.imageId} className="compliance-image-result">
            <h4>图 {img.imageId}</h4>
            {img.issues.length > 0 && (
              <div className="compliance-issues">
                {img.issues.map((issue, idx) => (
                  <div key={idx} className="compliance-issue">
                    ⛔ {issue}
                  </div>
                ))}
              </div>
            )}
            {img.warnings.length > 0 && (
              <div className="compliance-warnings">
                {img.warnings.map((warning, idx) => (
                  <div key={idx} className="compliance-warning">
                    ⚠️ {warning}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      ))}
    </div>
  )
}
