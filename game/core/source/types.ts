export type PieceType = 'rock' | 'scissors' | 'paper'

export type PlayerId = 1 | 2

export type GamePhase =
  | 'setup'
  | 'pregame'
  | 'pregame_reveal'
  | 'play'
  | 'stalemate_pending'
  | 'end'

export type GameStatus = 'running' | 'won' | 'lost' | 'draw'

export interface Piece {
  type: PieceType
  owner: PlayerId
  isAce: boolean
  hidden: boolean
}

export type Board = (Piece | null)[][]

export interface Move {
  from: { r: number; c: number }
  to: { r: number; c: number }
  duel: boolean
  capture?: boolean
}

export type ApplyMoveResult = 'ok' | 'win' | 'pass' | 'lose_piece'

/** Client-only visual payload; board unchanged until commitPendingMove(). */
export interface MoveVisualEvent {
  seq: number
  from: { r: number; c: number }
  to: { r: number; c: number }
  piece: Piece
  captured: Piece | null
  duel: boolean
  owner: PlayerId
  previewResult: ApplyMoveResult
}

export interface LogEntry {
  message: string
  kind: 'system' | 'you' | 'ai'
}

export interface EliminatedPiece {
  type: PieceType
  owner: PlayerId
  isAce: boolean
}

export interface GameState {
  phase: GamePhase
  board: Board
  humanHand: PieceType[]
  humanReserve: PieceType[]
  currentPlayer: PlayerId
  selectedCell: { r: number; c: number } | null
  highlightMoves: Move[]
  setupSelected: number[]
  setupAce: number | null
  preHumanPick: number | null
  humanAceType: PieceType | null
  enemyAceKnown: PieceType | null
  preGameRevealed: { human: PieceType | null; ai: PieceType | null }
  eliminated: EliminatedPiece[]
  log: LogEntry[]
  status: GameStatus
  statusText: string
  aiHint: string
  pregameRevealTypes: { human: PieceType; ai: PieceType } | null
  stalemateCountdown: number | null
  actionButtonLabel: string
  actionButtonEnabled: boolean
  showActionButton: boolean
  pendingMoveVisual: MoveVisualEvent | null
  animationLocked: boolean
}

export interface GameConfig {
  rows: number
  cols: number
}
