import type { PieceType } from './types.ts'

export type TranslateVars = Record<string, string | number>

let translateFn: (key: string, vars?: TranslateVars) => string = (key) => key

/** Wire runtime i18n (called from client main.ts after initI18n). */
export function setGameTranslator(
  fn: (key: string, vars?: TranslateVars) => string,
): void {
  translateFn = fn
}

export function tr(key: string, vars?: TranslateVars): string {
  return translateFn(key, vars)
}

export function pieceName(type: PieceType): string {
  return tr(`piece.${type}.name`)
}

export function pieceList(types: PieceType[]): string {
  return types.map(pieceName).join(tr('common.listSep'))
}
