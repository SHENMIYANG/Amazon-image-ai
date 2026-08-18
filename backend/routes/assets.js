import express from 'express'
import { getAccessibleAsset } from '../services/persistence/workbenchRepository.js'
import { readAssetBuffer } from '../services/storage.js'
import { isAuthEnabled } from '../services/auth/session.js'

const router = express.Router()

router.get('/:storageProvider/*', async (req, res, next) => {
  try {
    const storageProvider = String(req.params.storageProvider || '')
    const objectKey = String(req.params[0] || '').replace(/\\/g, '/')
    const asset = await getAccessibleAsset({ storageProvider, objectKey, actor: req.auth })
    if (isAuthEnabled() && !asset) {
      return res.status(404).json({ success: false, message: '图片不存在或当前账号无权访问。' })
    }

    if (asset.mimeType) res.type(asset.mimeType)
    res.send(await readAssetBuffer(storageProvider, objectKey))
  } catch (error) {
    next(error)
  }
})

export default router
