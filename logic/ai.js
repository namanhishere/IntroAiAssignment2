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

const aiTypes = new Set(["minimax", "random"]);
const CHECKMATE_SCORE = 100000;

function getDifficultyConfig(difficulty, options = {}) {
  const base = difficultyConfig[difficulty] || difficultyConfig.medium;
  if (options.disableRandomness) {
    return { ...base, randomness: 0 };
  }
  return base;
}

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

function terminalScore(chess) {
  if (chess.isCheckmate()) {
    return chess.turn() === "w" ? -CHECKMATE_SCORE : CHECKMATE_SCORE;
  }
  if (chess.isDraw()) {
    return 0;
  }
  return null;
}

function minimax(chess, depth, alpha, beta, isMaximizing) {
  const terminal = terminalScore(chess);
  if (terminal !== null) {
    return terminal;
  }

  if (depth === 0) {
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

function pickRandomMove(chess) {
  const moves = chess.moves();
  if (!moves.length) return null;
  return moves[Math.floor(Math.random() * moves.length)];
}

function pickMinimaxMove(chess, aiColor, difficulty, options = {}) {
  const level = getDifficultyConfig(difficulty, options);
  const moves = chess.moves();

  if (!moves.length) return null;

  if (Math.random() < level.randomness) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  const isAiMaximizing = aiColor === "w";
  let bestMove = null;
  let bestValue = isAiMaximizing ? -Infinity : Infinity;

  for (const move of moves) {
    chess.move(move);
    const value = minimax(chess, level.depth - 1, -Infinity, Infinity, chess.turn() === "w");
    chess.undo();

    if (isAiMaximizing) {
      if (value > bestValue) {
        bestValue = value;
        bestMove = move;
      }
    } else if (value < bestValue) {
      bestValue = value;
      bestMove = move;
    }
  }

  return bestMove;
}

function pickAgentMove(chess, aiColor, difficulty, aiType, options = {}) {
  if (aiType === "random") {
    return pickRandomMove(chess);
  }
  return pickMinimaxMove(chess, aiColor, difficulty, options);
}

module.exports = {
  difficultyConfig,
  aiTypes,
  pickAgentMove,
  pickRandomMove,
};
