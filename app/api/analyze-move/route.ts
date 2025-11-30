import { GoogleGenAI } from "@google/genai"
import { gameStateToFEN, type GameState } from "@/lib/chess-engine"
import type { MoveEvaluation } from "@/lib/adaptive-ai"

export const maxDuration = 30

export async function POST(req: Request) {
  const {
    gameState,
    evaluation,
    moveHistory,
    playerStats,
  }: {
    gameState: GameState
    evaluation: MoveEvaluation
    moveHistory: string[]
    playerStats: { skillRating: number; averageAccuracy: number } | null
  } = await req.json()

  const fen = gameStateToFEN(gameState)

  const prompt = `You are a chess coach analyzing a player's move. Be encouraging but honest.

Current position (FEN): ${fen}
Move played: ${evaluation.from} to ${evaluation.to}
Move evaluation: ${evaluation.type}
Centipawn loss: ${evaluation.centipawnLoss || 0} cp
${evaluation.bestMove ? `Better move was: ${evaluation.bestMove.from} to ${evaluation.bestMove.to}` : ""}
Recent moves: ${moveHistory.slice(-10).join(", ") || "Game just started"}
Player ELO rating: ~${playerStats?.skillRating || 1000}
Player accuracy this game: ${playerStats?.averageAccuracy || 70}%

Provide a brief, helpful comment (2-3 sentences max) about this move:
- If it's a blunder/mistake: Explain WHY it's bad and what tactical/strategic element they missed
- If it's an inaccuracy: Gently point out the better continuation
- If it's good/excellent/brilliant: Encourage them and explain what made it strong
- If there's a tactical theme (fork, pin, skewer, discovered attack, etc.), mention it
- Tailor your language to their skill level (simpler for lower ELO, more technical for higher)
- Be conversational and supportive, like a friendly coach

Response (keep it short and helpful):`
  const GEMINI_API_URL = process.env.GEMINI_API_URL;
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY});
    try {
    const { text } = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      maxOutputTokens: 300,
      temperature: 0.7,
    })
    return Response.json({ analysis:text });
  }
  /*try {
    const { text } = await generateText({
      model: "google/gemini-2.5-pro-preview-06-05",
      prompt,
      maxOutputTokens: 200,
      temperature: 0.7,
    })

    return Response.json({ analysis: text })}
  */catch (error) {
    console.error("AI analysis error:", error)
    const fallback = getFallbackAnalysis(evaluation)
    return Response.json({ analysis: fallback })
  }
}

function getFallbackAnalysis(evaluation: MoveEvaluation): string {
  const cpLoss = evaluation.centipawnLoss || 0

  switch (evaluation.type) {
    case "brilliant":
      return "Brilliant! You found an exceptional move that significantly improves your position."
    case "excellent":
      return "Excellent move! You're playing with great precision and understanding."
    case "good":
      return "Solid move. Keep up the good play!"
    case "inaccuracy":
      return `Small inaccuracy (${cpLoss}cp loss). ${evaluation.bestMove ? `${evaluation.bestMove.from}-${evaluation.bestMove.to} would give you a slightly better position.` : "Look for more active moves."}`
    case "mistake":
      return `That's a mistake (${cpLoss}cp loss). ${evaluation.bestMove ? `${evaluation.bestMove.from}-${evaluation.bestMove.to} was stronger.` : ""} Think about piece activity and king safety!`
    case "blunder":
      return `Significant error (${cpLoss}cp loss)! ${evaluation.bestMove ? `${evaluation.bestMove.from}-${evaluation.bestMove.to} was much better.` : ""} Take your time and check for tactics before moving.`
    default:
      return "Interesting move. Let's see how the game develops."
  }
}
