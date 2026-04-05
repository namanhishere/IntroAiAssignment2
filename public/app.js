let gameId = null;
let currentFen = "";
let selectedSquare = "";
let lastMove = null;
let moveNumber = 1;
let historyRows = [];
let isBusy = false;
let playerColor = "w";
let aiColor = "b";
let aiType = "minimax";
let evalGames = [];
let evalSelection = { gameIndex: -1, plyIndex: 0 };

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const fenEl = document.getElementById("fen");
const historyEl = document.getElementById("history");
const difficultyEl = document.getElementById("difficulty");
const playerColorEl = document.getElementById("playerColor");
const opponentTypeEl = document.getElementById("opponentType");
const newGameBtn = document.getElementById("newGameBtn");
const moveForm = document.getElementById("moveForm");
const moveInput = document.getElementById("moveInput");
const fenInput = document.getElementById("fenInput");
const loadFenBtn = document.getElementById("loadFenBtn");
const copyFenBtn = document.getElementById("copyFenBtn");
const evalGamesEl = document.getElementById("evalGames");
const evalBtn = document.getElementById("evalBtn");
const evalResultEl = document.getElementById("evalResult");
const evalGamesListEl = document.getElementById("evalGamesList");
const evalBoardEl = document.getElementById("evalBoard");
const evalPrevBtn = document.getElementById("evalPrev");
const evalNextBtn = document.getElementById("evalNext");
const evalMoveCounterEl = document.getElementById("evalMoveCounter");
const evalMoveLogEl = document.getElementById("evalMoveLog");
const evalGameMetaEl = document.getElementById("evalGameMeta");
const testPageEl = document.getElementById("testGamePage");
const testStatusEl = document.getElementById("testGameStatus");
const isMainPage = Boolean(boardEl && moveForm && newGameBtn);

const pieceAssetCode = {
  P: "wp",
  N: "wn",
  B: "wb",
  R: "wr",
  Q: "wq",
  K: "wk",
  p: "bp",
  n: "bn",
  b: "bb",
  r: "br",
  q: "bq",
  k: "bk",
};
const pieceAssetBase = "https://assets-themes.chess.com/image/ejgfv/150";

function boardFromFen(fen) {
  const placement = fen.split(" ")[0];
  const rows = placement.split("/");
  return rows.map((row) => {
    const cells = [];
    for (const ch of row) {
      if (/\d/.test(ch)) {
        for (let i = 0; i < Number(ch); i++) cells.push("");
      } else {
        cells.push(ch);
      }
    }
    return cells;
  });
}

function coords(row, col) {
  const file = "abcdefgh"[col];
  const rank = String(8 - row);
  return `${file}${rank}`;
}

function mapDisplayToBoardByColor(row, col, color) {
  if (color === "w") {
    return { boardRow: row, boardCol: col };
  }
  return { boardRow: 7 - row, boardCol: 7 - col };
}

function mapDisplayToBoard(row, col) {
  return mapDisplayToBoardByColor(row, col, playerColor);
}

function parseMove(text) {
  const value = text.trim().toLowerCase();
  const coord = value.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
  if (coord) {
    return {
      type: "coord",
      payload: {
        from: coord[1],
        to: coord[2],
        promotion: coord[3] || "q",
      },
    };
  }
  if (!value) return null;
  return {
    type: "san",
    payload: { san: text.trim() },
  };
}

function setInputFromSelection() {
  const current = moveInput.value.trim().toLowerCase();
  if (!selectedSquare) {
    moveInput.value = "";
    return;
  }

  if (current.length === 2) {
    moveInput.value = selectedSquare;
    return;
  }

  if (current.length >= 4) {
    moveInput.value = `${selectedSquare}${current.slice(2, 4)}`;
    return;
  }

  moveInput.value = selectedSquare;
}

function isPlayerToMove() {
  if (!currentFen) return false;
  const parts = currentFen.split(" ");
  return parts[1] === playerColor;
}

function isPlayerPiece(pieceCode) {
  if (!pieceCode) return false;
  const isWhitePiece = pieceCode === pieceCode.toUpperCase();
  return playerColor === "w" ? isWhitePiece : !isWhitePiece;
}

function addHistoryEntry(label, san, side) {
  historyRows.push({ no: moveNumber, side, label, san });
  if (side === "black") moveNumber += 1;

  historyEl.innerHTML = historyRows
    .map(
      (row) => `
      <article class="move-item">
        <p class="move-head">#${row.no} ${row.side}</p>
        <p class="move-text">${row.label} -> ${row.san}</p>
      </article>`
    )
    .join("");

  historyEl.scrollTop = historyEl.scrollHeight;
}

function renderBoard() {
  boardEl.innerHTML = "";
  if (!currentFen) return;

  const grid = boardFromFen(currentFen);

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const { boardRow, boardCol } = mapDisplayToBoard(row, col);
      const squareName = coords(boardRow, boardCol);
      const square = document.createElement("button");
      square.type = "button";
      square.className = `square ${(row + col) % 2 === 0 ? "light" : "dark"}`;
      square.dataset.square = squareName;

      if (selectedSquare === squareName) square.classList.add("selected");
      if (lastMove && (lastMove.from === squareName || lastMove.to === squareName)) {
        square.classList.add("last");
      }

      const coord = document.createElement("span");
      coord.className = "coord";
      coord.textContent = squareName.toUpperCase();
      square.appendChild(coord);

      const pieceCode = grid[boardRow][boardCol];
      if (pieceCode) {
        const piece = document.createElement("img");
        piece.className = "piece";
        piece.alt = pieceCode;
        piece.draggable = isPlayerPiece(pieceCode) && isPlayerToMove() && !isBusy;
        piece.src = `${pieceAssetBase}/${pieceAssetCode[pieceCode]}.png`;

        piece.addEventListener("dragstart", (event) => {
          if (!gameId || isBusy || !isPlayerToMove() || !isPlayerPiece(pieceCode)) {
            event.preventDefault();
            return;
          }

          const fromSquare = squareName;
          event.dataTransfer.setData("text/plain", fromSquare);
          event.dataTransfer.effectAllowed = "move";
          selectedSquare = fromSquare;
          setInputFromSelection();
          renderBoard();
        });

        square.appendChild(piece);
      }

      square.addEventListener("dragover", (event) => {
        event.preventDefault();
      });

      square.addEventListener("drop", async (event) => {
        event.preventDefault();
        if (!gameId || isBusy || !isPlayerToMove()) return;

        const from = event.dataTransfer.getData("text/plain");
        const to = squareName;
        if (!/^[a-h][1-8]$/.test(from) || from === to) return;

        selectedSquare = "";
        moveInput.value = `${from}${to}`;
        renderBoard();

        try {
          await submitMove(moveInput.value);
        } catch (error) {
          statusEl.textContent = `Error: ${error.message}`;
        }
      });

      square.addEventListener("click", async () => {
        if (!gameId || isBusy || !isPlayerToMove()) return;
        const current = moveInput.value.trim().toLowerCase();

        if (!selectedSquare) {
          selectedSquare = squareName;
          setInputFromSelection();
          renderBoard();
          return;
        }

        if (!current || current.length < 2) {
          selectedSquare = squareName;
          setInputFromSelection();
          renderBoard();
          return;
        }

        const from = selectedSquare;
        const to = squareName;
        selectedSquare = "";
        moveInput.value = `${from}${to}`;
        renderBoard();

        if (/^[a-h][1-8][a-h][1-8]([qrbn])?$/.test(moveInput.value)) {
          try {
            await submitMove(moveInput.value);
          } catch (error) {
            statusEl.textContent = `Error: ${error.message}`;
          }
        }
      });

      boardEl.appendChild(square);
    }
  }
}

function renderStaticBoard(element, fen, orientation, lastMoveHighlight) {
  if (!element) return;
  element.innerHTML = "";
  if (!fen) return;

  const grid = boardFromFen(fen);

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const { boardRow, boardCol } = mapDisplayToBoardByColor(row, col, orientation);
      const squareName = coords(boardRow, boardCol);
      const square = document.createElement("div");
      square.className = `square ${(row + col) % 2 === 0 ? "light" : "dark"}`;

      if (
        lastMoveHighlight &&
        (lastMoveHighlight.from === squareName || lastMoveHighlight.to === squareName)
      ) {
        square.classList.add("last");
      }

      const coord = document.createElement("span");
      coord.className = "coord";
      coord.textContent = squareName.toUpperCase();
      square.appendChild(coord);

      const pieceCode = grid[boardRow][boardCol];
      if (pieceCode) {
        const piece = document.createElement("img");
        piece.className = "piece";
        piece.alt = pieceCode;
        piece.draggable = false;
        piece.src = `${pieceAssetBase}/${pieceAssetCode[pieceCode]}.png`;
        square.appendChild(piece);
      }

      element.appendChild(square);
    }
  }
}

function formatEvalResult(game) {
  if (game.winner === "draw") return { label: "Draw", className: "draw" };
  if (game.winner === game.aiColor) return { label: "AI Win", className: "win" };
  return { label: "AI Loss", className: "loss" };
}

function formatEvalMoveLog(moves, activeIndex) {
  const rows = [];
  for (let i = 0; i < moves.length; i += 2) {
    const moveNo = Math.floor(i / 2) + 1;
    const whiteMove = moves[i];
    const blackMove = moves[i + 1];
    rows.push(
      `<div class="eval-move-row">
        <span class="eval-move-no">${moveNo}.</span>
        <span class="eval-move ${i === activeIndex ? "current" : ""}">${
          whiteMove ? whiteMove.san : ""
        }</span>
        <span class="eval-move ${i + 1 === activeIndex ? "current" : ""}">${
          blackMove ? blackMove.san : ""
        }</span>
      </div>`
    );
  }
  return rows.join("");
}

function renderEvalGamesList() {
  if (!evalGamesListEl) return;

  if (!evalGames.length) {
    evalGamesListEl.textContent = "No test games to display.";
    return;
  }

  evalGamesListEl.innerHTML = evalGames
    .map((game, index) => {
      const result = formatEvalResult(game);
      const aiLabel = game.aiColor === "w" ? "AI White" : "AI Black";
      return (
        `<a class="eval-game-link" href="/?test=${index + 1}">
          <span class="eval-game-title">Game ${index + 1}</span>
          <span class="eval-game-tag">${aiLabel}</span>
          <span class="eval-game-result ${result.className}">${result.label}</span>
        </a>`
      );
    })
    .join("");
}

function renderEvalGameViewer() {
  if (!evalBoardEl || !evalMoveCounterEl || !evalMoveLogEl || !evalGameMetaEl) {
    return;
  }

  const game = evalGames[evalSelection.gameIndex];
  if (!game) {
    return;
  }

  const plyIndex = Math.min(Math.max(evalSelection.plyIndex, 0), game.fens.length - 1);
  evalSelection.plyIndex = plyIndex;

  const lastMoveHighlight = plyIndex > 0 ? game.moves[plyIndex - 1] : null;
  renderStaticBoard(evalBoardEl, game.fens[plyIndex], "w", lastMoveHighlight);

  evalMoveCounterEl.textContent = `Ply ${plyIndex}/${game.moves.length}`;
  if (evalPrevBtn) evalPrevBtn.disabled = plyIndex === 0;
  if (evalNextBtn) evalNextBtn.disabled = plyIndex >= game.moves.length;

  const result = formatEvalResult(game);
  const meta = [
    game.aiColor === "w" ? "AI White" : "AI Black",
    result.label,
    `Plies ${game.moves.length}`,
  ];
  if (game.maxPliesReached) meta.push("Move limit");
  if (game.endedByRepetition) meta.push("Repetition");
  evalGameMetaEl.textContent = meta.join(" | ");

  evalMoveLogEl.innerHTML = formatEvalMoveLog(game.moves, plyIndex - 1);
}

function selectEvalGame(gameIndex, plyIndex = 0) {
  evalSelection = { gameIndex, plyIndex };
  renderEvalGamesList();
  renderEvalGameViewer();
}

function getTestIndex() {
  const params = new URLSearchParams(window.location.search);
  const value = Number(params.get("test"));
  if (!Number.isInteger(value) || value < 1) return null;
  return value;
}

async function initTestGamePage() {
  if (!testPageEl) return false;

  const testIndex = getTestIndex();
  if (!testIndex) {
    if (testStatusEl) testStatusEl.textContent = "Missing test game index.";
    return true;
  }

  testPageEl.classList.remove("is-hidden");
  if (testStatusEl) testStatusEl.textContent = "Loading test game...";

  try {
    const result = await api(`/api/evaluate/game?index=${testIndex}`);
    evalGames = result?.game ? [result.game] : [];
    evalSelection = { gameIndex: evalGames.length ? 0 : -1, plyIndex: 0 };
    renderEvalGameViewer();
    if (testStatusEl) testStatusEl.textContent = `Showing Game ${testIndex}`;
  } catch (error) {
    if (testStatusEl) testStatusEl.textContent = `Error: ${error.message}`;
  }

  return true;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (response.status === 204) return null;

  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body;
}

function syncGame(gameState) {
  currentFen = gameState.fen;
  statusEl.textContent = gameState.status;
  fenEl.textContent = gameState.fen;
  playerColor = gameState.playerColor || "w";
  aiColor = gameState.aiColor || (playerColor === "w" ? "b" : "w");
  aiType = gameState.aiType || "minimax";
  if (playerColorEl) playerColorEl.value = playerColor;
  if (opponentTypeEl) opponentTypeEl.value = aiType;
  if (difficultyEl && gameState.difficulty) difficultyEl.value = gameState.difficulty;
  if (fenInput) fenInput.value = gameState.fen;
  renderBoard();
}

async function createGame() {
  const game = await api("/api/games", {
    method: "POST",
    body: JSON.stringify({
      difficulty: difficultyEl.value,
      playerColor: playerColorEl?.value || "w",
      aiType: opponentTypeEl?.value || "minimax",
    }),
  });

  gameId = game.gameId;
  moveNumber = 1;
  historyRows = [];
  lastMove = null;
  selectedSquare = "";
  historyEl.innerHTML = "";
  moveInput.value = "";
  syncGame(game);

  if (!game.isGameOver && game.turn === game.aiColor) {
    await runAIMove();
  }
}

async function runAIMove() {
  if (!gameId) return;

  const result = await api(`/api/games/${gameId}/ai-move`, { method: "POST" });
  lastMove = { from: result.move.from, to: result.move.to };
  const aiSide = result.move.color === "w" ? "white" : "black";
  addHistoryEntry(result.move.from.toUpperCase(), result.move.san, aiSide);
  syncGame(result.game);
}

async function submitMove(textMove) {
  if (isBusy) return;
  const parsed = parseMove(textMove);
  if (!parsed) {
    statusEl.textContent = "Invalid move. Use e2e4/e7e8q or SAN like Nf3, O-O.";
    return;
  }

  isBusy = true;
  try {
    const result = await api(`/api/games/${gameId}/move`, {
      method: "POST",
      body: JSON.stringify(parsed.payload),
    });

    lastMove = { from: result.move.from, to: result.move.to };
    const playerSide = result.move.color === "w" ? "white" : "black";
    addHistoryEntry(result.move.from.toUpperCase(), result.move.san, playerSide);
    syncGame(result.game);
    moveInput.value = "";

    if (!result.game.isGameOver && result.game.turn === result.game.aiColor) {
      await runAIMove();
    }
  } finally {
    isBusy = false;
  }
}

async function resetGame() {
  try {
    if (gameId) {
      await api(`/api/games/${gameId}`, { method: "DELETE" });
    }
    await createGame();
  } catch (error) {
    statusEl.textContent = `Error: ${error.message}`;
  }
}

function initMainPage() {
  if (!isMainPage) return;

  moveForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!gameId) return;

    try {
      await submitMove(moveInput.value);
    } catch (error) {
      statusEl.textContent = `Error: ${error.message}`;
    }
  });

  newGameBtn.addEventListener("click", resetGame);

  if (playerColorEl) {
    playerColorEl.addEventListener("change", resetGame);
  }

  if (opponentTypeEl) {
    opponentTypeEl.addEventListener("change", resetGame);
  }

  moveInput.addEventListener("input", () => {
    const value = moveInput.value.trim().toLowerCase();
    const isCoordInput = /^[a-h][1-8]([a-h][1-8]([qrbn])?)?$/.test(value);
    if (!isCoordInput || value.length < 2) {
      selectedSquare = "";
      renderBoard();
      return;
    }

    const candidate = value.slice(0, 2);
    if (/^[a-h][1-8]$/.test(candidate)) {
      selectedSquare = candidate;
      renderBoard();
    }
  });

  loadFenBtn.addEventListener("click", async () => {
    if (!gameId) return;
    try {
      const result = await api(`/api/games/${gameId}/fen`, {
        method: "PATCH",
        body: JSON.stringify({ fen: fenInput.value }),
      });
      moveNumber = 1;
      historyRows = [];
      historyEl.innerHTML = "";
      lastMove = null;
      selectedSquare = "";
      moveInput.value = "";
      syncGame(result);
    } catch (error) {
      statusEl.textContent = `Error: ${error.message}`;
    }
  });

  copyFenBtn.addEventListener("click", async () => {
    const fen = fenEl.textContent || "";
    if (!fen) return;

    try {
      await navigator.clipboard.writeText(fen);
      statusEl.textContent = "FEN copied to clipboard.";
    } catch (_error) {
      statusEl.textContent = "Clipboard blocked. Copy from FEN textbox.";
    }
  });

  difficultyEl.addEventListener("change", async () => {
    if (!gameId) return;

    try {
      const result = await api(`/api/games/${gameId}/difficulty`, {
        method: "PATCH",
        body: JSON.stringify({ difficulty: difficultyEl.value }),
      });
      syncGame(result);
    } catch (error) {
      statusEl.textContent = `Error: ${error.message}`;
    }
  });

  resetGame();
}

if (evalBtn && evalGamesEl && evalResultEl) {
  evalBtn.addEventListener("click", async () => {
    const gamesPerSide = Math.min(Math.max(Number(evalGamesEl.value) || 10, 1), 50);
    evalResultEl.textContent = "Running evaluation...";
    evalGames = [];
    evalSelection = { gameIndex: -1, plyIndex: 0 };
    renderEvalGamesList();

    try {
      const result = await api("/api/evaluate", {
        method: "POST",
        body: JSON.stringify({
          gamesPerSide,
          difficulty: difficultyEl.value,
          includeGames: true,
          maxGames: gamesPerSide * 2,
        }),
      });

      evalResultEl.textContent =
        `AI as White: W ${result.results.aiWhite.wins} ` +
        `L ${result.results.aiWhite.losses} D ${result.results.aiWhite.draws}\n` +
        `AI as Black: W ${result.results.aiBlack.wins} ` +
        `L ${result.results.aiBlack.losses} D ${result.results.aiBlack.draws}\n` +
        `Overall: W ${result.overall.wins} ` +
        `L ${result.overall.losses} D ${result.overall.draws}`;

      evalGames = Array.isArray(result.games) ? result.games : [];
      evalSelection = { gameIndex: evalGames.length ? 0 : -1, plyIndex: 0 };
      renderEvalGamesList();
    } catch (error) {
      evalResultEl.textContent = `Error: ${error.message}`;
    }
  });
}

if (evalPrevBtn) {
  evalPrevBtn.addEventListener("click", () => {
    if (evalSelection.gameIndex < 0) return;
    selectEvalGame(evalSelection.gameIndex, evalSelection.plyIndex - 1);
  });
}

if (evalNextBtn) {
  evalNextBtn.addEventListener("click", () => {
    if (evalSelection.gameIndex < 0) return;
    selectEvalGame(evalSelection.gameIndex, evalSelection.plyIndex + 1);
  });
}

async function initApp() {
  const isTestPage = await initTestGamePage();
  if (!isTestPage) initMainPage();
}

initApp();
