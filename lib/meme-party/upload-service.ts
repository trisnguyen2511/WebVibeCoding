import { createHash } from 'crypto'
import type { ContentStore } from './content-store'
import { inspectImage, sanitizeFilename } from './image-info'
import { LIMITS } from './import-validate'
import type { StagedFile } from './library-types'

export type UploadResult = { ok: true; file: StagedFile; reused: boolean } | { ok: false; status: number; error: string }

/**
 * Validates and stores one image. The real type comes from magic bytes; the
 * object is content-addressed (`assets/<sha256>.<ext>`) so identical images
 * are physically stored once no matter how many records reference them.
 */
export async function storeUploadedImage(store: ContentStore, originalName: string, bytes: Buffer): Promise<UploadResult> {
  if (bytes.length === 0) return { ok: false, status: 400, error: 'File rỗng' }
  if (bytes.length > LIMITS.maxImageBytes) {
    return { ok: false, status: 413, error: `Ảnh vượt quá ${Math.round(LIMITS.maxImageBytes / 1024 / 1024)}MB` }
  }
  const info = inspectImage(bytes)
  if (!info) return { ok: false, status: 415, error: 'Chỉ hỗ trợ JPG, PNG, WebP (kiểm tra theo nội dung file)' }

  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const filename = sanitizeFilename(originalName)
  const existing = await store.findAssetBySha(sha256)
  if (existing) {
    return {
      ok: true,
      reused: true,
      file: { filename, imageUrl: existing.imageUrl, storagePath: existing.storagePath, mime: info.mime, width: info.width, height: info.height, sha256, size: bytes.length },
    }
  }
  const stored = await store.putFile(`assets/${sha256}.${info.ext}`, bytes, info.mime)
  return {
    ok: true,
    reused: false,
    file: { filename, imageUrl: stored.url, storagePath: stored.storagePath, mime: info.mime, width: info.width, height: info.height, sha256, size: bytes.length },
  }
}
