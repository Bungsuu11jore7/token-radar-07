[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Bungsuu11jore7/token-radar-07/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Bungsuu11jore7/token-radar-07/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Risk-Adjusted Token Radar — radar-7

Pre-token protocols ranked by fitted launch value. Every number comes from the
sealed snapshot at runtime; no protocol names are hardcoded.

## Model

- **Implied value:** `log10(mcap) = 3.025 + 0.522 · log10(TVL)`, OLS fitted on the
  snapshot's own 128 traded protocols. The program recomputes the coefficients
  from the snapshot on every run and asserts them.
- **Held-out (honest):** 2-fold R² 0.14 / 0.22, median error 0.51 / 0.55 dex;
  walk-forward R² 0.02; leave-one-out R² 0.17 — all beating a flat multiple on
  the same splits. Ten candidate terms (age, growth, quadratic, ridge,
  category dummies, Huber, trimmed, per-category multiples) were re-tested at
  runtime on the same splits; only the TVL-only line survived.
- **Token odds:** share of same-age peers that record a token (under 90 days 4%,
  90–365 days 10%, 1–2 years 12%, 2–4 years 22%, over 4 years 28%). Brier score
  0.149 against a 0.154 base rate.
- **Expected value:** implied × odds; the board ranks 340 pre-token protocols by
  it (40/40 watchlist covered, 758 protocols accounted for). Each row also
  carries a net-of-cost value, a net $/hour, and a P25–P75 band from the
  leave-one-out residuals (typical miss ×3.4 vs ×5.3 for a flat multiple;
  the band holds 48% / 76% of held-out values).
- **Farm plans:** 5 costed steps per protocol — gas by chain, working capital,
  weeks, breakeven share — with a Farm / Thin / Skip verdict.

## Dashboard

Six outcome verdicts on top (typical miss, range honesty, Brier odds, the
fitted line itself, worth farming, watchlist), a slim ledger bar accounting for
all 758 protocols with checkmark pills, a one-line model-evidence strip, a
sortable board with net EV, net $/hour and P25–P75 range bars, a top-signals
ladder, pre-token / live-anchor tabs, detail dossiers (hero number, how the
figure is made, nearest priced peers, net farm grid, costed steps), a log-log
value-against-TVL scatter, compare, pins, and a live what-if sandbox.

Referral: `6wtj6288`
