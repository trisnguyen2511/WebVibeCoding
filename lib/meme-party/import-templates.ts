import { toCsv } from './csv'

export const CSV_HEADERS = ['id', 'contentType', 'title', 'imageUrl', 'filename', 'gameMode', 'modes', 'prompt', 'caption', 'imageRef', 'category', 'tags', 'language', 'status']

const row = (o: Record<string, string>) => CSV_HEADERS.map((h) => o[h] ?? '')

/** Header + one valid example per content type (also documents which columns apply). */
export function csvTemplate(): string {
  return toCsv(CSV_HEADERS, [
    row({ id: 'asset_001', contentType: 'memeAsset', title: 'Mèo ngạc nhiên', imageUrl: 'https://example.com/cat.jpg', modes: 'meme|reaction', category: 'animal', tags: 'meo|soc', language: 'vi', status: 'active' }),
    row({ id: 'asset_002', contentType: 'memeAsset', title: 'Ảnh tải lên kèm', filename: 'meo-cuoi.png', category: 'animal', tags: 'meo', language: 'vi', status: 'active' }),
    row({ id: 'prompt_001', contentType: 'gamePrompt', title: 'Cuộc họp bất ngờ', gameMode: 'reaction', prompt: 'Khi cuộc họp bị kéo dài thêm 2 tiếng', category: 'office', tags: 'work|meeting', language: 'vi', status: 'active' }),
    row({ id: 'prompt_002', contentType: 'gamePrompt', title: 'Ảnh thứ Hai', gameMode: 'caption', prompt: 'Ảnh chụp lúc 7 giờ sáng thứ Hai', imageRef: 'asset_001', category: 'office', language: 'vi', status: 'active' }),
    row({ id: 'caption_001', contentType: 'captionOption', title: 'Tôi ổn', caption: 'Tôi ổn. (Không ổn)', category: 'general', tags: 'mood', language: 'vi', status: 'active' }),
  ])
}

export const CSV_GUIDE = `# Cột áp dụng theo contentType
# memeAsset:     title*, (imageUrl | filename)*, modes (meme|reaction, mặc định cả hai)
# gamePrompt:    gameMode* (caption|meme|reaction), prompt*, imageRef (id của memeAsset, tuỳ chọn)
# captionOption: caption*
# Chung:         id (tuỳ chọn, để cập nhật bản ghi cũ), category, tags (ngăn cách bằng |), language (mặc định vi), status (active|inactive)
# (*) bắt buộc. Dùng UTF-8; ô chứa dấu phẩy/xuống dòng phải đặt trong dấu nháy kép.
`

export function csvExample(): string {
  return csvTemplate()
}

const jsonItems = () => [
  { id: 'asset_001', contentType: 'memeAsset', title: 'Mèo ngạc nhiên', imageUrl: 'https://example.com/cat.jpg', modes: ['meme', 'reaction'], category: 'animal', tags: ['meo', 'soc'], language: 'vi', status: 'active' },
  { id: 'asset_002', contentType: 'memeAsset', title: 'Ảnh tải lên kèm', filename: 'meo-cuoi.png', category: 'animal', tags: ['meo'], language: 'vi', status: 'active' },
  { id: 'prompt_001', contentType: 'gamePrompt', title: 'Cuộc họp bất ngờ', gameMode: 'reaction', prompt: 'Khi cuộc họp bị kéo dài thêm 2 tiếng', category: 'office', tags: ['work', 'meeting'], language: 'vi', status: 'active' },
  { id: 'prompt_002', contentType: 'gamePrompt', title: 'Ảnh thứ Hai', gameMode: 'caption', prompt: 'Ảnh chụp lúc 7 giờ sáng thứ Hai', imageRef: 'asset_001', category: 'office', language: 'vi', status: 'active' },
  { id: 'caption_001', contentType: 'captionOption', title: 'Tôi ổn', caption: 'Tôi ổn. (Không ổn)', category: 'general', tags: ['mood'], language: 'vi', status: 'active' },
]

export function jsonTemplate(): string {
  return JSON.stringify({ version: 1, items: jsonItems() }, null, 2) + '\n'
}

export function jsonExample(): string {
  return JSON.stringify(jsonItems(), null, 2) + '\n'
}
