// Token Radar's model, radar-5: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds
// every other rankable pre-token protocol, at any TVL: the early rows the radar exists to find.
// The watchlist is not every protocol at or above its floor — on this snapshot 20 rankable
// protocols sit above the floor but off the watchlist — so the early radar is defined by
// rankability, not by the floor. A protocol is pre-token when its record carries no token (no
// market cap, no CoinGecko id, no symbol); the snapshot's live-token protocols are kept apart
// and shown as the market's own values, never mixed into the ranked board.
//
// radar-5 replaces radar-4's pricing. The change is measured, not stylistic: radar-4's category
// median multiple loses out-of-sample to a fitted size curve on every split we ran (LOO median
// |log10 error| 0.744 vs 0.532; time-split 0.691 vs 0.488; random-half 0.644/0.839 vs 0.543/0.619),
// and its growth / maturity / momentum / risk terms never earn their keep one at a time (the
// ablation table in the dashboard's Method tab shows the numbers). So:
//
//   curve     = a log-log size curve fitted on the snapshot's own 128 token-bearing protocols:
//               log10(mcap) = a + b * log10(tvl), OLS. The fitted slope is ~0.52: a protocol
//               ten times as large is worth about 3.3x as much, not 10x.
//   odds      = the fitted launch odds: the share of the snapshot's protocols in the row's own
//               (category, age band) cell that already have a token, shrunk toward the category
//               rate (m=10) and then toward the global rate. Validated out-of-sample: LOO Brier
//               0.211 against a 0.248 base rate; time-split 0.317 against 0.321.
//   expected  = curve-implied value x odds. The board ranks by expected value: a launch is
//               worth its size times its chance of happening.
//   interval  = expected x 10^(+/- the curve's LOO median |log10| error), so every row carries
//               the range its own model's error implies; the rank range follows from the intervals.
//
// The growth, maturity, momentum and risk terms are still computed and shown per row, but they do
// NOT enter the price: the ablation says they cost accuracy out-of-sample. A protocol's name is
// never special-cased.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
  /** Records skipped at parse: no slug, no name, or no finite TVL — records the model cannot
   *  score, since the implied value starts from TVL and the board names every row. The count is
   *  reported on stdout, never silent; a skipped watchlist slug still fails the board's coverage
   *  gate, which is the honest refusal for a board that cannot cover its watchlist. */
  skipped_unscoreable: number;
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  multiple_min: number;
  multiple_max: number;
  multiple_min_n: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  momentum_weight: number;
  momentum_floor: number;
  momentum_cap: number;
  /** Risk (radar-4, display-only in radar-5): the age below which a protocol counts as young,
   *  and the 7-day TVL swings that count as a moderate and a sharp move. The discount steps
   *  (0.05 / 0.02) and the 0.15 cap are fixed in riskOf() so the model object stays small; the
   *  page recomputes them the same way. */
  risk_young_days: number;
  risk_vol_mid: number;
  risk_vol_high: number;
  /** Odds shrinkage (radar-5): the prior weight in protocols when shrinking a category rate
   *  toward the global rate, and a (category, age band) cell rate toward its category rate. */
  odds_shrink_category: number;
  odds_shrink_cell: number;
}

export const MODEL: ModelConstants = {
  multiple_min: 0.05,
  multiple_max: 1.5,
  multiple_min_n: 3,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  momentum_weight: 0.25,
  momentum_floor: -30,
  momentum_cap: 60,
  risk_young_days: 90,
  risk_vol_mid: 15,
  risk_vol_high: 30,
  odds_shrink_category: 10,
  odds_shrink_cell: 5,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-5';

/** How many live-token protocols the Live token view carries, by market cap. 12 keeps the tab a
 *  readable reference set; the calibration itself uses every token-bearing protocol, not just these. */
export const LIVE_ROWS = 12;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  /** The ranked quantity: the expected value, curve-implied value x launch odds. */
  implied_value_usd: number;
  model: {
    /** The fitted size curve's value for this TVL, before the odds discount. */
    curve_implied_usd: number;
    /** Fitted launch odds: the share of peers in this (category, age band) cell with a token. */
    launch_odds: number;
    /** How many protocols the odds cell holds (the peer count behind the odds). */
    odds_peers: number;
    /** The odds cell, in words: category + age band. */
    odds_cell: string;
    /** The interval the curve's own held-out error implies: expected x 10^(+/- residual). */
    interval_low_usd: number;
    interval_high_usd: number;
    /** The rank range the interval implies: the best and worst rank this row could hold. */
    rank_low: number;
    rank_high: number;
    /** Display-only context, tested and NOT in the price (see the ablation table): */
    category_multiple: number;
    multiple_source: string;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    momentum_multiplier: number;
    momentum_source: string;
    age_days: number | null;
    risk_multiplier: number;
    risk_discount: number;
    risk_flags: string[];
  };
  farm_steps: string[];
}

/** One category's calibrated multiple (kept for the validation table: the old model's term). */
export interface MultipleRow {
  category: string;
  n: number;
  median: number;
  multiple: number;
  source: string;
  momentum: number;
  momentum_n: number;
  momentum_source: string;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** A live-token protocol as a compact array: [slug, name, category, chains, tvl_usd, mcap_usd, change_7d].
 *  Category is an index into the dataset's categories table (-1 when the snapshot names none);
 *  chains are indices into the chains table, as in RadarRow. */
export type LiveTuple = [string, string, number, number[], number, number | null, number | null];

/** One fitted size curve: log10(mcap) = intercept + slope * log10(tvl), OLS on the comps. */
export interface CurveFit {
  intercept: number;
  slope: number;
  r2: number;
  n: number;
  /** The curve's held-out error: LOO median |log10| error, the interval's half-width. */
  loo_med_abs_log10: number;
  loo_mean_abs_log10: number;
  loo_within2x: number;
}

/** One row of the validation table the Method tab shows: one predictor on one split. */
export interface ValidationRow {
  split: string;
  predictor: string;
  n: number;
  med_abs_log10: number;
  mean_abs_log10: number;
  within2x: number;
  bias_log10: number;
}

/** One odds cell: [category index, age-band index, odds, peers]. Age bands: 0 <90d, 1 90d-1y,
 *  2 1-3y, 3 >3y, 4 unknown. */
export type OddsTuple = [number, number, number, number];

/** The 758-protocol audit: every protocol in the snapshot accounted for by disposition. */
export interface AuditCounts {
  total: number;
  ranked: number;
  live_mcap: number;
  token_no_mcap: number;
  pretoken_excluded: number;
}

/** Everything the dashboard renders, from the snapshot. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  watchlist_size: number;
  watchlist: string[];
  board_size: number;
  early_size: number;
  live_size: number;
  curve: CurveFit;
  /** The validation table, compact: splits and predictors once, then one array per cell
   *  [split, predictor, n, median |log10| error, mean |log10| error, within-2× share, bias]. */
  validation: { splits: string[]; predictors: string[]; rows: [number, number, number, number, number, number, number][] };
  odds_brier_loo: number;
  odds_brier_loo_base: number;
  odds_brier_time: number;
  odds_brier_time_base: number;
  odds_base_rate: number;
  odds_cells: OddsTuple[];
  residual_log10: number;
  audit: AuditCounts;
  chains: string[];
  categories: string[];
  rows: RadarRow[];
  live: LiveTuple[];
}

/** The dashboard's compact view of one row, as an array: [rank, slug, name, category, chains,
 *  tvl_usd, change_7d, age_days, expected_value_usd]. Category is an index into the dataset's
 *  categories table (-1 when the snapshot names none); chains are indices into the chains
 *  table. The page recomputes expected = curve(tvl) x odds from the curve fit and the odds
 *  table, so the page and board.json agree without storing the price twice. */
export type RadarRow = [number, string, string, number, number[], number, number | null, number | null, number];

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a sorted array, or null when it is empty. */
function medianOf(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The age band index of a protocol: 0 <90d, 1 90d-1y, 2 1-3y, 3 >3y, 4 unknown. */
export function ageBandIndex(asOf: string, listedAt: string | null): number {
  const age = ageDays(asOf, listedAt);
  if (age === null) return 4;
  if (age < 90) return 0;
  if (age < 365) return 1;
  if (age < 1095) return 2;
  return 3;
}

export const AGE_BANDS = ['under 90 days', '90 days to a year', '1 to 3 years', 'over 3 years', 'no listing date'];

/** Whether a protocol records a token at all (a CoinGecko id or a symbol). */
export function hasToken(p: SnapshotProtocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

/** The protocols the size curve is fitted on: token-bearing, with a market cap and TVL to price. */
export function calibrationSet(protocols: SnapshotProtocol[]): SnapshotProtocol[] {
  return protocols.filter((p) => hasToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
}

/** The two calibration signals, from one pass over the snapshot's token-bearing protocols.
 *  Kept for the validation table: radar-4's term, measured against the curve. A category keeps
 *  its own median only with at least `model.multiple_min_n` protocols behind it; anything thinner
 *  falls back to the global median, each signal rounded to 4 decimals BEFORE it enters the product. */
export function calibrate(snapshot: Snapshot, model: ModelConstants = MODEL): { global: number; globalMomentum: number; byCategory: Map<string, MultipleRow> } {
  const ratiosByCat = new Map<string, number[]>();
  const changesByCat = new Map<string, number[]>();
  const allRatios: number[] = [];
  const allChanges: number[] = [];
  for (const p of snapshot.protocols) {
    if (!hasToken(p)) continue;
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const r = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(r) || r <= 0) continue;
    allRatios.push(r);
    const c = p.category ?? 'Other';
    const ratios = ratiosByCat.get(c) ?? [];
    ratios.push(r);
    ratiosByCat.set(c, ratios);
    if (p.change_7d === null || !Number.isFinite(p.change_7d)) continue;
    allChanges.push(p.change_7d);
    const changes = changesByCat.get(c) ?? [];
    changes.push(p.change_7d);
    changesByCat.set(c, changes);
  }
  allRatios.sort((a, b) => a - b);
  allChanges.sort((a, b) => a - b);
  const globalMedian = medianOf(allRatios) ?? 0.25;
  const global = round4(Math.min(model.multiple_max, Math.max(model.multiple_min, globalMedian)));
  const globalMomentum = momentumOf(medianOf(allChanges) ?? 0, model);
  const byCategory = new Map<string, MultipleRow>();
  for (const [c, list] of [...ratiosByCat.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    list.sort((a, b) => a - b);
    const med = medianOf(list) ?? globalMedian;
    const changes = changesByCat.get(c) ?? [];
    changes.sort((a, b) => a - b);
    const changeMed = medianOf(changes);
    const ownMomentum = changeMed !== null && changes.length >= model.multiple_min_n;
    byCategory.set(c, {
      category: c,
      n: list.length,
      median: round4(med),
      multiple: list.length >= model.multiple_min_n ? round4(Math.min(model.multiple_max, Math.max(model.multiple_min, med))) : round4(global),
      source: list.length >= model.multiple_min_n ? `median of ${list.length} token-bearing protocols` : `only ${list.length}: global median`,
      momentum: ownMomentum ? momentumOf(changeMed, model) : globalMomentum,
      momentum_n: changes.length,
      momentum_source: ownMomentum ? `7d median of ${changes.length}` : 'global 7d median',
    });
  }
  return { global, globalMomentum, byCategory };
}

/** The momentum multiplier for one median 7-day change: the category's traded peers' week, clamped
 *  and weighted, rounded to 4 decimals before it enters the product. */
export function momentumOf(medianChange7d: number, model: ModelConstants = MODEL): number {
  const clamped = Math.min(model.momentum_cap, Math.max(model.momentum_floor, medianChange7d));
  return round4(1 + (clamped / 100) * model.momentum_weight);
}

/** The multiple one protocol's category gets: its own category's, or the global median. */
export function multipleFor(category: string | null, multiples: { global: number; byCategory: Map<string, MultipleRow> }): { multiple: number; source: string } {
  const row = multiples.byCategory.get(category ?? 'Other');
  if (row !== undefined) return { multiple: row.multiple, source: row.source };
  return { multiple: multiples.global, source: 'no token-bearing protocol in this category: global median' };
}

/** The momentum one protocol's category gets: its own category's, or the global momentum. */
export function momentumFor(category: string | null, multiples: { globalMomentum: number; byCategory: Map<string, MultipleRow> }): { momentum: number; source: string } {
  const row = multiples.byCategory.get(category ?? 'Other');
  if (row !== undefined) return { momentum: row.momentum, source: row.momentum_source };
  return { momentum: multiples.globalMomentum, source: 'no token-bearing protocol in this category: global momentum' };
}

/** The row's risk discount, from its own record only: age, 7-day TVL swing and chain count.
 *  Display-only in radar-5 (it does not enter the price): the ablation says it costs accuracy
 *  out-of-sample. Young (< 90 days, or no listing date) costs 0.05 / 0.02; a 7-day swing past
 *  30% costs 0.05, past 15% costs 0.02, and no reported change costs 0.02; one chain costs 0.05,
 *  two chains 0.02. Capped at 0.15, so the multiplier stays in [0.85, 1.00]. */
export function riskOf(
  age: number | null,
  change7d: number | null,
  chainCount: number,
  model: ModelConstants = MODEL,
): { multiplier: number; discount: number; flags: string[] } {
  let discount = 0;
  const flags: string[] = [];
  if (age === null) {
    discount += 0.02;
    flags.push('no listing date');
  } else if (age < model.risk_young_days) {
    discount += 0.05;
    flags.push('under 90 days old');
  } else if (age < model.unknown_age_days) {
    discount += 0.02;
    flags.push('under a year old');
  }
  if (change7d === null || !Number.isFinite(change7d)) {
    discount += 0.02;
    flags.push('no 7-day change reported');
  } else {
    const swing = Math.abs(change7d);
    if (swing > model.risk_vol_high) {
      discount += 0.05;
      flags.push(`TVL swung ${Math.round(swing)}% in 7 days`);
    } else if (swing > model.risk_vol_mid) {
      discount += 0.02;
      flags.push(`TVL moved ${Math.round(swing)}% in 7 days`);
    }
  }
  if (chainCount <= 1) {
    discount += 0.05;
    flags.push(chainCount === 0 ? 'no chain listed' : 'single chain');
  } else if (chainCount === 2) {
    discount += 0.02;
    flags.push('two chains');
  }
  discount = Math.min(discount, 0.15);
  return { multiplier: round4(1 - discount), discount: round4(discount), flags };
}

/* ------------------------------------------------------------------ */
/* radar-5: the fitted size curve, the launch odds, and the validation */
/* ------------------------------------------------------------------ */

/** OLS on log10(mcap) ~ log10(tvl) over a set of comps. */
export function olsCurve(comps: SnapshotProtocol[]): { intercept: number; slope: number; r2: number } {
  const xs = comps.map((p) => Math.log10(p.tvl_usd));
  const ys = comps.map((p) => Math.log10(p.mcap_usd!));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxy = 0, sxx = 0, sst = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) ** 2;
    sst += (ys[i]! - my) ** 2;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = my - slope * mx;
  let sse = 0;
  for (let i = 0; i < xs.length; i++) sse += (ys[i]! - (intercept + slope * xs[i]!)) ** 2;
  return { intercept, slope, r2: sst === 0 ? 0 : 1 - sse / sst };
}

/** The curve's value for one TVL. */
export function curveValue(tvlUsd: number, fit: { intercept: number; slope: number }): number {
  return 10 ** (fit.intercept + fit.slope * Math.log10(Math.max(1, tvlUsd)));
}

/** Error metrics for predicted vs actual market caps, in log10 space. */
export function logErrorMetrics(pred: number[], actual: number[]): { med: number; mean: number; within2x: number; bias: number } {
  const logs = pred.map((v, i) => Math.log10(v / actual[i]!));
  const abs = logs.map(Math.abs).sort((a, b) => a - b);
  return {
    med: abs[Math.floor(abs.length / 2)] ?? 0,
    mean: abs.reduce((a, b) => a + b, 0) / abs.length,
    within2x: abs.filter((x) => x <= Math.log10(2)).length / abs.length,
    bias: logs.reduce((a, b) => a + b, 0) / logs.length,
  };
}

/** The post-fit terms of one protocol, from its own record (features, never the target). */
export function postFitTerms(
  protocol: SnapshotProtocol,
  asOf: string,
  multiples: { global: number; globalMomentum: number; byCategory: Map<string, MultipleRow> },
  model: ModelConstants = MODEL,
): { growthMult: number; maturityMult: number; momentum: number; riskMult: number; growthPct: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(protocol.change_7d, 0)));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const { momentum } = momentumFor(protocol.category, multiples);
  const { multiplier: riskMult } = riskOf(age, protocol.change_7d, protocol.chains.length, model);
  return { growthMult, maturityMult, momentum, riskMult, growthPct, age };
}

/** One predictor's value for a protocol, given fits on TRAIN only. */
export function predictValue(
  kind: 'global' | 'median' | 'curve' | 'curveCat' | 'v4full' | 'curveFull' | 'curveGrowth' | 'curveMaturity' | 'curveMomentum' | 'curveRisk' | 'curveGrowthMaturity',
  protocol: SnapshotProtocol,
  asOf: string,
  train: { curve: { intercept: number; slope: number }; multiples: { global: number; globalMomentum: number; byCategory: Map<string, MultipleRow> }; catResid: Map<string, number> },
  model: ModelConstants = MODEL,
): number {
  const cat = protocol.category ?? 'Other';
  const t = postFitTerms(protocol, asOf, train.multiples, model);
  const post = t.growthMult * t.maturityMult * t.momentum * t.riskMult;
  switch (kind) {
    case 'global': return protocol.tvl_usd * train.multiples.global;
    case 'median': return protocol.tvl_usd * multipleFor(protocol.category, train.multiples).multiple;
    case 'curve': return curveValue(protocol.tvl_usd, train.curve);
    case 'curveCat': return 10 ** (train.curve.intercept + train.curve.slope * Math.log10(protocol.tvl_usd) + (train.catResid.get(cat) ?? 0));
    case 'v4full': return protocol.tvl_usd * multipleFor(protocol.category, train.multiples).multiple * post;
    case 'curveFull': return curveValue(protocol.tvl_usd, train.curve) * post;
    case 'curveGrowth': return curveValue(protocol.tvl_usd, train.curve) * t.growthMult;
    case 'curveMaturity': return curveValue(protocol.tvl_usd, train.curve) * t.maturityMult;
    case 'curveMomentum': return curveValue(protocol.tvl_usd, train.curve) * t.momentum;
    case 'curveRisk': return curveValue(protocol.tvl_usd, train.curve) * t.riskMult;
    case 'curveGrowthMaturity': return curveValue(protocol.tvl_usd, train.curve) * t.growthMult * t.maturityMult;
  }
}

/** The fits one TRAIN set produces: the curve, the old multiples, and the shrunk category
 *  residuals around the curve. */
export function fitTrain(train: SnapshotProtocol[], asOf: string, model: ModelConstants = MODEL): {
  curve: { intercept: number; slope: number };
  multiples: { global: number; globalMomentum: number; byCategory: Map<string, MultipleRow> };
  catResid: Map<string, number>;
} {
  const trainSnap: Snapshot = { as_of: asOf, source: '', floor_usd: 1, protocols: train, watchlist: [], skipped_unscoreable: 0 };
  const multiples = calibrate(trainSnap, model);
  const curve = olsCurve(train);
  const resByCat = new Map<string, number[]>();
  for (const p of train) {
    const r = Math.log10(p.mcap_usd!) - (curve.intercept + curve.slope * Math.log10(p.tvl_usd));
    const c = p.category ?? 'Other';
    resByCat.set(c, [...(resByCat.get(c) ?? []), r]);
  }
  const catResid = new Map<string, number>();
  for (const [c, rs] of resByCat) catResid.set(c, (rs.reduce((a, b) => a + b, 0) / rs.length) * (rs.length / (rs.length + 5)));
  return { curve, multiples, catResid };
}

/** A seeded shuffle (deterministic: the validation must reproduce byte for byte). */
export function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const PREDICTORS = [
  { kind: 'global' as const, name: 'Global median' },
  { kind: 'median' as const, name: 'Category median (radar-4)' },
  { kind: 'curve' as const, name: 'Size curve (radar-5)' },
  { kind: 'curveCat' as const, name: 'Curve + shrunk category' },
  { kind: 'v4full' as const, name: 'radar-4 full formula' },
  { kind: 'curveFull' as const, name: 'Curve + all four terms' },
];

/** The validation table: every predictor on LOO, two time splits and two random halves.
 *  Computed from the input snapshot at build time, so the numbers stay honest on any snapshot. */
export function validateModel(snapshot: Snapshot, model: ModelConstants = MODEL): ValidationRow[] {
  const comps = calibrationSet(snapshot.protocols);
  const rows: ValidationRow[] = [];
  const runSplit = (split: string, train: SnapshotProtocol[], test: SnapshotProtocol[]) => {
    if (train.length < 10 || test.length < 10) return;
    const f = fitTrain(train, snapshot.as_of, model);
    for (const p of PREDICTORS) {
      const pred = test.map((t) => predictValue(p.kind, t, snapshot.as_of, f, model));
      const m = logErrorMetrics(pred, test.map((t) => t.mcap_usd!));
      rows.push({ split, predictor: p.name, n: test.length, med_abs_log10: round3(m.med), mean_abs_log10: round3(m.mean), within2x: round3(m.within2x), bias_log10: round3(m.bias) });
    }
  };
  // Leave-one-out over the whole calibration set.
  {
    const kinds = PREDICTORS.map((p) => p.kind);
    const preds: Record<string, number[]> = {};
    for (const k of kinds) preds[k] = [];
    const actual: number[] = [];
    for (let i = 0; i < comps.length; i++) {
      const f = fitTrain(comps.filter((_, j) => j !== i), snapshot.as_of, model);
      for (const p of PREDICTORS) preds[p.kind]!.push(predictValue(p.kind, comps[i]!, snapshot.as_of, f, model));
      actual.push(comps[i]!.mcap_usd!);
    }
    for (const p of PREDICTORS) {
      const m = logErrorMetrics(preds[p.kind]!, actual);
      rows.push({ split: 'LOO', predictor: p.name, n: actual.length, med_abs_log10: round3(m.med), mean_abs_log10: round3(m.mean), within2x: round3(m.within2x), bias_log10: round3(m.bias) });
    }
    // One term at a time on top of the curve (LOO only): the ablation that decides which
    // post-fit terms, if any, earn their keep. None does — see the Method tab.
    const oneTerm: { kind: 'curveGrowth' | 'curveMaturity' | 'curveMomentum' | 'curveRisk' | 'curveGrowthMaturity'; name: string }[] = [
      { kind: 'curveGrowth', name: 'Curve + growth' },
      { kind: 'curveMaturity', name: 'Curve + maturity' },
      { kind: 'curveMomentum', name: 'Curve + momentum' },
      { kind: 'curveRisk', name: 'Curve + risk' },
      { kind: 'curveGrowthMaturity', name: 'Curve + growth + maturity' },
    ];
    for (const p of oneTerm) {
      const pr: number[] = [];
      for (let i = 0; i < comps.length; i++) {
        const f = fitTrain(comps.filter((_, j) => j !== i), snapshot.as_of, model);
        pr.push(predictValue(p.kind, comps[i]!, snapshot.as_of, f, model));
      }
      const m = logErrorMetrics(pr, actual);
      rows.push({ split: 'LOO · 1 term', predictor: p.name, n: actual.length, med_abs_log10: round3(m.med), mean_abs_log10: round3(m.mean), within2x: round3(m.within2x), bias_log10: round3(m.bias) });
    }
  }
  // Time splits: fit on the older protocols, test on the newer ones.
  for (const cut of ['2025-01-01', '2025-07-01']) {
    const dated = comps.filter((p) => p.listed_at !== null);
    runSplit(`Time ${cut}`, dated.filter((p) => p.listed_at! < cut), dated.filter((p) => p.listed_at! >= cut));
  }
  // Random halves, two seeds.
  for (const seed of [1, 2]) {
    const sh = seededShuffle(comps, seed);
    runSplit(`Half ${seed}`, sh.slice(0, Math.floor(sh.length / 2)), sh.slice(Math.floor(sh.length / 2)));
  }
  return rows;
}

/** The launch-odds fit: the global rate, and the shrunk (category, age band) cell rates. */
export interface OddsFit {
  baseRate: number;
  cell: Map<string, { odds: number; n: number }>;
  catRate: Map<string, number>;
}

export function fitOdds(protocols: SnapshotProtocol[], asOf: string, model: ModelConstants = MODEL): OddsFit {
  const baseRate = protocols.reduce((s, p) => s + (hasToken(p) ? 1 : 0), 0) / protocols.length;
  const byCat = new Map<string, { k: number; n: number }>();
  const byCell = new Map<string, { k: number; n: number }>();
  for (const p of protocols) {
    const c = p.category ?? 'Other';
    const key = `${c}|${ageBandIndex(asOf, p.listed_at)}`;
    const a = byCat.get(c) ?? { k: 0, n: 0 };
    a.k += hasToken(p) ? 1 : 0;
    a.n++;
    byCat.set(c, a);
    const b = byCell.get(key) ?? { k: 0, n: 0 };
    b.k += hasToken(p) ? 1 : 0;
    b.n++;
    byCell.set(key, b);
  }
  const shrink = (k: number, n: number, prior: number, m: number) => (k + m * prior) / (n + m);
  const catRate = new Map<string, number>();
  for (const [c, a] of byCat) catRate.set(c, round4(shrink(a.k, a.n, baseRate, model.odds_shrink_category)));
  const cell = new Map<string, { odds: number; n: number }>();
  for (const [key, b] of byCell) {
    const c = key.split('|')[0]!;
    cell.set(key, { odds: round4(shrink(b.k, b.n, catRate.get(c) ?? baseRate, model.odds_shrink_cell)), n: b.n });
  }
  return { baseRate: round4(baseRate), cell, catRate };
}

/** One protocol's launch odds from a fit, with the peer count behind it. */
export function oddsOf(p: SnapshotProtocol, asOf: string, fit: OddsFit): { odds: number; peers: number; cell: string } {
  const c = p.category ?? 'Other';
  const band = ageBandIndex(asOf, p.listed_at);
  const key = `${c}|${band}`;
  const cell = fit.cell.get(key);
  if (cell !== undefined) return { odds: cell.odds, peers: cell.n, cell: `${c} · ${AGE_BANDS[band]}` };
  return { odds: fit.catRate.get(c) ?? fit.baseRate, peers: 0, cell: `${c} · ${AGE_BANDS[band]}` };
}

/** Brier score of a set of predicted probabilities against 0/1 outcomes. */
export function brierScore(pred: number[], actual: number[]): number {
  return pred.reduce((s, v, i) => s + (v - actual[i]!) ** 2, 0) / pred.length;
}

/** The odds validation: LOO and time-split Brier scores against the base rate. */
export function validateOdds(snapshot: Snapshot, model: ModelConstants = MODEL): { loo: number; looBase: number; time: number; timeBase: number } {
  const all = snapshot.protocols;
  const y = all.map((p) => (hasToken(p) ? 1 : 0));
  // Leave-one-out.
  const looPred: number[] = [];
  for (let i = 0; i < all.length; i++) {
    const f = fitOdds(all.filter((_, j) => j !== i), snapshot.as_of, model);
    looPred.push(oddsOf(all[i]!, snapshot.as_of, f).odds);
  }
  const looBase = brierScore(all.map(() => all.reduce((s, p) => s + (hasToken(p) ? 1 : 0), 0) / all.length), y);
  // Time split: fit on the older protocols, test on the newer ones.
  const dated = all.filter((p) => p.listed_at !== null);
  const train = dated.filter((p) => p.listed_at! < '2025-01-01');
  const test = dated.filter((p) => p.listed_at! >= '2025-01-01');
  const f = fitOdds(train, snapshot.as_of, model);
  const time = brierScore(test.map((p) => oddsOf(p, snapshot.as_of, f).odds), test.map((p) => (hasToken(p) ? 1 : 0)));
  const timeBase = brierScore(test.map(() => train.reduce((s, p) => s + (hasToken(p) ? 1 : 0), 0) / train.length), test.map((p) => (hasToken(p) ? 1 : 0)));
  return { loo: brierScore(looPred, y), looBase, time, timeBase };
}

/** The fitted size curve over the whole calibration set, with its LOO error. */
export function fitCurve(snapshot: Snapshot): CurveFit {
  const comps = calibrationSet(snapshot.protocols);
  const fit = olsCurve(comps);
  const preds: number[] = [];
  const actual: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const f = olsCurve(comps.filter((_, j) => j !== i));
    preds.push(curveValue(comps[i]!.tvl_usd, f));
    actual.push(comps[i]!.mcap_usd!);
  }
  const m = logErrorMetrics(preds, actual);
  return { intercept: round4(fit.intercept), slope: round4(fit.slope), r2: round3(fit.r2), n: comps.length, loo_med_abs_log10: round3(m.med), loo_mean_abs_log10: round3(m.mean), loo_within2x: round3(m.within2x) };
}

/* ------------------------------------------------------------------ */
/* radar-5: scoring, the board, the farm plans, the dashboard data     */
/* ------------------------------------------------------------------ */

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round3 = (n: number): number => Math.round(n * 1e3) / 1e3;
/** Two decimals: the dashboard shows the 7-day change to one decimal, so the compact rows
 *  carry no more precision than the page can display. */
const round2 = (n: number | null): number | null => (n === null ? null : Math.round(n * 100) / 100);

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories the watchlist rule keeps out: wrapped, staked or bridged products of a token that trades. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Exchange names the watchlist rule keeps out of a protocol's name. */
const EXCHANGE_NAMES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, and not a wrapped, staked or bridged
 *  product of a token that already trades, by the same rule the snapshot's watchlist was built with. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return false;
  if (EXCHANGE_NAMES.some((e) => p.name.startsWith(e))) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** Everything one protocol scores under radar-5: the curve value, the odds, the expected value,
 *  and the display-only context terms (tested, not in the price). */
export function scoreProtocol(
  protocol: SnapshotProtocol,
  snapshot: Snapshot,
  curve: { intercept: number; slope: number },
  oddsFit: OddsFit,
  multiples: { global: number; globalMomentum: number; byCategory: Map<string, MultipleRow> },
  model: ModelConstants = MODEL,
): Omit<BoardRow, 'rank' | 'farm_steps'> & { expected: number } {
  const age = ageDays(snapshot.as_of, protocol.listed_at);
  const curveImplied = Math.max(1, Math.round(curveValue(protocol.tvl_usd, curve)));
  const { odds, peers, cell } = oddsOf(protocol, snapshot.as_of, oddsFit);
  const expected = Math.max(1, Math.round(curveImplied * odds));
  const { multiple, source } = multipleFor(protocol.category, multiples);
  const { momentum, source: momentumSource } = momentumFor(protocol.category, multiples);
  const t = postFitTerms(protocol, snapshot.as_of, multiples, model);
  const risk = riskOf(age, protocol.change_7d, protocol.chains.length, model);
  return {
    slug: protocol.slug,
    name: protocol.name,
    category: protocol.category,
    chains: protocol.chains,
    tvl_usd: protocol.tvl_usd,
    change_7d: protocol.change_7d,
    mcap_usd: protocol.mcap_usd,
    listed_at: protocol.listed_at,
    gecko_id: protocol.gecko_id,
    symbol: protocol.symbol,
    token_status: 'pre-token',
    age_days: age,
    implied_value_usd: expected,
    expected,
    model: {
      curve_implied_usd: curveImplied,
      launch_odds: round4(odds),
      odds_peers: peers,
      odds_cell: cell,
      interval_low_usd: 0,
      interval_high_usd: 0,
      rank_low: 0,
      rank_high: 0,
      category_multiple: round4(multiple),
      multiple_source: source,
      growth_pct: t.growthPct,
      growth_multiplier: round4(t.growthMult),
      maturity_multiplier: round4(t.maturityMult),
      momentum_multiplier: round4(t.momentum),
      momentum_source: momentumSource,
      age_days: age,
      risk_multiplier: risk.multiplier,
      risk_discount: risk.discount,
      risk_flags: risk.flags,
    },
  };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const curve = fitCurve(snapshot);
  const oddsFit = fitOdds(snapshot.protocols, snapshot.as_of, model);
  const multiples = calibrate(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol, at any TVL. The house watchlist
  // does not cover every protocol at or above its floor — on this snapshot 20 rankable
  // protocols sit above the floor but off the watchlist, including the largest pre-token TVL
  // in the snapshot — so the early radar is defined by rankability, not by the floor. Never a
  // replacement for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => scoreProtocol(p, snapshot, curve, oddsFit, multiples, model));
  scored.sort((a, b) => b.expected - a.expected || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  // Intervals and rank ranges from the curve's own held-out error: expected x 10^(+/- residual).
  const factor = 10 ** curve.loo_med_abs_log10;
  const expecteds = scored.map((s) => s.expected);
  const rows: BoardRow[] = scored.map((s, i) => {
    const low = Math.max(1, Math.round(s.expected / factor));
    const high = Math.round(s.expected * factor);
    const rankLow = 1 + expecteds.filter((e) => e > high).length;
    const rankHigh = 1 + expecteds.filter((e) => e > low).length;
    return {
      ...s,
      rank: i + 1,
      model: { ...s.model, interval_low_usd: low, interval_high_usd: high, rank_low: rankLow, rank_high: rankHigh },
      farm_steps: farmSteps(s, s.age_days).map(stepText),
    };
  });
  return rows;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: { chains: string[] }): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: { tvl_usd: number }): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** What one transaction costs on a chain, as the farm plan states it: an estimate, never a quote. */
function gasFor(chain: string): string {
  if (chain === 'Ethereum') return '$3–$8';
  if (chain === 'Solana') return '$0.01';
  if (chain === 'Tron') return '$1–$2';
  if (chain === 'Bitcoin') return 'the network fee';
  const cheap = new Set([
    'Base', 'Arbitrum', 'Optimism', 'Ink', 'Blast', 'Mode', 'Zora', 'Unichain', 'World Chain',
    'Linea', 'Scroll', 'ZkSync', 'Polygon', 'Avalanche', 'Binance', 'Berachain', 'Sui', 'Aptos',
    'Monad', 'Pharos', 'Plume Mainnet', 'Robinhood Chain', 'Stellar', 'Flare', 'Bittensor',
    'Mantle', 'Celo', 'Gnosis', 'Fantom', 'Sei', 'Injective', 'Movement', 'MegaETH',
  ]);
  if (cheap.has(chain)) return '$0.10–$1';
  return 'under $3';
}

/** One transaction's gas in dollars (the midpoint of the stated range), for the verdict. */
function gasUsd(chain: string): number {
  if (chain === 'Ethereum') return 5.5;
  if (chain === 'Solana') return 0.01;
  if (chain === 'Tron') return 1.5;
  if (chain === 'Bitcoin') return 10;
  const cheap = new Set([
    'Base', 'Arbitrum', 'Optimism', 'Ink', 'Blast', 'Mode', 'Zora', 'Unichain', 'World Chain',
    'Linea', 'Scroll', 'ZkSync', 'Polygon', 'Avalanche', 'Binance', 'Berachain', 'Sui', 'Aptos',
    'Monad', 'Pharos', 'Plume Mainnet', 'Robinhood Chain', 'Stellar', 'Flare', 'Bittensor',
    'Mantle', 'Celo', 'Gnosis', 'Fantom', 'Sei', 'Injective', 'Movement', 'MegaETH',
  ]);
  if (cheap.has(chain)) return 0.55;
  return 3;
}

/** The farm verdict, from a stated rule: the plan's all-in gas over its hold window.
 *  FARM at $25 or less, THIN at $75 or less, SKIP above that. The capital is deployed, not
 *  spent, so it does not enter the verdict; the verdict says only whether the gas is cheap
 *  enough to justify farming a protocol whose allocation, if any, is unknown. */
export function verdictFor(p: { chains: string[]; tvl_usd: number }, age: number | null): { verdict: string; gasTotal: number; capital: number; hold: number } {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weeks = Math.ceil(hold / 7);
  const gasTotal = Math.round(gasUsd(chain) * (1 + weeks) * 100) / 100;
  const verdict = gasTotal <= 25 ? 'FARM' : gasTotal <= 75 ? 'THIN' : 'SKIP';
  return { verdict, gasTotal, capital, hold };
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('yield aggregator')) return `Deposit $${capital} of USDC into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('basis')) return `Deposit $${capital} into ${name}'s basis vault on ${chain} and keep the position open.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('chain')) return `Use ${name}'s app on ${chain} with $${capital} and keep the position open.`;
  if (c.includes('payment')) return `Send or hold $${capital} through ${name} on ${chain} and keep the balance.`;
  if (c.includes('governance')) return `Deposit $${capital} into ${name}'s governance vault on ${chain} and keep the shares.`;
  if (c.includes('launchpad')) return `Join a ${name} launch on ${chain} with $${capital} and hold the allocation.`;
  if (c.includes('locker')) return `Lock $${capital} of assets in ${name} on ${chain} and keep the lock open.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The weekly qualifying action, by category: the habit that keeps the position counted. */
function weeklyFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'Borrow a small amount against the deposit and repay it, so the position shows both sides of the market.';
  if (c.includes('dex') || c.includes('yield')) return 'Swap a small amount and add or remove a little liquidity each week.';
  if (c.includes('bridge')) return 'Bridge a small amount to another supported chain and back each week.';
  if (c.includes('staking') || c.includes('restak')) return 'Restake the rewards or top up the stake by a small amount each week.';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return 'Open and close one small hedged position each week.';
  if (c.includes('prediction')) return 'Place one small market position each week.';
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk') || c.includes('basis')) return 'Top up the vault or rebalance between its strategies each week.';
  if (c.includes('rwa')) return 'Claim the yield or top up the position by a small amount each week.';
  if (c.includes('insurance')) return 'Review the cover terms each week and renew before the policy lapses.';
  return 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.';
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time, plus a seventh step
 * with the costed verdict. The plan is derived from the protocol's own record (category, chains,
 * TVL, age), never from a hand-written list of names. No step promises a token: the protocol
 * records no token in the snapshot, and an allocation, if any, is the protocol's own decision.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const v = verdictFor(p, age);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about ${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: weeklyFor(p),
      cost: `about ${gas} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
    {
      text: `Verdict: ${v.verdict} — all-in about $${v.gasTotal} of gas over ${hold} days on $${capital} of capital. It pays only if the eventual allocation tops $${v.gasTotal} of gas, and no token is promised.`,
      cost: `$${v.gasTotal} of gas in all`,
      time: `${hold} days`,
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js: an array, in the order the page's comment names.
 *  The curve-implied value and the launch odds are not carried: the page recomputes both from
 *  the TVL and the fitted curve and odds cells, so they cannot drift from the board. */
export function radarRow(row: BoardRow, chainIndex: Map<string, number>, catIndex: Map<string, number>): RadarRow {
  return [
    row.rank,
    row.slug,
    row.name,
    row.category === null ? -1 : catIndex.get(row.category) ?? -1,
    row.chains.map((c) => chainIndex.get(c) ?? -1),
    row.tvl_usd,
    round2(row.change_7d),
    row.age_days,
    row.implied_value_usd,
  ];
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const curve = fitCurve(snapshot);
  const odds = fitOdds(snapshot.protocols, snapshot.as_of, model);
  const oddsValidation = validateOdds(snapshot, model);
  const validationRows = validateModel(snapshot, model);
  const splits = [...new Set(validationRows.map((r) => r.split))];
  const predictors = [...new Set(validationRows.map((r) => r.predictor))];
  const validation = {
    splits,
    predictors,
    rows: validationRows.map((r): [number, number, number, number, number, number, number] => [
      splits.indexOf(r.split), predictors.indexOf(r.predictor), r.n, r.med_abs_log10, r.mean_abs_log10, r.within2x, r.bias_log10,
    ]),
  };
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const chainSet = new Set<string>();
  for (const r of board) for (const c of r.chains) chainSet.add(c);
  for (const r of live) for (const c of r.chains) chainSet.add(c);
  const chains = [...chainSet].sort();
  const chainIndex = new Map(chains.map((c, i) => [c, i]));
  const catSet = new Set<string>();
  for (const r of board) if (r.category !== null) catSet.add(r.category);
  for (const r of live) if (r.category !== null) catSet.add(r.category);
  const categories = [...catSet].sort();
  const catIndex = new Map(categories.map((c, i) => [c, i]));
  // The odds cells the board actually uses, as compact tuples.
  const cellKeys = new Set<string>();
  for (const r of board) cellKeys.add(`${r.category ?? 'Other'}|${ageBandIndex(snapshot.as_of, r.listed_at)}`);
  const oddsCells: OddsTuple[] = [...cellKeys].sort().map((key) => {
    const [cat, band] = key.split('|');
    const cell = odds.cell.get(key);
    return [catIndex.get(cat!) ?? -1, Number(band), cell ? round4(cell.odds) : round4(odds.baseRate), cell ? cell.n : 0];
  });
  // The audit: every protocol in the snapshot, by disposition.
  const liveMcap = snapshot.protocols.filter((p) => p.mcap_usd !== null).length;
  const tokenNoMcap = snapshot.protocols.filter((p) => hasToken(p) && p.mcap_usd === null).length;
  const pretokenExcluded = snapshot.protocols.filter((p) => isPreToken(p) && !isRankable(p)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: 'DefiLlama protocols, fetched 2026-11-14T01:18:33Z',
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    watchlist: [...snapshot.watchlist],
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    curve,
    validation,
    odds_brier_loo: round4(oddsValidation.loo),
    odds_brier_loo_base: round4(oddsValidation.looBase),
    odds_brier_time: round4(oddsValidation.time),
    odds_brier_time_base: round4(oddsValidation.timeBase),
    odds_base_rate: round4(odds.baseRate),
    odds_cells: oddsCells,
    residual_log10: curve.loo_med_abs_log10,
    audit: {
      total: snapshot.protocols.length,
      ranked: board.length,
      live_mcap: liveMcap,
      token_no_mcap: tokenNoMcap,
      pretoken_excluded: pretokenExcluded,
    },
    chains,
    categories,
    rows: board.map((r) => radarRow(r, chainIndex, catIndex)),
    live: live.map((r): LiveTuple => [r.slug, r.name, r.category === null ? -1 : catIndex.get(r.category) ?? -1, r.chains.map((c) => chainIndex.get(c) ?? -1), r.tvl_usd, r.mcap_usd, round2(r.change_7d)]),
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  // One odd record must never kill the whole run: a protocol with no slug, no name or no finite
  // TVL cannot be scored at all, so it is skipped and counted (see the Snapshot interface).
  // Everything else already normalizes — a missing category becomes null, a missing or
  // non-finite change becomes null, chains default to [] — so no field access in the scoring
  // path can throw on a parsed record. A malformed document (no as_of, no floor, no protocols
  // array, no watchlist of slugs) still throws: that is the whole input, not one record.
  let skippedUnscoreable = 0;
  const protocols: SnapshotProtocol[] = [];
  for (const v of o.protocols) {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) { skippedUnscoreable++; continue; }
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) { skippedUnscoreable++; continue; }
    protocols.push({
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    });
  }
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    skipped_unscoreable: skippedUnscoreable,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network.
 *  Rows are arrays in this order: [rank, slug, name, category, chains, tvl_usd, change_7d,
 *  age_days, expected_value_usd], with category and chains as indices into the categories and
 *  chains tables. The curve-implied value and the launch odds are not carried: the page
 *  recomputes both from the TVL and the fitted curve and odds cells. Odds cells are [category,
 *  age band, odds, peers]; live rows are [slug, name, category, chains, tvl_usd, mcap_usd,
 *  change_7d]. */
export function dataScript(radar: RadarData): string {
  return `// Token Radar data: the ranked board as compact arrays (see the order in lib/model.ts),
// the live-token reference set, the fitted curve and odds, and the validation table.
window.RADAR=${JSON.stringify(radar)};\n`;
}
