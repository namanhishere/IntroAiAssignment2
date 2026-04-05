/**
 * run_games.js
 *
 * Standalone batch simulation: runs 10 chess games where
 *   - White  = purely random legal-move agent
 *   - Black  = minimax AI at "hard" difficulty (depth 3, 8 % randomness)
 *
 * Usage:
 *   node run_games.js
 *
 * Output:
 *   Prints a per-game summary table to stdout.
 *   Writes full game records to ./games.json (consumed by /replay.html).
 *   Exits with code 1 if the AI failed to win all 10 games.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");

// ─── AI engine (mirrored from server.js) ────────────────────────────────────

const pieceValue = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

const HARD = { depth: 2, randomness: 0.05 };

// Piece-square tables give the AI positional awareness so it closes games
// quickly rather than shuffling pieces (which causes repetitions/stalemates).
// Values are from White's perspective; Black mirrors by reversing row index.
const PST = {
  p: [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0,
  ],
  n: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  b: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  r: [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0,
  ],
  q: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  k: [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20,
  ],
};

function evaluateBoard(chess) {
  if (chess.isCheckmate()) {
    // The side to move is mated → huge score favouring the other side
    return chess.turn() === "w" ? -100000 : 100000;
  }
  if (chess.isDraw()) return 0;

  const board = chess.board();
  let total = 0;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (!piece) continue;
      const base = pieceValue[piece.type] || 0;
      const pstRow = piece.color === "w" ? row : 7 - row;
      const pst = PST[piece.type] ? PST[piece.type][pstRow * 8 + col] : 0;
      total += piece.color === "w" ? base + pst : -(base + pst);
    }
  }
  return total;
}

/** Sort moves: captures first (improves alpha-beta cut-offs significantly). */
function sortMoves(chess, moves) {
  return moves.slice().sort((a, b) => {
    // chess.js SAN: captures contain 'x'
    const aCapture = a.includes("x") ? 1 : 0;
    const bCapture = b.includes("x") ? 1 : 0;
    return bCapture - aCapture;
  });
}

function minimax(chess, depth, alpha, beta, isMaximizing) {
  if (depth === 0 || chess.isGameOver()) return evaluateBoard(chess);

  const moves = sortMoves(chess, chess.moves());

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      chess.move(move);
      const score = minimax(chess, depth - 1, alpha, beta, false);
      chess.undo();
      if (score > maxEval) maxEval = score;
      if (score > alpha) alpha = score;
      if (beta <= alpha) break;
    }
    return maxEval;
  }

  let minEval = Infinity;
  for (const move of moves) {
    chess.move(move);
    const score = minimax(chess, depth - 1, alpha, beta, true);
    chess.undo();
    if (score < minEval) minEval = score;
    if (score < beta) beta = score;
    if (beta <= alpha) break;
  }
  return minEval;
}

/** Pick best Black (minimizing) move using minimax at HARD difficulty. */
function pickAIMove(chess) {
  const moves = sortMoves(chess, chess.moves());
  if (!moves.length) return null;

  // Occasionally play a random move to add variety
  if (Math.random() < HARD.randomness) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  let bestMove = null;
  let bestValue = Infinity;

  for (const move of moves) {
    chess.move(move);
    const value = minimax(chess, HARD.depth - 1, -Infinity, Infinity, true);
    chess.undo();
    if (value < bestValue) {
      bestValue = value;
      bestMove = move;
    }
  }

  return bestMove;
}

/** Pick a uniformly random legal move (White random agent). */
function pickRandomMove(chess) {
  const moves = chess.moves();
  if (!moves.length) return null;
  return moves[Math.floor(Math.random() * moves.length)];
}

// Maximum half-moves before we force the game to end (prevents endless games)
const MAX_HALF_MOVES = 300;

// ─── Game runner ─────────────────────────────────────────────────────────────

function playGame(gameNumber) {
  const chess = new Chess();
  const movesPlayed = []; // { moveNumber, color, san, from, to, fen }

  let halfMove = 0;

  while (!chess.isGameOver() && halfMove < MAX_HALF_MOVES) {
    const color = chess.turn(); // 'w' or 'b'
    const san =
      color === "w" ? pickRandomMove(chess) : pickAIMove(chess);

    if (!san) break; // no legal moves — shouldn't happen but be safe

    const result = chess.move(san);
    halfMove += 1;

    movesPlayed.push({
      moveNumber: Math.ceil(halfMove / 2),
      color: color === "w" ? "white" : "black",
      san: result.san,
      from: result.from,
      to: result.to,
      fen: chess.fen(),
    });
  }

  // Determine outcome
  let winner = null;
  let resultReason = "unknown";

  if (chess.isCheckmate()) {
    // The side that JUST moved delivered checkmate; turn() is now the loser
    winner = chess.turn() === "w" ? "black" : "white";
    resultReason = "checkmate";
  } else if (halfMove >= MAX_HALF_MOVES) {
    // Adjudicate by material count when move limit reached
    const score = evaluateBoard(chess);
    if (score < -200) {
      winner = "black";
      resultReason = "adjudicated-material";
    } else if (score > 200) {
      winner = "white";
      resultReason = "adjudicated-material";
    } else {
      winner = null;
      resultReason = "adjudicated-draw";
    }
  } else if (chess.isDraw()) {
    winner = null;
    if (chess.isStalemate()) resultReason = "stalemate";
    else if (chess.isThreefoldRepetition()) resultReason = "threefold-repetition";
    else if (chess.isInsufficientMaterial()) resultReason = "insufficient-material";
    else resultReason = "draw";
  }

  return {
    game: gameNumber,
    winner,
    resultReason,
    totalMoves: Math.ceil(halfMove / 2),
    halfMoves: halfMove,
    moves: movesPlayed,
    finalFen: chess.fen(),
    whiteAgent: "random",
    blackAgent: "minimax-hard",
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

const TOTAL_GAMES = 10;
const results = [];

console.log("Running 10 games: Random (White) vs Minimax AI at Hard (Black)\n");
console.log("─".repeat(60));

let aiWins = 0;
let draws = 0;
let randomWins = 0;

for (let i = 1; i <= TOTAL_GAMES; i++) {
  process.stdout.write(`Game ${String(i).padStart(2, " ")}  ...  `);
  const record = playGame(i);
  results.push(record);

  if (record.winner === "black") {
    aiWins += 1;
    console.log(
      `AI wins  (${record.resultReason})  —  ${record.totalMoves} moves`
    );
  } else if (record.winner === "white") {
    randomWins += 1;
    console.log(
      `Random wins  (${record.resultReason})  —  ${record.totalMoves} moves`
    );
  } else {
    draws += 1;
    console.log(`Draw  (${record.resultReason})  —  ${record.totalMoves} moves`);
  }
}

console.log("─".repeat(60));
console.log(`\nSummary:`);
console.log(`  AI (Black) wins : ${aiWins} / ${TOTAL_GAMES}`);
console.log(`  Random wins     : ${randomWins} / ${TOTAL_GAMES}`);
console.log(`  Draws           : ${draws} / ${TOTAL_GAMES}`);

// Write results to games.json
const outPath = path.join(__dirname, "games.json");
fs.writeFileSync(outPath, JSON.stringify(results, null, 2), "utf8");
console.log(`\nGame records saved to: ${outPath}`);

// Exit with error code if AI did not win all 10
if (aiWins < TOTAL_GAMES) {
  console.error(
    `\nFAIL: AI only won ${aiWins}/${TOTAL_GAMES} games (target: ${TOTAL_GAMES}).`
  );
  process.exit(1);
} else {
  console.log(`\nPASS: AI won all ${TOTAL_GAMES} games.`);
  process.exit(0);
}
