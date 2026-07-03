import { AI, COLS, HUMAN, ROWS } from './config.ts'
import {
  acePosition,
  applyMove,
  beats,
  checkWin,
  countTypes,
  dealPool,
  emptyBoard,
  getAllBoardPieces,
  getPiece,
  isTypeStalemate,
  legalMoves,
  manhattan,
  previewApplyMove,
  same,
  TYPES,
} from './rpsRules.ts'
import { pieceList, pieceName, tr } from './translate.ts'
import type {
  Board,
  EliminatedPiece,
  GamePhase,
  GameState,
  GameStatus,
  LogEntry,
  Move,
  MoveVisualEvent,
  PieceType,
  PlayerId,
} from './types.ts'

export class GameInstance {
  private phase: GamePhase = 'setup'
  private board: Board = emptyBoard()
  private humanHand: PieceType[] = []
  private aiHand: PieceType[] = []
  private humanReserve: PieceType[] = []
  private aiReserve: PieceType[] = []
  private currentPlayer: PlayerId = HUMAN
  private selectedCell: { r: number; c: number } | null = null
  private setupSelected: number[] = []
  private setupPieceState: Record<number, 0 | 1 | 2> = {}
  private setupAce: number | null = null
  private preHumanPick: number | null = null
  private preGameRevealed = { human: null as PieceType | null, ai: null as PieceType | null }
  private humanAceType: PieceType | null = null
  private enemyAceKnown: PieceType | null = null
  private aiKnownHumanAce: PieceType | null = null
  private eliminated: EliminatedPiece[] = []
  private log: LogEntry[] = []
  private status: GameStatus = 'running'
  private statusText = ''
  private aiHint = ''
  private pregameRevealTypes: { human: PieceType; ai: PieceType } | null = null
  private stalemateTimer: ReturnType<typeof setTimeout> | null = null
  private aiTurnScheduled = false
  private pendingMove: { move: Move; owner: PlayerId } | null = null
  private pendingMoveVisual: MoveVisualEvent | null = null
  private animationLocked = false
  private moveVisualSeq = 0

  start(): void {
    this.initGame()
  }

  stop(): void {
    if (this.stalemateTimer) {
      clearTimeout(this.stalemateTimer)
      this.stalemateTimer = null
    }
  }

  getState(): GameState {
    const highlightMoves =
      this.phase === 'play' && this.currentPlayer === HUMAN && this.selectedCell
        ? legalMoves(this.board, HUMAN).filter(
            (m) =>
              m.from.r === this.selectedCell!.r && m.from.c === this.selectedCell!.c,
          )
        : []

    return {
      phase: this.phase,
      board: this.board.map((row) => row.map((p) => (p ? { ...p } : null))),
      humanHand: [...this.humanHand],
      humanReserve: [...this.humanReserve],
      currentPlayer: this.currentPlayer,
      selectedCell: this.selectedCell ? { ...this.selectedCell } : null,
      highlightMoves,
      setupSelected: [...this.setupSelected],
      setupAce: this.setupAce,
      preHumanPick: this.preHumanPick,
      humanAceType: this.humanAceType,
      enemyAceKnown: this.enemyAceKnown,
      preGameRevealed: { ...this.preGameRevealed },
      eliminated: [...this.eliminated],
      log: [...this.log],
      status: this.status,
      statusText: this.statusText,
      aiHint: this.aiHint,
      pregameRevealTypes: this.pregameRevealTypes,
      stalemateCountdown: this.phase === 'stalemate_pending' ? 1 : null,
      actionButtonLabel: this.getActionButtonLabel(),
      actionButtonEnabled: this.isActionButtonEnabled(),
      showActionButton: this.phase === 'setup' || this.phase === 'pregame',
      pendingMoveVisual: this.pendingMoveVisual,
      animationLocked: this.animationLocked,
    }
  }

  commitPendingMove(): void {
    if (!this.pendingMove) return
    const { move, owner } = this.pendingMove
    this.pendingMove = null
    this.pendingMoveVisual = null
    this.animationLocked = false
    this.finishExecuteMove(move, owner)
  }

  restart(): void {
    this.stop()
    this.initGame()
  }

  onHandClickSetup(idx: number): void {
    if (this.phase !== 'setup') return
    const state = this.setupPieceState[idx] ?? 0
    if (state === 0) {
      if (this.setupSelected.length >= 3) return
      this.setupSelected.push(idx)
      this.setupPieceState[idx] = 1
    } else if (state === 1) {
      if (this.setupAce !== null && this.setupAce !== idx) {
        this.setupPieceState[this.setupAce] = 1
      }
      this.setupAce = idx
      this.setupPieceState[idx] = 2
    } else if (state === 2) {
      this.setupSelected = this.setupSelected.filter((i) => i !== idx)
      if (this.setupAce === idx) this.setupAce = null
      this.setupPieceState[idx] = 0
    }
    this.statusText = tr('status.setup.selected', { count: this.setupSelected.length })
  }

  confirmSetup(): void {
    if (this.phase !== 'setup' || this.setupSelected.length !== 3 || this.setupAce === null) {
      return
    }

    const flankIdx = this.setupSelected.filter((i) => i !== this.setupAce)
    const leftType = this.humanHand[flankIdx[0]]
    const aceType = this.humanHand[this.setupAce]
    const rightType = this.humanHand[flankIdx[1]]

    this.humanReserve = this.humanHand.filter((_, i) => !this.setupSelected.includes(i))
    this.humanHand = []

    this.board[3][0] = { type: leftType, owner: HUMAN, hidden: false, isAce: false }
    this.board[3][1] = { type: aceType, owner: HUMAN, hidden: true, isAce: true }
    this.board[3][2] = { type: rightType, owner: HUMAN, hidden: false, isAce: false }

    this.humanAceType = aceType
    this.enemyAceKnown = null
    this.addLog(
      tr('log.youDeploy', { left: pieceName(leftType), right: pieceName(rightType) }),
      'you',
    )

    this.aiChooseDeployment()
    this.phase = 'pregame'
    this.preHumanPick = null
    this.statusText = tr('status.pregame.pick')
  }

  onReserveClick(idx: number): void {
    if (this.phase !== 'pregame') return
    this.preHumanPick = idx
    this.statusText = tr('status.pregame.ready')
  }

  confirmPregame(): void {
    if (this.phase !== 'pregame' || this.preHumanPick === null) return

    const aiIdx = this.aiPregamePick()
    const humanType = this.humanReserve[this.preHumanPick]
    const aiType = this.aiReserve[aiIdx]

    this.phase = 'pregame_reveal'
    this.pregameRevealTypes = { human: humanType, ai: aiType }
    this.statusText = tr('status.pregame.revealing')

    setTimeout(() => {
      this.pregameRevealTypes = null
      this.preGameRevealed = { human: humanType, ai: aiType }
      this.addLog(
        tr('log.pregameReveal', {
          youPiece: pieceName(humanType),
          aiPiece: pieceName(aiType),
        }),
        'system',
      )

      if (beats(humanType, aiType)) {
        this.currentPlayer = HUMAN
        this.addLog(tr('log.youWinInitiative'), 'you')
      } else if (beats(aiType, humanType)) {
        this.currentPlayer = AI
        this.addLog(tr('log.aiWinInitiative'), 'ai')
      } else {
        this.addLog(tr('log.pregameTie'), 'system')
        this.phase = 'pregame'
        this.preHumanPick = null
        this.statusText = tr('status.pregame.tieRetry')
        return
      }

      this.phase = 'play'
      this.statusText =
        this.currentPlayer === HUMAN
          ? tr('status.play.yourTurn')
          : tr('status.play.aiThinking')
      if (this.currentPlayer === AI) this.scheduleAiTurn(600)
    }, 1000)
  }

  onCellClick(r: number, c: number): void {
    if (this.phase !== 'play' || this.currentPlayer !== HUMAN) {
      return
    }

    const moves = legalMoves(this.board, HUMAN)
    const clickedPiece = getPiece(this.board, r, c)

    if (this.selectedCell) {
      const move = moves.find(
        (m) =>
          m.from.r === this.selectedCell!.r &&
          m.from.c === this.selectedCell!.c &&
          m.to.r === r &&
          m.to.c === c,
      )
      if (move) {
        if (this.animationLocked) return
        this.executeMove(move, HUMAN)
        return
      }
    }

    if (clickedPiece && clickedPiece.owner === HUMAN) {
      this.selectedCell = { r, c }
      this.statusText = tr('status.play.yourTurnMove')
      return
    }

    if (!this.animationLocked) {
      this.selectedCell = null
      this.statusText = tr('status.play.yourTurn')
    }
  }

  private initGame(): void {
    this.phase = 'setup'
    this.board = emptyBoard()
    this.setupSelected = []
    this.setupPieceState = {}
    this.setupAce = null
    this.preHumanPick = null
    this.preGameRevealed = { human: null, ai: null }
    this.humanAceType = null
    this.enemyAceKnown = null
    this.aiKnownHumanAce = null
    this.eliminated = []
    this.log = []
    this.status = 'running'
    this.selectedCell = null
    this.currentPlayer = HUMAN
    this.aiHint = ''
    this.pregameRevealTypes = null
    this.aiTurnScheduled = false
    this.pendingMove = null
    this.pendingMoveVisual = null
    this.animationLocked = false

    const pool = dealPool()
    this.humanHand = pool.slice(0, 6)
    this.aiHand = pool.slice(6, 12)
    this.aiReserve = []
    this.humanReserve = []

    this.addLog(tr('log.dealDone', { hand: pieceList(this.humanHand) }), 'system')
    this.statusText = tr('status.setup.initial')
  }

  private addLog(message: string, kind: LogEntry['kind']): void {
    this.log.unshift({ message, kind })
    if (this.log.length > 80) this.log.pop()
  }

  private getActionButtonLabel(): string {
    if (this.phase === 'setup') return tr('action.confirmSetup')
    if (this.phase === 'pregame') return tr('action.revealPregame')
    return ''
  }

  private isActionButtonEnabled(): boolean {
    if (this.phase === 'setup') {
      return this.setupSelected.length === 3 && this.setupAce !== null
    }
    if (this.phase === 'pregame') return this.preHumanPick !== null
    return false
  }

  private revealEnemyAce(type: PieceType): void {
    if (this.enemyAceKnown) return
    this.enemyAceKnown = type
    this.addLog(tr('log.enemyAceKnown', { piece: pieceName(type) }), 'system')
  }

  private noteHumanAceForAi(type: PieceType): void {
    if (type) this.aiKnownHumanAce = type
  }

  private aiChooseDeployment(): void {
    const hand = [...this.aiHand]
    let best: {
      trio: number[]
      aceIdx: number
      deploy: PieceType[]
      aceType: PieceType
    } | null = null
    let bestScore = -Infinity

    const indices: number[][] = []
    const comb = (start: number, chosen: number[]) => {
      if (chosen.length === 3) {
        indices.push([...chosen])
        return
      }
      for (let i = start; i < hand.length; i += 1) {
        chosen.push(i)
        comb(i + 1, chosen)
        chosen.pop()
      }
    }
    comb(0, [])

    for (const trio of indices) {
      for (const aceIdx of trio) {
        const deploy = trio.map((i) => hand[i])
        const aceType = hand[aceIdx]
        const flank = deploy.filter((_, j) => trio[j] !== aceIdx)
        const diversity = new Set(flank).size
        const reserveAfter = hand.filter((_, i) => !trio.includes(i))
        const resCounts = countTypes(reserveAfter)
        const bluff = resCounts[aceType]
        const score = diversity * 3 + bluff * 2 + (flank[0] !== flank[1] ? 2 : 0)
        if (score > bestScore) {
          bestScore = score
          best = { trio, aceIdx, deploy, aceType }
        }
      }
    }

    const { trio, aceIdx, deploy } = best!
    const flankTypes = deploy.filter((_, j) => trio[j] !== aceIdx)
    const leftType = flankTypes[0]
    const rightType = flankTypes[1] ?? flankTypes[0]
    const aceType = hand[aceIdx]

    this.aiHand = hand.filter((_, i) => !trio.includes(i))
    this.aiReserve = [...this.aiHand]
    this.aiHand = []

    this.board[0][0] = { type: leftType, owner: AI, hidden: false, isAce: false }
    this.board[0][1] = { type: aceType, owner: AI, hidden: true, isAce: true }
    this.board[0][2] = { type: rightType, owner: AI, hidden: false, isAce: false }

    this.addLog(
      tr('log.aiDeploy', { left: pieceName(leftType), right: pieceName(rightType) }),
      'ai',
    )
  }

  private aiPregamePick(): number {
    const counts = countTypes(this.aiReserve)
    return this.aiReserve.reduce(
      (best, t, i) => {
        const score = counts[t]
        return score > (best.score ?? -1) ? { i, score } : best
      },
      { i: 0, score: -1 },
    ).i
  }

  private scheduleAiTurn(delayMs: number): void {
    if (this.aiTurnScheduled) return
    this.aiTurnScheduled = true
    setTimeout(() => {
      this.aiTurnScheduled = false
      this.aiTurn()
    }, delayMs)
  }

  private aiTurn(): void {
    if (this.phase !== 'play' || this.currentPlayer !== AI || this.animationLocked) return
    if (this.tryStalemateAfterMove()) return

    const moves = legalMoves(this.board, AI)
    if (moves.length === 0) {
      if (this.tryStalemateAfterMove()) return
      this.addLog(tr('log.aiNoMoves'), 'ai')
      this.currentPlayer = HUMAN
      this.statusText = tr('status.play.yourTurn')
      return
    }

    const knownHumanAce = this.getHumanAceTypeForAI()
    let candidates = moves
    if (knownHumanAce) {
      const humanAceDuels = moves.filter((m) => {
        if (!m.duel) return false
        const toP = getPiece(this.board, m.to.r, m.to.c)
        return toP?.isAce && toP.owner === HUMAN
      })
      const winningDuels = humanAceDuels.filter((m) => {
        const fromP = getPiece(this.board, m.from.r, m.from.c)!
        return beats(fromP.type, knownHumanAce)
      })

      if (winningDuels.length > 0) {
        // 已知对方王牌类型时，有克制子可决斗则立即进攻
        candidates = winningDuels
      } else {
        // 排除必败/平局的王牌决斗，改走逼近或普通吃子
        candidates = moves.filter((m) => {
          if (!m.duel) return true
          const toP = getPiece(this.board, m.to.r, m.to.c)
          return !(toP?.isAce && toP.owner === HUMAN)
        })
        if (candidates.length === 0) candidates = moves
      }
    }

    let best = candidates[0]
    let bestScore = -Infinity
    for (const m of candidates) {
      const s = this.scoreMove(m, AI)
      if (s > bestScore) {
        bestScore = s
        best = m
      }
    }

    const fromP = getPiece(this.board, best.from.r, best.from.c)!
    this.aiHint = best.duel
      ? tr('ai.duel', { piece: pieceName(fromP.type) })
      : best.capture
        ? tr('ai.capture', {
            piece: pieceName(getPiece(this.board, best.to.r, best.to.c)!.type),
          })
        : tr('ai.move')
    this.addLog(this.aiHint, 'ai')
    this.executeMove(best, AI)
  }

  private getHumanAceTypeForAI(): PieceType | null {
    if (this.aiKnownHumanAce) return this.aiKnownHumanAce
    const pos = acePosition(this.board, HUMAN)
    if (pos && !pos.piece.hidden) return pos.piece.type
    return null
  }

  private inferEnemyAceProbs(): Record<PieceType, number> {
    const known = { rock: 0, scissors: 0, paper: 0 }
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        const p = getPiece(this.board, r, c)
        if (p && p.owner === HUMAN && !p.hidden) known[p.type] += 1
      }
    }
    if (this.preGameRevealed.human) known[this.preGameRevealed.human] += 1
    const weights: Record<PieceType, number> = { rock: 1, scissors: 1, paper: 1 }
    TYPES.forEach((t) => {
      weights[t] = Math.max(0.12, 1.25 - known[t] * 0.38)
    })
    const sum = weights.rock + weights.scissors + weights.paper
    return {
      rock: weights.rock / sum,
      scissors: weights.scissors / sum,
      paper: weights.paper / sum,
    }
  }

  private probBeat(attackerType: PieceType, probs: Record<PieceType, number>): number {
    let p = 0
    for (const t of TYPES) {
      if (beats(attackerType, t)) p += probs[t]
    }
    return p
  }

  private probLoseTo(
    attackerType: PieceType,
    defenderProbs: Record<PieceType, number>,
  ): number {
    let p = 0
    for (const t of TYPES) {
      if (beats(t, attackerType)) p += defenderProbs[t]
    }
    return p
  }

  private scoreMove(move: Move, owner: PlayerId): number {
    const fromP = getPiece(this.board, move.from.r, move.from.c)!
    const toP = getPiece(this.board, move.to.r, move.to.c)
    let score = 0
    const enemy = owner === AI ? HUMAN : AI
    const myAce = acePosition(this.board, owner)
    const enemyAce = acePosition(this.board, enemy)
    const knownHumanAce = owner === AI ? this.getHumanAceTypeForAI() : null

    if (!move.duel && !toP) {
      if (enemyAce) {
        const distBefore = manhattan(move.from, enemyAce)
        const distAfter = manhattan(move.to, enemyAce)
        if (knownHumanAce) {
          if (beats(fromP.type, knownHumanAce)) {
            score += (distBefore - distAfter) * 10
            if (distAfter === 1) score += 35
          } else if (same(fromP.type, knownHumanAce)) {
            score += (distAfter - distBefore) * 2
          } else {
            score += (distAfter - distBefore) * 4
          }
        } else {
          score += (distBefore - distAfter) * 4
        }
      }
      if (myAce && fromP.isAce) score -= 3
    }

    if (move.capture && toP) {
      score += 12
      if (toP.isAce) score += 200
      else score += 6
    }

    if (move.duel && toP?.isAce && toP.owner === HUMAN) {
      const atk = fromP.type
      if (knownHumanAce) {
        if (beats(atk, knownHumanAce)) score += 400
        else if (same(atk, knownHumanAce)) score -= 400
        else score -= 350
        if (fromP.isAce) score += beats(atk, knownHumanAce) ? 40 : -80
      } else {
        const probs = this.inferEnemyAceProbs()
        const pWin = this.probBeat(atk, probs)
        const pLose = this.probLoseTo(atk, probs)
        const pTie = Math.max(0, 1 - pWin - pLose)
        score += pWin * 120 - pLose * 100 + pTie * -25
        if (fromP.isAce) score += 15
      }
    }

    if (move.duel && toP?.isAce && toP.owner === AI) score -= 300

    if (myAce && owner === AI) {
      const threatened = legalMoves(this.board, enemy).some(
        (m) =>
          m.to.r === myAce.r &&
          m.to.c === myAce.c &&
          (m.duel || m.capture),
      )
      if (fromP.isAce && move.duel) score += threatened ? 25 : -10
      if (knownHumanAce && threatened && beats(knownHumanAce, myAce.piece.type)) {
        score -= 20
      }
    }

    score += legalMoves(this.board, owner).length * 0.1
    const jitter = owner === AI && knownHumanAce ? 0.08 : 0.45
    return score + Math.random() * jitter
  }

  private buildMoveVisualEvent(move: Move, owner: PlayerId): MoveVisualEvent {
    const fromP = getPiece(this.board, move.from.r, move.from.c)!
    const toP = getPiece(this.board, move.to.r, move.to.c)
    this.moveVisualSeq += 1
    return {
      seq: this.moveVisualSeq,
      from: { ...move.from },
      to: { ...move.to },
      piece: { ...fromP },
      captured: toP ? { ...toP } : null,
      duel: move.duel,
      owner,
      previewResult: previewApplyMove(this.board, move, owner),
    }
  }

  private executeMove(move: Move, owner: PlayerId): void {
    if (this.animationLocked) return
    this.pendingMove = { move, owner }
    this.pendingMoveVisual = this.buildMoveVisualEvent(move, owner)
    this.animationLocked = true
    this.selectedCell = null
  }

  private finishExecuteMove(move: Move, owner: PlayerId): void {
    const fromP = getPiece(this.board, move.from.r, move.from.c)!
    const toP = getPiece(this.board, move.to.r, move.to.c)

    if (move.duel && toP?.isAce) {
      this.addLog(
        tr('log.duel', {
          attacker: tr(owner === HUMAN ? 'player.you' : 'player.ai'),
          attackerPiece: pieceName(fromP.type),
          defender: tr(owner === HUMAN ? 'player.ai' : 'player.you'),
        }),
        'system',
      )
    }

    const result = applyMove(this.board, move, owner, (t) => this.revealEnemyAce(t), (t) =>
      this.noteHumanAceForAi(t),
    )

    if (result === 'win') {
      if (toP) this.eliminated.push({ type: toP.type, owner: toP.owner, isAce: true })
      this.endGame(owner)
      return
    }

    const winner = checkWin(this.board)
    if (winner) {
      this.endGame(winner)
      return
    }

    if (result === 'pass') {
      this.addLog(tr('log.duelPass'), 'system')
      this.currentPlayer = owner === HUMAN ? AI : HUMAN
    } else if (result === 'lose_piece') {
      this.eliminated.push({
        type: fromP.type,
        owner: fromP.owner,
        isAce: fromP.isAce,
      })
      this.addLog(
        tr('log.pieceLostToAce', {
          owner: tr(owner === HUMAN ? 'player.you' : 'player.ai'),
          piece: pieceName(fromP.type),
        }),
        owner === HUMAN ? 'you' : 'ai',
      )
      this.currentPlayer = owner === HUMAN ? AI : HUMAN
      const w = checkWin(this.board)
      if (w) {
        this.endGame(w)
        return
      }
    } else {
      if (toP && !move.duel) {
        this.eliminated.push({ type: toP.type, owner: toP.owner, isAce: toP.isAce })
      }
      this.currentPlayer = owner === HUMAN ? AI : HUMAN
    }

    this.selectedCell = null

    if (this.tryStalemateAfterMove()) return

    if (this.currentPlayer === HUMAN) {
      this.statusText = tr('status.play.yourTurnSelect')
      this.aiHint = ''
    } else {
      this.statusText = tr('status.play.aiThinking')
      this.scheduleAiTurn(500)
    }
  }

  private tryStalemateAfterMove(): boolean {
    if (this.phase !== 'play') return false
    if (!isTypeStalemate(this.board)) return false
    this.declareTypeStalemate()
    return true
  }

  private declareTypeStalemate(): void {
    if (this.phase !== 'play' && this.phase !== 'stalemate_pending') return
    if (this.stalemateTimer) clearTimeout(this.stalemateTimer)
    this.phase = 'stalemate_pending'
    const onlyType = getAllBoardPieces(this.board)[0]?.type
    this.statusText = tr('status.stalemate.pending')
    this.addLog(tr('log.stalemateField', { piece: pieceName(onlyType!) }), 'system')
    this.stalemateTimer = setTimeout(() => {
      this.stalemateTimer = null
      this.addLog(tr('log.stalemateEnd'), 'system')
      this.endGame('draw')
    }, 1000)
  }

  private endGame(winner: PlayerId | 'draw'): void {
    this.phase = 'end'
    if (this.stalemateTimer) {
      clearTimeout(this.stalemateTimer)
      this.stalemateTimer = null
    }
    if (winner === 'draw') {
      this.status = 'draw'
      this.statusText = tr('status.end.draw')
    } else if (winner === HUMAN) {
      this.status = 'won'
      this.statusText = tr('status.end.won')
    } else {
      this.status = 'lost'
      this.statusText = tr('status.end.lost')
    }
  }

  /** UI 确认按钮 */
  onActionButton(): void {
    if (this.phase === 'setup') this.confirmSetup()
    else if (this.phase === 'pregame') this.confirmPregame()
  }
}
