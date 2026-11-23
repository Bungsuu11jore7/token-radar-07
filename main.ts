// main.ts — Risk-Adjusted Token Radar ("radar-7").
// Reads /input/snapshot.json, runs the model (lib/model.ts), writes
// board.json + data.js, copies dashboard/ + screenshots/, and builds
// dossier.json via the vendor buildDossier. Deterministic: no clock, no
// randomness; identical input produces byte-identical output.
// Usage: node main.ts --input <snapshot.json>
//   Output dir: $MAKEFUN_OUTPUT_DIR, else /output (temp-dir fallback).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildModel } from "./lib/model.ts";
import { buildDossier } from "./vendor/makefun-board.ts";

function parseArgs(argv: string[]): { input: string } {
  let input = "/input/snapshot.json";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--input" && i + 1 < argv.length) input = argv[i + 1];
  }
  return { input };
}

function resolveOutDir(): string {
  const wanted = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  try {
    fs.mkdirSync(wanted, { recursive: true });
    fs.accessSync(wanted, fs.constants.W_OK);
    return wanted;
  } catch {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "radar7-"));
    return tmp;
  }
}

function copyDir(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function main(): void {
  const { input } = parseArgs(process.argv.slice(2));
  const outDir = resolveOutDir();
  const here = path.dirname(new URL(import.meta.url).pathname);

  const raw = fs.readFileSync(input, "utf-8");
  const snap = JSON.parse(raw) as Parameters<typeof buildModel>[0];
  const m = buildModel(snap);

  // Hard gates: the fit must reproduce the documented OLS line, and the
  // ledger must account for every protocol in the snapshot.
  if (Math.abs(m.fit.intercept - 3.025) >= 0.01 || Math.abs(m.fit.slope - 0.522) >= 0.01) {
    throw new Error(
      `fit mismatch: intercept=${m.fit.intercept} slope=${m.fit.slope} (want 3.025/0.522)`,
    );
  }
  if (m.counts.board !== 340) throw new Error(`board rows ${m.counts.board} != 340`);
  if (m.counts.watchlist !== 40) throw new Error(`watchlist ${m.counts.watchlist} != 40`);
  if (m.counts.anchors !== 144) throw new Error(`anchors ${m.counts.anchors} != 144`);
  if (m.counts.excluded !== 274) throw new Error(`excluded ${m.counts.excluded} != 274`);
  if (m.counts.total !== 758) throw new Error(`total ${m.counts.total} != 758`);
  const verdicts = { Farm: 0, Thin: 0, Skip: 0 };
  for (const r of m.board) verdicts[r.verdict]++;
  if (verdicts.Farm !== 235 || verdicts.Thin !== 68 || verdicts.Skip !== 37) {
    throw new Error(`verdicts Farm ${verdicts.Farm} / Thin ${verdicts.Thin} / Skip ${verdicts.Skip} != 235/68/37`);
  }
  if (m.candidates.filter((c) => c.kept).length !== 1 || !m.candidates[0].kept) {
    throw new Error("candidate rule: only M1 may be kept");
  }

  fs.mkdirSync(outDir, { recursive: true });
  const boardJson = JSON.stringify({
    generated: m.generated,
    fit: m.fit,
    counts: m.counts,
    totals: { expectedUsd: m.evidence.totalsExpected, impliedUsd: m.evidence.totalsImplied },
    rows: m.board,
  });
  fs.writeFileSync(path.join(outDir, "board.json"), boardJson);
  const dataJs =
    "window.RADAR = " +
    JSON.stringify({
      generated: m.generated,
      fit: m.fit,
      heldOut: m.heldOut,
      candidates: m.candidates,
      odds: m.odds,
      baseRate: m.baseRate,
      evidence: m.evidence,
      rows: m.board,
      anchors: m.anchors,
      excluded: m.excluded,
      counts: m.counts,
    }) +
    ";\n";
  fs.writeFileSync(path.join(outDir, "data.js"), dataJs);
  copyDir(path.join(here, "dashboard"), path.join(outDir, "dashboard"));
  copyDir(path.join(here, "screenshots"), path.join(outDir, "screenshots"));

  const dossier = buildDossier(outDir, { text_max_bytes: 65536 });
  fs.writeFileSync(path.join(outDir, "dossier.json"), dossier);

  const h = m.heldOut;
  console.log(
    `radar-7: board ${m.counts.board} watchlist ${m.counts.watchlist}/40 anchors ${m.counts.anchors} excluded ${m.counts.excluded} total ${m.counts.total}`,
  );
  console.log(
    `fit log10(mcap) = ${m.fit.intercept.toFixed(4)} + ${m.fit.slope.toFixed(4)} * log10(TVL) (n=${m.fit.n})`,
  );
  console.log(
    `held-out 2-fold R2 ${h.fold0.r2.toFixed(3)}/${h.fold1.r2.toFixed(3)} med ${h.fold0.medAbsErr.toFixed(3)}/${h.fold1.medAbsErr.toFixed(3)} | walk R2 ${h.walk.r2.toFixed(3)} | LOO R2 ${h.loo.r2.toFixed(3)}`,
  );
  console.log(
    `verdicts Farm ${verdicts.Farm} / Thin ${verdicts.Thin} / Skip ${verdicts.Skip} | Brier ${m.evidence.brier.toFixed(4)} vs ${m.evidence.brierBase.toFixed(4)} | coverage ${Math.round(m.evidence.coverageP25 * 100)}%/${Math.round(m.evidence.coverageP10 * 100)}%`,
  );
  console.log(`dossier ${dossier.length} B -> ${outDir}`);
}

main();
