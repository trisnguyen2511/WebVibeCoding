export type ToolCategory = 'utility' | 'crypto' | 'game' | 'media' | 'dev' | 'productivity'

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
]
