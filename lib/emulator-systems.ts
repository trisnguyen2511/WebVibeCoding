// Shared between the main emulator page and its admin ROM-management page —
// keeps the supported systems/cores/extensions in one place.
export type System = 'nes' | 'snes' | 'gba' | 'gbc' | 'n64' | 'arcade'

export const SYSTEMS: { value: System; label: string; exts: string; core: string }[] = [
  { value: 'nes', label: 'NES', exts: '.nes', core: 'fceumm' },
  { value: 'snes', label: 'SNES', exts: '.sfc .smc', core: 'snes9x' },
  { value: 'gba', label: 'GBA', exts: '.gba', core: 'mgba' },
  { value: 'gbc', label: 'Game Boy', exts: '.gbc .gb', core: 'gambatte' },
  { value: 'n64', label: 'N64', exts: '.n64 .z64', core: 'mupen64plus_next' },
  { value: 'arcade', label: 'Arcade (CP1/CP2/NeoGeo)', exts: '.zip', core: 'fbneo' },
]
