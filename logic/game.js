function gameStatus(chess, playerColor) {
  if (chess.isCheckmate()) {
    const winner = chess.turn() === "w" ? "b" : "w";
    return winner === playerColor ? "Checkmate. You win." : "Checkmate. AI wins.";
  }
  if (chess.isDraw()) {
    return "Draw.";
  }

  const playerLabel = playerColor === "w" ? "White" : "Black";
  let status = chess.turn() === playerColor ? `Your move (${playerLabel}).` : "AI thinking...";
  if (chess.inCheck()) status += " Check!";
  return status;
}

function serializeGame(gameId, entry) {
  return {
    gameId,
    difficulty: entry.difficulty,
    playerColor: entry.playerColor,
    aiColor: entry.aiColor,
    aiType: entry.aiType,
    fen: entry.chess.fen(),
    turn: entry.chess.turn(),
    isGameOver: entry.chess.isGameOver(),
    status: gameStatus(entry.chess, entry.playerColor),
  };
}

module.exports = {
  gameStatus,
  serializeGame,
};
