export type ToolCategory = 'utility' | 'crypto' | 'game' | 'media' | 'dev' | 'productivity' | 'social'

export interface Tool {
  name: string
  slug: string
  icon: string
  description: string
  category: ToolCategory
}

export const tools: Tool[] = [
  {
    name: 'Calculator',
    slug: 'calculator',
    icon: '🔢',
    description: 'Basic and scientific calculations',
    category: 'utility',
  },
  {
    name: 'Color Picker',
    slug: 'color-picker',
    icon: '🎨',
    description: 'Pick colors and convert between HEX, RGB, HSL',
    category: 'utility',
  },
  {
    name: 'Hash Generator',
    slug: 'hash',
    icon: '#',
    description: 'Generate MD5, SHA1, SHA256, SHA512 hashes',
    category: 'crypto',
  },
  {
    name: 'Game Controller',
    slug: 'game-controller',
    icon: '🎮',
    description: 'Use your phone as a wireless gamepad',
    category: 'game',
  },
  {
    name: 'Markdown Editor',
    slug: 'markdown-editor',
    icon: '📝',
    description: 'Write Markdown with live preview and auto-save',
    category: 'utility',
  },
  {
    name: 'JSON Tools',
    slug: 'json-tools',
    icon: '{ }',
    description: 'Format, validate and diff JSON documents',
    category: 'dev',
  },
  {
    name: 'Color Palette',
    slug: 'color-palette',
    icon: '🖌️',
    description: 'Generate palettes — shades, complementary, triadic and more',
    category: 'utility',
  },
  {
    name: 'Regex Tester',
    slug: 'regex-tester',
    icon: '.*',
    description: 'Test regular expressions with live match highlighting',
    category: 'dev',
  },
  {
    name: 'Encode / Decode',
    slug: 'encode-decode',
    icon: '⇄',
    description: 'Base64, URL encode, JWT decode, and AES-256 encryption',
    category: 'dev',
  },
  {
    name: 'Pomodoro',
    slug: 'pomodoro',
    icon: '🍅',
    description: 'Focus timer with task list and break reminders',
    category: 'productivity',
  },
  {
    name: 'Image Tools',
    slug: 'image-tools',
    icon: '🖼️',
    description: 'Compress, resize and convert images in the browser',
    category: 'media',
  },
  {
    name: 'Lucky Wheel',
    slug: 'lucky-wheel',
    icon: '🎡',
    description: 'Vòng quay may mắn — preset đa dạng, tùy chỉnh lựa chọn, lịch sử kết quả',
    category: 'utility',
  },
  {
    name: 'Emulator',
    slug: 'emulator',
    icon: '🕹️',
    description: 'Nintendo emulator trên web — NES, SNES, GBA, N64; điện thoại làm controller, multiplayer 4P',
    category: 'game',
  },
  {
    name: 'Private Chat',
    slug: 'private-chat',
    icon: '💬',
    description: 'PIN-based private chat with push notifications',
    category: 'social',
  },
  {
    name: 'Werewolf GM',
    slug: 'werewolf-gm',
    icon: '🐺',
    description: 'Công cụ quản trò Ma Sói — chia vai, điều hành đêm, kéo thả chọn mục tiêu, undo, lịch sử ván',
    category: 'game',
  },
  {
    name: 'Games',
    slug: 'games',
    icon: '🎲',
    description: 'Danh sách game tự code, chơi trực tiếp trên web — PC host phòng, điện thoại làm tay cầm cảm biến',
    category: 'game',
  },
]
