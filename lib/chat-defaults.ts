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
export type FontId = 'sans' | 'display' | 'mono' | 'cursive' | 'rounded' | 'serif' | 'script' | 'impact' | 'cute' | 'funky'
export type FontOption = { id: FontId; label: string }

export const FONT_CATALOG: FontOption[] = [
  { id: 'sans', label: 'Mặc định' },
  { id: 'display', label: 'Tiêu đề' },
  { id: 'mono', label: 'Mono' },
  { id: 'cursive', label: 'Viết tay' },
  { id: 'rounded', label: 'Bo tròn' },
  { id: 'serif', label: 'Cổ điển' },
  { id: 'script', label: 'Uyển chuyển' },
  { id: 'impact', label: 'Đậm nét' },
  { id: 'cute', label: 'Dễ thương' },
  { id: 'funky', label: 'Phá cách' },
]

// Wallpaper presets are CSS background-image values (gradients or a bundled
// static image) rendered behind the message list — fixed in code, a room
// picks one by id or uploads a fully custom image instead.
export type WallpaperPresetId = 'none' | 'nebula' | 'sunset' | 'ocean' | 'blush' | 'forest' | 'midnight' | 'mosaic' | 'burrow'
export const WALLPAPER_PRESETS: { id: WallpaperPresetId; label: string; css: string }[] = [
  { id: 'none', label: 'Mặc định', css: '' },
  { id: 'nebula', label: 'Tinh vân', css: 'radial-gradient(circle at 20% 20%, rgba(124,58,237,0.25), transparent 55%), radial-gradient(circle at 80% 70%, rgba(167,139,250,0.18), transparent 50%)' },
  { id: 'sunset', label: 'Hoàng hôn', css: 'linear-gradient(160deg, rgba(251,191,36,0.18), rgba(244,114,182,0.16) 55%, rgba(124,58,237,0.14))' },
  { id: 'ocean', label: 'Đại dương', css: 'linear-gradient(160deg, rgba(59,130,246,0.18), rgba(52,211,153,0.12) 60%, transparent)' },
  { id: 'blush', label: 'Ửng hồng', css: 'radial-gradient(circle at 30% 30%, rgba(244,114,182,0.22), transparent 55%), radial-gradient(circle at 75% 80%, rgba(167,139,250,0.16), transparent 55%)' },
  { id: 'forest', label: 'Rừng xanh', css: 'linear-gradient(160deg, rgba(52,211,153,0.16), rgba(96,165,250,0.10) 60%, transparent)' },
  { id: 'midnight', label: 'Đêm sâu', css: 'radial-gradient(circle at 50% 0%, rgba(129,140,248,0.20), transparent 60%)' },
  { id: 'mosaic', label: 'Gạch hoa', css: "url('/wallpapers/mosaic-tiles.jpg')" },
  {
    id: 'burrow',
    label: 'Tổ ấm trong hốc cây',
    // Soft layered glow instead of a literal image — the reference photo is a
    // busy game-UI screenshot (currency counters, buttons baked in), not
    // something that tiles cleanly as a chat background.
    css: 'radial-gradient(circle at 25% 10%, rgba(217,165,68,0.20), transparent 55%), linear-gradient(180deg, rgba(62,92,58,0.22), rgba(43,31,22,0.18) 55%, transparent), radial-gradient(circle at 80% 85%, rgba(74,155,155,0.14), transparent 50%)',
  },
]

// One-click "apply this whole look" presets — bundles a wallpaper with
// matching bubble colors and font, instead of an admin having to configure
// each piece separately to match a reference theme image.
export type ThemePreset = {
  id: string
  label: string
  wallpaperPreset: WallpaperPresetId
  primaryColor: string
  secondaryColor: string
  tertiaryColor: string
  quaternaryColor: string
  fontId: FontId
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'mosaic',
    label: 'Gạch hoa (Talavera)',
    wallpaperPreset: 'mosaic',
    primaryColor: '#1E4FD6', // cobalt blue tile
    secondaryColor: '#E23B2E', // vermillion tile
    tertiaryColor: '#F2A80F', // marigold tile
    quaternaryColor: '#2F9E4F', // leaf-green tile
    fontId: 'rounded',
  },
  {
    id: 'burrow',
    label: 'Tổ ấm trong hốc cây',
    wallpaperPreset: 'burrow',
    primaryColor: '#3E5C3A', // forest canopy green
    secondaryColor: '#C1615A', // terracotta/rose bed linens
    tertiaryColor: '#D9A544', // golden lantern glow
    quaternaryColor: '#4A9B9B', // teal bathtub
    fontId: 'rounded',
  },
]
