export interface Game {
  name: string
  slug: string
  icon: string
  description: string
}

export const games: Game[] = [
  {
    name: 'Gỡ Rối Rương Xoay',
    slug: 'untangle-chest',
    icon: '🔗',
    description: 'Xoay điện thoại để gỡ dây xoắn treo rương — vật lý con lắc xoắn thật, PC hiện màn hình, tối đa 4 người chơi',
  },
]
