const express = require("express");
const path = require("path");
const { randomUUID } = require("crypto");
const { Chess } = require("chess.js");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "127.0.0.1";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const games = new Map();

const pieceValue = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

const difficultyConfig = {
  easy: { depth: 1, randomness: 0.7 },
  medium: { depth: 2, randomness: 0.25 },
  hard: { depth: 3, randomness: 0.08 },
  expert: { depth: 4, randomness: 0.02 },
};

function evaluateBoard(chess) {
  const board = chess.board();
  let total = 0;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (!piece) continue;
      const value = pieceValue[piece.type] || 0;
      total += piece.color === "w" ? value : -value;
    }
  }

  return total;
}

function minimax(chess, depth, alpha, beta, isMaximizing) {
  if (depth === 0 || chess.isGameOver()) {
    return evaluateBoard(chess);
  }

  const moves = chess.moves();

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      chess.move(move);
      const evalScore = minimax(chess, depth - 1, alpha, beta, false);
      chess.undo();

      if (evalScore > maxEval) maxEval = evalScore;
      if (evalScore > alpha) alpha = evalScore;
      if (beta <= alpha) break;
    }
    return maxEval;
  }

  let minEval = Infinity;
  for (const move of moves) {
    chess.move(move);
    const evalScore = minimax(chess, depth - 1, alpha, beta, true);
    chess.undo();

    if (evalScore < minEval) minEval = evalScore;
    if (evalScore < beta) beta = evalScore;
    if (beta <= alpha) break;
  }
  return minEval;
}

function pickAIMove(chess, difficulty) {
  const level = difficultyConfig[difficulty] || difficultyConfig.medium;
  const moves = chess.moves();

  if (!moves.length) return null;

  if (Math.random() < level.randomness) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  let bestMove = null;
  let bestValue = Infinity;

  for (const move of moves) {
    chess.move(move);
    const value = minimax(chess, level.depth - 1, -Infinity, Infinity, true);
    chess.undo();

    if (value < bestValue) {
      bestValue = value;
      bestMove = move;
    }
  }

  return bestMove;
}

function gameStatus(chess) {
  if (chess.isCheckmate()) {
    return chess.turn() === "w" ? "Checkmate. AI wins." : "Checkmate. You win.";
  }
  if (chess.isDraw()) {
    return "Draw.";
  }

  let status = chess.turn() === "w" ? "Your move (White)." : "AI thinking...";
  if (chess.inCheck()) status += " Check!";
  return status;
}

function serializeGame(gameId, entry) {
  return {
    gameId,
    difficulty: entry.difficulty,
    fen: entry.chess.fen(),
    turn: entry.chess.turn(),
    isGameOver: entry.chess.isGameOver(),
    status: gameStatus(entry.chess),
  };
}

app.post("/api/games", (req, res) => {
  const difficulty = req.body?.difficulty || "medium";
  const chess = new Chess();
  const gameId = randomUUID();

  games.set(gameId, { chess, difficulty });

  res.status(201).json(serializeGame(gameId, games.get(gameId)));
});

app.get("/api/games/:id", (req, res) => {
  const entry = games.get(req.params.id);
  if (!entry) return res.status(404).json({ error: "Game not found" });
  res.json(serializeGame(req.params.id, entry));
});

app.post("/api/games/:id/move", (req, res) => {
  const entry = games.get(req.params.id);
  if (!entry) return res.status(404).json({ error: "Game not found" });

  const { from, to, promotion, san } = req.body || {};

  if (entry.chess.isGameOver()) {
    return res.status(400).json({ error: "Game is already over", game: serializeGame(req.params.id, entry) });
  }

  if (entry.chess.turn() !== "w") {
    return res.status(400).json({ error: "It is not White's turn", game: serializeGame(req.params.id, entry) });
  }

  let move = null;
  if (typeof san === "string" && san.trim()) {
    move = entry.chess.move(san.trim());
  } else {
    move = entry.chess.move({ from, to, promotion: promotion || "q" });
  }
  if (!move) return res.status(400).json({ error: "Illegal move" });

  res.json({
    move,
    game: serializeGame(req.params.id, entry),
  });
});

app.patch("/api/games/:id/fen", (req, res) => {
  const entry = games.get(req.params.id);
  if (!entry) return res.status(404).json({ error: "Game not found" });

  const fen = req.body?.fen;
  if (typeof fen !== "string" || !fen.trim()) {
    return res.status(400).json({ error: "FEN is required" });
  }

  try {
    entry.chess = new Chess(fen.trim());
  } catch (_error) {
    return res.status(400).json({ error: "Invalid FEN" });
  }

  res.json(serializeGame(req.params.id, entry));
});

app.post("/api/games/:id/ai-move", (req, res) => {
  const entry = games.get(req.params.id);
  if (!entry) return res.status(404).json({ error: "Game not found" });

  if (entry.chess.isGameOver()) {
    return res.status(400).json({ error: "Game is already over", game: serializeGame(req.params.id, entry) });
  }

  if (entry.chess.turn() !== "b") {
    return res.status(400).json({ error: "It is not AI turn", game: serializeGame(req.params.id, entry) });
  }

  const aiMove = pickAIMove(entry.chess, entry.difficulty);
  if (!aiMove) return res.status(400).json({ error: "No legal AI move" });

  const move = entry.chess.move(aiMove);
  res.json({ move, game: serializeGame(req.params.id, entry) });
});

app.patch("/api/games/:id/difficulty", (req, res) => {
  const entry = games.get(req.params.id);
  if (!entry) return res.status(404).json({ error: "Game not found" });

  const difficulty = req.body?.difficulty;
  if (!difficultyConfig[difficulty]) {
    return res.status(400).json({ error: "Invalid difficulty" });
  }

  entry.difficulty = difficulty;
  res.json(serializeGame(req.params.id, entry));
});

app.delete("/api/games/:id", (req, res) => {
  if (!games.has(req.params.id)) return res.status(404).json({ error: "Game not found" });
  games.delete(req.params.id);
  res.status(204).send();
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});
