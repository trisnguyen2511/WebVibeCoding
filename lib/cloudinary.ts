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

export async function deleteChatImages(publicIds: string[]): Promise<void> {
  if (publicIds.length === 0) return
  const client = getClient()
  await client.api.delete_resources(publicIds)
}

export async function getCloudinaryUsageBytes(): Promise<number> {
  const client = getClient()
  const usage = await client.api.usage()
  return usage.storage?.usage ?? 0
}
