// Client-only helper: uploads a large file directly to Cloudinary using its
// chunked upload protocol (POST each slice with a Content-Range header and
// a shared X-Unique-Upload-Id). This is required for ROM files up to ~2GB
// because Vercel serverless functions cap request bodies far below that —
// the file must go straight from the browser to Cloudinary, never through
// our own API.
const CHUNK_SIZE = 20 * 1024 * 1024 // 20MB — Cloudinary's recommended slice size

export type RomUploadSignedParams = {
  signature: string
  timestamp: number
  apiKey: string
  cloudName: string
  folder: string
  publicId: string
}

export type CloudinaryUploadResult = {
  secure_url: string
  public_id: string
  bytes: number
}

export async function uploadRomToCloudinary(
  file: File,
  params: RomUploadSignedParams,
  onProgress?: (fraction: number) => void
): Promise<CloudinaryUploadResult> {
  const uploadId = `rom-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const url = `https://api.cloudinary.com/v1_1/${params.cloudName}/raw/upload`
  const total = file.size

  let lastResult: CloudinaryUploadResult | null = null
  for (let start = 0; start < total; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, total)
    const chunk = file.slice(start, end)

    const form = new FormData()
    form.append('file', chunk)
    form.append('api_key', params.apiKey)
    form.append('timestamp', String(params.timestamp))
    form.append('signature', params.signature)
    form.append('folder', params.folder)
    form.append('public_id', params.publicId)

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Unique-Upload-Id': uploadId,
        'Content-Range': `bytes ${start}-${end - 1}/${total}`,
      },
      body: form,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Cloudinary chunk upload failed (HTTP ${res.status}): ${text}`)
    }

    lastResult = (await res.json()) as CloudinaryUploadResult
    onProgress?.(end / total)
  }

  if (!lastResult) throw new Error('empty file')
  return lastResult
}
