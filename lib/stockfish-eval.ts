import type { PlayerStats, MoveEvaluation } from "./adaptive-ai"

// Stockfish-style centipawn evaluation thresholds
export const STOCKFISH_THRESHOLDS = {
  BRILLIANT: -200, // Player found a move better than expected
  EXCELLENT: -50, // Very close to best move
  GOOD: 0, // Acceptable move
  INACCURACY: 50, // Small mistake (0.5 pawns)
  MISTAKE: 150, // Medium mistake (1.5 pawns)
  BLUNDER: 300, // Big mistake (3+ pawns)
}

// Stockfish-style difficulty levels mapped to ELO ranges
export const STOCKFISH_LEVELS: Record<number, { elo: number; depth: number; errorRate: number; blunderRate: number }> =
  {
    1: { elo: 400, depth: 1, errorRate: 0.4, blunderRate: 0.15 },
    2: { elo: 600, depth: 1, errorRate: 0.35, blunderRate: 0.12 },
    3: { elo: 800, depth: 2, errorRate: 0.3, blunderRate: 0.1 },
    4: { elo: 1000, depth: 2, errorRate: 0.25, blunderRate: 0.08 },
    5: { elo: 1200, depth: 3, errorRate: 0.2, blunderRate: 0.06 },
    6: { elo: 1400, depth: 3, errorRate: 0.15, blunderRate: 0.04 },
    7: { elo: 1600, depth: 4, errorRate: 0.1, blunderRate: 0.02 },
    8: { elo: 1800, depth: 4, errorRate: 0.05, blunderRate: 0.01 },
    9: { elo: 2000, depth: 5, errorRate: 0.02, blunderRate: 0.005 },
    10: { elo: 2200, depth: 5, errorRate: 0.01, blunderRate: 0.002 },
  }

// Convert player ELO to AI difficulty level
export function eloToDifficulty(playerElo: number): number {
  if (playerElo <= 500) return 1
  if (playerElo <= 700) return 2
  if (playerElo <= 900) return 3
  if (playerElo <= 1100) return 4
  if (playerElo <= 1300) return 5
  if (playerElo <= 1500) return 6
  if (playerElo <= 1700) return 7
  if (playerElo <= 1900) return 8
  if (playerElo <= 2100) return 9
  return 10
}

// Calculate ELO change after a game (standard ELO formula)
export function calculateEloChange(playerElo: number, opponentElo: number, result: "win" | "loss" | "draw"): number {
  // K-factor based on rating
  const K = playerElo < 1000 ? 40 : playerElo < 1400 ? 32 : playerElo < 2000 ? 24 : 16

  // Expected score
  const expectedScore = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400))

  // Actual score
  const actualScore = result === "win" ? 1 : result === "draw" ? 0.5 : 0

  // ELO change
  return Math.round(K * (actualScore - expectedScore))
}

// Calculate accuracy percentage from move evaluations (Stockfish-style)
export function calculateAccuracy(evaluations: MoveEvaluation[]): number {
  if (evaluations.length === 0) return 100

  let totalAccuracy = 0
  for (const eval_ of evaluations) {
    switch (eval_.type) {
      case "brilliant":
        totalAccuracy += 100
        break
      case "excellent":
        totalAccuracy += 95
        break
      case "good":
        totalAccuracy += 85
        break
      case "inaccuracy":
        totalAccuracy += 65
        break
      case "mistake":
        totalAccuracy += 40
        break
      case "blunder":
        totalAccuracy += 15
        break
    }
  }

  return Math.round(totalAccuracy / evaluations.length)
}

// Get move grade based on centipawn loss (Stockfish-style)
export function getMoveGrade(centipawnLoss: number): MoveEvaluation["type"] {
  if (centipawnLoss <= STOCKFISH_THRESHOLDS.BRILLIANT) return "brilliant"
  if (centipawnLoss <= STOCKFISH_THRESHOLDS.EXCELLENT) return "excellent"
  if (centipawnLoss <= STOCKFISH_THRESHOLDS.GOOD) return "good"
  if (centipawnLoss <= STOCKFISH_THRESHOLDS.INACCURACY) return "inaccuracy"
  if (centipawnLoss <= STOCKFISH_THRESHOLDS.MISTAKE) return "mistake"
  return "blunder"
}

// Adaptive difficulty adjustment based on player performance
export function getAdaptiveDifficulty(
  baseDifficulty: number,
  stats: PlayerStats,
  gameEvaluations: MoveEvaluation[],
): number {
  let adjustment = 0

  // Recent game accuracy adjustment
  const recentAccuracy = calculateAccuracy(gameEvaluations)
  if (recentAccuracy > 85 && gameEvaluations.length >= 5) {
    adjustment += 1 // Player is doing very well
  } else if (recentAccuracy < 50 && gameEvaluations.length >= 5) {
    adjustment -= 1 // Player is struggling
  }

  // Win streak adjustment
  if (stats.currentStreak >= 3) {
    adjustment += 1
  } else if (stats.currentStreak <= -3) {
    adjustment -= 1
  }

  // Blunder rate adjustment
  const blunderRate =
    gameEvaluations.length > 0 ? gameEvaluations.filter((e) => e.type === "blunder").length / gameEvaluations.length : 0
  if (blunderRate > 0.2 && gameEvaluations.length >= 5) {
    adjustment -= 1 // Too many blunders, ease up
  }

  // Clamp to valid range
  return Math.max(1, Math.min(10, baseDifficulty + adjustment))
}

// Get AI opponent's effective ELO based on difficulty and adaptation
export function getAIOpponentElo(difficulty: number, adaptiveBonus = 0): number {
  const baseElo = STOCKFISH_LEVELS[difficulty]?.elo || 1000
  return baseElo + adaptiveBonus
}

// Generate Stockfish-style evaluation bar value (-1 to 1, where positive is white advantage)
export function getEvaluationBarValue(centipawns: number): number {
  // Use a sigmoid-like function to map centipawns to -1 to 1 range
  const maxAdvantage = 1000 // 10 pawns = fully winning
  return Math.tanh(centipawns / maxAdvantage)
}

// Get evaluation description
export function getEvaluationDescription(centipawns: number): string {
  const pawns = centipawns / 100
  if (Math.abs(pawns) < 0.3) return "Equal position"
  if (Math.abs(pawns) < 1) return `Slight ${pawns > 0 ? "white" : "black"} advantage`
  if (Math.abs(pawns) < 2) return `${pawns > 0 ? "White" : "Black"} is better`
  if (Math.abs(pawns) < 5) return `${pawns > 0 ? "White" : "Black"} has a winning advantage`
  return `${pawns > 0 ? "White" : "Black"} is winning`
}
