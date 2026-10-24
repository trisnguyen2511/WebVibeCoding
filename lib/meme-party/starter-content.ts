import type { AssetContent, CaptionContent, ContentPool, PromptContent } from './types'

// Small built-in starter pack so a fresh install is playable before anyone
// fills the library. Each category falls back to it only while the managed
// library has no active content for that category.

const FACES: { id: string; title: string }[] = [
  { id: 'shock', title: 'Sốc tận óc' },
  { id: 'cry', title: 'Khóc thầm' },
  { id: 'cool', title: 'Ngầu lòi' },
  { id: 'sus', title: 'Nghi ngờ' },
  { id: 'dead', title: 'Chết lâm sàng' },
  { id: 'love', title: 'Mê mẩn' },
  { id: 'rage', title: 'Cáu thật sự' },
  { id: 'sleepy', title: 'Buồn ngủ' },
  { id: 'cringe', title: 'Rùng mình' },
  { id: 'smug', title: 'Tự mãn' },
  { id: 'think', title: 'Suy tư' },
  { id: 'party', title: 'Quẩy lên' },
]

export const STARTER_ASSETS: AssetContent[] = FACES.map((f) => ({
  id: `starter-${f.id}`,
  title: f.title,
  imageUrl: `/meme-party/starter/${f.id}.svg`,
  modes: ['meme', 'reaction'],
}))

export const STARTER_PROMPTS: PromptContent[] = [
  { id: 'starter-cap-1', mode: 'caption', text: 'Ảnh chụp lúc 7 giờ sáng thứ Hai', imageUrl: '/meme-party/starter/shock.svg' },
  { id: 'starter-cap-2', mode: 'caption', text: 'Khoảnh khắc nhìn số dư tài khoản cuối tháng', imageUrl: '/meme-party/starter/cry.svg' },
  { id: 'starter-cap-3', mode: 'caption', text: 'Bạn thân rủ đi chơi đúng lúc vừa nằm xuống giường', imageUrl: '/meme-party/starter/sleepy.svg' },
  { id: 'starter-cap-4', mode: 'caption', text: 'Deadline còn đúng 5 phút', imageUrl: '/meme-party/starter/dead.svg' },
  { id: 'starter-cap-5', mode: 'caption', text: 'Lúc mở camera trước mà quên đang bật', imageUrl: '/meme-party/starter/cringe.svg' },
  { id: 'starter-cap-6', mode: 'caption', text: 'Khi crush seen mà không rep', imageUrl: '/meme-party/starter/sus.svg' },
  { id: 'starter-meme-1', mode: 'meme', text: 'Nhóm chat im lặng 3 tiếng, rồi có người nhắn "alo"' },
  { id: 'starter-meme-2', mode: 'meme', text: 'Vừa nhận lương, 2 ngày sau tiền biến mất' },
  { id: 'starter-meme-3', mode: 'meme', text: 'Sếp bảo "họp nhanh 5 phút thôi"' },
  { id: 'starter-meme-4', mode: 'meme', text: 'Ăn buffet lần đầu sau một tuần diet' },
  { id: 'starter-meme-5', mode: 'meme', text: 'Phát hiện mình mặc áo ngược cả ngày' },
  { id: 'starter-meme-6', mode: 'meme', text: 'Lỡ gửi nhầm tin nhắn cho đúng người không nên gửi' },
  { id: 'starter-rea-1', mode: 'reaction', text: 'Cô giáo thông báo: "Mai kiểm tra bất ngờ nhé cả lớp"' },
  { id: 'starter-rea-2', mode: 'reaction', text: 'Crush nói: "Mình chỉ coi bạn là bạn thôi"' },
  { id: 'starter-rea-3', mode: 'reaction', text: 'Họp họ hàng, mẹ hỏi to: "Con có người yêu chưa?"' },
  { id: 'starter-rea-4', mode: 'reaction', text: 'Nhận tin nhắn lúc 11 giờ đêm: "Mai đi làm sớm nhé"' },
  { id: 'starter-rea-5', mode: 'reaction', text: 'Giá xăng lại tăng đúng hôm bạn đổ đầy bình' },
  { id: 'starter-rea-6', mode: 'reaction', text: 'Bạn thân khoe: "Tao có người yêu rồi nha"' },
]

const CAPTION_TEXTS = [
  'Tôi không sao, chỉ là tâm hồn đã rời khỏi cơ thể',
  'Mẹ ơi con muốn về quê nuôi gà',
  'Bên ngoài bình tĩnh, bên trong bão cấp 12',
  'Cuộc đời cho tôi chanh nên tôi pha trà đá',
  'Đã đọc, đã hiểu, đã quên',
  'Nói là đi ngủ sớm — lúc đó 3 giờ sáng',
  'Tôi đến đây vì nghe nói có đồ ăn miễn phí',
  'Ví tôi: 0 đồng. Mood tôi: vẫn nở hoa',
  'Tôi ổn. (Không ổn)',
  'Làm việc nhóm là một mình làm cả nhóm',
  'Cứ tự tin, lỡ sai thì nói là cố ý',
  'Chỉ cần tôi không nhìn thì deadline không tồn tại',
  'Một chút drama cho đời bớt nhạt',
  'Gen Z gọi là chill, tôi gọi là bỏ cuộc',
]

export const STARTER_CAPTIONS: CaptionContent[] = CAPTION_TEXTS.map((text, i) => ({ id: `starter-capt-${i + 1}`, text }))

export const STARTER_POOL: ContentPool = { prompts: STARTER_PROMPTS, captions: STARTER_CAPTIONS, assets: STARTER_ASSETS }
