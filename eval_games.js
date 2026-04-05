/**
 * eval_games.js
 *
 * Evaluation script — two experiment categories:
 *
 *   Category 1: Depth sweep   — fix randomness=0.05, vary depth 1..3
 *   Category 2: Randomness sweep — fix depth=2, vary randomness 0,0.10,0.25,0.50,0.75,1.00
 *
 * Each configuration plays GAMES_PER_CONFIG games.
 * Metrics per config: win rate (%), avg moves per game, avg time per game (ms).
 *
 * Usage:
 *   node eval_games.js
 *
 * Output:
 *   Prints two summary tables to stdout.
 *   Writes full results to ./eval_results.json (served by Express at /eval_results.json).
 */

"use strict";

const fs   = require("fs");
const path = require("path");
const { Chess } = require("chess.js");

// ─── Shared engine ────────────────────────────────────────────────────────────

const pieceValue = {
  p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000,
};

// Piece-square tables (White's perspective; Black mirrors by flipping row index)
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
  if (chess.isCheckmate()) return chess.turn() === "w" ? -100000 : 100000;
  if (chess.isDraw())      return 0;

  const board = chess.board();
  let total = 0;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (!piece) continue;
      const base   = pieceValue[piece.type] || 0;
      const pstRow = piece.color === "w" ? row : 7 - row;
      const pst    = PST[piece.type] ? PST[piece.type][pstRow * 8 + col] : 0;
      total += piece.color === "w" ? base + pst : -(base + pst);
    }
  }
  return total;
}

/** Put captures first — speeds up alpha-beta pruning. */
function sortMoves(moves) {
  return moves.slice().sort((a, b) => (b.includes("x") ? 1 : 0) - (a.includes("x") ? 1 : 0));
}

function minimax(chess, depth, alpha, beta, isMaximizing) {
  if (depth === 0 || chess.isGameOver()) return evaluateBoard(chess);

  const moves = sortMoves(chess.moves());

  if (isMaximizing) {
    let best = -Infinity;
    for (const m of moves) {
      chess.move(m);
      const s = minimax(chess, depth - 1, alpha, beta, false);
      chess.undo();
      if (s > best)  best  = s;
      if (s > alpha) alpha = s;
      if (beta <= alpha) break;
    }
    return best;
  }

  let best = Infinity;
  for (const m of moves) {
    chess.move(m);
    const s = minimax(chess, depth - 1, alpha, beta, true);
    chess.undo();
    if (s < best) best = s;
    if (s < beta) beta = s;
    if (beta <= alpha) break;
  }
  return best;
}

/**
 * Pick a move for the AI (Black, minimising).
 * @param {Chess}  chess
 * @param {number} depth       - search depth
 * @param {number} randomness  - probability of playing a random move instead
 */
function pickAIMove(chess, depth, randomness) {
  const moves = sortMoves(chess.moves());
  if (!moves.length) return null;

  if (Math.random() < randomness) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  let bestMove  = null;
  let bestValue = Infinity;

  for (const m of moves) {
    chess.move(m);
    const v = minimax(chess, depth - 1, -Infinity, Infinity, true);
    chess.undo();
    if (v < bestValue) { bestValue = v; bestMove = m; }
  }

  return bestMove;
}

function pickRandomMove(chess) {
  const moves = chess.moves();
  if (!moves.length) return null;
  return moves[Math.floor(Math.random() * moves.length)];
}

// ─── Single game ──────────────────────────────────────────────────────────────

const MAX_HALF_MOVES = 250; // cap to prevent runaway games

function playOneGame(depth, randomness) {
  const chess    = new Chess();
  let   halfMove = 0;
  const t0       = Date.now();

  while (!chess.isGameOver() && halfMove < MAX_HALF_MOVES) {
    const color = chess.turn();
    const san   = color === "w"
      ? pickRandomMove(chess)
      : pickAIMove(chess, depth, randomness);

    if (!san) break;
    chess.move(san);
    halfMove += 1;
  }

  const elapsedMs = Date.now() - t0;

  // Determine outcome
  let winner       = null;
  let resultReason = "unknown";

  if (chess.isCheckmate()) {
    winner       = chess.turn() === "w" ? "black" : "white";
    resultReason = "checkmate";
  } else if (halfMove >= MAX_HALF_MOVES) {
    const score = evaluateBoard(chess);
    if      (score < -200) { winner = "black"; resultReason = "adjudicated-material"; }
    else if (score >  200) { winner = "white"; resultReason = "adjudicated-material"; }
    else                   { winner = null;    resultReason = "adjudicated-draw";     }
  } else if (chess.isDraw()) {
    winner       = null;
    resultReason = chess.isStalemate()           ? "stalemate"
                 : chess.isThreefoldRepetition() ? "threefold-repetition"
                 : chess.isInsufficientMaterial()? "insufficient-material"
                 : "draw";
  }

  return {
    winner,
    resultReason,
    halfMoves: halfMove,
    totalMoves: Math.ceil(halfMove / 2),
    elapsedMs,
  };
}

// ─── Config runner ────────────────────────────────────────────────────────────

const GAMES_PER_CONFIG = 10;

/**
 * Run GAMES_PER_CONFIG games for one (depth, randomness) config.
 * Prints a progress dot per game.
 * Returns aggregate stats + per-game records.
 */
function runConfig(label, depth, randomness) {
  const games = [];
  let wins = 0, losses = 0, draws = 0;
  let totalMoves = 0, totalTime = 0;

  process.stdout.write(`  ${label.padEnd(30)} `);

  for (let g = 1; g <= GAMES_PER_CONFIG; g++) {
    const rec = playOneGame(depth, randomness);
    games.push({ game: g, ...rec });

    if      (rec.winner === "black") wins   += 1;
    else if (rec.winner === "white") losses += 1;
    else                             draws  += 1;

    totalMoves += rec.totalMoves;
    totalTime  += rec.elapsedMs;

    process.stdout.write(
      rec.winner === "black" ? "W" :
      rec.winner === "white" ? "L" : "D"
    );
  }

  const winRate  = (wins  / GAMES_PER_CONFIG) * 100;
  const avgMoves = totalMoves / GAMES_PER_CONFIG;
  const avgTime  = totalTime  / GAMES_PER_CONFIG;

  console.log(
    `  |  ${String(wins).padStart(2)}W ${String(losses).padStart(2)}L ${String(draws).padStart(2)}D` +
    `  win=${winRate.toFixed(0).padStart(3)}%` +
    `  moves=${avgMoves.toFixed(1).padStart(5)}` +
    `  time=${avgTime.toFixed(0).padStart(6)}ms`
  );

  return { label, depth, randomness, wins, losses, draws, winRate, avgMoves, avgTime, games };
}

// ─── Experiment definitions ───────────────────────────────────────────────────

// Category 1: fixed randomness=0.05, depths 1-3
// (depth 3 is already proven fast enough; skip 4+ to stay within time budget)
const DEPTH_CONFIGS = [
  { depth: 1, randomness: 0.05 },
  { depth: 2, randomness: 0.05 },
  { depth: 3, randomness: 0.05 },
];

// Category 2: fixed depth=2, vary randomness
const RAND_CONFIGS = [
  { depth: 2, randomness: 0.00 },
  { depth: 2, randomness: 0.10 },
  { depth: 2, randomness: 0.25 },
  { depth: 2, randomness: 0.50 },
  { depth: 2, randomness: 0.75 },
  { depth: 2, randomness: 1.00 },
];

// ─── Run Category 1 ──────────────────────────────────────────────────────────

const SEP = "─".repeat(78);

console.log("\n" + SEP);
console.log("  CATEGORY 1 — Depth Sweep  (randomness fixed at 0.05, 10 games each)");
console.log(SEP);
console.log("  Config                         Games            WinRate  AvgMoves  AvgTime");
console.log(SEP);

const depthResults = [];
for (const cfg of DEPTH_CONFIGS) {
  const label = `depth=${cfg.depth}`;
  const res   = runConfig(label, cfg.depth, cfg.randomness);
  depthResults.push(res);
}

// ─── Run Category 2 ──────────────────────────────────────────────────────────

console.log("\n" + SEP);
console.log("  CATEGORY 2 — Randomness Sweep  (depth fixed at 2, 10 games each)");
console.log(SEP);
console.log("  Config                         Games            WinRate  AvgMoves  AvgTime");
console.log(SEP);

const randResults = [];
for (const cfg of RAND_CONFIGS) {
  const label = `depth=2 rand=${cfg.randomness.toFixed(2)}`;
  const res   = runConfig(label, cfg.depth, cfg.randomness);
  randResults.push(res);
}

// ─── Summary tables ───────────────────────────────────────────────────────────

function printTable(title, rows, xKey, xLabel) {
  const w = 10;
  const sep2 = "-".repeat(54);
  console.log(`\n${title}`);
  console.log(sep2);
  console.log(
    `  ${xLabel.padEnd(12)}` +
    `${"Win Rate".padStart(w)}` +
    `${"Avg Moves".padStart(w)}` +
    `${"Avg Time".padStart(w)}` +
    `${"W/L/D".padStart(w)}`
  );
  console.log(sep2);
  for (const r of rows) {
    const xVal = String(r[xKey]).padEnd(12);
    console.log(
      `  ${xVal}` +
      `${(r.winRate.toFixed(0) + "%").padStart(w)}` +
      `${r.avgMoves.toFixed(1).padStart(w)}` +
      `${(r.avgTime.toFixed(0) + "ms").padStart(w)}` +
      `${(r.wins + "/" + r.losses + "/" + r.draws).padStart(w)}`
    );
  }
  console.log(sep2);
}

printTable(
  "=== Category 1 Summary: Depth Sweep (randomness=0.05) ===",
  depthResults,
  "depth",
  "Depth"
);

printTable(
  "=== Category 2 Summary: Randomness Sweep (depth=2) ===",
  randResults,
  "randomness",
  "Randomness"
);

// ─── Write eval_results.json ──────────────────────────────────────────────────

const output = {
  generatedAt: new Date().toISOString(),
  gamesPerConfig: GAMES_PER_CONFIG,
  categories: [
    {
      id:          "depth_sweep",
      title:       "Depth Sweep",
      description: "Fixed randomness=0.05, varying search depth (1–3)",
      fixedParam:  { randomness: 0.05 },
      variedParam: "depth",
      configs:     depthResults,
    },
    {
      id:          "randomness_sweep",
      title:       "Randomness Sweep",
      description: "Fixed depth=2, varying randomness (0–1)",
      fixedParam:  { depth: 2 },
      variedParam: "randomness",
      configs:     randResults,
    },
  ],
};

const outPath = path.join(__dirname, "eval_results.json");
fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");
console.log(`\nFull results written to: ${outPath}`);
