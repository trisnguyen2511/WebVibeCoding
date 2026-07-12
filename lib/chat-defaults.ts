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
