// Shared between the chat page and the admin panel so the admin's "edit
// starting from the current defaults" textarea always matches what actually
// renders when a room hasn't customized its own mood/reaction set.

export type MoodOption = { id: string; emoji: string; label: string; color: string }

export const DEFAULT_REACTION_EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '😡', '🎉']

export const DEFAULT_MOOD_OPTIONS: MoodOption[] = [
  { id: 'happy', emoji: '😄', label: 'Vui', color: '#FBBF24' },
  { id: 'love', emoji: '🥰', label: 'Yêu đời', color: '#F472B6' },
  { id: 'calm', emoji: '😌', label: 'Bình yên', color: '#34D399' },
  { id: 'tired', emoji: '😴', label: 'Mệt', color: '#60A5FA' },
  { id: 'sad', emoji: '😢', label: 'Buồn', color: '#818CF8' },
  { id: 'angry', emoji: '😡', label: 'Bực', color: '#F87171' },
]

// The set of font *ids* is fixed in code (each one is a real font pre-loaded
// at build time, chosen for Vietnamese diacritic support) — rooms can only
// choose which of these show in the picker and relabel them, not add
// arbitrary font names.
export type FontId = 'sans' | 'display' | 'mono' | 'cursive' | 'rounded' | 'serif'
export type FontOption = { id: FontId; label: string }

export const FONT_CATALOG: FontOption[] = [
  { id: 'sans', label: 'Mặc định' },
  { id: 'display', label: 'Tiêu đề' },
  { id: 'mono', label: 'Mono' },
  { id: 'cursive', label: 'Viết tay' },
  { id: 'rounded', label: 'Bo tròn' },
  { id: 'serif', label: 'Cổ điển' },
]
