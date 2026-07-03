import type { Application, ApplicationOptions } from 'pixi.js'
import { onDisplayChange } from '@minigame/platform'
import type { DisplayScaleOptions } from '@minigame/platform'

export type PixiResizeMetrics = {
  width: number
  height: number
  pixelRatio: number
}

export type PixiHighDpiOptions = DisplayScaleOptions & {
  app: Application
  container: HTMLElement
  onResize?: (metrics: PixiResizeMetrics) => void
  appOptions?: Partial<Omit<ApplicationOptions, 'width' | 'height' | 'resolution' | 'autoDensity' | 'resizeTo'>>
}

export async function initPixiAppWithHighDpi({
  app,
  container,
  onResize,
  appOptions,
  minPixelRatio = 1,
  maxPixelRatio = 2,
}: PixiHighDpiOptions): Promise<() => void> {
  let frameId: number | null = null

  const getMetrics = (): PixiResizeMetrics => {
    const width = Math.max(1, container.clientWidth || Math.round(window.innerWidth) || 1)
    const height = Math.max(1, container.clientHeight || Math.round(window.innerHeight) || 1)
    const rawPixelRatio = Number.isFinite(window.devicePixelRatio) ? window.devicePixelRatio : 1
    const low = Math.min(minPixelRatio, maxPixelRatio)
    const high = Math.max(minPixelRatio, maxPixelRatio)

    return {
      width,
      height,
      pixelRatio: Math.max(low, Math.min(rawPixelRatio || 1, high)),
    }
  }

  const applyMetrics = () => {
    const metrics = getMetrics()
    app.renderer.resize(metrics.width, metrics.height, metrics.pixelRatio)
    onResize?.(metrics)
  }

  const initial = getMetrics()

  await app.init({
    ...appOptions,
    width: initial.width,
    height: initial.height,
    resolution: initial.pixelRatio,
    autoDensity: true,
  })

  onResize?.(initial)

  const scheduleApply = () => {
    if (frameId !== null) return

    frameId = window.requestAnimationFrame(() => {
      frameId = null
      applyMetrics()
    })
  }

  const removeDisplayChange = onDisplayChange(() => {
    scheduleApply()
  }, { minPixelRatio, maxPixelRatio })

  return () => {
    if (frameId !== null) {
      window.cancelAnimationFrame(frameId)
      frameId = null
    }

    removeDisplayChange()
  }
}
