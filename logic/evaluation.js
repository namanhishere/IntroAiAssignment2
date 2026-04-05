const { Chess } = require("chess.js");
const { pickAgentMove, pickRandomMove } = require("./ai");

function getWinnerColor(chess) {
  if (chess.isDraw()) return "draw";
  if (chess.isCheckmate()) return chess.turn() === "w" ? "b" : "w";
  return "draw";
}

function getPositionKey(chess) {
  return chess.fen().split(" ").slice(0, 4).join(" ");
}

function runSingleGame({ aiColor, difficulty, aiType, maxPlies = 300 }) {
  const chess = new Chess();
  const repetitionCounts = new Map();
  repetitionCounts.set(getPositionKey(chess), 1);
  let plies = 0;
  let endedByRepetition = false;

  while (!chess.isGameOver() && plies < maxPlies) {
    const move = chess.turn() === aiColor
      ? pickAgentMove(chess, aiColor, difficulty, aiType, { disableRandomness: true })
      : pickRandomMove(chess);

    if (!move) break;
    chess.move(move);
    plies += 1;

    if (chess.isGameOver()) break;

    const positionKey = getPositionKey(chess);
    const nextCount = (repetitionCounts.get(positionKey) || 0) + 1;
    repetitionCounts.set(positionKey, nextCount);
    if (nextCount >= 3) {
      endedByRepetition = true;
      break;
    }
  }

  if (!chess.isGameOver() || endedByRepetition) {
    return "draw";
  }
  return getWinnerColor(chess);
}

function runSingleGameDetailed({ aiColor, difficulty, aiType, maxPlies = 300 }) {
  const chess = new Chess();
  const moves = [];
  const fens = [chess.fen()];
  const repetitionCounts = new Map();
  repetitionCounts.set(getPositionKey(chess), 1);
  let plies = 0;
  let endedByRepetition = false;

  while (!chess.isGameOver() && plies < maxPlies) {
    const move = chess.turn() === aiColor
      ? pickAgentMove(chess, aiColor, difficulty, aiType, { disableRandomness: true })
      : pickRandomMove(chess);

    if (!move) break;
    const applied = chess.move(move);
    if (!applied) break;

    moves.push({
      san: applied.san,
      from: applied.from,
      to: applied.to,
      color: applied.color,
    });
    fens.push(chess.fen());
    plies += 1;

    if (chess.isGameOver()) break;

    const positionKey = getPositionKey(chess);
    const nextCount = (repetitionCounts.get(positionKey) || 0) + 1;
    repetitionCounts.set(positionKey, nextCount);
    if (nextCount >= 3) {
      endedByRepetition = true;
      break;
    }
  }

  const maxPliesReached = plies >= maxPlies && !chess.isGameOver();
  const winner = chess.isGameOver() && !endedByRepetition ? getWinnerColor(chess) : "draw";

  return {
    winner,
    moves,
    fens,
    aiColor,
    maxPliesReached,
    endedByRepetition,
  };
}

function tallyResult(bucket, winner, aiColor) {
  if (winner === "draw") {
    bucket.draws += 1;
  } else if (winner === aiColor) {
    bucket.wins += 1;
  } else {
    bucket.losses += 1;
  }
}

module.exports = {
  runSingleGame,
  runSingleGameDetailed,
  tallyResult,
};
