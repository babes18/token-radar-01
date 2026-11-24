# Token Radar v5 — build notes

## Why v5 exists

v4 is submitted (ID 01a1e99a, commit 73b1bc8) with a dev judge win rate of 87.6%
(11W/1L over 12 matches) — the first entry with a passing dev score. But the
final phase (from 14 Dec 10:10 UTC) screens on the dev ladder rating: only the
top 40 by rating go on, and a rated entry whose interval high reaches the
place-40 line goes on. The live leaderboard (24 Nov) has the top 40+ entries all
at 20W/0L and ~95.7–96.7%; rank 40 sits at 95.72%. v4's interval high is 91.10%.
**v4 would be screened out of the final as it stands.** The final also runs on a
different dataset, so v4 may be overfit to the dev data. v5 is the answer to
both: a model fitted and validated out-of-sample, and a board built to be
defensible to the judge rather than tuned to the dev ladder.

## What v4 got wrong (measured, not asserted)

- **The category median loses out-of-sample.** On leave-one-out over the same
  128 live-token protocols, the category median scores a median |log10| error of
  0.744 — worse than the global median at 0.707. The old full formula (median ×
  growth × maturity × momentum × risk) scores 0.766, the worst of everything
  tested. v4's top 10 (Steakhouse #1, Gauntlet #2, Veda #3, Upshift #5, Nonce #8)
  were priced by the global median, not by any category signal: Risk Curators
  has 1 live peer, Onchain Capital Allocator 2.
- **The post-fit terms never earn their keep.** One at a time on top of the
  curve — growth, maturity, momentum, risk, growth + maturity — the LOO error
  stays at 0.532–0.535, against 0.532 for the curve alone. Adding all four
  together shaves the median (0.532 → 0.518) but makes the mean error worse
  (0.693 → 0.709), the within-2× share worse (0.320 → 0.297) and adds a −0.117
  bias. They are documented in the Method tab, not in the price.
- **Coverage had a hole.** The board held the watchlist plus early rows *below
  the floor* — but the house watchlist does not cover every protocol at or above
  its floor. On this snapshot 20 rankable protocols sit above the $50M floor but
  off the watchlist, including the largest pre-token TVL in the snapshot
  (Sentora Curator, $2.76B) and Polymarket International ($320M), Cian Yield
  Layer ($280M), Mellow Core ($233M), BitFi Basis ($215M), Figure Markets Prime
  ($191M). v4 dropped all 20. v5 ranks every rankable pre-token protocol: 198
  rows, not 178.
- **The Launching-soon tab is gone.** It listed 12 pump.fun tokens from a frozen
  off-snapshot extract (Nov 2026), stale against a sealed snapshot that never
  changes. Dropping it (and `lib/graduating-data.ts`) frees dossier bytes and
  removes the staleness.

## What changed vs v4 (repo-v4, commit 73b1bc8)

- **Model: radar-5.** `expected value = curve value × launch odds`.
  - The curve value comes from a fitted size curve over the 128 live-token
    protocols with a market cap: `log10(mcap) = 3.0247 + 0.5223 × log10(TVL)`,
    R² 0.194. LOO median |log10| error 0.532 (mean 0.693, within-2× 0.320).
  - The launch odds come from the protocol's (category, age band) cell: how many
    protocols in that cell launched a token, shrunk toward the category rate
    (prior weight 10) and the global rate 0.5488 (cell prior weight 5). LOO Brier
    0.2112 against the base rate 0.2476; time-split Brier 0.3172 against 0.3207.
  - Odds are stored rounded to 4 decimals in both the builder (`fitOdds`) and
    the dashboard (`odds_cells`), so the page's recomputation agrees with the
    board exactly — a rounding mismatch was caught by the agreement test and
    fixed this way (198/198 rows had differed by ~0.008%).
- **Ranking:** by expected value, not by implied value. Top 10: USDD $23.5M
  (odds 43%), Veda $22.0M (33%), Figure Markets Prime $15.4M (69%), BitFi Basis
  $15.0M (63%), OnRe $14.5M (51%), Bittensor dTAO $14.3M (45%), b14g $14.1M
  (66%), Sentora Curator $13.2M (15%), Steakhouse Financial $13.2M (15%),
  OpenTrade $12.8M (51%). No category takes more than 2 of the top 10 (v4 had
  5/10 from one family). Every row carries a value interval and a rank range
  from the curve's own held-out error (factor ~3.4×); USDD's rank range is
  #1–#38, so the board says how uncertain it is instead of pretending to be
  exact.
- **Audit strip:** every protocol accounted for — 198 ranked + 144 live tokens
  with a market cap + 272 tokens with no market cap recorded + 144 pre-token
  excluded by the watchlist rule = 758. Shown in the Method tab.
- **Farm verdicts:** every row carries a seven-step plan with a costed verdict —
  FARM when the plan's all-in gas is $25 or less, THIN at $75 or less, SKIP
  above that. Distribution: FARM 127, THIN 70, SKIP 1. No step promises a
  token.
- **Dashboard:** 3 tabs (Board, Live tokens, Method). The Method tab shows the
  formula, the fitted curve as a scatter (TVL vs expected value, watchlist amber
  / early teal, curve line), the full validation table (6 predictors × 5 splits
  plus the one-term ablation), the odds Brier scores, the audit, and the farm
  verdict rule. The page recomputes every expected value and every farm step
  from the same figures as the builder; the detail view shows the check.
- **Size discipline:** dashboard 62,225 bytes against the 65,024 gate (2,799
  bytes of headroom). `data.js` is compact arrays (validation as index tables,
  rows without the curve value and odds — the page recomputes both, so they
  cannot drift; 7-day change rounded to 2 decimals, the most the page displays).
  `app.js` is the readable source with comments and indentation stripped by a
  small local script (`/tmp/strip-comments.mjs`, string-aware; the readable
  source is kept at `/tmp/app-readable-v5.js`). The detail view's per-row
  context section (growth/maturity/momentum/risk multipliers) was removed to
  fit the budget; the Method tab carries that evidence instead.
- **`main.ts` unchanged.** The build still refuses a board the gate will not
  take and exits 1 rather than ship a truncated dossier.

## Verification (all local, node v24.22.1, kit-v19 snapshot, 758 protocols / 40 watchlist)

- **Build:** `MAKEFUN_OUTPUT_DIR=out node main.ts --input
  ../kit-v19/token-radar-01-kit/input/snapshot.json` exits 0. 198 rows (40
  watchlist + 158 early), 12 live set aside. Dashboard 62,225 bytes (app.css
  6,258, app.js 34,127, index.html 446, data.js 21,394). Dossier text 62,249
  bytes, no `[Cut at` marker.
- **Determinism:** two fresh `main.ts` runs byte-identical (`diff -r` clean).
- **Page↔board agreement via CDP headless Chrome** (`/tmp/cdp-v5.mjs`, Chrome
  157 at /opt/meta-chromium/chrome): 198 rows rendered, 0 page exceptions.
  Expected values: 198/198 match board.json. Farm steps: 198/198 match
  byte-for-byte. Filtered view (Lending): 16 rows, ranks preserved. Detail view
  (USDD) opens, recompute matches board.json.
- **Screenshots:** 3 re-taken via headless Chrome (CDP) at 1440×900 and VIEWED —
  board (198 rows), detail (USDD, reason + interval + farm plan), filtered
  (Lending, 16 of 198 rows). All ≤ 524,288 bytes (171,230 / 243,078 / 167,890).
  The stale `launching.png` was deleted.
- **`makefun check` (kit-v19, worktree): 4 passed, 1 failed, 14 skipped, 5
  checked at submission.** Passed: competition_open, snapshot (22 files,
  2,596,449 bytes), license_osi (MIT), entrypoint (main.ts, node22). The single
  failure is transcripts_present — expected: no bundle exists yet (bundling is
  done by the parent agent at submit time); every thinking_* check skips for
  the same reason rather than failing. At-submission items (repo_public,
  repo_owner, repo_created_after_open, commit_in_repo, duplicate_snapshot) are
  evaluated at submit time.
- **grade-local: not runnable locally for this competition.** The CLI refuses:
  token-radar-01 is a program/v1 competition whose scorer and reference data
  are not published in the kit; the house grades from its competition
  directory. The dev judge win rate can only be measured by the server run,
  as v4's 87.6% was.

## What v5 does not claim

- No local judge win rate: the judge runs server-side. v5's case for the final
  is the validation, not a dev score — the curve beats the old median on every
  held-out split, the odds beat the base rate out-of-sample, and the board
  carries its own uncertainty. Whether that lifts the dev rating from 87.6%
  toward the ~95.7% place-40 line is for the server run to say.
- The expected values are a ranking device, not prices, and the launch odds are
  fitted rates, not promises. The intervals say so on every row.
- Veda is ranked #2 with a stated caveat: independent reporting (13 Nov 2026)
  says no VEDA token or airdrop has been announced and Veda Points are
  non-transferable. The farm plan promises no token; the odds are what the
  snapshot's (category, age band) cell says, nothing more.
