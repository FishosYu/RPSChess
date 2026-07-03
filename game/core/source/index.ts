export type {
  PieceType,
  PlayerId,
  GamePhase,
  GameStatus,
  Piece,
  Board,
  Move,
  LogEntry,
  EliminatedPiece,
  GameState,
  GameConfig,
  ApplyMoveResult,
  MoveVisualEvent,
} from './types.ts'

export {
  ROWS,
  COLS,
  HUMAN,
  AI,
  DEFAULT_GAME_CONFIG,
} from './config.ts'

export {
  TYPES,
  LABEL,
  NAME,
  beats,
  same,
  legalMoves,
  emptyBoard,
  previewApplyMove,
  cloneBoard,
} from './rpsRules.ts'

export { GameInstance } from './GameInstance.ts'

export {
  setGameTranslator,
  tr,
  pieceName,
  pieceList,
} from './translate.ts'
export type { TranslateVars } from './translate.ts'
