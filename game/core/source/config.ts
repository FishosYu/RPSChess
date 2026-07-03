import type { GameConfig } from './types.ts'

export const ROWS = 4
export const COLS = 3
export const HUMAN = 2 as const
export const AI = 1 as const

export const DEFAULT_GAME_CONFIG: GameConfig = {
  rows: ROWS,
  cols: COLS,
}
