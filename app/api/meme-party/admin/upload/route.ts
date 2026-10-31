import { NextRequest } from 'next/server'
import { clientKey, fail, ok, requireAdmin } from '@/lib/meme-party/api'
import { getContentStore } from '@/lib/meme-party/content-store'
import { LIMITS } from '@/lib/meme-party/import-validate'
import { logEvent } from '@/lib/meme-party/log'
import { rateLimited } from '@/lib/meme-party/rate-limit'
import { storeUploadedImage } from '@/lib/meme-party/upload-service'

// One image per request (keeps each request under serverless body limits and lets the UI retry files individually).
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied
  if (rateLimited(`upload:${clientKey(req)}`, 120, 60_000)) return fail('Tải lên quá nhanh, thử lại sau', 429, 'rate_limited')
  if (Number(req.headers.get('content-length') ?? 0) > LIMITS.maxImageBytes + 64 * 1024) return fail('Ảnh quá lớn', 413, 'too_large')
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return fail('Yêu cầu không hợp lệ', 400, 'invalid_body')
  }
  const file = form.get('file')
  if (!(file instanceof File)) return fail('Thiếu file', 400, 'invalid_body')
  try {
    const res = await storeUploadedImage(getContentStore(), file.name, Buffer.from(await file.arrayBuffer()))
    if (!res.ok) return fail(res.error, res.status, 'upload_rejected')
    logEvent('meme_party.upload', { name: res.file.filename, bytes: res.file.size, reused: res.reused })
    return ok({ file: res.file, reused: res.reused })
  } catch (e) {
    return fail('Lưu ảnh thất bại: ' + (e instanceof Error ? e.message : 'unknown'), 500, 'storage_error')
  }
}
