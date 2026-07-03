import { AI, COLS, HUMAN, ROWS } from './config.ts'
import type {
  ApplyMoveResult,
  Board,
  Move,
  Piece,
  PieceType,
  PlayerId,
} from './types.ts'

export const TYPES: PieceType[] = ['rock', 'scissors', 'paper']

export const LABEL: Record<PieceType, string> = {
  rock: '✊',
  scissors: '✌️',
  paper: '✋',
}

export const NAME: Record<PieceType, string> = {
  rock: '石头',
  scissors: '剪刀',
  paper: '布',
}

const WINS: Record<PieceType, PieceType> = {
  rock: 'scissors',
  scissors: 'paper',
  paper: 'rock',
}

export function beats(a: PieceType, b: PieceType): boolean {
  return WINS[a] === b
}

export function same(a: PieceType, b: PieceType): boolean {
  return a === b
}

export function emptyBoard(): Board {
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => null),
  )
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function dealPool(): PieceType[] {
  return shuffle([
    ...Array<PieceType>(4).fill('rock'),
    ...Array<PieceType>(4).fill('scissors'),
    ...Array<PieceType>(4).fill('paper'),
  ])
}

export function countTypes(pieces: PieceType[]): Record<PieceType, number> {
  const c: Record<PieceType, number> = { rock: 0, scissors: 0, paper: 0 }
  pieces.forEach((t) => {
    c[t] += 1
  })
  return c
}

export function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS
}

export function getPiece(board: Board, r: number, c: number): Piece | null {
  if (!inBounds(r, c)) return null
  const p = board[r][c]
  return p ?? null
}

export function dirsFor(piece: Piece): Array<[number, number]> {
  if (piece.isAce) {
    return [
      [-1, -1],
      [-1, 0],
      [-1, 1],
      [0, -1],
      [0, 1],
      [1, -1],
      [1, 0],
      [1, 1],
    ]
  }
  return [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ]
}

export function legalMoves(board: Board, owner: PlayerId): Move[] {
  const moves: Move[] = []
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const piece = getPiece(board, r, c)
      if (!piece || piece.owner !== owner) continue
      for (const [dr, dc] of dirsFor(piece)) {
        const nr = r + dr
        const nc = c + dc
        if (!inBounds(nr, nc)) continue
        const target = getPiece(board, nr, nc)
        if (!target) {
          moves.push({ from: { r, c }, to: { r: nr, c: nc }, duel: false })
        } else if (target.owner !== owner) {
          if (target.isAce) {
            moves.push({ from: { r, c }, to: { r: nr, c: nc }, duel: true })
          } else if (beats(piece.type, target.type)) {
            moves.push({
              from: { r, c },
              to: { r: nr, c: nc },
              duel: false,
              capture: true,
            })
          }
        }
      }
    }
  }
  return moves
}

export function acePosition(
  board: Board,
  owner: PlayerId,
): { r: number; c: number; piece: Piece } | null {
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const p = getPiece(board, r, c)
      if (p && p.owner === owner && p.isAce) return { r, c, piece: p }
    }
  }
  return null
}

export function getAllBoardPieces(board: Board): Piece[] {
  const list: Piece[] = []
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const p = getPiece(board, r, c)
      if (p) list.push(p)
    }
  }
  return list
}

export function isTypeStalemate(board: Board): boolean {
  const pieces = getAllBoardPieces(board)
  if (pieces.length < 2) return false
  const types = new Set(pieces.map((p) => p.type))
  if (types.size !== 1) return false
  const humanLeft = pieces.some((p) => p.owner === HUMAN)
  const aiLeft = pieces.some((p) => p.owner === AI)
  return humanLeft && aiLeft
}

export function manhattan(
  a: { r: number; c: number },
  b: { r: number; c: number },
): number {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c)
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((p) => (p ? { ...p } : null)))
}

export function previewApplyMove(
  board: Board,
  move: Move,
  owner: PlayerId,
): ApplyMoveResult {
  const copy = cloneBoard(board)
  return applyMove(copy, move, owner, () => {}, () => {})
}

export function applyMove(
  board: Board,
  move: Move,
  owner: PlayerId,
  onRevealEnemyAce: (type: PieceType) => void,
  onNoteHumanAceForAi: (type: PieceType) => void,
): ApplyMoveResult {
  const fromP = board[move.from.r][move.from.c]!
  const toP = board[move.to.r][move.to.c]

  if (move.duel && toP && toP.isAce) {
    toP.hidden = false
    const atkType = fromP.type
    const defType = toP.type
    if (toP.owner === AI) onRevealEnemyAce(defType)
    if (fromP.isAce && fromP.owner === AI) onRevealEnemyAce(fromP.type)
    if (toP.owner === HUMAN) onNoteHumanAceForAi(defType)
    if (fromP.isAce && fromP.owner === HUMAN) onNoteHumanAceForAi(fromP.type)

    if (beats(atkType, defType)) {
      board[move.to.r][move.to.c] = null
      board[move.from.r][move.from.c] = null
      return 'win'
    }
    if (same(atkType, defType)) {
      return 'pass'
    }
    board[move.from.r][move.from.c] = null
    return 'lose_piece'
  }

  if (toP && !move.duel) {
    if (owner === AI && fromP.isAce) onRevealEnemyAce(fromP.type)
    board[move.to.r][move.to.c] = null
  }

  board[move.to.r][move.to.c] = fromP
  board[move.from.r][move.from.c] = null
  return 'ok'
}

export function checkWin(board: Board): PlayerId | null {
  if (!acePosition(board, AI)) return HUMAN
  if (!acePosition(board, HUMAN)) return AI
  return null
}
