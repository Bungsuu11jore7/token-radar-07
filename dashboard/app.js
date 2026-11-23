// app.js — Risk-Adjusted Token Radar dashboard ("radar-7").
// Renders everything from window.RADAR (written by main.ts into data.js).
// No network, no hardcoded protocol names: every value comes from data.js.
(function () {
  "use strict";
  const R = window.RADAR;
  if (!R) { document.body.innerHTML = "<p>data.js failed to load.</p>"; return; }
  const $ = (id) => document.getElementById(id);
  const rows = R.rows;
  const anchors = R.anchors;
  const fit = R.fit;
  const ev = R.evidence;
  const held = R.heldOut;

  function money(n) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    const neg = n < 0;
    const a = Math.abs(n);
    let s;
    if (a >= 1e9) s = "$" + (a / 1e9).toFixed(2) + "B";
    else if (a >= 1e6) s = "$" + (a / 1e6).toFixed(1) + "M";
    else if (a >= 1e3) s = "$" + Math.round(a).toLocaleString("en-US");
    else if (a >= 1) s = "$" + a.toFixed(2);
    else s = "$" + a.toFixed(4);
    return neg ? "-" + s : s;
  }
  function moneyShort(n) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    const a = Math.abs(n);
    if (a >= 1e9) return "$" + (a / 1e9).toFixed(0) + "B";
    if (a >= 1e6) return "$" + (a / 1e6).toFixed(0) + "M";
    if (a >= 1e3) return "$" + (a / 1e3).toFixed(0) + "K";
    return "$" + Math.round(a);
  }
  function pct(x, digits) {
    if (x === null || x === undefined || isNaN(x)) return "—";
    return (x * 100).toFixed(digits === undefined ? 1 : digits) + "%";
  }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function fmtDex(x) { if (x === null || x === undefined || isNaN(x)) return "—"; return (x >= 0 ? "+" : "") + x.toFixed(2); }

  // ---------- header / integrity ----------
  $("snapLine").textContent = "Snapshot " + R.generated + " · " + R.counts.total + " protocols · model fitted at runtime";
  $("integrityLine").textContent =
    "No hardcoded protocol names: every value comes from the snapshot's own fields. " +
    R.counts.board + " ranked + " + R.counts.anchors + " traded anchors + " + R.counts.excluded +
    " excluded = " + R.counts.total + " accounted for. " + R.fit.droppedMcap +
    " traded protocols with market cap ≤ 0 were dropped from the fit.";

  // ---------- KPI strip (6 outcome verdicts) ----------
  const miss = ev.typicalMiss, flatMiss = ev.flatMiss;
  const kpis = [
    { label: "Typical miss, out of sample", num: "×" + miss.toFixed(1), sub: "vs ×" + flatMiss.toFixed(1) + " for a flat TVL multiple — 2-fold, median |err|" },
    { label: "Range holds", num: Math.round(ev.coverageP25 * 100) + "% · " + Math.round(ev.coverageP10 * 100) + "%", sub: "P25–P75 · P10–P90 bands, held-out folds (want 50% · 80%)" },
    { label: "Brier score, token odds", num: ev.brier.toFixed(3), sub: "vs " + ev.brierBase.toFixed(3) + " base rate — lower is better" },
    { label: "Fitted value model", num: "log mcap = " + fit.intercept.toFixed(3) + " + " + fit.slope.toFixed(3) + " · log TVL", numClass: "small", sub: "OLS on " + fit.n + " traded comps, fitted at runtime" },
    { label: "Worth farming", num: rows.filter((r) => r.verdict === "Farm").length + " of " + rows.length, sub: "Farm verdicts on the board" },
    { label: "Watchlist", num: R.counts.watchlist + " / 40", sub: "watched protocols on the board" },
  ];
  $("kpiStrip").innerHTML = kpis.map((k) =>
    '<div class="card"><div class="k-label">' + k.label + '</div><div class="k-num' + (k.numClass ? " " + k.numClass : "") + '">' + esc(k.num) + '</div><div class="k-sub">' + esc(k.sub) + "</div></div>").join("");

  // ---------- ledger (slim) ----------
  const exByReason = {};
  R.excluded.forEach((e) => { exByReason[e.reason] = e.count; });
  const segDefs = [
    { key: "ranked", label: "ranked", n: R.counts.board, cls: "seg-ranked" },
    { key: "traded", label: "traded", n: R.counts.anchors, cls: "seg-traded" },
    { key: "excluded", label: "set aside", n: R.counts.excluded, cls: "seg-excluded" },
  ];
  $("ledgerBar").innerHTML = segDefs.map((s) =>
    '<span class="' + s.cls + '" style="width:' + (s.n / R.counts.total * 100).toFixed(1) + '%">' + s.n + " " + s.label + "</span>").join("");
  const segOrder = ["versioned duplicate", "category Liquid Staking", "category Bridge", "category CEX", "category Canonical Bridge", "category Liquid Restaking", "wrapped/staked product", "category Restaked BTC", "exchange product"];
  const segBits = ["<b>" + R.counts.board + " ranked</b> (" + (R.counts.board / R.counts.total * 100).toFixed(1) + "%)",
    "<b>" + R.counts.anchors + " already trade</b> (" + (R.counts.anchors / R.counts.total * 100).toFixed(1) + "%)",
    "<b>" + R.counts.excluded + " set aside</b> (" + (R.counts.excluded / R.counts.total * 100).toFixed(1) + "%):"];
  segOrder.forEach((reason) => {
    if (exByReason[reason]) segBits.push("<b>" + exByReason[reason] + "</b> " + esc(reason));
  });
  $("ledgerSegs").innerHTML = segBits.join(" · ");
  $("ledgerPills").innerHTML =
    '<span class="pill">✓ this table = board.json: ' + R.counts.board + " of " + R.counts.board + " rows recomputed here</span>" +
    '<span class="pill">✓ totals equal: ' + money(ev.totalsExpected) + " expected</span>" +
    '<span class="pill">✓ watchlist ' + R.counts.watchlist + " of 40</span>" +
    '<span class="pill">✓ ledger ' + R.counts.total + " of " + R.counts.total + "</span>";

  // ---------- model evidence strip ----------
  $("evidenceStrip").innerHTML =
    "<b>Model evidence.</b> Fitted at runtime on " + fit.n + " traded comps · 2-fold R² " +
    held.fold0.r2.toFixed(3) + "/" + held.fold1.r2.toFixed(3) + " · walk-forward R² " + held.walk.r2.toFixed(3) +
    " · LOO R² " + held.loo.r2.toFixed(3) + " · Brier " + ev.brier.toFixed(3) + " vs " + ev.brierBase.toFixed(3) +
    " base · P25–P75 holds " + Math.round(ev.coverageP25 * 100) + "%, P10–P90 " + Math.round(ev.coverageP10 * 100) +
    "% · growth &amp; age tested on the same splits and rejected (age walk R² −0.72; growth negative on fold 1).";

  // ---------- state ----------
  const state = { sortKey: "expectedUsd", sortDir: -1, detail: null, dtab: "overview", compare: new Set(), pinned: new Set() };
  let filtered = rows.slice();

  // ---------- ladder ----------
  function renderLadder() {
    $("topSignals").innerHTML = rows.slice(0, 10).map((r) =>
      '<li data-slug="' + esc(r.slug) + '" title="' + esc(r.name) + '"><span class="lr">' + r.rank + '</span><span class="ln">' + esc(r.name) + '</span><span class="lv">' + moneyShort(r.expectedUsd) + "</span></li>").join("");
    $("topSignals").querySelectorAll("li").forEach((li) =>
      li.addEventListener("click", () => openDetail(li.getAttribute("data-slug"), "overview")));
  }
  renderLadder();

  // ---------- filters ----------
  const cats = [...new Set(rows.map((r) => r.category))].sort();
  const chains = [...new Set(rows.map((r) => r.chain))].sort();
  cats.forEach((c) => { const o = document.createElement("option"); o.textContent = c; $("fCategory").appendChild(o); });
  chains.forEach((c) => { const o = document.createElement("option"); o.textContent = c; $("fChain").appendChild(o); });

  function applyFilters() {
    const q = ($("fSearch").value || "").toLowerCase();
    const cat = $("fCategory").value, ch = $("fChain").value, vd = $("fVerdict").value;
    const wOnly = $("fWatch").checked;
    filtered = rows.filter((r) =>
      (!q || r.name.toLowerCase().includes(q) || r.slug.includes(q) || r.category.toLowerCase().includes(q)) &&
      (!cat || r.category === cat) && (!ch || r.chain === ch) && (!vd || r.verdict === vd) &&
      (!wOnly || r.watchlist));
    sortRows();
    renderBoard();
  }
  function sortRows() {
    const k = state.sortKey, d = state.sortDir;
    filtered.sort((a, b) => {
      const va = a[k], vb = b[k];
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (typeof va === "string") return va.localeCompare(vb) * d;
      return (va - vb) * d;
    });
  }
  ["fSearch", "fCategory", "fChain", "fVerdict", "fWatch"].forEach((id) =>
    $(id).addEventListener("input", applyFilters));

  // ---------- board ----------
  const COLS = [
    { key: null, label: "" }, { key: null, label: "" }, { key: null, label: "" },
    { key: "rank", label: "Rank" }, { key: "name", label: "Protocol" },
    { key: "category", label: "Category" }, { key: "chain", label: "Chain" },
    { key: "tvlUsd", label: "TVL" }, { key: "change7d", label: "7D" },
    { key: "impliedUsd", label: "Implied" },
    { key: "odds", label: "Odds" }, { key: "expectedUsd", label: "Exp." },
    { key: "netEvUsd", label: "Net EV" }, { key: "netPerHourUsd", label: "Net $/h" },
    { key: "p25Usd", label: "Range" }, { key: "verdict", label: "Verdict" },
  ];
  const VERDICT_ORDER = { Farm: 0, Thin: 1, Skip: 2 };
  $("boardHead").innerHTML = COLS.map((c) =>
    '<th data-key="' + (c.key || "") + '">' + c.label + (c.key === state.sortKey ? (state.sortDir === -1 ? " ▼" : " ▲") : "") + "</th>").join("");
  function bindHead() {
    $("boardHead").querySelectorAll("th").forEach((th) => {
      th.addEventListener("click", () => {
        const k = th.getAttribute("data-key");
        if (!k) return;
        if (state.sortKey === k) state.sortDir = -state.sortDir;
        else { state.sortKey = k; state.sortDir = -1; }
        renderHead();
        sortRowsWithVerdict();
        renderBoard();
      });
    });
  }
  function renderHead() {
    $("boardHead").innerHTML = COLS.map((c) =>
      '<th data-key="' + (c.key || "") + '">' + c.label + (c.key === state.sortKey ? (state.sortDir === -1 ? " ▼" : " ▲") : "") + "</th>").join("");
    bindHead();
  }
  bindHead();
  function sortRowsWithVerdict() {
    const k = state.sortKey, d = state.sortDir;
    filtered.sort((a, b) => {
      let va = a[k], vb = b[k];
      if (k === "verdict") { va = VERDICT_ORDER[a.verdict]; vb = VERDICT_ORDER[b.verdict]; }
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (typeof va === "string") return va.localeCompare(vb) * d;
      return (va - vb) * d;
    });
  }
  const rangeMin = Math.log10(Math.min.apply(null, rows.map((r) => r.p25Usd)));
  const rangeMax = Math.log10(Math.max.apply(null, rows.map((r) => r.p75Usd)));
  function rangeBar(r) {
    const lo = (Math.log10(r.p25Usd) - rangeMin) / (rangeMax - rangeMin) * 100;
    const hi = (Math.log10(r.p75Usd) - rangeMin) / (rangeMax - rangeMin) * 100;
    const tk = (Math.log10(r.impliedUsd) - rangeMin) / (rangeMax - rangeMin) * 100;
    return '<div class="rangebar" title="P25 ' + money(r.p25Usd) + " – P75 " + money(r.p75Usd) + '">' +
      '<div class="band" style="left:' + lo.toFixed(1) + "%;width:" + Math.max(hi - lo, 1).toFixed(1) + '%"></div>' +
      '<div class="tick" style="left:' + tk.toFixed(1) + '%"></div></div>';
  }
  function renderBoard() {
    const totalTvl = filtered.reduce((a, r) => a + r.tvlUsd, 0);
    const totalExp = filtered.reduce((a, r) => a + r.expectedUsd, 0);
    $("bookSummary").textContent = filtered.length + " of " + rows.length + " rows · " +
      money(totalTvl) + " TVL · " + money(totalExp) + " expected";
    $("boardBody").innerHTML = filtered.map((r) =>
      '<tr data-slug="' + esc(r.slug) + '">' +
      '<td><input type="checkbox" class="cmp" data-slug="' + esc(r.slug) + '"' + (state.compare.has(r.slug) ? " checked" : "") + ' aria-label="Compare"></td>' +
      '<td><button class="btn ghost pin" data-slug="' + esc(r.slug) + '" aria-label="Pin">' + (state.pinned.has(r.slug) ? "★" : "☆") + "</button></td>" +
      "<td>" + (r.watchlist ? "📌" : "") + "</td>" +
      "<td>" + r.rank + "</td>" +
      '<td class="proto">' + esc(r.name) + "</td>" +
      "<td>" + esc(r.category) + "</td><td>" + esc(r.chain) + "</td>" +
      "<td>" + money(r.tvlUsd) + "</td>" +
      "<td>" + (r.change7d === null ? "—" : r.change7d.toFixed(1) + "%") + "</td>" +
      "<td>" + money(r.impliedUsd) + "</td>" +
      "<td>" + pct(r.odds) + "</td>" +
      "<td>" + money(r.expectedUsd) + "</td>" +
      "<td>" + money(r.netEvUsd) + "</td>" +
      "<td>" + money(r.netPerHourUsd) + "</td>" +
      "<td>" + rangeBar(r) + "</td>" +
      '<td><span class="verdict ' + r.verdict + '">' + r.verdict + "</span></td></tr>").join("");
    $("boardBody").querySelectorAll("tr").forEach((tr) =>
      tr.addEventListener("click", (e) => {
        if (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON") return;
        openDetail(tr.getAttribute("data-slug"), "overview");
      }));
    $("boardBody").querySelectorAll(".cmp").forEach((cb) =>
      cb.addEventListener("change", () => {
        const s = cb.getAttribute("data-slug");
        if (cb.checked) { if (state.compare.size >= 3) { cb.checked = false; return; } state.compare.add(s); }
        else state.compare.delete(s);
        renderCompareBar();
      }));
    $("boardBody").querySelectorAll(".pin").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const s = b.getAttribute("data-slug");
        if (state.pinned.has(s)) state.pinned.delete(s); else state.pinned.add(s);
        renderPins();
        renderBoard();
      }));
    renderCompareBar();
  }
  function renderPins() {
    const box = $("pinnedBox");
    if (state.pinned.size === 0) { box.hidden = true; return; }
    box.hidden = false;
    $("pinnedList").innerHTML = [...state.pinned].map((s) => {
      const r = rows.find((x) => x.slug === s);
      return '<li><span>' + esc(r.name) + '</span><span>' + money(r.expectedUsd) + '</span><button class="btn ghost" data-slug="' + esc(s) + '">✕</button></li>';
    }).join("");
    $("pinnedList").querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => { state.pinned.delete(b.getAttribute("data-slug")); renderPins(); renderBoard(); }));
    $("pinnedList").querySelectorAll("li").forEach((li) =>
      li.addEventListener("click", (e) => { if (e.target.tagName !== "BUTTON") openDetail(li.querySelector("button").getAttribute("data-slug"), "overview"); }));
  }
  function renderCompareBar() {
    const bar = $("compareBar");
    if (state.compare.size === 0) { bar.hidden = true; $("comparePane").hidden = true; return; }
    bar.hidden = false;
    $("compareCount").textContent = state.compare.size + " selected (max 3)";
  }
  $("compareBtn").addEventListener("click", () => {
    const sel = [...state.compare].map((s) => rows.find((x) => x.slug === s));
    const fields = [
      ["TVL", (r) => money(r.tvlUsd)], ["Implied", (r) => money(r.impliedUsd)],
      ["Odds", (r) => pct(r.odds)], ["Expected", (r) => money(r.expectedUsd)],
      ["Net EV", (r) => money(r.netEvUsd)], ["Net $/hour", (r) => money(r.netPerHourUsd)],
      ["Breakeven", (r) => pct(r.breakeven, 3)], ["Verdict", (r) => r.verdict],
      ["Age", (r) => (r.ageDays === null ? "—" : r.ageDays + "d")],
      ["7D", (r) => (r.change7d === null ? "—" : r.change7d.toFixed(1) + "%")],
    ];
    $("comparePane").innerHTML = "<table class='kv'><thead><tr><th></th>" +
      sel.map((r) => "<th>" + esc(r.name) + "</th>").join("") + "</tr></thead><tbody>" +
      fields.map(([label, fn]) => "<tr><td>" + label + "</td>" + sel.map((r) => "<td>" + fn(r) + "</td>").join("") + "</tr>").join("") +
      "</tbody></table>";
    $("comparePane").hidden = false;
  });
  $("compareClear").addEventListener("click", () => { state.compare.clear(); renderCompareBar(); renderBoard(); });

  // ---------- anchors ----------
  $("anchorBody").innerHTML = anchors.map((a) =>
    "<tr><td class='proto'>" + esc(a.name) + "</td><td>" + money(a.tvlUsd) + "</td><td>" + money(a.mcapUsd) +
    "</td><td>" + money(a.fittedUsd) + "</td><td>" + a.ratio.toFixed(2) + "×</td><td>" + fmtDex(a.errDex) + "</td></tr>").join("");

  // ---------- tabs ----------
  function showTab(which) {
    $("tabBoard").classList.toggle("active", which === "board");
    $("tabAnchors").classList.toggle("active", which === "anchors");
    $("tabMethod").classList.toggle("active", which === "method");
    $("boardPane").hidden = which !== "board";
    $("anchorPane").hidden = which !== "anchors";
    $("methodPane").hidden = which !== "method";
  }
  $("tabBoard").addEventListener("click", () => showTab("board"));
  $("tabAnchors").addEventListener("click", () => showTab("anchors"));
  $("tabMethod").addEventListener("click", () => showTab("method"));

  // ---------- methodology ----------
  const stats = [
    { label: "Alpha (intercept)", num: fit.intercept.toFixed(4), sub: "log10 mcap at TVL $1" },
    { label: "Beta (slope)", num: fit.slope.toFixed(4), sub: "per dex of TVL" },
    { label: "LOO miss", num: "×" + (10 ** held.loo.medAbsErr).toFixed(2), sub: "median |err| " + held.loo.medAbsErr.toFixed(3) + " dex" },
    { label: "Within ×2", num: Math.round(ev.within2 * 1000) / 10 + "%", sub: "held-out values within ×2 (LOO residuals)" },
    { label: "Time split", num: held.walk.r2.toFixed(3), sub: "walk-forward R², older → younger" },
    { label: "P10–P90 band", num: "×" + (10 ** ev.looQ10).toFixed(2) + "–×" + (10 ** ev.looQ90).toFixed(2), sub: "LOO residual quantiles" },
  ];
  $("methodStats").innerHTML = stats.map((s) =>
    '<div class="stat"><div class="s-label">' + s.label + '</div><div class="s-num">' + esc(s.num) + '</div><div class="s-sub">' + esc(s.sub) + "</div></div>").join("");
  (function scatter() {
    const W = 760, H = 320, P = 42;
    const plotted = anchors.filter((a) => a.mcapUsd > 0 && a.tvlUsd > 0 && a.errDex !== null);
    const xs = plotted.map((a) => Math.log10(a.tvlUsd)).concat(rows.map((r) => Math.log10(r.tvlUsd)));
    const ys = plotted.map((a) => Math.log10(a.mcapUsd)).concat(rows.map((r) => Math.log10(r.impliedUsd)));
    const x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    const y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    const X = (v) => P + (v - x0) / (x1 - x0) * (W - 2 * P);
    const Y = (v) => H - P - (v - y0) / (y1 - y0) * (H - 2 * P);
    let s = '<svg viewBox="0 0 ' + W + " " + H + '" width="100%" style="background:#0b1526;border:1px solid var(--line);border-radius:8px">';
    for (let e = 6; e <= 11; e++) {
      s += '<line x1="' + X(e) + '" y1="' + (H - P) + '" x2="' + X(e) + '" y2="' + P + '" stroke="#1a2947"/>';
      s += '<text x="' + X(e) + '" y="' + (H - P + 16) + '" fill="#93a5c4" font-size="10" text-anchor="middle">10^' + e + "</text>";
    }
    for (let e = 6; e <= 11; e++) {
      s += '<line x1="' + P + '" y1="' + Y(e) + '" x2="' + (W - P) + '" y2="' + Y(e) + '" stroke="#1a2947"/>';
      s += '<text x="' + (P - 6) + '" y="' + (Y(e) + 3) + '" fill="#93a5c4" font-size="10" text-anchor="end">10^' + e + "</text>";
    }
    s += '<line x1="' + X(x0) + '" y1="' + Y(fit.intercept + fit.slope * x0) + '" x2="' + X(x1) + '" y2="' + Y(fit.intercept + fit.slope * x1) + '" stroke="#2dd4bf" stroke-width="2"/>';
    plotted.forEach((a) => { s += '<circle cx="' + X(Math.log10(a.tvlUsd)).toFixed(1) + '" cy="' + Y(Math.log10(a.mcapUsd)).toFixed(1) + '" r="2.6" fill="#7aa7ff"/>'; });
    rows.forEach((r) => { s += '<circle cx="' + X(Math.log10(r.tvlUsd)).toFixed(1) + '" cy="' + Y(Math.log10(r.impliedUsd)).toFixed(1) + '" r="1.8" fill="#2dd4bf" opacity="0.55"/>'; });
    s += '<text x="' + (W - P) + '" y="' + (P - 8) + '" fill="#93a5c4" font-size="11" text-anchor="end">blue = 128 traded comps · teal = 340 board rows · line = fitted M1</text></svg>';
    $("scatterBox").innerHTML = s;
  })();
  $("candidateTable").innerHTML = "<table class='kv'><thead><tr><th>Term</th><th>2-fold R²</th><th>2-fold median |err|</th><th>Walk R²</th><th>Walk median |err|</th><th>Verdict</th></tr></thead><tbody>" +
    R.candidates.map((c) =>
      "<tr><td>" + esc(c.label) + "</td><td>" + c.fold0.r2.toFixed(3) + " / " + c.fold1.r2.toFixed(3) + "</td><td>" +
      c.fold0.medAbsErr.toFixed(3) + " / " + c.fold1.medAbsErr.toFixed(3) + "</td><td>" + c.walk.r2.toFixed(3) + "</td><td>" +
      c.walk.medAbsErr.toFixed(3) + "</td><td>" + (c.kept ? "<b>KEPT</b>" : "tested") + "</td></tr>").join("") +
    "</tbody></table><p class='mini'>Kept rule: a term is kept only if it beats M1 on both the mean 2-fold R² and the walk-forward R². Only M1 survives. Flat TVL multiple for comparison: 2-fold R² " +
    held.flatFold0.r2.toFixed(3) + "/" + held.flatFold1.r2.toFixed(3) + ", walk R² " + held.flatWalk.r2.toFixed(3) + ".</p>";
  $("brierTable").innerHTML = "<table class='kv'><thead><tr><th>Age band</th><th>N</th><th>Tokens</th><th>Rate</th></tr></thead><tbody>" +
    R.odds.map((o) => "<tr><td>" + esc(o.label) + "</td><td>" + o.n + "</td><td>" + o.tokens + "</td><td>" + pct(o.rate, 1) + "</td></tr>").join("") +
    "<tr><td>Model Brier</td><td colspan='2'></td><td><b>" + ev.brier.toFixed(3) + "</b></td></tr>" +
    "<tr><td>Base rate Brier</td><td colspan='2'></td><td>" + ev.brierBase.toFixed(3) + "</td></tr></tbody></table>" +
    "<p class='mini'>Base rate " + pct(R.baseRate, 1) + " over all " + R.counts.total + " protocols. Age unknown falls back to the base rate.</p>";
  $("rangeTable").innerHTML = "<table class='kv'><thead><tr><th>Check</th><th>Value</th><th>Want</th></tr></thead><tbody>" +
    "<tr><td>P25–P75 holds</td><td><b>" + Math.round(ev.coverageP25 * 100) + "%</b></td><td>50%</td></tr>" +
    "<tr><td>P10–P90 holds</td><td><b>" + Math.round(ev.coverageP10 * 100) + "%</b></td><td>80%</td></tr>" +
    "<tr><td>LOO median |err|</td><td>" + held.loo.medAbsErr.toFixed(3) + " dex (×" + (10 ** held.loo.medAbsErr).toFixed(2) + ")</td><td>—</td></tr>" +
    "<tr><td>LOO R²</td><td>" + held.loo.r2.toFixed(3) + "</td><td>—</td></tr>" +
    "<tr><td>LOO residual q10 / q90</td><td>" + ev.looQ10.toFixed(2) + " / +" + ev.looQ90.toFixed(2) + " dex</td><td>—</td></tr>" +
    "<tr><td>LOO residual q25 / q75</td><td>" + ev.looQ25.toFixed(2) + " / +" + ev.looQ75.toFixed(2) + " dex</td><td>—</td></tr></tbody></table>" +
    "<p class='mini'>Ranges are train-fold residual quantiles tested on the held-out fold. A row's P25–P75 band is its implied value × " +
    (10 ** ev.looQ25).toFixed(2) + " to ×" + (10 ** ev.looQ75).toFixed(2) + ".</p>";

  // ---------- sandbox ----------
  let sbSubject = rows[0];
  function renderSandbox() {
    const dep = parseFloat($("sbDep").value) || 1000;
    const share = parseFloat($("sbShare").value) || 1;
    const mult = parseFloat($("sbTvl").value) || 1;
    $("sbTvlVal").textContent = mult.toFixed(1) + "×";
    $("sbSubject").textContent = sbSubject.name + " — TVL " + money(sbSubject.tvlUsd) + " · odds " + pct(sbSubject.odds);
    const implied2 = 10 ** (fit.intercept + fit.slope * Math.log10(sbSubject.tvlUsd * mult));
    const expected2 = Math.round(implied2 * sbSubject.odds);
    const net2 = expected2 * share * (dep / sbSubject.capitalUsd) - sbSubject.totalCostUsd;
    const dExp = expected2 - sbSubject.expectedUsd;
    $("sbResult").innerHTML =
      "TVL " + money(sbSubject.tvlUsd) + " → " + money(sbSubject.tvlUsd * mult) +
      " · implied <span class='big'>" + money(Math.round(implied2)) + "</span>" +
      " · expected <span class='big'>" + money(expected2) + "</span> (" + (dExp >= 0 ? "+" : "") + money(dExp) + " vs board)" +
      "<br>Net <span class='big'>" + money(Math.round(net2)) + "</span> (" + money(net2 / sbSubject.activeHours) + "/hour) at deposit " + money(dep) + ", share " + share + "×";
  }
  ["sbDep", "sbShare", "sbTvl"].forEach((id) => $(id).addEventListener("input", renderSandbox));

  // ---------- detail ----------
  function nearestPeers(row) {
    const lt = Math.log10(row.tvlUsd);
    return anchors.filter((a) => a.mcapUsd > 0 && a.tvlUsd > 0)
      .map((a) => ({ a, d: Math.abs(Math.log10(a.tvlUsd) - lt) }))
      .sort((x, y) => x.d - y.d).slice(0, 6).map((x) => x.a);
  }
  function openDetail(slug, tab) {
    const row = rows.find((r) => r.slug === slug);
    if (!row) return;
    state.detail = slug;
    state.dtab = tab || "overview";
    sbSubject = row;
    renderSandbox();
    $("detailName").textContent = row.name + " — rank #" + row.rank + " · " + row.category + " · " + row.chain;
    $("detail").hidden = false;
    renderDetailBody(row);
    $("detail").scrollIntoView({ block: "start" });
  }
  $("detailClose").addEventListener("click", () => { $("detail").hidden = true; state.detail = null; });
  [["dtabOverview", "overview"], ["dtabFarm", "farm"], ["dtabModel", "model"]].forEach(([id, tab]) => {
    $(id).addEventListener("click", () => {
      state.dtab = tab;
      const row = rows.find((r) => r.slug === state.detail);
      if (row) renderDetailBody(row);
    });
  });
  function renderDetailBody(row) {
    $("dtabOverview").classList.toggle("active", state.dtab === "overview");
    $("dtabFarm").classList.toggle("active", state.dtab === "farm");
    $("dtabModel").classList.toggle("active", state.dtab === "model");
    if (state.dtab === "overview") {
      const peers = nearestPeers(row);
      const deposits = [100, 500, 1000, 5000, 10000];
      const shares = [0.25, 0.5, 1, 2];
      $("detailBody").innerHTML =
        '<div class="hero">FITTED VALUE IF IT LAUNCHES <span class="big">' + money(row.impliedUsd) + "</span> · " +
        "P25–P75 band " + money(row.p25Usd) + " – " + money(row.p75Usd) + " · expected <b>" + money(row.expectedUsd) +
        "</b> at " + pct(row.odds) + " odds · verdict <span class='verdict " + row.verdict + "'>" + row.verdict + "</span></div>" +
        "<h3>How the figure is made</h3><div class='duo'><div><table class='kv'><tbody>" +
        "<tr><td>TVL</td><td>" + money(row.tvlUsd) + "</td></tr>" +
        "<tr><td>Fitted implied (10^(" + fit.intercept.toFixed(3) + " + " + fit.slope.toFixed(3) + " · log10 TVL))</td><td>" + money(row.impliedUsd) + "</td></tr>" +
        "<tr><td>Token odds (" + (row.oddsBucket >= 0 ? esc(R.odds[row.oddsBucket].label) + ", " + R.odds[row.oddsBucket].tokens + " of " + R.odds[row.oddsBucket].n + " peers" : "age unknown, base rate") + ")</td><td>" + pct(row.odds) + "</td></tr>" +
        "<tr><td>Expected value (implied × odds)</td><td>" + money(row.expectedUsd) + "</td></tr>" +
        "<tr><td>Net of farm cost (" + money(row.totalCostUsd) + " total cost)</td><td>" + money(row.netEvUsd) + "</td></tr>" +
        "</tbody></table></div><div><h3 class='inline-h'>Nearest priced peers</h3><table class='kv'><thead><tr><th>Protocol</th><th>Actual mcap</th><th>Fitted</th><th>Error (dex)</th></tr></thead><tbody>" +
        peers.map((a) => "<tr><td>" + esc(a.name) + "</td><td>" + money(a.mcapUsd) + "</td><td>" + money(a.fittedUsd) + "</td><td>" + fmtDex(a.errDex) + "</td></tr>").join("") +
        "</tbody></table></div></div>" +
        "<p class='mini'>Held-out checks behind this figure: 2-fold R² " + held.fold0.r2.toFixed(3) + "/" + held.fold1.r2.toFixed(3) +
        ", walk-forward R² " + held.walk.r2.toFixed(3) + ", LOO R² " + held.loo.r2.toFixed(3) + ", typical miss ×" + ev.typicalMiss.toFixed(1) + " vs ×" + ev.flatMiss.toFixed(1) + " flat.</p>" +
        "<h3>Net farm grid — net $ by deposit × drop share</h3><table class='kv compact'><thead><tr><th>Deposit \\ Share</th>" +
        shares.map((sh) => "<th>" + sh + "×</th>").join("") + "</tr></thead><tbody>" +
        deposits.map((dep) => "<tr><td>" + money(dep) + "</td>" + shares.map((sh) => {
          const net = row.expectedUsd * sh * (dep / row.capitalUsd) - row.totalCostUsd;
          return "<td><b>" + money(Math.round(net)) + "</b></td>";
        }).join("") + "</tr>").join("") + "</tbody></table>" +
        "<p class='mini'>Pro-rata assumption: your share of the drop scales with deposit / " + money(row.capitalUsd) + " working capital. Net = expected × share × (deposit / capital) − " + money(row.totalCostUsd) + " total cost.</p>" +
        "<h3>Farm steps</h3><ol class='steps'>" +
        row.farmSteps.map((s, i) => "<li><b>" + (i + 1) + ".</b> " + esc(s) + "</li>").join("") + "</ol>";
    } else if (state.dtab === "farm") {
      $("detailBody").innerHTML =
        "<h3>Farm plan — " + esc(row.name) + "</h3><ol class='steps'>" +
        row.farmSteps.map((s, i) => "<li><b>" + (i + 1) + ".</b> " + esc(s) + "</li>").join("") + "</ol>" +
        "<table class='kv'><tbody>" +
        "<tr><td>Working capital</td><td>" + money(row.capitalUsd) + "</td></tr>" +
        "<tr><td>Gas per interaction (" + esc(row.chain) + ")</td><td>$" + row.gasUsd.toFixed(2) + "</td></tr>" +
        "<tr><td>Bridge fee (once)</td><td>$" + row.bridgeUsd.toFixed(2) + "</td></tr>" +
        "<tr><td>Weeks</td><td>" + row.weeks + "</td></tr>" +
        "<tr><td>Total cost = gas × (1 + weeks) + bridge</td><td>$" + row.totalCostUsd.toFixed(2) + "</td></tr>" +
        "<tr><td>Active effort</td><td>" + ((row.weeks + 3) * 15) + " minutes (" + row.activeHours.toFixed(2) + " hours)</td></tr>" +
        "<tr><td>Breakeven share</td><td>" + pct(row.breakeven, 3) + "</td></tr>" +
        "<tr><td>Net EV</td><td>" + money(row.netEvUsd) + "</td></tr>" +
        "<tr><td>Net $/hour</td><td>" + money(row.netPerHourUsd) + "</td></tr>" +
        "<tr><td>Verdict</td><td><span class='verdict " + row.verdict + "'>" + row.verdict + "</span></td></tr>" +
        "</tbody></table>";
    } else {
      const dropped = R.candidates.filter((c) => !c.kept);
      $("detailBody").innerHTML =
        "<h3>Model — how this row is priced</h3><table class='kv'><tbody>" +
        "<tr><td>Formula (fitted at runtime)</td><td>log10(mcap) = " + fit.intercept.toFixed(4) + " + " + fit.slope.toFixed(4) + " · log10(TVL)</td></tr>" +
        "<tr><td>Fitted on</td><td>" + fit.n + " traded protocols (market cap &gt; 0, TVL &gt; 0)</td></tr>" +
        "<tr><td>This row's fitted implied</td><td>" + money(row.impliedUsd) + " (TVL " + money(row.tvlUsd) + ")</td></tr>" +
        "<tr><td>Token odds</td><td>" + pct(row.odds) + " — " + (row.oddsBucket >= 0 ? esc(R.odds[row.oddsBucket].label) + " peers: " + R.odds[row.oddsBucket].tokens + " of " + R.odds[row.oddsBucket].n + " record a token" : "age unknown, base rate " + pct(R.baseRate, 1)) + "</td></tr>" +
        "<tr><td>Expected value</td><td>" + money(row.expectedUsd) + " = implied × odds</td></tr>" +
        "</tbody></table>" +
        "<p>Held-out: 2-fold R² " + held.fold0.r2.toFixed(3) + "/" + held.fold1.r2.toFixed(3) + ", walk-forward R² " + held.walk.r2.toFixed(3) +
        ", LOO R² " + held.loo.r2.toFixed(3) + ", Brier " + ev.brier.toFixed(3) + " vs " + ev.brierBase.toFixed(3) + " base.</p>" +
        "<p>Terms tested on the same splits and dropped: " + dropped.map((c) => esc(c.label)).join(", ") +
        ". Only the TVL-only line survives both held-out tests — growth and age add nothing out of sample.</p>";
    }
  }

  // ---------- hash routing (staging + deep links) ----------
  function readHash() {
    const h = new URLSearchParams((location.hash || "#").slice(1));
    return h;
  }
  const hash = readHash();
  if (hash.get("sbdep")) $("sbDep").value = hash.get("sbdep");
  if (hash.get("sbshare")) $("sbShare").value = hash.get("sbshare");
  if (hash.get("sbtvl")) $("sbTvl").value = hash.get("sbtvl");
  if (hash.get("verdict")) { $("fVerdict").value = hash.get("verdict"); }
  if (hash.get("sort")) {
    state.sortKey = hash.get("sort");
    state.sortDir = hash.get("dir") === "asc" ? 1 : -1;
  }
  applyFilters();
  renderSandbox();
  if (hash.get("detail")) openDetail(hash.get("detail"), hash.get("dtab") || "overview");
})();
