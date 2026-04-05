const express = require("express");
const path = require("path");
const { randomUUID } = require("crypto");
const { Chess } = require("chess.js");
const { difficultyConfig, aiTypes, pickAgentMove } = require("./logic/ai");
const { serializeGame } = require("./logic/game");
const { runSingleGame, runSingleGameDetailed, tallyResult } = require("./logic/evaluation");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "127.0.0.1";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public"), { index: false }));

const games = new Map();
const lastEvaluation = {
  games: [],
  updatedAt: 0,
};


app.post("/api/games", (req, res) => {
  const difficulty = difficultyConfig[req.body?.difficulty] ? req.body.difficulty : "medium";
  const playerColor = req.body?.playerColor === "b" ? "b" : "w";
  const aiColor = playerColor === "w" ? "b" : "w";
  const aiType = aiTypes.has(req.body?.aiType) ? req.body.aiType : "minimax";
  const chess = new Chess();
  const gameId = randomUUID();

  games.set(gameId, {
    chess,
    difficulty,
    playerColor,
    aiColor,
    aiType,
  });

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

  if (entry.chess.turn() !== entry.playerColor) {
    return res.status(400).json({ error: "It is not your turn", game: serializeGame(req.params.id, entry) });
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

  if (entry.chess.turn() !== entry.aiColor) {
    return res.status(400).json({ error: "It is not AI turn", game: serializeGame(req.params.id, entry) });
  }

  const aiMove = pickAgentMove(entry.chess, entry.aiColor, entry.difficulty, entry.aiType);
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

app.post("/api/evaluate", (req, res) => {
  const gamesPerSide = Math.min(Math.max(Number(req.body?.gamesPerSide) || 10, 1), 50);
  const difficulty = difficultyConfig[req.body?.difficulty] ? req.body.difficulty : "expert";
  const includeGames = Boolean(req.body?.includeGames);
  const maxGames = Math.min(
    Math.max(Number(req.body?.maxGames) || gamesPerSide * 2, 1),
    50
  );

  const results = {
    aiWhite: { wins: 0, losses: 0, draws: 0 },
    aiBlack: { wins: 0, losses: 0, draws: 0 },
  };
  const games = [];

  for (let i = 0; i < gamesPerSide; i += 1) {
    if (includeGames && games.length < maxGames) {
      const gameWhite = runSingleGameDetailed({
        aiColor: "w",
        difficulty,
        aiType: "minimax",
      });
      tallyResult(results.aiWhite, gameWhite.winner, "w");
      games.push({
        index: games.length + 1,
        aiColor: "w",
        winner: gameWhite.winner,
        moves: gameWhite.moves,
        fens: gameWhite.fens,
        maxPliesReached: gameWhite.maxPliesReached,
        endedByRepetition: gameWhite.endedByRepetition,
      });
    } else {
      const winnerWhite = runSingleGame({ aiColor: "w", difficulty, aiType: "minimax" });
      tallyResult(results.aiWhite, winnerWhite, "w");
    }

    if (includeGames && games.length < maxGames) {
      const gameBlack = runSingleGameDetailed({
        aiColor: "b",
        difficulty,
        aiType: "minimax",
      });
      tallyResult(results.aiBlack, gameBlack.winner, "b");
      games.push({
        index: games.length + 1,
        aiColor: "b",
        winner: gameBlack.winner,
        moves: gameBlack.moves,
        fens: gameBlack.fens,
        maxPliesReached: gameBlack.maxPliesReached,
        endedByRepetition: gameBlack.endedByRepetition,
      });
    } else {
      const winnerBlack = runSingleGame({ aiColor: "b", difficulty, aiType: "minimax" });
      tallyResult(results.aiBlack, winnerBlack, "b");
    }
  }

  const overall = {
    wins: results.aiWhite.wins + results.aiBlack.wins,
    losses: results.aiWhite.losses + results.aiBlack.losses,
    draws: results.aiWhite.draws + results.aiBlack.draws,
  };

  res.json({
    gamesPerSide,
    difficulty,
    aiType: "minimax",
    opponentType: "random",
    results,
    overall,
    games: includeGames ? games : [],
  });

  if (includeGames) {
    lastEvaluation.games = games;
    lastEvaluation.updatedAt = Date.now();
  }
});

app.get("/api/evaluate/game", (req, res) => {
  const index = Number(req.query?.index);
  if (!Number.isInteger(index) || index < 1) {
    return res.status(400).json({ error: "Invalid test game index" });
  }

  const game = lastEvaluation.games[index - 1];
  if (!game) {
    return res.status(404).json({ error: "Test game not found. Run evaluation first." });
  }

  return res.json({
    index,
    updatedAt: lastEvaluation.updatedAt,
    game,
  });
});

app.get("/", (req, res) => {
  if (req.query?.test) {
    return res.sendFile(path.join(__dirname, "public", "test.html"));
  }
  return res.sendFile(path.join(__dirname, "public", "index.html"));
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
