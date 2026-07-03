import { HUMAN, type Piece, type PieceType } from '@minigame/core'
import { Container, Graphics, Sprite, Texture } from 'pixi.js'
import { strokePixelFrame } from './pixelStyle'

const PX = 32
const M = 2 // inner margin for border in texture

const PIECE_BASE: Record<PieceType, string> = {
  rock: '#6a788c',
  scissors: '#c94b5d',
  paper: '#4a9e6a',
}

const PIECE_BASE_DARK: Record<PieceType, string> = {
  rock: '#4a5566',
  scissors: '#8a2838',
  paper: '#2d6b44',
}

function canvasTexture(
  draw: (ctx: CanvasRenderingContext2D, s: number) => void,
  size = PX,
): Texture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  draw(ctx, size)
  const tex = Texture.from(canvas)
  tex.source.scaleMode = 'nearest'
  return tex
}

function px(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  ctx.fillStyle = color
  ctx.fillRect(Math.floor(x), Math.floor(y), w, h)
}

function fillSolidBase(ctx: CanvasRenderingContext2D, s: number, type: PieceType): void {
  px(ctx, 0, 0, s, s, PIECE_BASE_DARK[type])
  px(ctx, M, M, s - M * 2, s - M * 2, PIECE_BASE[type])
}

function drawRockIcon(ctx: CanvasRenderingContext2D): void {
  const c = '#8a9aae'
  const d = '#5a6578'
  const hi = '#b8c8d8'
  px(ctx, 10, 9, 12, 10, c)
  px(ctx, 8, 11, 3, 7, d)
  px(ctx, 21, 12, 3, 6, d)
  px(ctx, 11, 7, 10, 3, d)
  px(ctx, 13, 20, 6, 3, d)
  px(ctx, 14, 10, 3, 3, hi)
}

function drawScissorsIcon(ctx: CanvasRenderingContext2D): void {
  const blade = '#f0e8ec'
  const bladeSh = '#6a1828'
  const handle = '#e8b830'
  const handleSh = '#9a6018'

  px(ctx, 14, 13, 4, 4, handle)
  px(ctx, 15, 14, 2, 2, '#fff8c0')
  px(ctx, 7, 5, 3, 2, blade)
  px(ctx, 6, 7, 2, 2, blade)
  px(ctx, 5, 9, 2, 3, blade)
  px(ctx, 4, 12, 2, 2, bladeSh)
  px(ctx, 22, 5, 3, 2, blade)
  px(ctx, 24, 7, 2, 2, blade)
  px(ctx, 25, 9, 2, 3, blade)
  px(ctx, 26, 12, 2, 2, bladeSh)
  px(ctx, 5, 16, 8, 3, handleSh)
  px(ctx, 6, 19, 6, 8, handle)
  px(ctx, 7, 21, 4, 4, PIECE_BASE.scissors)
  px(ctx, 19, 16, 8, 3, handleSh)
  px(ctx, 20, 19, 6, 8, handle)
  px(ctx, 21, 21, 4, 4, PIECE_BASE.scissors)
}

function drawPaperIcon(ctx: CanvasRenderingContext2D): void {
  px(ctx, 9, 7, 14, 18, '#e8f4ea')
  px(ctx, 7, 9, 2, 14, '#3d7a52')
  px(ctx, 22, 10, 2, 12, '#b0d8b8')
  px(ctx, 11, 10, 10, 2, '#3d7a52')
  px(ctx, 11, 14, 8, 2, '#3d7a52')
  px(ctx, 11, 18, 6, 2, '#3d7a52')
  px(ctx, 10, 8, 3, 2, '#ffffff')
}

function drawRock(ctx: CanvasRenderingContext2D, s: number): void {
  fillSolidBase(ctx, s, 'rock')
  drawRockIcon(ctx)
}

function drawScissors(ctx: CanvasRenderingContext2D, s: number): void {
  fillSolidBase(ctx, s, 'scissors')
  drawScissorsIcon(ctx)
}

function drawPaper(ctx: CanvasRenderingContext2D, s: number): void {
  fillSolidBase(ctx, s, 'paper')
  drawPaperIcon(ctx)
}

function drawAceBase(ctx: CanvasRenderingContext2D, s: number): void {
  px(ctx, 0, 0, s, s, '#6a5010')
  px(ctx, M, M, s - M * 2, s - M * 2, '#c9a227')
  px(ctx, M + 2, M + 2, s - (M + 2) * 2, s - (M + 2) * 2, '#3d2810')
  px(ctx, M + 4, M + 4, s - (M + 4) * 2, s - (M + 4) * 2, '#e8c860')
  px(ctx, 12, 12, 8, 8, '#ffd878')
}

function drawAceBack(ctx: CanvasRenderingContext2D, s: number): void {
  drawAceBase(ctx, s)
  ctx.fillStyle = '#5a3a10'
  ctx.font = 'bold 12px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('?', 16, 17)
}

function drawAceRevealed(ctx: CanvasRenderingContext2D, s: number, type: PieceType): void {
  drawAceBase(ctx, s)
  if (type === 'rock') drawRockIcon(ctx)
  else if (type === 'scissors') drawScissorsIcon(ctx)
  else drawPaperIcon(ctx)
}

function drawCellLight(ctx: CanvasRenderingContext2D, s: number): void {
  px(ctx, 0, 0, s, s, '#6a5840')
  px(ctx, 2, 2, s - 4, s - 4, '#c9b896')
  px(ctx, 4, 4, 3, 3, '#ddd0b0')
  px(ctx, s - 7, s - 7, 3, 3, '#9a8868')
}

function drawCellDark(ctx: CanvasRenderingContext2D, s: number): void {
  px(ctx, 0, 0, s, s, '#4a3828')
  px(ctx, 2, 2, s - 4, s - 4, '#8b7355')
  px(ctx, 4, 4, 3, 3, '#6a5840')
  px(ctx, s - 7, s - 7, 3, 3, '#3d3020')
}

export class PixelAssets {
  readonly piece: Record<PieceType, Texture>
  readonly aceBack: Texture
  readonly aceRevealed: Record<PieceType, Texture>
  readonly cellLight: Texture
  readonly cellDark: Texture
  readonly spark: Texture

  private constructor(
    piece: Record<PieceType, Texture>,
    aceBack: Texture,
    aceRevealed: Record<PieceType, Texture>,
    cellLight: Texture,
    cellDark: Texture,
    spark: Texture,
  ) {
    this.piece = piece
    this.aceBack = aceBack
    this.aceRevealed = aceRevealed
    this.cellLight = cellLight
    this.cellDark = cellDark
    this.spark = spark
  }

  static create(): PixelAssets {
    return new PixelAssets(
      {
        rock: canvasTexture(drawRock),
        scissors: canvasTexture(drawScissors),
        paper: canvasTexture(drawPaper),
      },
      canvasTexture(drawAceBack),
      {
        rock: canvasTexture((ctx, s) => drawAceRevealed(ctx, s, 'rock')),
        scissors: canvasTexture((ctx, s) => drawAceRevealed(ctx, s, 'scissors')),
        paper: canvasTexture((ctx, s) => drawAceRevealed(ctx, s, 'paper')),
      },
      canvasTexture(drawCellLight),
      canvasTexture(drawCellDark),
      canvasTexture((ctx, s) => {
        px(ctx, 14, 14, 4, 4, '#fff8c0')
        px(ctx, 12, 12, 8, 8, '#ffe080')
      }, 16),
    )
  }

  buildPieceVisual(piece: Piece, size: number): Container {
    const c = new Container()
    c.label = 'piece-visual'
    c.eventMode = 'none'

    const tex = piece.isAce
      ? piece.hidden
        ? this.aceBack
        : this.aceRevealed[piece.type]
      : this.piece[piece.type]
    const spr = new Sprite(tex)
    spr.width = size
    spr.height = size
    spr.position.set(0, 0)
    c.addChild(spr)

    const outline = piece.owner === HUMAN ? 0x4a9e7a : 0xc45c6a
    const frame = new Graphics()
    frame.label = 'frame'
    strokePixelFrame(frame, 0, 0, size, size, outline, 2)
    c.addChild(frame)

    if (piece.isAce && !piece.hidden) {
      const crown = new Graphics()
      crown.label = 'crown'
      const m = Math.max(2, Math.floor(size * 0.06))
      const cs = Math.max(3, Math.floor(size * 0.14))
      crown.rect(m, m, cs, cs)
      crown.fill(0xffd060)
      crown.rect(size - m - cs, m, cs, cs)
      crown.fill(0xffd060)
      strokePixelFrame(crown, 1, 1, size - 2, size - 2, 0xffd060, 1)
      c.addChild(crown)
    }

    return c
  }
}

export function centerPieceInCell(pieceNode: Container, cellSize: number, pieceSize: number): void {
  pieceNode.position.set(
    Math.floor((cellSize - pieceSize) / 2),
    Math.floor((cellSize - pieceSize) / 2),
  )
}
