let gameId = null;
let currentFen = "";
let selectedSquare = "";
let lastMove = null;
let moveNumber = 1;
let historyRows = [];
let isBusy = false;

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const fenEl = document.getElementById("fen");
const historyEl = document.getElementById("history");
const difficultyEl = document.getElementById("difficulty");
const newGameBtn = document.getElementById("newGameBtn");
const moveForm = document.getElementById("moveForm");
const moveInput = document.getElementById("moveInput");
const fenInput = document.getElementById("fenInput");
const loadFenBtn = document.getElementById("loadFenBtn");
const copyFenBtn = document.getElementById("copyFenBtn");

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

function isWhiteToMove() {
  const parts = currentFen.split(" ");
  return parts[1] === "w";
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
      const squareName = coords(row, col);
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

      const pieceCode = grid[row][col];
      if (pieceCode) {
        const piece = document.createElement("img");
        piece.className = "piece";
        piece.alt = pieceCode;
        piece.draggable = pieceCode === pieceCode.toUpperCase();
        piece.src = `${pieceAssetBase}/${pieceAssetCode[pieceCode]}.png`;

        piece.addEventListener("dragstart", (event) => {
          if (!gameId || isBusy || !isWhiteToMove()) {
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
        if (!gameId || isBusy || !isWhiteToMove()) return;

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
  if (fenInput) fenInput.value = gameState.fen;
  renderBoard();
}

async function createGame() {
  const game = await api("/api/games", {
    method: "POST",
    body: JSON.stringify({ difficulty: difficultyEl.value }),
  });

  gameId = game.gameId;
  moveNumber = 1;
  historyRows = [];
  lastMove = null;
  selectedSquare = "";
  historyEl.innerHTML = "";
  moveInput.value = "";
  syncGame(game);
}

async function runAIMove() {
  if (!gameId) return;

  const result = await api(`/api/games/${gameId}/ai-move`, { method: "POST" });
  lastMove = { from: result.move.from, to: result.move.to };
  addHistoryEntry(result.move.from.toUpperCase(), result.move.san, "black");
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
    addHistoryEntry(result.move.from.toUpperCase(), result.move.san, "white");
    syncGame(result.game);
    moveInput.value = "";

    if (!result.game.isGameOver && result.game.turn === "b") {
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
