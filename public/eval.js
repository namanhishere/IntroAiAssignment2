/**
 * eval.js — frontend logic for /eval.html
 *
 * Fetches /eval_results.json and renders:
 *   - Two sections (depth sweep + randomness sweep)
 *   - A CSS bar chart per section, switchable between Win Rate / Avg Moves / Avg Time
 *   - Per-config collapsible game-by-game result tables
 */

"use strict";

// ─── State ────────────────────────────────────────────────────────────────────

let evalData   = null;
let activeMetric = "winrate"; // "winrate" | "moves" | "time"

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const sectionsEl   = document.getElementById("evalSections");
const loadingEl    = document.getElementById("loadingMsg");
const metricBtns   = document.querySelectorAll(".metric-btn");

// ─── Metric helpers ───────────────────────────────────────────────────────────

const METRICS = {
  winrate: {
    key:    "winRate",
    label:  cfg => cfg.winRate.toFixed(0) + "%",
    max:    100,
    unit:   "%",
    cls:    "metric-winrate",
  },
  moves: {
    key:    "avgMoves",
    label:  cfg => cfg.avgMoves.toFixed(1),
    max:    cfg => cfg,   // computed dynamically
    unit:   " moves",
    cls:    "metric-moves",
  },
  time: {
    key:    "avgTime",
    label:  cfg => cfg.avgTime.toFixed(0) + "ms",
    max:    cfg => cfg,
    unit:   "ms",
    cls:    "metric-time",
  },
};

function getMax(metric, configs) {
  if (metric === "winrate") return 100;
  const key = METRICS[metric].key;
  return Math.max(...configs.map(c => c[key])) * 1.05; // 5% headroom
}

// ─── Bar chart ────────────────────────────────────────────────────────────────

/**
 * Build or update the bar chart for one category.
 * Uses data-* attributes so we can re-render when metric changes without
 * rebuilding the whole DOM.
 */
function buildChart(container, configs, metric) {
  container.innerHTML = "";
  const maxVal = getMax(metric, configs);
  const def    = METRICS[metric];

  for (const cfg of configs) {
    const val   = cfg[def.key];
    const pct   = Math.max((val / maxVal) * 100, 0.5); // at least 0.5% wide
    const label = def.label(cfg);

    const row = document.createElement("div");
    row.className = "bar-row";

    // x-axis label
    const lbl = document.createElement("div");
    lbl.className   = "bar-label";
    lbl.textContent = cfg.label;

    // track + fill
    const track = document.createElement("div");
    track.className = "bar-track";

    const fill = document.createElement("div");
    fill.className = `bar-fill ${def.cls}`;
    fill.style.width  = "0%"; // start at 0 for transition
    fill.dataset.target = String(pct.toFixed(2));
    fill.textContent  = val > maxVal * 0.18 ? label : ""; // only show inside if enough space

    track.appendChild(fill);

    // value label on the right
    const valEl = document.createElement("div");
    valEl.className   = "bar-value";
    valEl.textContent = label;

    row.appendChild(lbl);
    row.appendChild(track);
    row.appendChild(valEl);
    container.appendChild(row);
  }

  // Animate fills after paint
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      container.querySelectorAll(".bar-fill").forEach(el => {
        el.style.width = el.dataset.target + "%";
      });
    });
  });
}

// ─── Per-game table ───────────────────────────────────────────────────────────

function winnerBadge(winner) {
  if (winner === "black") return '<span class="win-black">AI (Black)</span>';
  if (winner === "white") return '<span class="win-white">Random (White)</span>';
  return '<span class="win-draw">Draw</span>';
}

function buildGameTable(games) {
  let html = `
    <div class="game-table-wrap">
      <table class="game-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Winner</th>
            <th>Reason</th>
            <th>Total Moves</th>
            <th>Time (ms)</th>
          </tr>
        </thead>
        <tbody>
  `;
  for (const g of games) {
    html += `<tr>
      <td>${g.game}</td>
      <td>${winnerBadge(g.winner)}</td>
      <td>${g.resultReason}</td>
      <td>${g.totalMoves}</td>
      <td>${g.elapsedMs}</td>
    </tr>`;
  }
  html += `</tbody></table></div>`;
  return html;
}

// ─── Section builder ──────────────────────────────────────────────────────────

function buildSection(category) {
  const section = document.createElement("div");
  section.className    = "eval-section";
  section.dataset.catId = category.id;

  // Header
  const h2 = document.createElement("h2");
  h2.textContent = category.title;
  section.appendChild(h2);

  const desc = document.createElement("p");
  desc.className   = "desc";
  desc.textContent = category.description;
  section.appendChild(desc);

  // Bar chart
  const chartWrap = document.createElement("div");
  chartWrap.className   = "chart-wrap";
  chartWrap.dataset.chart = category.id;
  buildChart(chartWrap, category.configs, activeMetric);
  section.appendChild(chartWrap);

  // Per-config collapsible blocks
  for (const cfg of category.configs) {
    const block = document.createElement("div");
    block.className = "config-block";

    const header = document.createElement("div");
    header.className = "config-header";

    const title = document.createElement("span");
    title.className   = "config-title";
    title.textContent = cfg.label;

    const stats = document.createElement("span");
    stats.className   = "config-stats";
    stats.innerHTML   =
      `Win Rate: <strong>${cfg.winRate.toFixed(0)}%</strong> &nbsp;|&nbsp; ` +
      `Avg Moves: <strong>${cfg.avgMoves.toFixed(1)}</strong> &nbsp;|&nbsp; ` +
      `Avg Time: <strong>${cfg.avgTime.toFixed(0)}ms</strong> &nbsp;|&nbsp; ` +
      `W/L/D: <strong>${cfg.wins}/${cfg.losses}/${cfg.draws}</strong>`;

    const toggle = document.createElement("button");
    toggle.className   = "toggle-link";
    toggle.textContent = "show games ▾";

    const details = document.createElement("div");
    details.className = "config-details";
    details.innerHTML  = buildGameTable(cfg.games);

    toggle.addEventListener("click", () => {
      const open = details.classList.toggle("open");
      toggle.textContent = open ? "hide games ▴" : "show games ▾";
    });

    header.appendChild(title);
    header.appendChild(stats);
    header.appendChild(toggle);
    block.appendChild(header);
    block.appendChild(details);
    section.appendChild(block);
  }

  return section;
}

// ─── Re-render charts when metric changes ────────────────────────────────────

function refreshCharts() {
  if (!evalData) return;
  for (const category of evalData.categories) {
    const chartWrap = document.querySelector(`[data-chart="${category.id}"]`);
    if (chartWrap) buildChart(chartWrap, category.configs, activeMetric);
  }
}

// ─── Metric button wiring ─────────────────────────────────────────────────────

metricBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    metricBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeMetric = btn.dataset.metric;
    refreshCharts();
  });
});

// ─── Load data and render ─────────────────────────────────────────────────────

(async function init() {
  try {
    const res = await fetch("/eval_results.json");
    if (!res.ok) throw new Error(`HTTP ${res.status} — run: node eval_games.js`);
    evalData = await res.json();
  } catch (err) {
    loadingEl.textContent = `Failed to load eval_results.json: ${err.message}`;
    return;
  }

  // Remove loading message
  loadingEl.remove();

  // Add generation timestamp
  const meta = document.createElement("p");
  meta.style.cssText = "margin:0;font-size:0.8rem;color:var(--muted)";
  meta.textContent   = `Generated: ${new Date(evalData.generatedAt).toLocaleString()}  ·  ${evalData.gamesPerConfig} games per config`;
  sectionsEl.appendChild(meta);

  // Build one section per category
  for (const category of evalData.categories) {
    sectionsEl.appendChild(buildSection(category));
  }
})();
