/**
 * replay.js — frontend logic for the game replay viewer (replay.html)
 *
 * Loads games.json, renders a game-selector list, and provides a
 * step-through board viewer with Prev / Next / Auto-play controls.
 */

"use strict";

// ─── Constants ────────────────────────────────────────────────────────────────

const pieceAssetCode = {
  P: "wp", N: "wn", B: "wb", R: "wr", Q: "wq", K: "wk",
  p: "bp", n: "bn", b: "bb", r: "br", q: "bq", k: "bk",
};
const pieceAssetBase = "https://assets-themes.chess.com/image/ejgfv/150";

// ─── State ────────────────────────────────────────────────────────────────────

let allGames = [];          // full games.json array
let activeGameIdx = null;  // index into allGames
let stepIdx = 0;           // which half-move we're currently showing (0 = start)
let autoTimer = null;      // setInterval handle

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const boardEl          = document.getElementById("board");
const placeholderEl    = document.getElementById("placeholder");
const gameListEl       = document.getElementById("gameList");
const summaryLineEl    = document.getElementById("summaryLine");
const summaryTableEl   = document.getElementById("summaryTableWrap");
const moveCounterEl    = document.getElementById("moveCounter");
const moveSanEl        = document.getElementById("moveSan");
const btnFirst         = document.getElementById("btnFirst");
const btnPrev          = document.getElementById("btnPrev");
const btnNext          = document.getElementById("btnNext");
const btnLast          = document.getElementById("btnLast");
const btnAuto          = document.getElementById("btnAuto");
const speedSelect      = document.getElementById("speedSelect");

// ─── FEN utilities ────────────────────────────────────────────────────────────

function boardFromFen(fen) {
  const placement = fen.split(" ")[0];
  return placement.split("/").map((row) => {
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
  return `${"abcdefgh"[col]}${8 - row}`;
}

// ─── Board renderer ───────────────────────────────────────────────────────────

function renderBoardFromFen(fen, lastFrom, lastTo) {
  boardEl.innerHTML = "";
  const grid = boardFromFen(fen);

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const sq = coords(row, col);
      const cell = document.createElement("div");
      cell.className = `square ${(row + col) % 2 === 0 ? "light" : "dark"}`;
      cell.dataset.square = sq;

      if (lastFrom && (sq === lastFrom || sq === lastTo)) {
        cell.classList.add("last");
      }

      const coordSpan = document.createElement("span");
      coordSpan.className = "coord";
      coordSpan.textContent = sq.toUpperCase();
      cell.appendChild(coordSpan);

      const pieceCode = grid[row][col];
      if (pieceCode) {
        const img = document.createElement("img");
        img.className = "piece";
        img.alt = pieceCode;
        img.draggable = false;
        img.src = `${pieceAssetBase}/${pieceAssetCode[pieceCode]}.png`;
        cell.appendChild(img);
      }

      boardEl.appendChild(cell);
    }
  }
}

// ─── Starting FEN ─────────────────────────────────────────────────────────────

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// ─── Move list sidebar ────────────────────────────────────────────────────────

function buildMoveList(game) {
  const container = document.createElement("div");
  container.id = "replayMoveList";
  container.className = "replay-move-list";

  // "Start" entry
  const startItem = document.createElement("div");
  startItem.className = "rmove-item" + (stepIdx === 0 ? " current" : "");
  startItem.dataset.step = "0";
  startItem.innerHTML = `<span class="rmove-num">—</span><span class="rmove-san">Start position</span><span class="rmove-side"></span>`;
  startItem.addEventListener("click", () => jumpTo(0));
  container.appendChild(startItem);

  game.moves.forEach((mv, i) => {
    const item = document.createElement("div");
    item.className = "rmove-item" + (stepIdx === i + 1 ? " current" : "");
    item.dataset.step = String(i + 1);
    item.innerHTML = `
      <span class="rmove-num">${mv.moveNumber}${mv.color === "white" ? "." : "…"}</span>
      <span class="rmove-san">${mv.san}</span>
      <span class="rmove-side">${mv.color === "white" ? "White" : "Black"}</span>
    `;
    item.addEventListener("click", () => jumpTo(i + 1));
    container.appendChild(item);
  });

  return container;
}

function refreshMoveList() {
  const old = document.getElementById("replayMoveList");
  if (!old) return;
  const game = allGames[activeGameIdx];
  const newList = buildMoveList(game);
  old.replaceWith(newList);
  scrollMoveListToCurrent();
}

function scrollMoveListToCurrent() {
  const list = document.getElementById("replayMoveList");
  if (!list) return;
  const current = list.querySelector(".current");
  if (current) current.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

// ─── Game selector list ───────────────────────────────────────────────────────

function resultLabel(game) {
  if (game.winner === "black") return '<span class="win-black">AI wins</span>';
  if (game.winner === "white") return '<span class="win-white">Random wins</span>';
  return '<span class="win-draw">Draw</span>';
}

function buildGameList() {
  gameListEl.innerHTML = "";

  allGames.forEach((game, idx) => {
    const card = document.createElement("button");
    card.className = "game-card" + (activeGameIdx === idx ? " active" : "");
    card.innerHTML = `
      <p class="game-card-title">Game ${game.game}</p>
      <p class="game-card-sub">${resultLabel(game)} &nbsp;·&nbsp; ${game.resultReason} &nbsp;·&nbsp; ${game.totalMoves} moves</p>
    `;
    card.addEventListener("click", () => selectGame(idx));
    gameListEl.appendChild(card);
  });
}

// ─── Summary table (shown before any game is selected) ────────────────────────

function buildSummaryTable() {
  let html = `
    <table class="summary-table">
      <thead>
        <tr>
          <th>#</th><th>Winner</th><th>Reason</th><th>Moves</th>
        </tr>
      </thead>
      <tbody>
  `;
  allGames.forEach((g) => {
    html += `<tr>
      <td>${g.game}</td>
      <td>${resultLabel(g)}</td>
      <td>${g.resultReason}</td>
      <td>${g.totalMoves}</td>
    </tr>`;
  });
  html += `</tbody></table>`;
  summaryTableEl.innerHTML = html;
}

// ─── Navigation ───────────────────────────────────────────────────────────────

function getFenAtStep(game, step) {
  if (step === 0) return START_FEN;
  return game.moves[step - 1].fen;
}

function getLastMoveAtStep(game, step) {
  if (step === 0) return { from: null, to: null };
  return { from: game.moves[step - 1].from, to: game.moves[step - 1].to };
}

function applyStep() {
  const game = allGames[activeGameIdx];
  const totalSteps = game.moves.length;
  const fen = getFenAtStep(game, stepIdx);
  const { from, to } = getLastMoveAtStep(game, stepIdx);

  renderBoardFromFen(fen, from, to);
  refreshMoveList();

  // Counter text
  if (stepIdx === 0) {
    moveCounterEl.textContent = "Start position";
    moveSanEl.textContent = "White = Random agent   |   Black = Minimax AI (hard)";
  } else if (stepIdx === totalSteps) {
    const last = game.moves[stepIdx - 1];
    moveCounterEl.textContent = `Move ${last.moveNumber} — ${last.color === "white" ? "White" : "Black"}`;
    moveSanEl.textContent = `${last.san}   |   ${
      game.winner === "black"
        ? "AI (Black) wins by " + game.resultReason
        : game.winner === "white"
        ? "Random (White) wins by " + game.resultReason
        : "Draw — " + game.resultReason
    }`;
  } else {
    const mv = game.moves[stepIdx - 1];
    moveCounterEl.textContent = `Move ${mv.moveNumber} — ${mv.color === "white" ? "White" : "Black"}`;
    moveSanEl.textContent = mv.san;
  }

  // Button states
  btnFirst.disabled = stepIdx === 0;
  btnPrev.disabled  = stepIdx === 0;
  btnNext.disabled  = stepIdx >= totalSteps;
  btnLast.disabled  = stepIdx >= totalSteps;
}

function jumpTo(step) {
  stopAuto();
  stepIdx = step;
  applyStep();
}

function stepForward() {
  const game = allGames[activeGameIdx];
  if (stepIdx < game.moves.length) {
    stepIdx += 1;
    applyStep();
  }
  if (stepIdx >= game.moves.length) stopAuto();
}

function stepBack() {
  if (stepIdx > 0) {
    stepIdx -= 1;
    applyStep();
  }
}

// ─── Auto-play ────────────────────────────────────────────────────────────────

function stopAuto() {
  if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
  }
  btnAuto.textContent = "▶❚❚";
  btnAuto.classList.remove("autoplay-active");
}

function startAuto() {
  const delay = parseInt(speedSelect.value, 10);
  // If already at end, restart from beginning
  const game = allGames[activeGameIdx];
  if (stepIdx >= game.moves.length) stepIdx = 0;

  btnAuto.textContent = "❚❚";
  btnAuto.classList.add("autoplay-active");
  applyStep();
  autoTimer = setInterval(() => {
    stepForward();
    if (stepIdx >= allGames[activeGameIdx].moves.length) stopAuto();
  }, delay);
}

// ─── Select / load a game ─────────────────────────────────────────────────────

function selectGame(idx) {
  stopAuto();
  activeGameIdx = idx;
  stepIdx = 0;

  // Show board, hide placeholder
  boardEl.style.display = "";
  placeholderEl.style.display = "none";

  // Rebuild sidebar with move list under header
  const old = document.getElementById("replayMoveList");
  if (old) old.remove();

  const game = allGames[activeGameIdx];
  const moveList = buildMoveList(game);
  // Insert after game list
  document.querySelector(".replay-sidebar").appendChild(moveList);

  buildGameList(); // re-render to show active card
  applyStep();
}

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────

document.addEventListener("keydown", (e) => {
  if (activeGameIdx === null) return;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); jumpTo(stepIdx + 1 <= allGames[activeGameIdx].moves.length ? stepIdx + 1 : stepIdx); }
  if (e.key === "ArrowLeft"  || e.key === "ArrowUp")   { e.preventDefault(); jumpTo(stepIdx - 1 >= 0 ? stepIdx - 1 : 0); }
  if (e.key === "Home") { e.preventDefault(); jumpTo(0); }
  if (e.key === "End")  { e.preventDefault(); jumpTo(allGames[activeGameIdx].moves.length); }
  if (e.key === " ")    { e.preventDefault(); autoTimer ? stopAuto() : startAuto(); }
});

// ─── Button wiring ────────────────────────────────────────────────────────────

btnFirst.addEventListener("click", () => jumpTo(0));
btnPrev .addEventListener("click", () => jumpTo(Math.max(0, stepIdx - 1)));
btnNext .addEventListener("click", () => jumpTo(Math.min(allGames[activeGameIdx]?.moves.length ?? 0, stepIdx + 1)));
btnLast .addEventListener("click", () => jumpTo(allGames[activeGameIdx]?.moves.length ?? 0));
btnAuto .addEventListener("click", () => { autoTimer ? stopAuto() : startAuto(); });

speedSelect.addEventListener("change", () => {
  if (autoTimer) { stopAuto(); startAuto(); }
});

// ─── Initial load ─────────────────────────────────────────────────────────────

(async function init() {
  // Hide board until a game is selected
  boardEl.style.display = "none";

  try {
    const res = await fetch("/games.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    allGames = await res.json();
  } catch (err) {
    summaryLineEl.textContent = "Could not load games.json. Run: node run_games.js";
    return;
  }

  const aiWins = allGames.filter((g) => g.winner === "black").length;
  summaryLineEl.textContent = `${allGames.length} games  ·  AI wins: ${aiWins}/${allGames.length}`;

  buildGameList();
  buildSummaryTable();
})();
