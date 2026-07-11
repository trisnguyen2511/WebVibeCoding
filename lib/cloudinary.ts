import { v2 as cloudinary } from 'cloudinary'

let configured = false
function getClient() {
  if (!configured) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    })
    configured = true
  }
  return cloudinary
}

export async function uploadChatImage(
  dataUrl: string
): Promise<{ url: string; publicId: string; bytes: number }> {
  const client = getClient()
  const result = await client.uploader.upload(dataUrl, {
    folder: 'private-chat',
    resource_type: 'image',
  })
  return { url: result.secure_url, publicId: result.public_id, bytes: result.bytes }
}

const CHAT_UPLOAD_FOLDER = 'private-chat'

// Signature for a direct browser→Cloudinary upload (used for file/video
// attachments, which can exceed the serverless function body-size limit).
// Only params the client will actually send get signed — resource_type and
// api_key are not part of Cloudinary's signature calculation.
export function createChatUploadSignature(): { signature: string; timestamp: number; apiKey: string; cloudName: string; folder: string } {
  const client = getClient()
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = client.utils.api_sign_request(
    { folder: CHAT_UPLOAD_FOLDER, timestamp },
    process.env.CLOUDINARY_API_SECRET!
  )
  return {
    signature,
    timestamp,
    apiKey: process.env.CLOUDINARY_API_KEY!,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
    folder: CHAT_UPLOAD_FOLDER,
  }
}

export async function deleteChatImages(publicIds: string[], resourceType: string = 'image'): Promise<void> {
  if (publicIds.length === 0) return
  const client = getClient()
  await client.api.delete_resources(publicIds, { resource_type: resourceType })
}

export async function getCloudinaryUsageBytes(): Promise<number> {
  const client = getClient()
  const usage = await client.api.usage()
  return usage.storage?.usage ?? 0
}
