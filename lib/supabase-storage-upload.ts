export async function uploadRomToSupabase(
  file: File,
  signedUrl: string,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', signedUrl)
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`Upload thất bại HTTP ${xhr.status}: ${xhr.responseText}`))
    }
    xhr.onerror = () => reject(new Error('Lỗi mạng khi upload'))
    xhr.send(file)
  })
}
