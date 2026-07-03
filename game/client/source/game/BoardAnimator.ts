import { LABEL, pieceName, type MoveVisualEvent, type Piece } from '@minigame/core'
import { t } from '@minigame/i18n'
import { getGameSfx } from '../audio/GameSfx'
import { Container, Graphics, Sprite, Text } from 'pixi.js'
import type { PixelAssets } from './PixelAssets'
import { pixelTextStyle, strokePixelFrame } from './pixelStyle'

export interface BoardAnimatorContext {
  cellCenter: (r: number, c: number) => { x: number; y: number }
  cellSize: number
  piecePixelSize: number
  viewportWidth: number
  viewportHeight: number
  assets: PixelAssets
  boardLayer: Container
  overlayLayer: Container
  buildPiece: (piece: Piece, size: number) => Container
}

type AnimPhase =
  | 'idle'
  | 'move'
  | 'capture'
  | 'duel_banner'
  | 'duel_lunge'
  | 'duel_reveal'
  | 'duel_outro'

interface Particle {
  sprite: Sprite
  vx: number
  vy: number
  life: number
  maxLife: number
}

export class BoardAnimator {
  busy = false
  private phase: AnimPhase = 'idle'
  private time = 0
  private event: MoveVisualEvent | null = null
  private ctx: BoardAnimatorContext | null = null
  private onDone: (() => void) | null = null
  private floating: Container | null = null
  private overlay: Container | null = null
  private particles: Particle[] = []
  private hiddenCells = new Set<string>()
  private moveT = 0
  private moveFrom = { x: 0, y: 0 }
  private moveTo = { x: 0, y: 0 }
  private captureVictim: Container | null = null
  private duelDefender: Piece | null = null

  getHiddenCells(): ReadonlySet<string> {
    return this.hiddenCells
  }

  play(event: MoveVisualEvent, ctx: BoardAnimatorContext, onDone: () => void): boolean {
    if (this.busy) return false
    this.busy = true
    this.event = event
    this.ctx = ctx
    this.onDone = onDone
    this.time = 0
    this.phase = 'move'
    this.moveT = 0
    this.hiddenCells = new Set([`${event.from.r},${event.from.c}`])

    const from = ctx.cellCenter(event.from.r, event.from.c)
    const to = ctx.cellCenter(event.to.r, event.to.c)
    this.moveFrom = from
    this.moveTo = to

    const ps = ctx.piecePixelSize
    this.floating = ctx.buildPiece(event.piece, ps)
    this.floating.position.set(from.x - ps / 2, from.y - ps / 2)
    ctx.boardLayer.addChild(this.floating)

    if (event.captured && !event.duel) {
      this.hiddenCells.add(`${event.to.r},${event.to.c}`)
    }
    return true
  }

  update(deltaSeconds: number): void {
    if (!this.busy || !this.event || !this.ctx) return
    this.time += deltaSeconds
    this.updateParticles(deltaSeconds)

    switch (this.phase) {
      case 'move':
        this.tickMove(deltaSeconds)
        break
      case 'capture':
        this.tickCapture(deltaSeconds)
        break
      case 'duel_banner':
        if (this.time >= 0.55) this.startDuelLunge()
        break
      case 'duel_lunge':
        this.tickDuelLunge(deltaSeconds)
        break
      case 'duel_reveal':
        if (this.time >= 0.9) this.startDuelOutro()
        break
      case 'duel_outro':
        if (this.time >= 0.45) this.finish()
        break
      default:
        break
    }
  }

  private tickMove(dt: number): void {
    const duration = 0.28
    this.moveT = Math.min(1, this.moveT + dt / duration)
    const e = easeOutCubic(this.moveT)
    if (this.floating) {
      const ps = this.floating.width || this.ctx!.piecePixelSize
      this.floating.position.set(
        this.moveFrom.x + (this.moveTo.x - this.moveFrom.x) * e - ps / 2,
        this.moveFrom.y + (this.moveTo.y - this.moveFrom.y) * e - ps / 2,
      )
      this.floating.scale.set(1 + Math.sin(this.moveT * Math.PI) * 0.08)
    }
    if (this.moveT >= 1) {
      const ev = this.event!
      if (ev.duel && ev.captured) {
        this.startDuelBanner()
      } else if (ev.captured) {
        this.startCapture()
      } else {
        this.finish()
      }
    }
  }

  private startCapture(): void {
    getGameSfx().play('broke')
    const ev = this.event!
    const ctx = this.ctx!
    this.phase = 'capture'
    this.time = 0
    if (this.floating) {
      this.floating.destroy({ children: true })
      this.floating = null
    }
    if (ev.captured) {
      const ps = ctx.piecePixelSize
      this.captureVictim = ctx.buildPiece(ev.captured, ps)
      const pos = ctx.cellCenter(ev.to.r, ev.to.c)
      this.captureVictim.position.set(pos.x - ps / 2, pos.y - ps / 2)
      ctx.boardLayer.addChild(this.captureVictim)
      this.spawnBurst(pos.x, pos.y, 14, 0xff6040)
    }
  }

  private tickCapture(_dt: number): void {
    const duration = 0.35
    const t = Math.min(1, this.time / duration)
    if (this.captureVictim) {
      this.captureVictim.alpha = 1 - t
      this.captureVictim.scale.set(1 + t * 0.4)
      this.captureVictim.rotation = t * 0.5
    }
    if (t >= 1) this.finish()
  }

  private startDuelBanner(): void {
    getGameSfx().play('fight')
    const ctx = this.ctx!
    this.phase = 'duel_banner'
    this.time = 0
    this.duelDefender = this.event!.captured

    if (this.floating) {
      const pos = ctx.cellCenter(this.event!.to.r, this.event!.to.c)
      const ps = ctx.piecePixelSize
      this.floating.position.set(pos.x - ps / 2, pos.y - ps / 2)
      this.floating.scale.set(1.15)
    }

    this.overlay = new Container()
    this.overlay.label = 'duel-overlay'
    const dim = new Graphics()
    dim.rect(0, 0, 2000, 2000)
    dim.fill({ color: 0x000000, alpha: 0.55 })
    dim.position.set(-400, -400)
    this.overlay.addChild(dim)

    const banner = new Text({
      text: t('duel.banner'),
      style: pixelTextStyle({
        fontSize: 28,
        fill: '#e8a838',
      }),
    })
    banner.anchor.set(0.5)
    banner.label = 'banner'
    banner.scale.set(0.3)
    this.overlay.addChild(banner)
    ctx.overlayLayer.addChild(this.overlay)
    this.layoutDuelOverlay()
  }

  private layoutDuelOverlay(): void {
    if (!this.overlay || !this.ctx) return
    const banner = this.overlay.getChildByLabel('banner') as Text
    const w = this.ctx.viewportWidth
    const h = this.ctx.viewportHeight
    banner.position.set(w / 2, h * 0.22)
    const pulse = 1 + Math.sin(this.time * 8) * 0.06
    if (this.phase === 'duel_banner') {
      banner.scale.set(Math.min(1.1, 0.3 + this.time * 1.8) * pulse)
    }
  }

  private startDuelLunge(): void {
    this.phase = 'duel_lunge'
    this.time = 0
    this.moveT = 0
    const ev = this.event!
    const ctx = this.ctx!
    this.moveFrom = ctx.cellCenter(ev.from.r, ev.from.c)
    this.moveTo = ctx.cellCenter(ev.to.r, ev.to.c)
    if (!this.floating) {
      const ps = Math.floor(ctx.piecePixelSize * 1.08)
      this.floating = ctx.buildPiece(ev.piece, ps)
      ctx.boardLayer.addChild(this.floating)
    }
    this.hiddenCells.add(`${ev.to.r},${ev.to.c}`)
  }

  private tickDuelLunge(dt: number): void {
    const duration = 0.32
    this.moveT = Math.min(1, this.moveT + dt / duration)
    const e = easeInOutCubic(this.moveT)
    if (this.floating) {
      const ps = this.floating.width || this.ctx!.piecePixelSize
      this.floating.position.set(
        this.moveFrom.x + (this.moveTo.x - this.moveFrom.x) * e - ps / 2,
        this.moveFrom.y + (this.moveTo.y - this.moveFrom.y) * e - ps / 2,
      )
      this.floating.rotation = Math.sin(this.moveT * Math.PI) * 0.15
    }
    if (this.moveT >= 1) this.startDuelReveal()
  }

  private startDuelReveal(): void {
    const ctx = this.ctx!
    const ev = this.event!
    this.phase = 'duel_reveal'
    this.time = 0

    const pos = ctx.cellCenter(ev.to.r, ev.to.c)
    this.spawnBurst(pos.x, pos.y, 28, 0xffe040)
    this.spawnBurst(pos.x, pos.y, 20, 0x80c0ff)

    if (this.duelDefender) {
      const revealed: Piece = { ...this.duelDefender, hidden: false }
      const panel = new Container()
      const pw = ctx.cellSize * 1.4
      const ph = ctx.cellSize * 1.1
      const bg = new Graphics()
      bg.rect(0, 0, pw, ph)
      bg.fill({ color: 0x1a1028, alpha: 0.92 })
      strokePixelFrame(bg, 0, 0, pw, ph, 0xffd060, 3)
      panel.addChild(bg)

      const aceSprite = ctx.buildPiece(revealed, ctx.cellSize * 0.65)
      aceSprite.position.set(pw / 2 - ctx.cellSize * 0.325, 8)
      panel.addChild(aceSprite)

      const label = new Text({
        text: `${LABEL[revealed.type]} ${pieceName(revealed.type)}`,
        style: pixelTextStyle({ fontSize: 11, fill: '#ffe080' }),
      })
      label.anchor.set(0.5, 0)
      label.position.set(pw / 2, ctx.cellSize * 0.78)
      panel.addChild(label)

      panel.pivot.set(pw / 2, ctx.cellSize * 0.55)
      panel.position.set(pos.x, pos.y - ctx.cellSize * 0.2)
      panel.scale.set(0.2)
      panel.label = 'reveal-panel'
      ctx.boardLayer.addChild(panel)

      const targetScale = 1
      const animPanel = () => {
        const t = Math.min(1, this.time / 0.35)
        panel.scale.set(0.2 + (targetScale - 0.2) * easeOutBack(t))
      }
      ;(panel as Container & { _anim?: () => void })._anim = animPanel
    }

    if (this.overlay) {
      const flash = new Graphics()
      flash.rect(-400, -400, 2000, 2000)
      flash.fill({ color: 0xffffff, alpha: 0.35 })
      flash.label = 'flash'
      this.overlay.addChild(flash)
    }
  }

  private startDuelOutro(): void {
    this.phase = 'duel_outro'
    this.time = 0
    const ev = this.event!
    if (!this.overlay) return
    const result = ev.previewResult
    let msg = ''
    if (result === 'win') {
      msg = t('duel.resultWin')
    } else if (result === 'pass') {
      msg = t('duel.resultPass')
    } else if (result === 'lose_piece') {
      msg = t('duel.resultLose')
    }
    if (result === 'win' || result === 'lose_piece') {
      getGameSfx().play('broke')
    }
    const sub = new Text({
      text: msg,
      style: pixelTextStyle({ fontSize: 16, fill: '#f0ebe3', align: 'center' }),
    })
    sub.anchor.set(0.5)
    sub.label = 'result'
    this.overlay.addChild(sub)
    this.layoutDuelOverlay()
    sub.position.set(this.ctx!.viewportWidth / 2, this.ctx!.viewportHeight * 0.32)
  }

  private finish(): void {
    this.clearFx()
    this.busy = false
    this.phase = 'idle'
    this.event = null
    this.hiddenCells.clear()
    const done = this.onDone
    this.onDone = null
    this.ctx = null
    done?.()
  }

  private clearFx(): void {
    const board = this.ctx?.boardLayer
    if (this.floating) {
      this.floating.destroy({ children: true })
      this.floating = null
    }
    if (this.captureVictim) {
      this.captureVictim.destroy({ children: true })
      this.captureVictim = null
    }
    if (this.overlay) {
      this.overlay.destroy({ children: true })
      this.overlay = null
    }
    for (const p of this.particles) {
      p.sprite.destroy()
    }
    this.particles = []
    board?.getChildByLabel('reveal-panel')?.destroy({ children: true })
  }

  private spawnBurst(x: number, y: number, count: number, tint: number): void {
    const ctx = this.ctx!
    for (let i = 0; i < count; i += 1) {
      const spr = new Sprite(ctx.assets.spark)
      spr.anchor.set(0.5)
      spr.tint = tint
      spr.width = 6 + Math.random() * 8
      spr.height = spr.width
      spr.position.set(x, y)
      ctx.boardLayer.addChild(spr)
      const angle = Math.random() * Math.PI * 2
      const speed = 80 + Math.random() * 160
      this.particles.push({
        sprite: spr,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.35 + Math.random() * 0.25,
        maxLife: 0.6,
      })
    }
  }

  private updateParticles(dt: number): void {
    const alive: Particle[] = []
    for (const p of this.particles) {
      p.life -= dt
      if (p.life <= 0) {
        p.sprite.destroy()
        continue
      }
      p.sprite.x += p.vx * dt
      p.sprite.y += p.vy * dt
      p.vy += 220 * dt
      p.sprite.alpha = p.life / p.maxLife
      alive.push(p)
    }
    this.particles = alive

    if (this.phase === 'duel_reveal') {
      const panel = this.ctx?.boardLayer.getChildByLabel('reveal-panel') as
        | (Container & { _anim?: () => void })
        | undefined
      panel?._anim?.()
    }
    if (this.phase === 'duel_banner' || this.phase === 'duel_outro') {
      this.layoutDuelOverlay()
    }
  }
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

function easeOutBack(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2
}
