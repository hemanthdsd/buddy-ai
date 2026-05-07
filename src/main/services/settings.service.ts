import { app } from 'electron'

// ─── Settings Service ─────────────────────────────────────────────────────────
// Persists user preferences across app restarts using electron-store.
//
// electron-store writes a JSON file to:
//   %APPDATA%\prompt-enhancer\config.json   (Windows)
//
// We import it with require() because electron-store v8 is ESM-only and
// electron-vite bundles CommonJS for the main process.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Store = require('electron-store')

export interface AppSettings {
  model: string          // Ollama model name, e.g. "qwen2.5:3b"
  visionModel: string    // Vision model for screen analysis, e.g. "llava"
  startWithWindows: boolean
}

const DEFAULTS: AppSettings = {
  model: 'qwen2.5:3b',
  visionModel: 'llava',
  startWithWindows: false
}

// Typed store instance
const store = new Store<AppSettings>({
  name: 'config',
  defaults: DEFAULTS
})

// ─── Getters / setters ────────────────────────────────────────────────────────

export function getSettings(): AppSettings {
  return {
    model:             store.get('model',             DEFAULTS.model),
    visionModel:       store.get('visionModel',       DEFAULTS.visionModel),
    startWithWindows:  store.get('startWithWindows',  DEFAULTS.startWithWindows)
  }
}

export function saveSettings(partial: Partial<AppSettings>): AppSettings {
  if (partial.model            !== undefined) store.set('model',            partial.model)
  if (partial.visionModel      !== undefined) store.set('visionModel',      partial.visionModel)
  if (partial.startWithWindows !== undefined) {
    store.set('startWithWindows', partial.startWithWindows)
    // Apply the Windows login item immediately
    applyStartupSetting(partial.startWithWindows)
  }
  return getSettings()
}

// ─── Windows startup ──────────────────────────────────────────────────────────

export function applyStartupSetting(enable: boolean): void {
  try {
    app.setLoginItemSettings({
      openAtLogin: enable,
      name: 'Buddy AI'
    })
    console.log(`[Buddy] Start with Windows: ${enable}`)
  } catch (err) {
    // setLoginItemSettings is a no-op in dev mode on some systems — safe to ignore
    console.warn('[Buddy] setLoginItemSettings failed (expected in dev):', err)
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
// Call once on app.whenReady() to apply persisted startup preference

export function initSettings(): AppSettings {
  const settings = getSettings()
  applyStartupSetting(settings.startWithWindows)
  console.log('[Buddy] Settings loaded:', settings)
  return settings
}
