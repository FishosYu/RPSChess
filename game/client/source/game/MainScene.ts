import {
  AI,
  COLS,
  GameInstance,
  HUMAN,
  LABEL,
  ROWS,
  pieceName,
  type GameState,
  type GameStatus,
  type Piece,
  type PieceType,
} from '@minigame/core'
import { getLocale, t } from '@minigame/i18n'
import { Container, Graphics, Rectangle, Sprite, Text, TextStyle } from 'pixi.js'
import type { GameScene } from '../engine/Engine'
import { Engine } from '../engine/Engine'
import { BoardAnimator } from './BoardAnimator'
import { centerPieceInCell, PixelAssets } from './PixelAssets'
import { GameMusic } from '../audio/GameMusic'
import { getGameSfx } from '../audio/GameSfx'
import {
  drawMusicNoteIcon,
  drawPixelPlayIcon,
  drawButtonSparkleGuide,
  fillPixelButton,
  fillPixelChamferButton,
  pixelTextStyle,
  strokePixelFrame,
} from './pixelStyle'

const COLORS = {
  bg: 0x1a1625,
  panel: 0x252033,
  accent: 0xe8a838,
  text: 0xf0ebe3,
  muted: 0x9a8f82,
  rock: 0x6b7a8f,
  scissors: 0xc45c6a,
  paper: 0x5a9e7a,
  p1: 0x4a7eb8,
  p2: 0xc45c4a,
  cell: 0x2e2840,
  cellHover: 0x3d3555,
  highlight: 0xe8a838,
  danger: 0xc45c4a,
} as const

const PIECE_FILL: Record<PieceType, number> = {
  rock: COLORS.rock,
  scissors: COLORS.scissors,
  paper: COLORS.paper,
}

export class MainScene implements GameScene {
  private readonly engine: Engine
  private readonly root = new Container()
  private readonly boardLayer = new Container()
  private readonly uiLayer = new Container()
  private readonly overlayLayer = new Container()
  private readonly hudLayer = new Container()

  private readonly gameMusic = new GameMusic()
  private musicBtn: Container | null = null
  private readonly musicBtnSize = 36

  private game: GameInstance | null = null
  private state: GameState | null = null

  private cellContainers: Container[][] = []
  private statusText: Text | null = null
  private aiHintText: Text | null = null
  private handContainer: Container | null = null
  private logContainer: Container | null = null
  private aceHumanText: Text | null = null
  private aceEnemyText: Text | null = null
  private actionBtn: Container | null = null
  private restartBtn: Container | null = null
  private playMoveHintText: Text | null = null
  private endModal: Container | null = null
  private startScreen: Container | null = null
  private pregameReveal: Container | null = null
  private graveHuman: Container | null = null
  private graveAi: Container | null = null
  private guideHintText: Text | null = null

  private started = false
  private viewportWidth = 800
  private viewportHeight = 600
  private contentWidth = 360
  private cellSize = 72
  private handPieceSize = 52
  private boardOriginX = 0
  private boardOriginY = 0
  private handBlockHeight = 130
  private lastLogLen = 0
  private lastHandSig = ''
  private readonly handCols = 3
  private readonly boardGap = 6
  private pixelAssets: PixelAssets | null = null
  private readonly boardAnimator = new BoardAnimator()
  private activeAnimSeq = -1
  private lastEndSfx: GameStatus | null = null
  private guideAnimTime = 0
  private actionGuideRingSig = ''
  private actionGuideBtnW = 0
  private actionGuideBtnH = 0
  private lastPlayMoveHintVisible = false

  constructor(engine: Engine) {
    this.engine = engine
    this.root.addChild(this.boardLayer)
    this.root.addChild(this.uiLayer)
    this.root.addChild(this.overlayLayer)
    this.root.addChild(this.hudLayer)
    this.engine.app.stage.eventMode = 'passive'
    this.engine.app.stage.addChild(this.root)
    this.buildMusicButton()
  }

  init(): void {
    this.resetView()
    this.started = false
    this.boardLayer.visible = false
    this.uiLayer.visible = false
    this.buildStartScreen()
    this.onResize(this.engine.app.renderer.width, this.engine.app.renderer.height)
    this.layoutMusicButton()
  }

  update(deltaSeconds: number): void {
    if (!this.started || !this.game) return
    this.state = this.game.getState()
    this.boardAnimator.update(deltaSeconds)

    const pending = this.state.pendingMoveVisual
    if (
      pending &&
      !this.boardAnimator.busy &&
      pending.seq !== this.activeAnimSeq &&
      this.pixelAssets
    ) {
      const started = this.boardAnimator.play(
        pending,
        this.createAnimatorContext(),
        () => {
          this.game?.commitPendingMove()
          this.state = this.game?.getState() ?? null
          this.activeAnimSeq = -1
          this.syncFromState()
        },
      )
      if (started) {
        this.activeAnimSeq = pending.seq
      }
    }

    this.syncFromState()
    this.updateGuideAnimations(deltaSeconds)
  }

  private updateGuideAnimations(deltaSeconds: number): void {
    this.guideAnimTime += deltaSeconds

    const label = this.handContainer?.getChildByLabel('hand-guide-label') as Text | undefined
    if (label && this.state) {
      const pulseActive =
        this.state.phase === 'setup' || this.state.phase === 'pregame'
      if (pulseActive) {
        const pulse = 1 + 0.07 * Math.sin(this.guideAnimTime * 4.2)
        label.scale.set(pulse)
      } else {
        label.scale.set(1)
      }
    }

    const playLabel = this.playMoveHintText
    if (playLabel && this.state) {
      const pulseActive =
        this.state.phase === 'play' &&
        this.state.currentPlayer === HUMAN &&
        playLabel.visible
      if (pulseActive) {
        const pulse = 1 + 0.07 * Math.sin(this.guideAnimTime * 4.2)
        playLabel.scale.set(pulse)
      } else {
        playLabel.scale.set(1)
      }
    }

    const ringWrap = this.actionBtn?.getChildByLabel('guide-ring-wrap') as Container | undefined
    if (ringWrap?.visible && this.actionGuideBtnW > 0) {
      const ring = ringWrap.getChildByLabel('guide-ring') as Graphics
      drawButtonSparkleGuide(ring, this.actionGuideBtnW, this.actionGuideBtnH, this.guideAnimTime)
    }
  }

  private handGuideStyle(): TextStyle {
    return pixelTextStyle({
      fontSize: 11,
      fill: '#e8a838',
      align: 'center',
      wordWrap: true,
      breakWords: true,
      lineHeight: 16,
    })
  }

  private layoutHandGuideLabel(): void {
    const label = this.handContainer?.getChildByLabel('hand-guide-label') as Text | undefined
    if (!label) return
    label.style.wordWrapWidth = this.contentWidth
    label.anchor.set(0.5, 0)
    label.position.set(this.contentWidth / 2, 0)
  }

  private layoutPlayMoveHint(y = 0): void {
    if (!this.playMoveHintText) return
    this.playMoveHintText.style.wordWrapWidth = this.contentWidth
    this.playMoveHintText.anchor.set(0.5, 0)
    this.playMoveHintText.position.set(this.contentWidth / 2, y)
  }

  private syncPlayMoveHint(s: GameState): void {
    if (!this.playMoveHintText) return
    const show =
      s.phase === 'play' &&
      s.currentPlayer === HUMAN &&
      s.status !== 'won' &&
      s.status !== 'lost'
    this.playMoveHintText.visible = show
    if (!show) {
      this.playMoveHintText.scale.set(1)
    }
    if (show !== this.lastPlayMoveHintVisible) {
      this.lastPlayMoveHintVisible = show
      this.onResize(this.viewportWidth, this.viewportHeight)
    }
  }

  private syncActionButtonGuideRing(s: GameState, bw: number, bh: number): void {
    if (!this.actionBtn) return

    const show =
      this.actionBtn.visible &&
      s.actionButtonEnabled &&
      (s.phase === 'setup' || s.phase === 'pregame')

    let wrap = this.actionBtn.getChildByLabel('guide-ring-wrap') as Container | undefined
    if (!show) {
      if (wrap) wrap.visible = false
      this.actionGuideBtnW = 0
      this.actionGuideBtnH = 0
      return
    }

    if (!wrap) {
      wrap = new Container()
      wrap.label = 'guide-ring-wrap'
      wrap.eventMode = 'none'
      const ring = new Graphics()
      ring.label = 'guide-ring'
      wrap.addChild(ring)
      this.actionBtn.addChildAt(wrap, 0)
    }

    wrap.visible = true
    wrap.position.set(0, 0)

    this.actionGuideBtnW = bw
    this.actionGuideBtnH = bh

    const sig = `${bw}x${bh}`
    if (this.actionGuideRingSig !== sig) {
      this.actionGuideRingSig = sig
    }
  }

  onResize(width: number, height: number): void {
    this.viewportWidth = width
    this.viewportHeight = height

    if (!this.started) {
      this.layoutOverlay()
      this.layoutMusicButton()
      return
    }

    const pad = 10
    const gap = this.boardGap
    this.contentWidth = width - pad * 2
    this.handPieceSize = Math.max(
      40,
      Math.min(56, Math.floor((this.contentWidth - gap * (this.handCols - 1)) / this.handCols)),
    )

    const topUiH = this.layoutTopSection()
    const graveH = 36
    const btnH = 36
    const logH = Math.min(72, Math.max(48, Math.floor(height * 0.1)))
    const legendH = 48
    const handRows =
      this.state?.phase === 'setup' ? 2 : this.state?.phase === 'pregame' ? 1 : 0
    this.handBlockHeight =
      handRows > 0 ? 20 + handRows * (this.handPieceSize + gap) + 8 : 0

    const playGuideH =
      this.state?.phase === 'play' && this.state.currentPlayer === HUMAN ? 26 : 0
    const reservedBelowBoard =
      this.handBlockHeight + btnH * 2 + 12 + logH + legendH + 24 + graveH + playGuideH + 6
    const boardAvailH = height - pad * 2 - topUiH - reservedBelowBoard - 16
    const boardAvailW = this.contentWidth

    this.cellSize = Math.max(
      44,
      Math.min(
        Math.floor((boardAvailW - gap * (COLS - 1)) / COLS),
        Math.floor((boardAvailH - gap * (ROWS - 1)) / ROWS),
        80,
      ),
    )

    const boardW = COLS * this.cellSize + (COLS - 1) * gap
    const boardH = ROWS * this.cellSize + (ROWS - 1) * gap

    this.boardOriginX = (width - boardW) / 2
    this.boardOriginY = pad + topUiH + 8

    this.uiLayer.position.set(pad, pad)
    this.boardLayer.position.set(this.boardOriginX, this.boardOriginY)

    this.layoutCells(gap)

    const grave = this.boardLayer.getChildByLabel('graveyard') as Container
    if (grave) {
      grave.position.set((boardW - this.contentWidth) / 2, boardH + 6)
    }
    if (this.graveAi) {
      this.graveAi.position.set(this.contentWidth * 0.52, 0)
    }

    const bottomUiY = this.boardOriginY + boardH + graveH + 14 - pad
    this.layoutBottomSection(bottomUiY, logH, btnH, legendH)
    this.layoutOverlay()
    this.layoutMusicButton()

    if (this.state) {
      this.syncPregameReveal(this.state)
    }
  }

  /** 竖屏顶部：标题、玩法提示、王牌、状态 */
  private layoutTopSection(): number {
    let y = 0
    const w = this.contentWidth

    const title = this.uiLayer.getChildByLabel('title') as Text
    if (title) {
      title.style.wordWrapWidth = w
      title.anchor.set(0.5, 0)
      title.position.set(w / 2, y)
      y += 26
    }

    if (this.guideHintText) {
      this.guideHintText.style.wordWrapWidth = w
      this.guideHintText.position.set(0, y)
      y += this.guideHintText.height + 8
    }

    const acePanel = this.uiLayer.getChildByLabel('ace-panel') as Container
    if (acePanel && this.aceHumanText && this.aceEnemyText) {
      acePanel.position.set(0, y)
      this.aceHumanText.position.set(0, 0)
      this.aceEnemyText.position.set(w * 0.48, 0)
      y += 38
    }

    if (this.statusText) {
      this.statusText.style.wordWrapWidth = w
      this.statusText.position.set(0, y)
      y += Math.max(22, this.statusText.height) + 4
    }

    if (this.aiHintText) {
      this.aiHintText.style.wordWrapWidth = w
      this.aiHintText.position.set(0, y)
      y += this.aiHintText.height > 0 ? this.aiHintText.height + 4 : 0
    }

    return y + 4
  }

  /** 竖屏底部：手牌、按钮、战报 */
  private layoutBottomSection(
    startY: number,
    logH: number,
    btnH: number,
    legendH: number,
  ): void {
    let y = startY
    const w = this.contentWidth

    if (this.handContainer) {
      this.handContainer.position.set(0, y)
      this.layoutHandGuideLabel()
      y += this.handBlockHeight > 0 ? this.handBlockHeight + 8 : 0
    }

    if (this.actionBtn) {
      this.resizeButton(this.actionBtn, w, btnH, false)
      this.actionBtn.position.set(0, y)
      y += this.actionBtn.visible ? btnH + 6 : 0
    }

    if (this.playMoveHintText?.visible) {
      this.layoutPlayMoveHint(y)
      y += this.playMoveHintText.height + 6
    }

    if (this.restartBtn) {
      this.resizeButton(this.restartBtn, w, btnH, true)
      this.restartBtn.position.set(0, y)
      y += btnH + 8
    }

    const logTitle = this.uiLayer.getChildByLabel('log-title') as Text
    if (logTitle) {
      logTitle.position.set(0, y)
      y += 20
    }

    if (this.logContainer) {
      this.logContainer.position.set(0, y)
      this.renderLog(this.state?.log ?? [], w, logH)
      y += logH + 6
    }

    const legend = this.uiLayer.getChildByLabel('legend') as Text
    if (legend) {
      legend.style.wordWrapWidth = w
      legend.position.set(0, y)
      y += legend.height + 4
    }

    const poolInfo = this.uiLayer.getChildByLabel('pool-info') as Text
    if (poolInfo) {
      poolInfo.scale.set(1)
      if (poolInfo.width > w) {
        poolInfo.scale.set(Math.max(0.86, w / poolInfo.width))
      }
      poolInfo.position.set(0, y)
    }
  }

  private layoutButtonLabel(label: Text, width: number, height: number): void {
    label.style.align = 'center'
    label.style.wordWrapWidth = Math.max(0, width - 16)
    label.anchor.set(0.5, 0.5)
    // nudge up slightly: bottom shadow strip makes text look low when geometrically centered
    label.position.set(Math.round(width / 2), Math.round(height / 2) - 1)
  }

  private resizeButton(
    btn: Container,
    width: number,
    height: number,
    secondary = false,
  ): void {
    const bg = btn.getChildByLabel('bg') as Graphics
    const label = btn.getChildByLabel('label') as Text
    bg.clear()
    fillPixelButton(bg, 0, 0, width, height, secondary ? 0x3d3555 : COLORS.accent)
    if (label) {
      this.layoutButtonLabel(label, width, height)
    }
    this.makeClickable(btn, width, height)
  }

  destroy(): void {
    this.game?.stop()
    this.game = null
    this.state = null
    this.gameMusic.destroy()
    this.resetView()
  }

  /** 清空各层内容，但不销毁 boardLayer / uiLayer / overlayLayer 本身 */
  private resetView(): void {
    this.destroyChildren(this.boardLayer)
    this.destroyChildren(this.uiLayer)
    this.destroyChildren(this.overlayLayer)
    this.lastHandSig = ''
    this.cellContainers = []
    this.statusText = null
    this.aiHintText = null
    this.handContainer = null
    this.logContainer = null
    this.aceHumanText = null
    this.aceEnemyText = null
    this.actionBtn = null
    this.restartBtn = null
    this.playMoveHintText = null
    this.endModal = null
    this.startScreen = null
    this.pregameReveal = null
    this.graveHuman = null
    this.graveAi = null
    this.guideHintText = null
    this.started = false
    this.lastEndSfx = null
    this.lastPlayMoveHintVisible = false
  }

  private beginGame(): void {
    if (this.started) return
    this.started = true
    if (this.startScreen) {
      this.startScreen.visible = false
    }
    this.boardLayer.visible = true
    this.uiLayer.visible = true
    this.pixelAssets = PixelAssets.create()
    this.activeAnimSeq = -1
    this.game = new GameInstance()
    this.game.start()
    this.state = this.game.getState()
    this.buildBoardCells()
    this.buildUi()
    this.syncFromState()
    this.onResize(this.viewportWidth, this.viewportHeight)
    void this.gameMusic.play()
  }

  private buildMusicButton(): void {
    if (this.musicBtn) return

    const size = this.musicBtnSize
    const btn = new Container()
    btn.label = 'music-btn'

    const bg = new Graphics()
    bg.label = 'bg'
    fillPixelButton(bg, 0, 0, size, size, COLORS.panel, COLORS.muted)

    const icon = new Graphics()
    icon.label = 'icon'

    btn.addChild(bg, icon)
    this.makeClickable(btn, size, size)
    btn.on('pointertap', () => {
      getGameSfx().play('click')
      this.gameMusic.toggle()
      this.refreshMusicButtonIcon()
    })

    this.musicBtn = btn
    this.hudLayer.addChild(btn)
    this.refreshMusicButtonIcon()
  }

  private refreshMusicButtonIcon(): void {
    if (!this.musicBtn) return
    const size = this.musicBtnSize
    const icon = this.musicBtn.getChildByLabel('icon') as Graphics
    const muted = this.gameMusic.isMuted()
    icon.clear()
    drawMusicNoteIcon(
      icon,
      size / 2,
      size / 2,
      1,
      muted ? COLORS.muted : COLORS.accent,
      muted,
    )
  }

  private layoutMusicButton(): void {
    if (!this.musicBtn) return
    const pad = 10
    const size = this.musicBtnSize
    this.musicBtn.position.set(this.viewportWidth - pad - size, pad)
  }

  private buildStartScreen(): void {
    const screen = new Container()
    screen.label = 'start-screen'

    const dim = new Graphics()
    dim.label = 'dim'
    screen.addChild(dim)

    const title = new Text({
      text: t('game.title'),
      style: pixelTextStyle({
        fontSize: 32,
        fill: '#e8a838',
        align: 'center',
      }),
    })
    title.label = 'start-title'
    title.anchor.set(0.5, 0)

    const subtitle = new Text({
      text: t('game.subtitle'),
      style: pixelTextStyle({
        fontSize: 14,
        fill: '#9a8f82',
        align: 'center',
      }),
    })
    subtitle.label = 'start-subtitle'
    subtitle.anchor.set(0.5, 0)

    const playBtn = this.createPlayButton(() => this.beginGame())
    playBtn.label = 'start-play'

    screen.addChild(title, subtitle, playBtn)
    this.startScreen = screen
    this.overlayLayer.addChild(screen)
  }

  private layoutStartScreen(): void {
    if (!this.startScreen?.visible) return

    const dim = this.startScreen.getChildByLabel('dim') as Graphics
    dim.clear()
    dim.rect(0, 0, this.viewportWidth, this.viewportHeight)
    dim.fill(COLORS.bg)

    const title = this.startScreen.getChildByLabel('start-title') as Text
    const subtitle = this.startScreen.getChildByLabel('start-subtitle') as Text
    const playBtn = this.startScreen.getChildByLabel('start-play') as Container

    const cx = this.viewportWidth / 2
    const cy = this.viewportHeight / 2
    const titleSize = Math.min(48, Math.max(32, Math.floor(this.viewportWidth * 0.1)))
    const subSize = Math.min(20, Math.max(14, Math.floor(this.viewportWidth * 0.045)))

    title.style.fontSize = titleSize
    title.position.set(cx, cy - 100)
    subtitle.style.fontSize = subSize
    subtitle.position.set(cx, cy - 100 + titleSize + 12)

    const btnSize = Math.min(96, Math.max(72, Math.floor(this.viewportWidth * 0.22)))
    this.layoutPlayButton(playBtn, btnSize)
    playBtn.position.set(cx - btnSize / 2, cy + 24)
  }

  private createPlayButton(onClick: () => void): Container {
    const btn = new Container()
    const size = 88
    this.makeClickable(btn, size, size)

    const bg = new Graphics()
    bg.label = 'bg'
    fillPixelChamferButton(bg, size, COLORS.accent)

    const icon = new Graphics()
    icon.label = 'icon'
    drawPixelPlayIcon(icon, size / 2, size / 2, 1)

    btn.addChild(bg, icon)
    this.bindClickSound(btn, onClick)
    return btn
  }

  private layoutPlayButton(btn: Container, size: number): void {
    const bg = btn.getChildByLabel('bg') as Graphics
    const icon = btn.getChildByLabel('icon') as Graphics
    const cx = size / 2
    const cy = size / 2
    bg.clear()
    fillPixelChamferButton(bg, size, COLORS.accent)
    const s = size / 88
    icon.clear()
    drawPixelPlayIcon(icon, cx, cy, s)
    this.makeClickable(btn, size, size)
  }

  private destroyChildren(container: Container): void {
    const children = container.removeChildren()
    for (const child of children) {
      child.destroy({ children: true })
    }
  }

  private buildBoardCells(): void {
    this.cellContainers = []
    for (let r = 0; r < ROWS; r += 1) {
      this.cellContainers[r] = []
      for (let c = 0; c < COLS; c += 1) {
        const cell = new Container()
        cell.eventMode = 'static'
        cell.cursor = 'pointer'
        const bg = new Sprite()
        bg.label = 'bg'
        cell.addChild(bg)
        const pieceHolder = new Container()
        pieceHolder.label = 'piece'
        pieceHolder.eventMode = 'none'
        cell.addChild(pieceHolder)
        const hl = new Graphics()
        hl.label = 'hl'
        hl.eventMode = 'none'
        cell.addChild(hl)
        const rr = r
        const cc = c
        cell.on('pointertap', () => this.game?.onCellClick(rr, cc))
        this.makeClickable(cell, this.cellSize, this.cellSize)
        this.boardLayer.addChild(cell)
        this.cellContainers[r][c] = cell
      }
    }

    const grave = new Container()
    grave.label = 'graveyard'
    this.boardLayer.addChild(grave)
    this.graveHuman = new Container()
    this.graveAi = new Container()
    grave.addChild(this.graveHuman, this.graveAi)
  }

  private layoutCells(gap: number): void {
    if (this.cellContainers.length === 0) return
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        const row = this.cellContainers[r]
        if (!row) continue
        const cell = row[c]
        if (!cell) continue
        cell.position.set(c * (this.cellSize + gap), r * (this.cellSize + gap))
        const bg = cell.getChildByLabel('bg') as Sprite
        const assets = this.pixelAssets
        if (assets) {
          bg.texture = (r + c) % 2 === 0 ? assets.cellLight : assets.cellDark
          bg.width = this.cellSize
          bg.height = this.cellSize
        }
        cell.hitArea = new Rectangle(0, 0, this.cellSize, this.cellSize)
      }
    }
    const grave = this.boardLayer.getChildByLabel('graveyard') as Container
    if (grave) {
      grave.position.set(0, ROWS * (this.cellSize + gap) + 8)
    }
  }

  private buildUi(): void {
    const title = new Text({
      text: t('game.title'),
      style: pixelTextStyle({ fontSize: 18, fill: '#e8a838' }),
    })
    this.uiLayer.addChild(title)
    title.label = 'title'

    this.guideHintText = new Text({
      text: t('game.guideHint'),
      style: pixelTextStyle({
        fontSize: 11,
        fill: '#9a8f82',
        wordWrap: true,
        breakWords: true,
        wordWrapWidth: this.contentWidth,
        lineHeight: 16,
        align: 'left',
      }),
    })
    this.guideHintText.label = 'guide-hint'
    this.uiLayer.addChild(this.guideHintText)

    const acePanel = new Container()
    acePanel.label = 'ace-panel'
    this.aceHumanText = new Text({
      text: t('ace.yoursEmpty'),
      style: this.mutedStyle(13),
    })
    this.aceEnemyText = new Text({
      text: t('ace.enemyHidden'),
      style: this.mutedStyle(13),
    })
    acePanel.addChild(this.aceHumanText, this.aceEnemyText)
    this.aceEnemyText.position.set(0, 22)
    this.uiLayer.addChild(acePanel)

    this.statusText = new Text({
      text: '',
      style: pixelTextStyle({
        fontSize: 12,
        fill: '#f0ebe3',
        wordWrap: true,
        wordWrapWidth: 260,
      }),
    })
    this.statusText.label = 'status'
    this.uiLayer.addChild(this.statusText)

    this.aiHintText = new Text({
      text: '',
      style: pixelTextStyle({
        fontSize: 11,
        fill: '#9a8f82',
      }),
    })
    this.aiHintText.label = 'ai-hint'
    this.uiLayer.addChild(this.aiHintText)

    this.handContainer = new Container()
    this.handContainer.label = 'hand'
    this.uiLayer.addChild(this.handContainer)

    this.actionBtn = this.createButton(t('action.confirmSetup'), () =>
      this.game?.onActionButton(),
    )
    this.actionBtn.label = 'action-btn'
    this.uiLayer.addChild(this.actionBtn)

    this.restartBtn = this.createButton(t('ui.restart'), () => this.game?.restart(), true)
    this.restartBtn.label = 'restart-btn'
    this.uiLayer.addChild(this.restartBtn)

    this.playMoveHintText = new Text({
      text: t('ui.playMoveHint'),
      style: this.handGuideStyle(),
    })
    this.playMoveHintText.label = 'play-move-hint'
    this.playMoveHintText.visible = false
    this.playMoveHintText.eventMode = 'none'
    this.uiLayer.addChild(this.playMoveHintText)

    const logTitle = new Text({
      text: t('ui.battleLog'),
      style: pixelTextStyle({ fontSize: 12, fill: '#e8a838' }),
    })
    logTitle.label = 'log-title'
    this.uiLayer.addChild(logTitle)

    this.logContainer = new Container()
    this.logContainer.label = 'log'
    this.uiLayer.addChild(this.logContainer)

    const legend = new Text({
      text: t('ui.legend'),
      style: this.legendStyle(),
    })
    legend.label = 'legend'
    this.uiLayer.addChild(legend)

    const poolInfo = new Text({
      text: t('ui.poolInfo'),
      style: this.poolInfoStyle(),
    })
    poolInfo.label = 'pool-info'
    this.uiLayer.addChild(poolInfo)

    this.pregameReveal = new Container()
    this.pregameReveal.label = 'pregame-reveal'
    this.pregameReveal.visible = false
    this.boardLayer.addChild(this.pregameReveal)
  }

  private syncFromState(): void {
    if (!this.state) return
    const s = this.state

    if (this.statusText) this.statusText.text = s.statusText
    if (this.aiHintText) this.aiHintText.text = s.aiHint

    if (this.aceHumanText) {
      this.aceHumanText.text = s.humanAceType
        ? t('ace.yours', {
            piece: `${LABEL[s.humanAceType]} ${pieceName(s.humanAceType)}`,
          })
        : t('ace.yoursEmpty')
    }
    if (this.aceEnemyText) {
      this.aceEnemyText.text = s.enemyAceKnown
        ? t('ace.enemy', {
            piece: `${LABEL[s.enemyAceKnown]} ${pieceName(s.enemyAceKnown)}`,
          })
        : t('ace.enemyHidden')
    }

    this.syncBoard(s)
    this.syncHand(s)
    this.syncActionButton(s)
    this.syncPlayMoveHint(s)
    this.syncGraveyard(s)
    this.syncPregameReveal(s)
    this.syncEndModal(s)

    if (s.log.length !== this.lastLogLen) {
      this.lastLogLen = s.log.length
      this.renderLog(s.log, this.contentWidth, 72)
    }
  }

  private syncBoard(s: GameState): void {
    const highlights = new Set(
      s.highlightMoves.map((m) => `${m.to.r},${m.to.c}`),
    )
    const duels = new Set(
      s.highlightMoves.filter((m) => m.duel).map((m) => `${m.to.r},${m.to.c}`),
    )
    const sel = s.selectedCell
    const hidden = this.boardAnimator.getHiddenCells()
    const inputLocked = s.animationLocked

    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        const cell = this.cellContainers[r][c]
        const hl = cell.getChildByLabel('hl') as Graphics
        const holder = cell.getChildByLabel('piece') as Container
        holder.removeChildren()

        const key = `${r},${c}`
        hl.clear()
        const sz = this.cellSize
        if (sel && sel.r === r && sel.c === c) {
          hl.rect(0, 0, sz, sz).fill({ color: COLORS.highlight, alpha: 0.5 })
          strokePixelFrame(hl, 0, 0, sz, sz, COLORS.accent, 3)
        } else if (duels.has(key)) {
          hl.rect(0, 0, sz, sz).fill({ color: COLORS.danger, alpha: 0.45 })
          strokePixelFrame(hl, 0, 0, sz, sz, COLORS.danger, 3)
        } else if (highlights.has(key)) {
          hl.rect(0, 0, sz, sz).fill({ color: 0x8fbc6a, alpha: 0.55 })
          strokePixelFrame(hl, 0, 0, sz, sz, 0xc8e878, 2)
        }

        const piece = s.board[r][c]
        if (piece && !hidden.has(key)) {
          this.addPieceToCell(holder, piece)
        }

        const canInteract =
          !inputLocked &&
          s.phase === 'play' &&
          s.currentPlayer === HUMAN &&
          (piece?.owner === HUMAN || highlights.has(key))
        cell.eventMode = canInteract ? 'static' : 'passive'
        cell.cursor = canInteract ? 'pointer' : 'default'
        cell.alpha = canInteract || !piece ? 1 : 0.95
      }
    }
  }

  private piecePixelSize(): number {
    return Math.floor(this.cellSize * 0.76)
  }

  private addPieceToCell(holder: Container, piece: Piece): void {
    const ps = this.piecePixelSize()
    const g = this.createPieceGraphic(piece, ps)
    centerPieceInCell(g, this.cellSize, ps)
    holder.addChild(g)
  }

  private createAnimatorContext() {
    const assets = this.pixelAssets!
    return {
      cellSize: this.cellSize,
      piecePixelSize: this.piecePixelSize(),
      viewportWidth: this.viewportWidth,
      viewportHeight: this.viewportHeight,
      assets,
      boardLayer: this.boardLayer,
      overlayLayer: this.overlayLayer,
      cellCenter: (r: number, c: number) => {
        const cell = this.cellContainers[r][c]
        return {
          x: cell.x + this.cellSize / 2,
          y: cell.y + this.cellSize / 2,
        }
      },
      buildPiece: (piece: Parameters<PixelAssets['buildPieceVisual']>[0], size: number) =>
        assets.buildPieceVisual(piece, size),
    }
  }

  private handSignature(s: GameState): string {
    if (s.phase === 'setup') {
      return `setup:${s.humanHand.join()}|sel:${s.setupSelected.join()}|ace:${s.setupAce}`
    }
    if (s.phase === 'pregame') {
      return `pregame:${s.humanReserve.join()}|pick:${s.preHumanPick}`
    }
    return `idle:${s.phase}`
  }

  private syncHand(s: GameState): void {
    if (!this.handContainer) return

    const sig = this.handSignature(s)
    if (sig === this.lastHandSig) return
    this.lastHandSig = sig

    this.handContainer.removeChildren()

    if (s.phase === 'setup') {
      this.addHandGrid(
        t('hand.setupTitle'),
        s.humanHand.map((type, i) => ({
          type,
          selected: s.setupAce === i ? 2 : s.setupSelected.includes(i) ? 1 : 0,
          onClick: () => this.game?.onHandClickSetup(i),
        })),
      )
      this.onResize(this.viewportWidth, this.viewportHeight)
      return
    }

    if (s.phase === 'pregame') {
      this.addHandGrid(
        t('hand.pregameTitle'),
        s.humanReserve.map((type, i) => ({
          type,
          selected: s.preHumanPick === i ? 1 : 0,
          onClick: () => this.game?.onReserveClick(i),
        })),
      )
      this.onResize(this.viewportWidth, this.viewportHeight)
      return
    }

    this.onResize(this.viewportWidth, this.viewportHeight)
  }

  private addHandGrid(
    labelText: string,
    items: Array<{
      type: PieceType
      selected: 0 | 1 | 2
      onClick: () => void
    }>,
  ): void {
    if (!this.handContainer) return

    const gap = 8
    const size = this.handPieceSize
    const label = new Text({
      text: labelText,
      style: this.handGuideStyle(),
    })
    label.label = 'hand-guide-label'
    label.eventMode = 'none'
    label.anchor.set(0.5, 0)
    label.position.set(this.contentWidth / 2, 0)
    label.style.wordWrapWidth = this.contentWidth
    this.handContainer.addChild(label)

    const grid = new Container()
    grid.position.set(0, label.height + 6)
    items.forEach((item, i) => {
      const col = i % this.handCols
      const row = Math.floor(i / this.handCols)
      const p = this.createHandPiece(
        item.type,
        HUMAN,
        item.selected === 2,
        item.selected === 1,
      )
      p.position.set(col * (size + gap), row * (size + gap))
      p.on('pointertap', () => {
        getGameSfx().play('click')
        item.onClick()
      })
      grid.addChild(p)
    })
    this.handContainer.addChild(grid)
  }

  private syncActionButton(s: GameState): void {
    if (!this.actionBtn) return
    const label = this.actionBtn.getChildByLabel('label') as Text
    const bg = this.actionBtn.getChildByLabel('bg') as Graphics
    this.actionBtn.visible = s.showActionButton
    if (label) label.text = s.actionButtonLabel
    const bw = this.contentWidth
    const bh = 36
    bg.clear()
    fillPixelButton(
      bg,
      0,
      0,
      bw,
      bh,
      s.actionButtonEnabled ? COLORS.accent : 0x5a5040,
    )
    if (label) this.layoutButtonLabel(label, bw, bh)
    this.syncActionButtonGuideRing(s, bw, bh)
    this.actionBtn.alpha = s.actionButtonEnabled ? 1 : 0.6
    this.actionBtn.eventMode = s.actionButtonEnabled ? 'static' : 'none'
    if (s.actionButtonEnabled) {
      this.makeClickable(this.actionBtn, bw, bh)
    }
  }

  private syncGraveyard(s: GameState): void {
    if (!this.graveHuman || !this.graveAi) return
    this.graveHuman.removeChildren()
    this.graveAi.removeChildren()
    let hi = 0
    let ai = 0
    const ps = Math.min(36, Math.floor(this.contentWidth / 10))
    for (const p of s.eliminated) {
      const g = this.createPieceGraphic(p, ps)
      if (p.owner === HUMAN) {
        g.position.set(hi * (ps + 6), 0)
        this.graveHuman.addChild(g)
        hi += 1
      } else {
        g.position.set(ai * (ps + 6), 0)
        this.graveAi.addChild(g)
        ai += 1
      }
    }
    const ghLabel = new Text({ text: t('ui.graveYours'), style: this.mutedStyle(10) })
    ghLabel.position.set(0, -16)
    const gaLabel = new Text({ text: t('ui.graveEnemy'), style: this.mutedStyle(10) })
    gaLabel.position.set(120, -16)
    if (!this.graveHuman.getChildByLabel('lbl')) {
      ghLabel.label = 'lbl'
      this.graveHuman.addChild(ghLabel)
    }
    if (!this.graveAi.getChildByLabel('lbl')) {
      gaLabel.label = 'lbl'
      this.graveAi.addChild(gaLabel)
    }
    this.graveAi.position.set(this.contentWidth * 0.52, 0)
  }

  private syncPregameReveal(s: GameState): void {
    if (!this.pregameReveal) return
    this.pregameReveal.removeChildren()
    if (!s.pregameRevealTypes) {
      this.pregameReveal.visible = false
      return
    }
    this.pregameReveal.visible = true
    const { human, ai } = s.pregameRevealTypes
    const gap = 6
    const boardW = COLS * this.cellSize + (COLS - 1) * gap
    const boardH = ROWS * this.cellSize + (ROWS - 1) * gap
    const revealSize = Math.min(52, this.cellSize)
    this.pregameReveal.position.set((boardW - revealSize * 2 - 48) / 2, boardH / 2 - revealSize / 2)

    const left = this.createPieceGraphic(
      { type: human, owner: HUMAN, hidden: false, isAce: false },
      revealSize,
    )
    const right = this.createPieceGraphic(
      { type: ai, owner: AI, hidden: false, isAce: false },
      revealSize,
    )
    left.position.set(0, 0)
    right.position.set(revealSize + 48, 0)
    const vs = new Text({
      text: t('ui.pregameVs'),
      style: pixelTextStyle({ fontSize: 12, fill: '#e8a838' }),
    })
    vs.anchor.set(0.5)
    vs.position.set(revealSize + 24, revealSize / 2)
    this.pregameReveal.addChild(left, vs, right)
  }

  private syncEndModal(s: GameState): void {
    if (s.phase !== 'end') {
      this.lastEndSfx = null
      if (this.endModal) {
        this.endModal.visible = false
      }
      return
    }

    if ((s.status === 'won' || s.status === 'lost') && this.lastEndSfx !== s.status) {
      getGameSfx().play(s.status === 'won' ? 'win' : 'lose')
      this.lastEndSfx = s.status
    }

    if (!this.endModal) {
      this.endModal = new Container()
      this.endModal.label = 'end-modal'
      const dim = new Graphics()
      dim.label = 'dim'
      this.endModal.addChild(dim)

      const panel = new Container()
      panel.label = 'panel'
      const panelBg = new Graphics()
      panelBg.label = 'panel-bg'
      panel.addChild(panelBg)

      const title = new Text({
        text: '',
        style: pixelTextStyle({ fontSize: 20, fill: '#e8a838' }),
      })
      title.label = 'title'
      panel.addChild(title)

      const body = new Text({
        text: '',
        style: pixelTextStyle({
          fontSize: 11,
          fill: '#9a8f82',
          align: 'center',
          wordWrap: true,
          wordWrapWidth: 280,
        }),
      })
      body.label = 'body'
      panel.addChild(body)

      const again = this.createButton(t('ui.playAgain'), () => {
        this.game?.restart()
        if (this.endModal) this.endModal.visible = false
      })
      again.label = 'again-btn'
      panel.addChild(title, body, again)

      this.endModal.addChild(panel)
      this.overlayLayer.addChild(this.endModal)
    }

    this.endModal.visible = true
    const panel = this.endModal.getChildByLabel('panel') as Container
    const title = panel.getChildByLabel('title') as Text
    const body = panel.getChildByLabel('body') as Text

    if (s.status === 'won') {
      title.text = t('endModal.wonTitle')
      body.text = t('endModal.wonBody')
    } else if (s.status === 'lost') {
      title.text = t('endModal.lostTitle')
      body.text = t('endModal.lostBody')
    } else {
      title.text = t('endModal.drawTitle')
      body.text = t('endModal.drawBody')
    }

    this.layoutOverlay()
  }

  private layoutOverlay(): void {
    this.layoutStartScreen()
    this.layoutMusicButton()
    if (!this.endModal?.visible) return
    const dim = this.endModal.getChildByLabel('dim') as Graphics
    dim.clear()
    dim.rect(0, 0, this.viewportWidth, this.viewportHeight)
    dim.fill({ color: 0x000000, alpha: 0.75 })

    const panel = this.endModal.getChildByLabel('panel') as Container
    const panelBg = panel.getChildByLabel('panel-bg') as Graphics
    const title = panel.getChildByLabel('title') as Text
    const body = panel.getChildByLabel('body') as Text
    const again = panel.getChildByLabel('again-btn') as Container
    const pw = Math.min(320, this.viewportWidth - 40)
    const btnH = 36
    const btnW = pw - 48
    const bodyWrap = pw - 40

    body.style.wordWrapWidth = bodyWrap
    title.style.align = 'center'
    body.style.align = 'center'
    title.anchor.set(0.5, 0)
    body.anchor.set(0.5, 0)
    title.position.set(pw / 2, 16)
    body.position.set(pw / 2, 48)

    const ph = Math.max(160, 48 + body.height + 16 + btnH + 16)
    panelBg.clear()
    panelBg.rect(0, 0, pw, ph)
    panelBg.fill({ color: COLORS.panel, alpha: 0.95 })
    strokePixelFrame(panelBg, 0, 0, pw, ph, COLORS.accent, 2)

    if (again) {
      this.resizeButton(again, btnW, btnH, false)
      again.position.set((pw - btnW) / 2, ph - btnH - 16)
    }

    panel.position.set(
      (this.viewportWidth - pw) / 2,
      (this.viewportHeight - ph) / 2,
    )
  }

  private renderLog(
    entries: GameState['log'],
    width: number,
    maxHeight: number,
  ): void {
    if (!this.logContainer) return
    this.logContainer.removeChildren()
    let y = 0
    const lineH = 16
    const maxLines = Math.min(5, Math.floor(maxHeight / lineH))
    const slice = entries.slice(0, maxLines)
    for (const entry of slice) {
      const color =
        entry.kind === 'you' ? '#7bc49a' : entry.kind === 'ai' ? '#e07a88' : '#e8a838'
      const logLine = new Text({
        text: entry.message,
        style: pixelTextStyle({
          fontSize: 10,
          fill: color,
          wordWrap: true,
          wordWrapWidth: width,
        }),
      })
      logLine.position.set(0, y)
      this.logContainer.addChild(logLine)
      y += logLine.height + 4
    }
  }

  private createPieceGraphic(piece: Piece | EliminatedPiece, size: number): Container {
    const isElim = 'isAce' in piece && !('hidden' in piece)
    const full: Piece = isElim
      ? {
          type: piece.type,
          owner: piece.owner,
          isAce: piece.isAce,
          hidden: false,
        }
      : (piece as Piece)
    return this.buildPieceVisual(full, size)
  }

  private createHandPiece(
    type: PieceType,
    owner: typeof HUMAN,
    isAceHidden: boolean,
    selected: boolean,
  ): Container {
    const piece: Piece = {
      type,
      owner,
      isAce: isAceHidden,
      hidden: isAceHidden,
    }
    const size = this.handPieceSize
    const c = this.buildPieceVisual(piece, size)
    this.makeClickable(c, size, size)
    if (selected) {
      const ring = new Graphics()
      strokePixelFrame(ring, -2, -2, size + 4, size + 4, COLORS.accent, 3)
      c.addChildAt(ring, 0)
    }
    return c
  }

  private buildPieceVisual(piece: Piece, size: number): Container {
    if (this.pixelAssets) {
      return this.pixelAssets.buildPieceVisual(piece, size)
    }
    const c = new Container()
    const g = new Graphics()
    const r = size / 2
    g.circle(r, r, r - 2)
    g.fill(PIECE_FILL[piece.type])
    c.addChild(g)
    return c
  }

  private makeClickable(target: Container, width: number, height: number): void {
    target.eventMode = 'static'
    target.cursor = 'pointer'
    target.hitArea = new Rectangle(0, 0, width, height)
  }

  private bindClickSound(target: Container, onClick: () => void): void {
    target.on('pointertap', () => {
      getGameSfx().play('click')
      onClick()
    })
  }

  private createButton(
    label: string,
    onClick: () => void,
    secondary = false,
  ): Container {
    const btn = new Container()
    const bw = 200
    const bh = 36
    this.makeClickable(btn, bw, bh)
    const bg = new Graphics()
    bg.label = 'bg'
    fillPixelButton(bg, 0, 0, bw, bh, secondary ? 0x3d3555 : COLORS.accent)
    const text = new Text({
      text: label,
      style: pixelTextStyle({
        fontSize: 12,
        fill: secondary ? '#f0ebe3' : '#1a1625',
        align: 'center',
      }),
    })
    text.label = 'label'
    this.layoutButtonLabel(text, bw, bh)
    btn.addChild(bg, text)
    this.bindClickSound(btn, onClick)
    return btn
  }

  private mutedStyle(size: number): TextStyle {
    return pixelTextStyle({
      fontSize: size,
      fill: '#9a8f82',
      wordWrap: true,
    })
  }

  private legendStyle(): TextStyle {
    if (getLocale() === 'en') {
      return pixelTextStyle({
        fontSize: 8,
        fill: '#9a8f82',
        wordWrap: true,
        lineHeight: 11,
      })
    }

    return pixelTextStyle({
      fontSize: 9,
      fill: '#9a8f82',
      wordWrap: true,
      lineHeight: 12,
    })
  }

  private poolInfoStyle(): TextStyle {
    return pixelTextStyle({
      fontSize: 10,
      fill: '#9a8f82',
      wordWrap: false,
      lineHeight: 13,
    })
  }
}

type EliminatedPiece = GameState['eliminated'][number]
