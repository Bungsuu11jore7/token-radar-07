// lib/model.ts — Risk-Adjusted Token Radar ("radar-7") model.
// Pure computation from the snapshot: exclusions, OLS fit on traded comps,
// held-out validation (2-fold by slug parity, walk-forward by listed_at,
// leave-one-out), token odds by age, board ranking, farm plans, candidate
// term tests, net/range per row. Every number is computed at runtime from
// the snapshot's own fields; nothing is hardcoded except the rules below.

export interface Proto {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number | null;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id?: string | null;
  symbol?: string | null;
}

export interface Snapshot {
  as_of: string;
  source?: string;
  floor_usd?: number;
  protocols: Proto[];
  watchlist: string[];
}

export interface Fit {
  intercept: number;
  slope: number;
  n: number;
  droppedMcap: number;
}

export interface SplitEval {
  r2: number;
  medAbsErr: number;
}

export interface HeldOut {
  fold0: SplitEval;
  fold1: SplitEval;
  walk: SplitEval;
  loo: SplitEval;
  flatFold0: SplitEval;
  flatFold1: SplitEval;
  flatWalk: SplitEval;
}

export interface Candidate {
  name: string;
  label: string;
  fold0: SplitEval;
  fold1: SplitEval;
  walk: SplitEval;
  kept: boolean;
}

export interface OddsBucket {
  label: string;
  loDays: number;
  hiDays: number | null;
  n: number;
  tokens: number;
  rate: number;
}

export interface FarmStep {
  text: string;
  costUsd: number;
  timeMin: number;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string;
  chain: string;
  chains: string[];
  tvlUsd: number;
  change7d: number | null;
  ageDays: number | null;
  impliedUsd: number;
  odds: number;
  oddsBucket: number;
  expectedUsd: number;
  watchlist: boolean;
  verdict: "Farm" | "Thin" | "Skip";
  weeks: number;
  gasUsd: number;
  bridgeUsd: number;
  capitalUsd: number;
  totalCostUsd: number;
  breakeven: number;
  netEvUsd: number;
  activeHours: number;
  netPerHourUsd: number;
  p25Usd: number;
  p75Usd: number;
  farmSteps: string[];
}

export interface Anchor {
  slug: string;
  name: string;
  tvlUsd: number;
  mcapUsd: number;
  fittedUsd: number;
  ratio: number;
  errDex: number;
}

export interface Evidence {
  typicalMiss: number;
  flatMiss: number;
  coverageP25: number;
  coverageP10: number;
  brier: number;
  brierBase: number;
  looQ10: number;
  looQ25: number;
  looQ75: number;
  looQ90: number;
  within2: number;
  totalsExpected: number;
  totalsImplied: number;
}

export interface ModelOut {
  generated: string;
  fit: Fit;
  heldOut: HeldOut;
  candidates: Candidate[];
  odds: OddsBucket[];
  baseRate: number;
  evidence: Evidence;
  board: BoardRow[];
  anchors: Anchor[];
  excluded: { reason: string; count: number }[];
  counts: { board: number; watchlist: number; anchors: number; excluded: number; total: number };
}

// ---- rules (the only hardcoded inputs) ----

const EXCLUDED_CATEGORIES = new Set([
  "Bridge",
  "Canonical Bridge",
  "Liquid Staking",
  "Liquid Restaking",
  "Restaked BTC",
  "CEX",
]);

const EXCHANGE_PREFIXES = [
  "Binance",
  "Coinbase",
  "Bybit",
  "Kraken",
  "Bitget",
  "OKX",
  "Bitfinex",
  "Gemini",
];

const VERSION_RE = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_RE = /\b(wrapped|staked|staking)\b/i;

const GAS_USD: Record<string, number> = {
  Ethereum: 8.0,
  Base: 0.5,
  Arbitrum: 0.5,
  Optimism: 0.5,
  Solana: 0.05,
  BSC: 0.3,
  Polygon: 0.1,
  Avalanche: 0.4,
};

const STEP_GROUPS: Record<string, string> = {
  Dexs: "Dexs",
  Lending: "Lending",
  Yield: "Yield",
  RWA: "RWA",
  "Risk Curators": "Risk Curators",
  "Onchain Capital Allocator": "Onchain Capital Allocator",
  CDP: "CDP",
};

// ---- small numeric helpers ----

export function log10(x: number): number {
  return Math.log10(x);
}

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return NaN;
  return n % 2 === 1 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

export function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 0) return NaN;
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.min(lo + 1, s.length - 1);
  const f = i - lo;
  return s[lo] * (1 - f) + s[hi] * f;
}

function solveLinear(A: number[][], b: number[]): number[] {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    const tmp = M[c];
    M[c] = M[p];
    M[p] = tmp;
    const pv = M[c][c];
    if (Math.abs(pv) < 1e-12) throw new Error("singular matrix in OLS");
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / pv;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / M[i][i]);
}

function ols(X: number[][], y: number[], ridgeLambda = 0): number[] {
  const k = X[0].length;
  const XtX: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const Xty: number[] = new Array<number>(k).fill(0);
  for (let r = 0; r < X.length; r++) {
    for (let i = 0; i < k; i++) {
      Xty[i] += X[r][i] * y[r];
      for (let j = 0; j < k; j++) XtX[i][j] += X[r][i] * X[r][j];
    }
  }
  if (ridgeLambda !== 0) for (let i = 1; i < k; i++) XtX[i][i] += ridgeLambda;
  return solveLinear(XtX, Xty);
}

function predict(beta: number[], x: number[]): number {
  let s = 0;
  for (let i = 0; i < beta.length; i++) s += beta[i] * x[i];
  return s;
}

function r2Of(X: number[][], y: number[], beta: number[]): number {
  const my = y.reduce((a, b) => a + b, 0) / y.length;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < y.length; i++) {
    ssTot += (y[i] - my) ** 2;
    ssRes += (y[i] - predict(beta, X[i])) ** 2;
  }
  return 1 - ssRes / ssTot;
}

function evalSplit(Xtr: number[][], ytr: number[], Xte: number[][], yte: number[], beta: number[]): SplitEval {
  void Xtr;
  void ytr;
  const errs = Xte.map((x, i) => Math.abs(yte[i] - predict(beta, x)));
  return { r2: r2Of(Xte, yte, beta), medAbsErr: median(errs) };
}

// ---- snapshot helpers ----

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (!listedAt) return null;
  const a = Date.parse(asOf + "T00:00:00Z");
  const b = Date.parse(listedAt.slice(0, 10) + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.floor((a - b) / 86400000);
}

export function exclusionReason(p: Proto): string | null {
  if (EXCLUDED_CATEGORIES.has(p.category)) return "category " + p.category;
  if (VERSION_RE.test(p.name)) return "versioned duplicate";
  if (WRAPPED_RE.test(p.name)) return "wrapped/staked product";
  for (const ex of EXCHANGE_PREFIXES) {
    if (p.name === ex || p.name.startsWith(ex + " ") || p.name.startsWith(ex + "-")) {
      return "exchange product";
    }
  }
  return null;
}

function ageBucket(age: number | null): number {
  if (age === null) return -1;
  if (age < 90) return 0;
  if (age < 365) return 1;
  if (age < 730) return 2;
  if (age < 1460) return 3;
  return 4;
}

const BUCKET_LABELS = ["<90 days", "90–365 days", "1–2 years", "2–4 years", ">4 years"];
const BUCKET_BOUNDS: [number, number | null][] = [
  [0, 90],
  [90, 365],
  [365, 730],
  [730, 1460],
  [1460, null],
];

// ---- farm plans ----

function gasFor(chain: string): number {
  return GAS_USD[chain] ?? 1.0;
}

function capitalFor(tvl: number): number {
  if (tvl >= 1e9) return 1000;
  if (tvl >= 1e8) return 500;
  return 100;
}

function weeksFor(odds: number): number {
  if (odds >= 0.22) return 8;
  if (odds >= 0.12) return 6;
  return 4;
}

function money(n: number): string {
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return "$" + Math.round(n).toLocaleString("en-US");
  if (n >= 1) return "$" + n.toFixed(2);
  return "$" + n.toFixed(4);
}

function farmSteps(
  group: string,
  name: string,
  chain: string,
  capital: number,
  gas: number,
  bridge: number,
  weeks: number,
  totalCost: number,
  breakevenPct: number,
  expected: number,
): string[] {
  const cap = money(capital);
  const g = "$" + gas.toFixed(2);
  const br = bridge > 0 ? "$" + bridge.toFixed(2) : "$0";
  const tot = "$" + totalCost.toFixed(2);
  const be = (breakevenPct * 100).toFixed(3) + "%";
  const exp = money(expected);
  const open: Record<string, string[]> = {
    Dexs: [
      `Swap ${cap} working capital into the ${name} pool on ${chain} — gas ≈ ${g}, bridge ${br} once.`,
      `Provide ${cap} as liquidity in the ${name} pool and hold the LP position for ${weeks} weeks.`,
      `Collect trading fees weekly; each claim costs ≈ ${g} in gas, ${weeks} claims planned.`,
      `Hedge impermanent loss by keeping half the position in the pool's base asset for ${weeks} weeks.`,
      `Exit in week ${weeks}: remove liquidity, recover ${cap} capital, pay final gas ≈ ${g}. Total cost ≈ ${tot}, breakeven ${be} of ${exp} expected value.`,
    ],
    Lending: [
      `Bridge ${cap} working capital to ${chain} for ${name} — bridge fee ${br} once, gas ≈ ${g}.`,
      `Deposit ${cap} as collateral in the ${name} lending pool — gas ≈ ${g}, position opens in week 0.`,
      `Borrow against the deposit at the pool's prevailing rate; keep the health factor above the liquidation line for ${weeks} weeks.`,
      `Claim any points or incentives weekly; each claim costs ≈ ${g} in gas, ${weeks} claims planned.`,
      `Exit in week ${weeks}: repay the loan, withdraw ${cap} capital, pay final gas ≈ ${g}. Total cost ≈ ${tot}, breakeven ${be} of ${exp} expected value.`,
    ],
    Yield: [
      `Move ${cap} working capital to ${chain} for ${name} — bridge fee ${br} once, gas ≈ ${g}.`,
      `Deposit ${cap} into the ${name} vault; the vault starts earning in week 0, gas ≈ ${g}.`,
      `Let the yield compound for ${weeks} weeks; harvest weekly, each harvest ≈ ${g} in gas.`,
      `Monitor the vault's strategy and TVL weekly; withdraw early if the yield drops below the gas cost of ${g} per claim.`,
      `Exit in week ${weeks}: redeem the vault position, recover ${cap} capital, pay final gas ≈ ${g}. Total cost ≈ ${tot}, breakeven ${be} of ${exp} expected value.`,
    ],
    RWA: [
      `Bridge ${cap} working capital to ${chain} for ${name} — bridge fee ${br} once, gas ≈ ${g}.`,
      `Mint ${cap} of the ${name} tokenized asset; minting gas ≈ ${g}, position opens in week 0.`,
      `Hold the position for ${weeks} weeks and collect the underlying yield as it accrues.`,
      `Check the custodian attestation and redemption window weekly; each on-chain check costs ≈ ${g}.`,
      `Exit in week ${weeks}: redeem the tokenized asset for ${cap} capital, pay final gas ≈ ${g}. Total cost ≈ ${tot}, breakeven ${be} of ${exp} expected value.`,
    ],
    "Risk Curators": [
      `Move ${cap} working capital to ${chain} for ${name} — bridge fee ${br} once, gas ≈ ${g}.`,
      `Allocate ${cap} to the curated ${name} vault; allocation gas ≈ ${g}, position opens in week 0.`,
      `Review the curator's risk parameters weekly for ${weeks} weeks; each rebalance costs ≈ ${g}.`,
      `Collect curator fees as they accrue; each claim costs ≈ ${g} in gas.`,
      `Exit in week ${weeks}: withdraw the allocation, recover ${cap} capital, pay final gas ≈ ${g}. Total cost ≈ ${tot}, breakeven ${be} of ${exp} expected value.`,
    ],
    "Onchain Capital Allocator": [
      `Bridge ${cap} working capital to ${chain} for ${name} — bridge fee ${br} once, gas ≈ ${g}.`,
      `Commit ${cap} to the ${name} allocation strategy; commitment gas ≈ ${g}, position opens in week 0.`,
      `Track the strategy's deployments weekly for ${weeks} weeks; each on-chain action costs ≈ ${g}.`,
      `Rebalance toward the best-performing sleeve when the gap exceeds the ${g} gas cost of moving.`,
      `Exit in week ${weeks}: unwind the allocation, recover ${cap} capital, pay final gas ≈ ${g}. Total cost ≈ ${tot}, breakeven ${be} of ${exp} expected value.`,
    ],
    CDP: [
      `Move ${cap} working capital to ${chain} for ${name} — bridge fee ${br} once, gas ≈ ${g}.`,
      `Lock ${cap} as collateral in the ${name} CDP; opening gas ≈ ${g}, position opens in week 0.`,
      `Mint stablecoins against the collateral and hold for ${weeks} weeks, keeping the ratio above liquidation.`,
      `Top up collateral if the ratio falls; each top-up costs ≈ ${g} in gas.`,
      `Exit in week ${weeks}: repay the minted stablecoins, unlock ${cap} capital, pay final gas ≈ ${g}. Total cost ≈ ${tot}, breakeven ${be} of ${exp} expected value.`,
    ],
  };
  const def = [
    `Move ${cap} working capital to ${chain} for ${name} — bridge fee ${br} once, gas ≈ ${g}.`,
    `Open a ${cap} position in ${name}; entry gas ≈ ${g}, position opens in week 0.`,
    `Hold and monitor the position weekly for ${weeks} weeks; each on-chain action costs ≈ ${g}.`,
    `Claim any rewards as they accrue; each claim costs ≈ ${g} in gas, ${weeks} claims planned.`,
    `Exit in week ${weeks}: close the position, recover ${cap} capital, pay final gas ≈ ${g}. Total cost ≈ ${tot}, breakeven ${be} of ${exp} expected value.`,
  ];
  return open[group] ?? def;
}

// ---- candidate designs ----

type DesignFn = (p: Proto, asOf: string) => number[] | null;

function designFor(kind: string, topCats: string[]): DesignFn {
  return (p: Proto, asOf: string) => {
    const tvl = p.tvl_usd;
    if (!tvl || tvl <= 0) return null;
    const lt = log10(tvl);
    const age = (ageDays(asOf, p.listed_at) ?? 0) / 365.25;
    const g = p.change_7d ?? 0;
    switch (kind) {
      case "M1":
        return [1, lt];
      case "+age":
        return [1, lt, age];
      case "+growth":
        return [1, lt, g];
      case "+age+growth":
        return [1, lt, age, g];
      case "quad":
        return [1, lt, lt * lt];
      case "ridge1":
        return [1, lt, age, g];
      case "cat":
        return [1, lt, ...topCats.map((c) => (p.category === c ? 1 : 0))];
      case "huber":
      case "trimmed":
        return [1, lt];
      default:
        return [1, lt];
    }
  };
}

const CANDIDATE_DEFS: { name: string; label: string }[] = [
  { name: "M1", label: "M1: log TVL only" },
  { name: "+age", label: "M1 + age" },
  { name: "+growth", label: "M1 + growth" },
  { name: "+age+growth", label: "M1 + age + growth" },
  { name: "quad", label: "M1 + quadratic" },
  { name: "ridge1", label: "M1 + age + growth, ridge 1" },
  { name: "cat", label: "M1 + category dummies" },
  { name: "huber", label: "M1, Huber robust" },
  { name: "trimmed", label: "M1, trimmed 10%" },
  { name: "percat", label: "Per-category multiple" },
];

function fitHuber(X: number[][], y: number[], iters = 20): number[] {
  let beta = ols(X, y);
  for (let it = 0; it < iters; it++) {
    const res = X.map((x, i) => y[i] - predict(beta, x));
    const cen = median(res);
    const mad = median(res.map((r) => Math.abs(r - cen))) || 1e-9;
    const k = 1.345 * mad;
    const w = res.map((r) => (Math.abs(r) <= k ? 1 : k / Math.abs(r)));
    const Xw = X.map((row, i) => row.map((v) => v * Math.sqrt(w[i])));
    const yw = y.map((v, i) => v * Math.sqrt(w[i]));
    beta = ols(Xw, yw);
  }
  return beta;
}

function fitTrimmed(X: number[][], y: number[]): number[] {
  const beta0 = ols(X, y);
  const order = X.map((_, i) => i).sort(
    (a, b) => Math.abs(y[b] - predict(beta0, X[b])) - Math.abs(y[a] - predict(beta0, X[a])),
  );
  const drop = new Set(order.slice(0, Math.floor(X.length / 10)));
  const keep = X.map((_, i) => i).filter((i) => !drop.has(i));
  return ols(
    keep.map((i) => X[i]),
    keep.map((i) => y[i]),
  );
}

function evalDesign(
  kind: string,
  design: DesignFn,
  train: Proto[],
  test: Proto[],
  asOf: string,
): SplitEval {
  const Xtr: number[][] = [];
  const ytr: number[] = [];
  for (const p of train) {
    const x = design(p, asOf);
    if (x && p.mcap_usd && p.mcap_usd > 0) {
      Xtr.push(x);
      ytr.push(log10(p.mcap_usd));
    }
  }
  let beta: number[];
  if (kind === "huber") beta = fitHuber(Xtr, ytr);
  else if (kind === "trimmed") beta = fitTrimmed(Xtr, ytr);
  else if (kind === "ridge1") beta = ols(Xtr, ytr, 1);
  else beta = ols(Xtr, ytr);
  const Xte: number[][] = [];
  const yte: number[] = [];
  for (const p of test) {
    const x = design(p, asOf);
    if (x && p.mcap_usd && p.mcap_usd > 0) {
      Xte.push(x);
      yte.push(log10(p.mcap_usd));
    }
  }
  return evalSplit(Xtr, ytr, Xte, yte, beta);
}

function evalPerCat(train: Proto[], test: Proto[]): SplitEval {
  const byCat = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of train) {
    if (!p.mcap_usd || !p.tvl_usd) continue;
    const m = p.mcap_usd / p.tvl_usd;
    all.push(m);
    const arr = byCat.get(p.category) ?? [];
    arr.push(m);
    byCat.set(p.category, arr);
  }
  const gmed = median(all);
  const yte: number[] = [];
  const yhat: number[] = [];
  for (const p of test) {
    if (!p.mcap_usd || !p.tvl_usd) continue;
    const ms = byCat.get(p.category) ?? [];
    const m = ms.length > 0 ? median(ms) : gmed;
    yhat.push(log10(p.tvl_usd * m));
    yte.push(log10(p.mcap_usd));
  }
  const my = yte.reduce((a, b) => a + b, 0) / yte.length;
  const ssTot = yte.reduce((a, v) => a + (v - my) ** 2, 0);
  const ssRes = yte.reduce((a, v, i) => a + (v - yhat[i]) ** 2, 0);
  const errs = yte.map((v, i) => Math.abs(v - yhat[i]));
  return { r2: 1 - ssRes / ssTot, medAbsErr: median(errs) };
}

// ---- main build ----

export function buildModel(snap: Snapshot): ModelOut {
  const asOf = snap.as_of;
  const all = snap.protocols;
  const watchSet = new Set(snap.watchlist);

  // Exclusions + board universe.
  const excludedCount = new Map<string, number>();
  const boardPool: Proto[] = [];
  for (const p of all) {
    if (p.mcap_usd !== null && p.mcap_usd !== undefined) continue; // traded, not board
    const reason = exclusionReason(p);
    if (reason) {
      excludedCount.set(reason, (excludedCount.get(reason) ?? 0) + 1);
      continue;
    }
    boardPool.push(p);
  }
  const excluded = [...excludedCount.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  // Training set: traded with mcap>0 and tvl>0.
  const traded = all
    .filter((p) => (p.mcap_usd ?? 0) > 0 && (p.tvl_usd ?? 0) > 0)
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const droppedMcap = all.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd !== undefined && (p.mcap_usd ?? 0) <= 0,
  ).length;

  // Fit M1.
  const Xall = traded.map((p) => [1, log10(p.tvl_usd as number)]);
  const yall = traded.map((p) => log10(p.mcap_usd as number));
  const beta = ols(Xall, yall);
  const fit: Fit = { intercept: beta[0], slope: beta[1], n: traded.length, droppedMcap };

  // 2-fold by slug parity (sorted order).
  const fold0 = traded.filter((_, i) => i % 2 === 0);
  const fold1 = traded.filter((_, i) => i % 2 === 1);
  const foldEval = (tr: Proto[], te: Proto[]): SplitEval => {
    const Xtr = tr.map((p) => [1, log10(p.tvl_usd as number)]);
    const ytr = tr.map((p) => log10(p.mcap_usd as number));
    const b = ols(Xtr, ytr);
    const Xte = te.map((p) => [1, log10(p.tvl_usd as number)]);
    const yte = te.map((p) => log10(p.mcap_usd as number));
    return evalSplit(Xtr, ytr, Xte, yte, b);
  };
  const f0 = foldEval(fold1, fold0);
  const f1 = foldEval(fold0, fold1);

  // Flat multiple on the same folds.
  const flatEval = (tr: Proto[], te: Proto[]): SplitEval => {
    const fm = median(tr.map((p) => (p.mcap_usd as number) / (p.tvl_usd as number)));
    const yte = te.map((p) => log10(p.mcap_usd as number));
    const yhat = te.map((p) => log10((p.tvl_usd as number) * fm));
    const my = yte.reduce((a, b) => a + b, 0) / yte.length;
    const ssTot = yte.reduce((a, v) => a + (v - my) ** 2, 0);
    const ssRes = yte.reduce((a, v, i) => a + (v - yhat[i]) ** 2, 0);
    return { r2: 1 - ssRes / ssTot, medAbsErr: median(yte.map((v, i) => Math.abs(v - yhat[i]))) };
  };
  const ff0 = flatEval(fold1, fold0);
  const ff1 = flatEval(fold0, fold1);

  // Walk-forward: median split by listed_at, fit older half, test younger half.
  const dated = traded.filter((p) => p.listed_at).sort((a, b) => (a.listed_at as string) < (b.listed_at as string) ? -1 : 1);
  const half = Math.floor(dated.length / 2);
  const walkOld = dated.slice(0, half);
  const walkYoung = dated.slice(half);
  const walk = foldEval(walkOld, walkYoung);
  const flatWalk = flatEval(walkOld, walkYoung);

  // LOO via hat matrix.
  const XtX = [
    [Xall.length, Xall.reduce((a, r) => a + r[1], 0)],
    [Xall.reduce((a, r) => a + r[1], 0), Xall.reduce((a, r) => a + r[1] * r[1], 0)],
  ];
  const det = XtX[0][0] * XtX[1][1] - XtX[0][1] * XtX[1][0];
  const inv: number[][] = [
    [XtX[1][1] / det, -XtX[0][1] / det],
    [-XtX[1][0] / det, XtX[0][0] / det],
  ];
  const looErrs: number[] = [];
  for (let i = 0; i < Xall.length; i++) {
    const x = Xall[i];
    const h = x[0] * (inv[0][0] * x[0] + inv[0][1] * x[1]) + x[1] * (inv[1][0] * x[0] + inv[1][1] * x[1]);
    const r = yall[i] - predict(beta, x);
    looErrs.push(r / (1 - h));
  }
  const looMy = yall.reduce((a, b) => a + b, 0) / yall.length;
  const looSsTot = yall.reduce((a, v) => a + (v - looMy) ** 2, 0);
  const looSsRes = looErrs.reduce((a, e) => a + e * e, 0);
  const loo: SplitEval = { r2: 1 - looSsRes / looSsTot, medAbsErr: median(looErrs.map(Math.abs)) };

  const heldOut: HeldOut = {
    fold0: f0,
    fold1: f1,
    walk,
    loo,
    flatFold0: ff0,
    flatFold1: ff1,
    flatWalk,
  };

  // Range coverage: train-fold residual quantiles tested on the test fold.
  const coverage = (tr: Proto[], te: Proto[]): { p25: number; p10: number } => {
    const Xtr = tr.map((p) => [1, log10(p.tvl_usd as number)]);
    const ytr = tr.map((p) => log10(p.mcap_usd as number));
    const b = ols(Xtr, ytr);
    const rtr = Xtr.map((x, i) => ytr[i] - predict(b, x));
    const Xte = te.map((p) => [1, log10(p.tvl_usd as number)]);
    const yte = te.map((p) => log10(p.mcap_usd as number));
    const rte = Xte.map((x, i) => yte[i] - predict(b, x));
    const q25 = quantile(rtr, 0.25);
    const q75 = quantile(rtr, 0.75);
    const q10 = quantile(rtr, 0.1);
    const q90 = quantile(rtr, 0.9);
    return {
      p25: rte.filter((e) => e >= q25 && e <= q75).length / rte.length,
      p10: rte.filter((e) => e >= q10 && e <= q90).length / rte.length,
    };
  };
  const covA = coverage(fold1, fold0);
  const covB = coverage(fold0, fold1);
  const covP25 = (covA.p25 * fold0.length + covB.p25 * fold1.length) / traded.length;
  const covP10 = (covA.p10 * fold0.length + covB.p10 * fold1.length) / traded.length;

  // Token odds by age (exact fractions, computed from the snapshot).
  const odds: OddsBucket[] = BUCKET_BOUNDS.map(([lo, hi], i) => {
    const grp = all.filter((p) => {
      const a = ageDays(asOf, p.listed_at);
      if (a === null) return false;
      return a >= lo && (hi === null || a < hi);
    });
    const tokens = grp.filter((p) => p.mcap_usd !== null && p.mcap_usd !== undefined).length;
    return {
      label: BUCKET_LABELS[i],
      loDays: lo,
      hiDays: hi,
      n: grp.length,
      tokens,
      rate: grp.length > 0 ? tokens / grp.length : 0,
    };
  });
  const baseRate = all.filter((p) => p.mcap_usd !== null && p.mcap_usd !== undefined).length / all.length;
  const oddsFor = (age: number | null): { rate: number; bucket: number } => {
    if (age === null) return { rate: baseRate, bucket: -1 };
    const b = ageBucket(age);
    return { rate: odds[b].rate, bucket: b };
  };

  // Brier scores over all 758 protocols.
  let brier = 0;
  let brierBase = 0;
  for (const p of all) {
    const y = p.mcap_usd !== null && p.mcap_usd !== undefined ? 1 : 0;
    const pb = oddsFor(ageDays(asOf, p.listed_at)).rate;
    brier += (y - pb) ** 2;
    brierBase += (y - baseRate) ** 2;
  }
  brier /= all.length;
  brierBase /= all.length;

  // Candidate term tests (same folds + walk as the main fit).
  const catCounts = new Map<string, number>();
  for (const p of traded) catCounts.set(p.category, (catCounts.get(p.category) ?? 0) + 1);
  const topCats = [...catCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c);
  const m1Mean = (f0.r2 + f1.r2) / 2;
  const candidates: Candidate[] = CANDIDATE_DEFS.map((def) => {
    let c0: SplitEval;
    let c1: SplitEval;
    let cw: SplitEval;
    if (def.name === "percat") {
      c0 = evalPerCat(fold1, fold0);
      c1 = evalPerCat(fold0, fold1);
      cw = evalPerCat(walkOld, walkYoung);
    } else {
      const design = designFor(def.name, topCats);
      c0 = evalDesign(def.name, design, fold1, fold0, asOf);
      c1 = evalDesign(def.name, design, fold0, fold1, asOf);
      cw = evalDesign(def.name, design, walkOld, walkYoung, asOf);
    }
    // Kept only if it beats M1 on BOTH the mean 2-fold R2 and walk-forward R2.
    const meanFold = (c0.r2 + c1.r2) / 2;
    const kept = def.name === "M1" ? true : meanFold > m1Mean && cw.r2 > walk.r2;
    return { name: def.name, label: def.label, fold0: c0, fold1: c1, walk: cw, kept };
  });

  // Board rows.
  const looQ10 = quantile(looErrs, 0.1);
  const looQ25 = quantile(looErrs, 0.25);
  const looQ75 = quantile(looErrs, 0.75);
  const looQ90 = quantile(looErrs, 0.9);
  const rows: BoardRow[] = boardPool.map((p) => {
    const tvl = p.tvl_usd as number;
    const implied = Math.round(10 ** (beta[0] + beta[1] * log10(tvl)));
    const age = ageDays(asOf, p.listed_at);
    const { rate, bucket } = oddsFor(age);
    let expected = Math.round(implied * rate);
    if (expected < 1) expected = 1;
    const chain = p.chains && p.chains.length > 0 ? p.chains[0] : "—";
    const gas = p.chains && p.chains.length > 0 ? gasFor(chain) : 1.0;
    const bridge = chain !== "Ethereum" ? 12 : 0;
    const capital = capitalFor(tvl);
    const weeks = weeksFor(rate);
    const totalCost = gas * (1 + weeks) + bridge;
    const breakeven = totalCost / expected;
    let verdict: BoardRow["verdict"] = "Farm";
    if (rate < 0.05 || breakeven >= 0.01) verdict = "Skip";
    else if (rate < 0.12 || breakeven >= 0.0001) verdict = "Thin";
    const netEv = expected - totalCost;
    const activeHours = (weeks + 3) * 0.25;
    const netPerHour = netEv / activeHours;
    const p25 = implied * 10 ** looQ25;
    const p75 = implied * 10 ** looQ75;
    const group = STEP_GROUPS[p.category] ?? "default";
    const steps = farmSteps(group, p.name, chain, capital, gas, bridge, weeks, totalCost, breakeven, expected);
    return {
      rank: 0,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chain,
      chains: p.chains ?? [],
      tvlUsd: tvl,
      change7d: p.change_7d,
      ageDays: age,
      impliedUsd: implied,
      odds: rate,
      oddsBucket: bucket,
      expectedUsd: expected,
      watchlist: watchSet.has(p.slug),
      verdict,
      weeks,
      gasUsd: gas,
      bridgeUsd: bridge,
      capitalUsd: capital,
      totalCostUsd: totalCost,
      breakeven,
      netEvUsd: netEv,
      activeHours,
      netPerHourUsd: netPerHour,
      p25Usd: p25,
      p75Usd: p75,
      farmSteps: steps,
    };
  });
  rows.sort((a, b) => {
    if (b.expectedUsd !== a.expectedUsd) return b.expectedUsd - a.expectedUsd;
    if (b.impliedUsd !== a.impliedUsd) return b.impliedUsd - a.impliedUsd;
    return a.slug < b.slug ? -1 : 1;
  });
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });

  // Anchors: all 144 traded with fitted values. The 16 with market cap ≤ 0
  // have no finite log error (log10 of a non-positive number); their error
  // is null and the dashboard renders it as "—".
  const anchors: Anchor[] = all
    .filter((p) => p.mcap_usd !== null && p.mcap_usd !== undefined)
    .map((p) => {
      const tvl = p.tvl_usd as number;
      const fitted = tvl && tvl > 0 ? 10 ** (beta[0] + beta[1] * log10(tvl)) : NaN;
      const mcap = p.mcap_usd as number;
      const err = mcap > 0 && Number.isFinite(fitted) && fitted > 0 ? log10(mcap) - log10(fitted) : NaN;
      return {
        slug: p.slug,
        name: p.name,
        tvlUsd: tvl,
        mcapUsd: mcap,
        fittedUsd: fitted,
        ratio: Number.isFinite(fitted) && fitted > 0 ? mcap / fitted : 0,
        errDex: Number.isFinite(err) ? err : (null as unknown as number),
      };
    })
    .sort((a, b) => a.slug < b.slug ? -1 : 1);

  const totalsExpected = rows.reduce((a, r) => a + r.expectedUsd, 0);
  const totalsImplied = rows.reduce((a, r) => a + r.impliedUsd, 0);
  const evidence: Evidence = {
    typicalMiss: 10 ** ((f0.medAbsErr + f1.medAbsErr) / 2),
    flatMiss: 10 ** ((ff0.medAbsErr + ff1.medAbsErr) / 2),
    coverageP25: covP25,
    coverageP10: covP10,
    brier,
    brierBase,
    looQ10,
    looQ25,
    looQ75,
    looQ90,
    within2: looErrs.filter((e) => Math.abs(e) <= log10(2)).length / looErrs.length,
    totalsExpected,
    totalsImplied,
  };

  return {
    generated: asOf,
    fit,
    heldOut,
    candidates,
    odds,
    baseRate,
    evidence,
    board: rows,
    anchors,
    excluded,
    counts: {
      board: rows.length,
      watchlist: rows.filter((r) => r.watchlist).length,
      anchors: anchors.length,
      excluded: excluded.reduce((a, e) => a + e.count, 0),
      total: all.length,
    },
  };
}
