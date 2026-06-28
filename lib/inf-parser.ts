export interface ButtonConfig {
  label: string
  key: string
  x: number
  y: number
  w: number
  h: number
  hold: boolean        // auto-repeat while held
  holdDelay: number    // ms before repeat starts (default 300)
  holdInterval: number // ms between repeats (default 80)
}

export interface ComboConfig {
  label: string
  x: number
  y: number
  w: number
  h: number
  chord: string[]  // keys to send simultaneously when this button is pressed
}

export interface ControllerConfig {
  name: string
  orientation: 'landscape' | 'portrait'
  buttons: Record<string, ButtonConfig>
  combos: Record<string, ComboConfig>
}

export function parseInf(content: string): { config: ControllerConfig | null; error: string | null } {
  const lines = content.split('\n')
  let section: string | null = null
  let buttonId: string | null = null
  let comboId: string | null = null

  const controller: {
    name?: string
    orientation?: 'landscape' | 'portrait'
    buttons: Record<string, Partial<ButtonConfig>>
    combos: Record<string, Partial<ComboConfig>>
  } = { buttons: {}, combos: {} }

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1
    const raw = lines[i].split(';')[0].trim()
    if (!raw) continue

    if (raw.startsWith('[')) {
      const header = raw.slice(1, -1).trim()
      if (header === 'controller') {
        section = 'controller'
        buttonId = null
        comboId = null
      } else if (header.startsWith('button:')) {
        buttonId = header.slice(7).trim().toUpperCase()
        comboId = null
        section = 'button'
        controller.buttons[buttonId] = {}
      } else if (header.startsWith('combo:')) {
        comboId = header.slice(6).trim().toUpperCase()
        buttonId = null
        section = 'combo'
        controller.combos[comboId] = {}
      } else {
        return { config: null, error: `line ${lineNum}: unknown section [${header}]` }
      }
      continue
    }

    if (!raw.includes('=')) {
      return { config: null, error: `line ${lineNum}: expected "key = value", got "${raw}"` }
    }

    const eqIdx = raw.indexOf('=')
    const key = raw.slice(0, eqIdx).trim()
    const value = raw.slice(eqIdx + 1).trim()

    if (section === 'controller') {
      if (key === 'name') {
        controller.name = value
      } else if (key === 'orientation') {
        if (value !== 'landscape' && value !== 'portrait') {
          return { config: null, error: `line ${lineNum}: orientation must be "landscape" or "portrait", got "${value}"` }
        }
        controller.orientation = value
      }
    } else if (section === 'button' && buttonId) {
      const btn = controller.buttons[buttonId]
      if (key === 'label') {
        btn.label = value
      } else if (key === 'key') {
        btn.key = value
      } else if (key === 'hold') {
        btn.hold = value === 'true'
      } else if (key === 'hold_delay') {
        const num = Number(value)
        if (isNaN(num) || num < 0) return { config: null, error: `line ${lineNum}: hold_delay must be a non-negative number` }
        btn.holdDelay = num
      } else if (key === 'hold_interval') {
        const num = Number(value)
        if (isNaN(num) || num < 16) return { config: null, error: `line ${lineNum}: hold_interval must be >= 16ms` }
        btn.holdInterval = num
      } else if (['x', 'y', 'w', 'h'].includes(key)) {
        const num = Number(value)
        if (isNaN(num)) return { config: null, error: `line ${lineNum}: "${key}" must be a number, got "${value}"` }
        if (num < 0 || num > 100) return { config: null, error: `line ${lineNum}: "${key}" must be in range 0–100 (percent), got ${num}` }
        btn[key as 'x' | 'y' | 'w' | 'h'] = num
      }
    } else if (section === 'combo' && comboId) {
      const combo = controller.combos[comboId]
      if (key === 'label') {
        combo.label = value
      } else if (key === 'chord') {
        const parts = value.split('+').map((k) => k.trim()).filter(Boolean)
        if (parts.length < 2) return { config: null, error: `line ${lineNum}: combo "chord" must list at least 2 keys separated by +, got "${value}"` }
        combo.chord = parts
      } else if (['x', 'y', 'w', 'h'].includes(key)) {
        const num = Number(value)
        if (isNaN(num)) return { config: null, error: `line ${lineNum}: "${key}" must be a number, got "${value}"` }
        if (num < 0 || num > 100) return { config: null, error: `line ${lineNum}: "${key}" must be in range 0–100 (percent), got ${num}` }
        combo[key as 'x' | 'y' | 'w' | 'h'] = num
      }
    }
  }

  if (!controller.name) return { config: null, error: 'missing required field: name' }
  if (!controller.orientation) return { config: null, error: 'missing required field: orientation' }

  for (const [id, btn] of Object.entries(controller.buttons)) {
    const missing = (['label', 'key', 'x', 'y', 'w', 'h'] as const).filter((f) => btn[f] === undefined)
    if (missing.length > 0) return { config: null, error: `button [${id}] is missing required fields: ${missing.join(', ')}` }
  }

  for (const [id, combo] of Object.entries(controller.combos)) {
    const missing = (['label', 'chord', 'x', 'y', 'w', 'h'] as const).filter((f) => combo[f] === undefined)
    if (missing.length > 0) return { config: null, error: `combo [${id}] is missing required fields: ${missing.join(', ')}` }
  }

  // Apply defaults for optional button fields
  const buttons = Object.fromEntries(
    Object.entries(controller.buttons).map(([id, btn]) => [
      id,
      {
        ...btn,
        hold: btn.hold ?? false,
        holdDelay: btn.holdDelay ?? 300,
        holdInterval: btn.holdInterval ?? 80,
      } as ButtonConfig,
    ])
  )

  return {
    config: {
      name: controller.name,
      orientation: controller.orientation,
      buttons,
      combos: controller.combos as Record<string, ComboConfig>,
    },
    error: null,
  }
}
