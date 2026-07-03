/// <reference types="vite/client" />
import { setGameTranslator } from '@minigame/core'
import type { I18nMode } from '@minigame/i18n'
import { getLocale, initI18n, mountDevtools, t } from '@minigame/i18n'
import { initPixiAppWithHighDpi } from '@minigame/render-adapter/pixi'
import * as PIXI from 'pixi.js'
import { Application } from 'pixi.js'
import enLocale from '../../i18n/en.json'
import zhLocale from '../../i18n/zh.json'
import { Engine } from './source/engine/Engine'
import { MainScene } from './source/game/MainScene'

// Initialize i18n
const i18nMode = (import.meta.env.VITE_I18N_MODE as I18nMode | undefined) ?? 'locked'
const i18nLocale = import.meta.env.VITE_I18N_LOCALE as string | undefined

initI18n({
  locales: { zh: zhLocale, en: enLocale },
  defaultLocale: 'zh',
  fallbackLocale: 'en',
  mode: i18nMode,
  locale: i18nLocale,
})

setGameTranslator((key, vars) => t(key, vars))

document.documentElement.lang = getLocale() === 'zh' ? 'zh-CN' : 'en'
document.title = `${t('game.title')} · PixiJS`

const loadingLabel = document.querySelector('#loading-screen > div:last-child')
if (loadingLabel) {
  loadingLabel.textContent = t('loading.game')
}

if (import.meta.env.DEV) {
  mountDevtools()
}

;(window as any).PIXI = PIXI

let app: Application | null = null
let engine: Engine | null = null
let scene: MainScene | null = null
let highDpiCleanup: (() => void) | null = null

async function waitForPixelFont(): Promise<void> {
  if (!document.fonts?.load) return
  try {
    await Promise.race([
      document.fonts.load('16px Zpix'),
      new Promise((resolve) => window.setTimeout(resolve, 2500)),
    ])
  } catch {
    // Font loading can fail for local/offline play; keep booting with fallbacks.
  }
}

async function startGame() {
  if (app) return

  const container = document.getElementById('game-container')
  if (!container) {
    throw new Error('Missing #game-container')
  }

  await waitForPixelFont()

  app = new Application()
  highDpiCleanup = await initPixiAppWithHighDpi({
    app,
    container,
    appOptions: {
      backgroundColor: 0x1a1625,
      antialias: false,
      roundPixels: true,
    },
    onResize: ({ width, height }) => {
      scene?.onResize(width, height)
    },
  })

  container.appendChild(app.canvas)

  engine = new Engine(app)
  scene = new MainScene(engine)
  engine.setScene(scene)

  ;(window as any).game = engine

  const loadingScreen = document.getElementById('loading-screen')
  if (loadingScreen) {
    loadingScreen.classList.add('hidden')
  }

  app.canvas.tabIndex = 0
  app.canvas.focus()
  app.canvas.addEventListener('pointerdown', () => {
    app?.canvas.focus()
  })

  engine.start()
}

function destroyGame() {
  highDpiCleanup?.()
  highDpiCleanup = null
  engine?.destroy()
  engine = null
  scene = null

  if (app) {
    app.canvas.remove()
    app.destroy(true)
    app = null
  }
}

window.addEventListener('beforeunload', () => {
  destroyGame()
})

function showBootError(error: unknown): void {
  console.error(error)
  const loadingScreen = document.getElementById('loading-screen')
  if (!loadingScreen) return
  const msg = error instanceof Error ? error.message : String(error)
  loadingScreen.innerHTML = `
    <div style="max-width:320px;text-align:center;padding:16px;color:#f0ebe3">
      <div style="color:#e8a838;font-weight:600;margin-bottom:8px">${t('loading.failed')}</div>
      <div style="font-size:13px;color:#c45c6a;word-break:break-word">${msg}</div>
      <div style="font-size:12px;color:#9a8f82;margin-top:12px">${t('loading.openConsole')}</div>
    </div>`
}

void startGame().catch(showBootError)
