import { type GameState, getAllLegalMoves, makeMove, type Piece, type PieceType, type Square } from "./chess-engine"
import { STOCKFISH_LEVELS, getMoveGrade, STOCKFISH_THRESHOLDS, calculateEloChange } from "./stockfish-eval"

export type DifficultyLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

export type PlayerStats = {
  gamesPlayed: number
  wins: number
  losses: number
  draws: number
  blunders: number
  mistakes: number
  inaccuracies: number
  goodMoves: number
  excellentMoves: number
  brilliantMoves: number
  averageAccuracy: number
  currentStreak: number
  skillRating: number
  tacticsScore: number
  positionScore: number
  endgameScore: number
  totalCentipawnLoss: number
  totalMovesAnalyzed: number
}

export type MoveEvaluation = {
  from: Square
  to: Square
  score: number
  type: "blunder" | "mistake" | "inaccuracy" | "good" | "excellent" | "brilliant"
  bestMove?: { from: Square; to: Square; score: number }
  centipawnLoss: number
  explanation?: string
}

const PIECE_VALUES: Record<PieceType, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
}

const PAWN_TABLE = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [5, 5, 10, 25, 25, 10, 5, 5],
  [0, 0, 0, 20, 20, 0, 0, 0],
  [5, -5, -10, 0, 0, -10, -5, 5],
  [5, 10, 10, -20, -20, 10, 10, 5],
  [0, 0, 0, 0, 0, 0, 0, 0],
]

const KNIGHT_TABLE = [
  [-50, -40, -30, -30, -30, -30, -40, -50],
  [-40, -20, 0, 0, 0, 0, -20, -40],
  [-30, 0, 10, 15, 15, 10, 0, -30],
  [-30, 5, 15, 20, 20, 15, 5, -30],
  [-30, 0, 15, 20, 20, 15, 0, -30],
  [-30, 5, 10, 15, 15, 10, 5, -30],
  [-40, -20, 0, 5, 5, 0, -20, -40],
  [-50, -40, -30, -30, -30, -30, -40, -50],
]

const BISHOP_TABLE = [
  [-20, -10, -10, -10, -10, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 10, 10, 5, 0, -10],
  [-10, 5, 5, 10, 10, 5, 5, -10],
  [-10, 0, 10, 10, 10, 10, 0, -10],
  [-10, 10, 10, 10, 10, 10, 10, -10],
  [-10, 5, 0, 0, 0, 0, 5, -10],
  [-20, -10, -10, -10, -10, -10, -10, -20],
]

const ROOK_TABLE = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [5, 10, 10, 10, 10, 10, 10, 5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [0, 0, 0, 5, 5, 0, 0, 0],
]

const KING_TABLE = [
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-20, -30, -30, -40, -40, -30, -30, -20],
  [-10, -20, -20, -20, -20, -20, -20, -10],
  [20, 20, 0, 0, 0, 0, 20, 20],
  [20, 30, 10, 0, 0, 10, 30, 20],
]

function getPieceSquareValue(piece: Piece, row: number, col: number): number {
  if (!piece) return 0

  const isWhite = piece.color === "w"
  const r = isWhite ? row : 7 - row

  let table: number[][]
  switch (piece.type) {
    case "p":
      table = PAWN_TABLE
      break
    case "n":
      table = KNIGHT_TABLE
      break
    case "b":
      table = BISHOP_TABLE
      break
    case "r":
      table = ROOK_TABLE
      break
    case "q":
      table = BISHOP_TABLE
      break
    case "k":
      table = KING_TABLE
      break
    default:
      return 0
  }

  return table[r][col]
}

export function evaluatePosition(state: GameState): number {
  let score = 0

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = state.board[row][col]
      if (piece) {
        const value = PIECE_VALUES[piece.type] + getPieceSquareValue(piece, row, col)
        score += piece.color === "w" ? value : -value
      }
    }
  }

  if (state.isCheckmate) {
    score = state.turn === "w" ? -99999 : 99999
  }

  return score
}

function minimax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
  noiseLevel: number,
  nodeCount: { count: number },
  maxNodes: number,
): number {
  nodeCount.count++

  if (nodeCount.count > maxNodes) {
    return evaluatePosition(state)
  }

  if (depth === 0 || state.isCheckmate || state.isStalemate || state.isDraw) {
    const eval_ = evaluatePosition(state)
    const noise = (Math.random() - 0.5) * noiseLevel * 100
    return eval_ + noise
  }

  const moves = getAllLegalMoves(state)

  const maxMoves = Math.min(moves.length, depth > 1 ? 10 : 20)
  const limitedMoves = moves.slice(0, maxMoves)

  if (maximizing) {
    let maxEval = Number.NEGATIVE_INFINITY
    for (const { from, to } of limitedMoves) {
      const newState = makeMove(state, from, to)
      if (newState) {
        const eval_ = minimax(newState, depth - 1, alpha, beta, false, noiseLevel, nodeCount, maxNodes)
        maxEval = Math.max(maxEval, eval_)
        alpha = Math.max(alpha, eval_)
        if (beta <= alpha) break
      }
    }
    return maxEval
  } else {
    let minEval = Number.POSITIVE_INFINITY
    for (const { from, to } of limitedMoves) {
      const newState = makeMove(state, from, to)
      if (newState) {
        const eval_ = minimax(newState, depth - 1, alpha, beta, true, noiseLevel, nodeCount, maxNodes)
        minEval = Math.min(minEval, eval_)
        beta = Math.min(beta, eval_)
        if (beta <= alpha) break
      }
    }
    return minEval
  }
}

export async function getAIMoveAsync(
  state: GameState,
  difficulty: DifficultyLevel,
  playerStats: PlayerStats,
): Promise<{ from: Square; to: Square } | null> {
  return new Promise((resolve) => {
    // Use setTimeout to allow UI to update
    setTimeout(() => {
      const result = getAIMove(state, difficulty, playerStats)
      resolve(result)
    }, 10)
  })
}

export function getAIMove(
  state: GameState,
  difficulty: DifficultyLevel,
  playerStats: PlayerStats,
): { from: Square; to: Square } | null {
  const moves = getAllLegalMoves(state)
  if (moves.length === 0) return null

  const levelParams = STOCKFISH_LEVELS[difficulty]
  const depth = Math.min(levelParams.depth, 2)
  const { errorRate, blunderRate } = levelParams

  const noiseLevel = Math.max(0, (10 - difficulty) / 5)

  // Occasionally make a random move (blunder)
  if (Math.random() < blunderRate) {
    return moves[Math.floor(Math.random() * moves.length)]
  }

  const maxNodes = 5000
  const nodeCount = { count: 0 }

  const scoredMoves: { move: (typeof moves)[0]; score: number }[] = []

  for (const move of moves) {
    if (nodeCount.count > maxNodes) break

    const newState = makeMove(state, move.from, move.to)
    if (newState) {
      const score = minimax(
        newState,
        depth - 1,
        Number.NEGATIVE_INFINITY,
        Number.POSITIVE_INFINITY,
        state.turn === "b",
        noiseLevel,
        nodeCount,
        maxNodes,
      )
      scoredMoves.push({ move, score })
    }
  }

  scoredMoves.sort((a, b) => (state.turn === "w" ? b.score - a.score : a.score - b.score))

  // At lower difficulties, sometimes pick a suboptimal move
  if (Math.random() < errorRate && scoredMoves.length > 1) {
    const poolSize = Math.min(5, scoredMoves.length)
    const index = Math.floor(Math.random() * poolSize)
    return scoredMoves[index].move
  }

  return scoredMoves[0]?.move || moves[0]
}

export function evaluatePlayerMove(stateBefore: GameState, from: Square, to: Square): MoveEvaluation {
  const moves = getAllLegalMoves(stateBefore)

  const maxNodes = 2000
  const nodeCount = { count: 0 }

  const scoredMoves: { from: Square; to: Square; score: number }[] = []

  for (const move of moves) {
    if (nodeCount.count > maxNodes) break

    const newState = makeMove(stateBefore, move.from, move.to)
    if (newState) {
      const score = minimax(
        newState,
        1, // Reduced depth for faster evaluation
        Number.NEGATIVE_INFINITY,
        Number.POSITIVE_INFINITY,
        stateBefore.turn === "b",
        0,
        nodeCount,
        maxNodes,
      )
      scoredMoves.push({ from: move.from, to: move.to, score })
    }
  }

  scoredMoves.sort((a, b) => (stateBefore.turn === "w" ? b.score - a.score : a.score - b.score))

  const bestMove = scoredMoves[0]
  const playerMove = scoredMoves.find((m) => m.from === from && m.to === to)

  if (!bestMove || !playerMove) {
    return { from, to, score: 0, type: "good", centipawnLoss: 0 }
  }

  const centipawnLoss = stateBefore.turn === "w" ? bestMove.score - playerMove.score : playerMove.score - bestMove.score

  const type = getMoveGrade(centipawnLoss)

  return {
    from,
    to,
    score: playerMove.score,
    type,
    centipawnLoss,
    bestMove:
      centipawnLoss > STOCKFISH_THRESHOLDS.GOOD
        ? { from: bestMove.from, to: bestMove.to, score: bestMove.score }
        : undefined,
  }
}

export function createDefaultStats(initialElo = 1000): PlayerStats {
  return {
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    blunders: 0,
    mistakes: 0,
    inaccuracies: 0,
    goodMoves: 0,
    excellentMoves: 0,
    brilliantMoves: 0,
    averageAccuracy: 70,
    currentStreak: 0,
    skillRating: initialElo,
    tacticsScore: 50,
    positionScore: 50,
    endgameScore: 50,
    totalCentipawnLoss: 0,
    totalMovesAnalyzed: 0,
  }
}

export function updateStatsAfterMove(stats: PlayerStats, evaluation: MoveEvaluation): PlayerStats {
  const newStats = { ...stats }

  switch (evaluation.type) {
    case "blunder":
      newStats.blunders++
      break
    case "mistake":
      newStats.mistakes++
      break
    case "inaccuracy":
      newStats.inaccuracies++
      break
    case "good":
      newStats.goodMoves++
      break
    case "excellent":
      newStats.excellentMoves++
      break
    case "brilliant":
      newStats.brilliantMoves++
      break
  }

  newStats.totalCentipawnLoss += Math.max(0, evaluation.centipawnLoss)
  newStats.totalMovesAnalyzed++

  const avgCentipawnLoss = newStats.totalCentipawnLoss / newStats.totalMovesAnalyzed
  newStats.averageAccuracy = Math.round(Math.max(50, 100 - avgCentipawnLoss / 3))

  return newStats
}

export function updateStatsAfterGame(
  stats: PlayerStats,
  result: "win" | "loss" | "draw",
  aiDifficulty: number,
): PlayerStats {
  const newStats = { ...stats }
  newStats.gamesPlayed++

  const aiElo = STOCKFISH_LEVELS[aiDifficulty]?.elo || 1000
  const eloChange = calculateEloChange(stats.skillRating, aiElo, result)

  switch (result) {
    case "win":
      newStats.wins++
      newStats.currentStreak = Math.max(0, newStats.currentStreak) + 1
      break
    case "loss":
      newStats.losses++
      newStats.currentStreak = Math.min(0, newStats.currentStreak) - 1
      break
    case "draw":
      newStats.draws++
      newStats.currentStreak = 0
      break
  }

  newStats.skillRating = Math.max(100, newStats.skillRating + eloChange)

  return newStats
}

export function generateMoveHint(evaluation: MoveEvaluation): string {
  const cpLoss = evaluation.centipawnLoss

  if (evaluation.type === "brilliant") return "Brilliant! You found an exceptional move!"
  if (evaluation.type === "excellent") return "Excellent move! Nearly perfect play."
  if (evaluation.type === "good") return "Good move. Solid continuation."
  if (evaluation.type === "inaccuracy") {
    return `Inaccuracy (${cpLoss} cp lost). ${evaluation.bestMove ? `Best was ${evaluation.bestMove.from}-${evaluation.bestMove.to}` : ""}`
  }
  if (evaluation.type === "mistake") {
    return `Mistake (${cpLoss} cp lost). ${evaluation.bestMove ? `${evaluation.bestMove.from}-${evaluation.bestMove.to} was stronger.` : ""}`
  }
  if (evaluation.type === "blunder") {
    return `Blunder! (${cpLoss} cp lost). ${evaluation.bestMove ? `You missed ${evaluation.bestMove.from}-${evaluation.bestMove.to}.` : ""}`
  }
  return ""
}
