export type ToolCategory = 'utility' | 'crypto' | 'game' | 'media'

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
    name: 'Encrypt / Decrypt',
    slug: 'decrypt',
    icon: '🔓',
    description: 'AES-256 text encryption and decryption',
    category: 'crypto',
  },
  {
    name: 'Game Controller',
    slug: 'game-controller',
    icon: '🎮',
    description: 'Use your phone as a wireless gamepad',
    category: 'game',
  },
]
