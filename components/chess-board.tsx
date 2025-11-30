"use client"






/*{isThinking && (
        <div className="absolute inset-0 bg-background/20 flex items-center justify-center rounded">
          <div className="bg-card px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2 border border-border">
            <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            <span className="text-xs font-medium text-foreground">AI thinking...</span>
          </div>
        </div>
      )}*/
import { type GameState, getPieceAt, type Square, coordsToSquare } from "@/lib/chess-engine"
import { cn } from "@/lib/utils"

type ChessBoardProps = {
  gameState: GameState
  selectedSquare: Square | null
  validMoves: Square[]
  lastMove: { from: Square; to: Square } | null
  onSquareClick: (square: Square) => void
  flipped?: boolean
  isThinking?: boolean
  playerColor?: "w" | "b"
}

const PIECE_SYMBOLS: Record<string, string> = {
  wp: "♙",
  wn: "♘",
  wb: "♗",
  wr: "♖",
  wq: "♕",
  wk: "♔",
  bp: "♟",
  bn: "♞",
  bb: "♝",
  br: "♜",
  bq: "♛",
  bk: "♚",
}

export function ChessBoard({
  gameState,
  selectedSquare,
  validMoves,
  lastMove,
  onSquareClick,
  flipped = false,
  isThinking = false,
  playerColor = "w",
}: ChessBoardProps) {
  const rows = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7]
  const cols = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7]

  const renderSquare = (row: number, col: number) => {
    const square = coordsToSquare(row, col)
    const piece = getPieceAt(gameState, square)
    const isLight = (row + col) % 2 === 0
    const isSelected = selectedSquare === square
    const isValidMove = validMoves.includes(square)
    const isLastMoveSquare = lastMove?.from === square || lastMove?.to === square
    const isCheck = piece?.type === "k" && piece.color === gameState.turn && gameState.isCheck
    const hasPiece = piece !== null
    const isPlayerPiece = piece?.color === playerColor
    const isPlayerTurn = gameState.turn === playerColor

    return (
      <button
        key={square}
        onClick={() => onSquareClick(square)}
        disabled={isThinking}
        className={cn(
          "relative aspect-square flex items-center justify-center transition-all",
          "text-2xl sm:text-3xl md:text-4xl lg:text-5xl",
          isLight ? "bg-board-light" : "bg-board-dark",
          isLight && "wood-texture",
          isSelected && "ring-2 ring-primary ring-inset",
          isLastMoveSquare && "bg-highlight-last",
          isCheck && "bg-highlight-check",
          isThinking && "cursor-not-allowed opacity-80",
          !isThinking && isPlayerPiece && isPlayerTurn && !isSelected && "hover:brightness-110 cursor-pointer",
        )}
      >
        {isValidMove && (
          <div
            className={cn(
              "absolute inset-0 flex items-center justify-center z-10",
              hasPiece ? "ring-2 ring-inset ring-primary/60" : "",
            )}
          >
            {!hasPiece && <div className="w-2 h-2 md:w-3 md:h-3 rounded-full bg-primary/50" />}
          </div>
        )}

        {piece && (
          <span
            className={cn(
              "select-none drop-shadow-md transition-transform relative z-0",
              piece.color === "w" ? "text-white [text-shadow:_1px_1px_2px_rgb(0_0_0_/_60%)]" : "text-gray-900",
              isSelected && "scale-110",
            )}
          >
            {PIECE_SYMBOLS[piece.color + piece.type]}
          </span>
        )}

        {col === (flipped ? 7 : 0) && (
          <span className="absolute left-0.5 top-0.5 text-[9px] font-medium text-muted-foreground/70">{8 - row}</span>
        )}
        {row === (flipped ? 0 : 7) && (
          <span className="absolute right-0.5 bottom-0.5 text-[9px] font-medium text-muted-foreground/70">
            {String.fromCharCode(97 + col)}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="relative">
      <div
        className="grid grid-cols-8 rounded overflow-hidden border-4 border-board-border shadow-xl"
        style={{
          width: "calc(100vh - 80px)",
          height: "calc(100vh - 80px)",
          maxWidth: "600px",
          maxHeight: "600px",
        }}
      >
        {rows.map((row) => cols.map((col) => renderSquare(row, col)))}
      </div>

      
    </div>
  )
}
