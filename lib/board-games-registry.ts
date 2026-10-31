export interface BoardGame {
  name: string
  slug: string
  icon: string
  description: string
  /** Existing route of the game — kept as-is so shared links, QR codes and stored data keep working. */
  href: string
}

export const boardGames: BoardGame[] = [
  {
    name: 'Ma Sói',
    slug: 'werewolf-gm',
    icon: '🐺',
    description: 'Công cụ quản trò Ma Sói — chia vai, điều hành đêm, undo, lịch sử ván, phát thẻ vai trò online qua QR/mã phòng',
    href: '/tools/werewolf-gm',
  },
  {
    name: 'Xì Dách',
    slug: 'xi-dach',
    icon: '🃏',
    description: 'Tính xác suất quắc, thắng/thua và EV để quyết định rút hay dằn khi chơi xì dách',
    href: '/tools/xi-dach',
  },
  {
    name: 'Meme Party',
    slug: 'meme-party',
    icon: '🎭',
    description: 'Game meme cho hội bạn 5–12 người — chọn meme, bình chọn ẩn danh, 10 vòng hỗn hợp; điện thoại là tay cầm, TV là màn hình chung',
    href: '/tools/meme-party',
  },
]
