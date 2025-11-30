"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { ChessBoard } from "./chess-board"
import { MoveHistoryPanel } from "./move-history-panel"
import { AIFeedback } from "./ai-feedback"
import { GameSetupModal } from "./game-setup-modal"
import { EvaluationBar } from "./evaluation-bar"
import { GameControls } from "./game-controls"
import {
  type GameState,
  createInitialState,
  makeMove,
  getValidMoves,
  moveToAlgebraic,
  type Square,
} from "@/lib/chess-engine"
import {
  type DifficultyLevel,
  type PlayerStats,
  createDefaultStats,
  getAIMoveAsync,
  evaluatePlayerMove,
  updateStatsAfterMove,
  updateStatsAfterGame,
  type MoveEvaluation,
  evaluatePosition,
} from "@/lib/adaptive-ai"
import { eloToDifficulty, getAdaptiveDifficulty, STOCKFISH_LEVELS } from "@/lib/stockfish-eval"
import { Button } from "@/components/ui/button"

export function ChessGame() {
  const [gameState, setGameState] = useState<GameState>(createInitialState())
  const [gameHistory, setGameHistory] = useState<GameState[]>([createInitialState()])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null)
  const [validMoves, setValidMoves] = useState<Square[]>([])
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null)
  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null)
  const [isThinking, setIsThinking] = useState(false)
  const [moveNotations, setMoveNotations] = useState<string[]>([])
  const [currentEvaluation, setCurrentEvaluation] = useState<MoveEvaluation | null>(null)
  const [gameEvaluations, setGameEvaluations] = useState<MoveEvaluation[]>([])
  const [aiAnalysis, setAIAnalysis] = useState<string>("")
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [gameStarted, setGameStarted] = useState(false)
  const [playerColor, setPlayerColor] = useState<"w" | "b">("w")
  const [showSetupModal, setShowSetupModal] = useState(false)
  const [currentDifficulty, setCurrentDifficulty] = useState<DifficultyLevel>(5)
  const [positionEval, setPositionEval] = useState<number>(0)

  const aiMoveInProgress = useRef(false)

  useEffect(() => {
    const saved = localStorage.getItem("chessAI_playerStats")
    if (saved) {
      try {
        setPlayerStats(JSON.parse(saved))
      } catch {
        setPlayerStats(null)
      }
    }
  }, [])

  useEffect(() => {
    if (playerStats) {
      localStorage.setItem("chessAI_playerStats", JSON.stringify(playerStats))
    }
  }, [playerStats])

  useEffect(() => {
    setPositionEval(evaluatePosition(gameState))
  }, [gameState])

  useEffect(() => {
    if (!gameStarted || !playerStats) return
    if (gameState.turn === playerColor) return
    if (gameState.isCheckmate || gameState.isStalemate || gameState.isDraw) return
    if (aiMoveInProgress.current) return

    const makeAIMove = async () => {
      aiMoveInProgress.current = true
      setIsThinking(true)

      await new Promise((resolve) => setTimeout(resolve, 300))

      try {
        const aiMove = await getAIMoveAsync(gameState, currentDifficulty, playerStats)

        if (aiMove) {
          const newState = makeMove(gameState, aiMove.from, aiMove.to)
          if (newState) {
            setGameState(newState)
            setGameHistory((prev) => [...prev.slice(0, historyIndex + 1), newState])
            setHistoryIndex((prev) => prev + 1)
            setLastMove(aiMove)
            const notation = moveToAlgebraic(gameState, newState.history[newState.history.length - 1])
            setMoveNotations((prev) => [...prev, notation])
          }
        }
      } catch (error) {
        console.error("AI move error:", error)
      } finally {
        setIsThinking(false)
        aiMoveInProgress.current = false
      }
    }

    makeAIMove()
  }, [gameState, gameStarted, playerColor, currentDifficulty, playerStats, historyIndex])

  useEffect(() => {
    if (!playerStats) return
    if (gameState.isCheckmate || gameState.isStalemate || gameState.isDraw) {
      let result: "win" | "loss" | "draw"
      if (gameState.isCheckmate) {
        result = gameState.turn === playerColor ? "loss" : "win"
      } else {
        result = "draw"
      }
      setPlayerStats((prev) => (prev ? updateStatsAfterGame(prev, result, currentDifficulty) : prev))
    }
  }, [
    gameState.isCheckmate,
    gameState.isStalemate,
    gameState.isDraw,
    gameState.turn,
    playerColor,
    currentDifficulty,
    playerStats,
  ])

  const requestAIAnalysis = async (state: GameState, evaluation: MoveEvaluation) => {
    if (evaluation.type === "good" || evaluation.type === "excellent") return

    setIsAnalyzing(true)
    try {
      const response = await fetch("/api/analyze-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameState: state,
          evaluation,
          moveHistory: moveNotations,
          playerStats: playerStats
            ? { skillRating: playerStats.skillRating, averageAccuracy: playerStats.averageAccuracy }
            : null,
        }),
      })
      const data = await response.json()
      setAIAnalysis(data.analysis)
    } catch (error) {
      console.error("Failed to get AI analysis:", error)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleSquareClick = useCallback(
    (square: Square) => {
      if (!gameStarted || !playerStats) return
      if (gameState.turn !== playerColor) return
      if (isThinking) return
      if (gameState.isCheckmate || gameState.isStalemate || gameState.isDraw) return

      const [row, col] = [8 - Number.parseInt(square[1]), square.charCodeAt(0) - 97]
      const clickedPiece = gameState.board[row]?.[col]

      if (selectedSquare) {
        if (clickedPiece && clickedPiece.color === playerColor) {
          setSelectedSquare(square)
          setValidMoves(getValidMoves(gameState, square))
          return
        }

        if (validMoves.includes(square)) {
          const stateBefore = gameState
          const newState = makeMove(gameState, selectedSquare, square)

          if (newState) {
            const evaluation = evaluatePlayerMove(stateBefore, selectedSquare, square)
            setCurrentEvaluation(evaluation)
            setGameEvaluations((prev) => [...prev, evaluation])
            setPlayerStats((prev) => (prev ? updateStatsAfterMove(prev, evaluation) : prev))

            if (evaluation.type !== "good" && evaluation.type !== "excellent") {
              requestAIAnalysis(stateBefore, evaluation)
            } else {
              setAIAnalysis("")
            }

            setGameState(newState)
            setGameHistory((prev) => [...prev.slice(0, historyIndex + 1), newState])
            setHistoryIndex((prev) => prev + 1)
            setLastMove({ from: selectedSquare, to: square })
            const notation = moveToAlgebraic(stateBefore, newState.history[newState.history.length - 1])
            setMoveNotations((prev) => [...prev, notation])

            const newDifficulty = getAdaptiveDifficulty(
              eloToDifficulty(playerStats.skillRating),
              playerStats,
              gameEvaluations,
            ) as DifficultyLevel
            setCurrentDifficulty(newDifficulty)
          }
        }

        setSelectedSquare(null)
        setValidMoves([])
      } else {
        if (clickedPiece && clickedPiece.color === playerColor) {
          setSelectedSquare(square)
          setValidMoves(getValidMoves(gameState, square))
        }
      }
    },
    [
      gameState,
      selectedSquare,
      validMoves,
      gameStarted,
      playerColor,
      isThinking,
      playerStats,
      gameEvaluations,
      historyIndex,
    ],
  )

  const handleStartGame = (color: "w" | "b", initialElo: number) => {
    const stats = playerStats || createDefaultStats(initialElo)
    setPlayerStats(stats)
    setPlayerColor(color)
    const difficulty = eloToDifficulty(stats.skillRating) as DifficultyLevel
    setCurrentDifficulty(difficulty)

    const initialState = createInitialState()
    setGameState(initialState)
    setGameHistory([initialState])
    setHistoryIndex(0)
    setSelectedSquare(null)
    setValidMoves([])
    setLastMove(null)
    setMoveNotations([])
    setCurrentEvaluation(null)
    setGameEvaluations([])
    setAIAnalysis("")
    setShowSetupModal(false)
    aiMoveInProgress.current = false
    setGameStarted(true)
  }

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = Math.max(0, historyIndex - 2)
      setHistoryIndex(newIndex)
      setGameState(gameHistory[newIndex])
      setMoveNotations((prev) => prev.slice(0, newIndex))
      setSelectedSquare(null)
      setValidMoves([])
      setLastMove(null)
    }
  }

  const handleRedo = () => {
    if (historyIndex < gameHistory.length - 1) {
      const newIndex = Math.min(gameHistory.length - 1, historyIndex + 2)
      setHistoryIndex(newIndex)
      setGameState(gameHistory[newIndex])
    }
  }

  const handleCopyPGN = () => {
    const pairs: string[] = []
    for (let i = 0; i < moveNotations.length; i += 2) {
      const moveNum = Math.floor(i / 2) + 1
      const white = moveNotations[i]
      const black = moveNotations[i + 1] || ""
      pairs.push(`${moveNum}. ${white} ${black}`)
    }
    navigator.clipboard.writeText(pairs.join(" "))
  }

  const handleNewGame = () => {
    setShowSetupModal(true)
  }

  const isFirstGame = !playerStats || playerStats.gamesPlayed === 0
  const aiElo = STOCKFISH_LEVELS[currentDifficulty]?.elo || 1000

  return (
    <div className="h-screen w-screen bg-background overflow-hidden flex flex-col">
      <GameSetupModal
        open={showSetupModal}
        onStartGame={handleStartGame}
        isFirstGame={isFirstGame}
        currentElo={playerStats?.skillRating || 1000}
      />

      {/* Compact Header */}
      <header className="flex-shrink-0 h-12 px-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
            C
          </div>
          <span className="font-bold text-foreground">ChessMind AI</span>
        </div>

        {gameStarted && playerStats ? (
          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">
              ELO: <span className="font-mono font-bold text-primary">{playerStats.skillRating}</span>
            </span>
            <span className="text-muted-foreground">
              vs AI: <span className="font-mono">~{aiElo}</span>
            </span>
            <span className="text-muted-foreground">
              Lv: <span className="font-bold">{currentDifficulty}</span>
            </span>
          </div>
        ) : (
          <Button size="sm" onClick={() => setShowSetupModal(true)} className="h-7 px-3 text-xs">
            Start Game
          </Button>
        )}
      </header>

      {/* Main Content - fills remaining height */}
      <main className="flex-1 min-h-0 flex">
        {/* Left: Evaluation Bar */}
        <div className="flex-shrink-0 w-8 p-1 flex items-stretch">
          <EvaluationBar evaluation={positionEval} playerColor={playerColor} />
        </div>

        {/* Center: Chess Board - takes available space */}
        <div className="flex-shrink-0 p-2 flex items-center justify-center">
          <ChessBoard
            gameState={gameState}
            selectedSquare={selectedSquare}
            validMoves={validMoves}
            lastMove={lastMove}
            onSquareClick={handleSquareClick}
            flipped={playerColor === "b"}
            isThinking={isThinking}
            playerColor={playerColor}
          />
        </div>

        {/* Right: Sidebar - fills remaining width */}
        <div className="flex-1 min-w-0 flex flex-col p-2 pl-0 gap-2">
          {/* AI Feedback */}
          <div className="flex-shrink-0">
            <AIFeedback
              evaluation={currentEvaluation}
              analysis={aiAnalysis}
              isAnalyzing={isAnalyzing}
              isThinking={isThinking}
              playerStats={playerStats}
              aiElo={aiElo}
              difficulty={currentDifficulty}
            />
          </div>

          {/* Move History - fills remaining space */}
          <div className="flex-1 min-h-0">
            <MoveHistoryPanel moveNotations={moveNotations} gameState={gameState} isThinking={isThinking} />
          </div>

          {/* Game Controls */}
          <div className="flex-shrink-0">
            <GameControls
              onUndo={handleUndo}
              onRedo={handleRedo}
              onCopyPGN={handleCopyPGN}
              onNewGame={handleNewGame}
              canUndo={historyIndex > 0 && gameStarted}
              canRedo={historyIndex < gameHistory.length - 1}
              gameStarted={gameStarted}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
