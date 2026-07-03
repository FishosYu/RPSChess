import { Graphics, TextStyle } from 'pixi.js'

/** Chinese + Latin pixel font (Zpix), with fallbacks */
export const PIXEL_FONT =
  'Zpix, "Press Start 2P", "Courier New", monospace'

export function pixelTextStyle(
  overrides: Partial<TextStyle> & { fontSize: number },
): TextStyle {
  return new TextStyle({
    fontFamily: PIXEL_FONT,
    fill: '#f0ebe3',
    letterSpacing: 0,
    lineHeight: overrides.fontSize + 6,
    ...overrides,
  })
}

/** Stepped pixel border (sharp corners, no roundRect) */
export function strokePixelFrame(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
  thickness = 2,
): void {
  const t = thickness
  g.rect(x, y, w, h).stroke({ width: t, color, alignment: 0.5 })
  g.rect(x + t, y + t, w - t * 2, 1).fill({ color: 0xffffff, alpha: 0.12 })
}

export function fillPixelButton(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: number,
  border = 0xffd080,
): void {
  g.rect(x, y, w, h)
  g.fill(fill)
  strokePixelFrame(g, x, y, w, h, border, 2)
  // bottom shadow strip
  g.rect(x + 2, y + h - 3, w - 4, 2)
  g.fill({ color: 0x000000, alpha: 0.25 })
}

/** Chamfered square (cut corners) for play button */
export function fillPixelChamferButton(
  g: Graphics,
  size: number,
  fill: number,
  border = 0xffd080,
): void {
  const c = 6
  g.moveTo(c, 0)
  g.lineTo(size - c, 0)
  g.lineTo(size, c)
  g.lineTo(size, size - c)
  g.lineTo(size - c, size)
  g.lineTo(c, size)
  g.lineTo(0, size - c)
  g.lineTo(0, c)
  g.closePath()
  g.fill(fill)
  g.stroke({ width: 2, color: border, alignment: 0.5 })
  g.rect(4, size - 5, size - 8, 3)
  g.fill({ color: 0x000000, alpha: 0.22 })
}

function pointOnRectPerimeter(
  x0: number,
  y0: number,
  w: number,
  h: number,
  dist: number,
): { x: number; y: number } {
  const perimeter = 2 * (w + h)
  let d = ((dist % perimeter) + perimeter) % perimeter
  if (d < w) return { x: x0 + d, y: y0 }
  d -= w
  if (d < h) return { x: x0 + w, y: y0 + d }
  d -= h
  if (d < w) return { x: x0 + w - d, y: y0 + h }
  d -= w
  return { x: x0, y: y0 + h - d }
}

/** Slot-machine style sparkle traveling along a button border */
export function drawButtonSparkleGuide(
  g: Graphics,
  bw: number,
  bh: number,
  time: number,
  pad = 5,
): void {
  g.clear()
  const x0 = -pad
  const y0 = -pad
  const rw = bw + pad * 2
  const rh = bh + pad * 2
  const perimeter = 2 * (rw + rh)

  g.rect(x0, y0, rw, rh).stroke({ width: 1, color: 0xffd060, alpha: 0.35 })

  const speed = 240
  const headDist = (time * speed) % perimeter
  const trailSteps = 26
  const trailGap = 6
  const sparkSize = 5
  const sparkHalf = 2

  for (let i = trailSteps; i >= 0; i -= 1) {
    const dist = (headDist - i * trailGap + perimeter) % perimeter
    const { x, y } = pointOnRectPerimeter(x0, y0, rw, rh, dist)
    const px = Math.floor(x)
    const py = Math.floor(y)

    if (i === 0) {
      g.rect(px - sparkHalf, py - sparkHalf, sparkSize, sparkSize).fill(0xffffff)
      g.rect(px - 1, py - 1, 3, 3).fill(0xffe080)
      g.rect(px, py, 1, 1).fill(0xffffff)
    } else {
      const fade = 0.1 + (1 - i / trailSteps) * 0.65
      g.rect(px - sparkHalf, py - sparkHalf, sparkSize, sparkSize).fill({
        color: 0xffffff,
        alpha: fade * 0.45,
      })
      g.rect(px - 1, py - 1, 3, 3).fill({ color: 0xffe080, alpha: fade })
    }
  }
}

export function drawPixelPlayIcon(g: Graphics, cx: number, cy: number, scale: number): void {
  const s = scale
  // symmetric triangle so the icon reads centered in the button
  g.moveTo(cx - 8 * s, cy - 10 * s)
  g.lineTo(cx + 10 * s, cy)
  g.lineTo(cx - 8 * s, cy + 10 * s)
  g.closePath()
  g.fill(0x1a1625)
  g.rect(cx - 9 * s, cy - 11 * s, 1, 22 * s)
  g.fill({ color: 0xffffff, alpha: 0.15 })
}

/** Solid eighth-note icon (no emoji). Optional slash when muted. */
export function drawMusicNoteIcon(
  g: Graphics,
  cx: number,
  cy: number,
  scale: number,
  color: number,
  muted: boolean,
): void {
  const s = scale
  const headX = cx - 5 * s
  const headY = cy + 4 * s

  g.ellipse(headX, headY, 5 * s, 4 * s)
  g.fill(color)

  const stemX = cx + 1 * s
  g.rect(stemX, cy - 9 * s, 2 * s, 14 * s)
  g.fill(color)

  g.moveTo(stemX + 2 * s, cy - 9 * s)
  g.lineTo(stemX + 11 * s, cy - 5 * s)
  g.lineTo(stemX + 9 * s, cy - 1 * s)
  g.lineTo(stemX + 2 * s, cy - 3 * s)
  g.closePath()
  g.fill(color)

  if (muted) {
    g.moveTo(cx - 9 * s, cy - 9 * s)
    g.lineTo(cx + 10 * s, cy + 9 * s)
    g.stroke({ width: 2 * s, color: 0xc45c6a, cap: 'round' })
  }
}
