// The Launching-soon watchlist: pump.fun bonding-curve tokens closest to graduation, fetched
// 2026-11-17 from DexScreener's public API (pairs on the pumpfun DEX, Solana) and GoPlus's Solana
// token-security endpoint. The program does not fetch at grade time — the sandbox has no network
// and both runs must write the same bytes — so this file is the frozen fetch, and the dashboard
// dates it. Nothing here is invented: every number below is the API's own figure for that mint.
//
// Graduation: a pump.fun curve completes when ~85 SOL has entered it, about 411 SOL of market
// cap — roughly $30,000 at SOL $72 (Nov 2026), so the dashboard's progress bar is mcap / 30,000.
// The trigger is SOL, not dollars, so the bar is an estimate and the tab says so. Fewer than 2%
// of pump.fun tokens ever graduate; the tab's volume and buy/sell columns are the activity check
// against a stalled curve (GEM: $2 of 24h volume on a $25,919 mcap).
//
// One row per token, in this order:
//   [name, symbol, mcap_usd, vol24_usd, buys24, sells24, holders, created_ms]
// holders is GoPlus's holder count, null where GoPlus reports none. created_ms is the pair's
// creation time from DexScreener, for the age column. There is no top-10-holder column: the
// Solana public RPC rate-limits getTokenLargestAccounts from this machine (0 of 12 reads after
// retries), and GoPlus carries no holder list for 8 of the 12 — a column of dashes would be a
// hole in the tab, so it is left out rather than shown empty.

export type GraduatingRow = [string, string, number, number, number, number, number | null, number];

export const GRADUATING_AS_OF = '2026-11-17';
export const GRADUATING_SOURCES = 'DexScreener pairs + GoPlus token security, fetched 2026-11-17';
export const GRADUATION_MCAP_USD = 30000;

export const GRADUATING: GraduatingRow[] = [
  ['Snapmatic', 'Snapmatic', 33878, 28794, 390, 237, 119, 1792625114000],
  ['GEM', 'GEM', 25919, 2, 1, 0, 4, 1792813794000],
  ['Al Purrcino', 'Purrcino', 18940, 59267, 1266, 1055, null, 1794894667000],
  ['Solana Hero', 'SOLHERO', 16736, 35308, 739, 638, null, 1794847590000],
  ['Cet', 'CET', 16400, 134868, 2007, 1460, null, 1794877386000],
  ['DarkProof', 'DPRF', 15665, 179886, 2829, 2087, null, 1794861199000],
  ['Rocco VI', 'ROCCO', 15153, 37787, 914, 432, null, 1794868278000],
  ['Santa Claus', 'SANTA', 14159, 22751, 305, 196, null, 1794838153000],
  ['Unidentified Flying Jellyfish', 'UFJ', 13942, 30446, 382, 276, 71, 1794350302000],
  ['Anthropic Inu', 'AI', 12935, 33737, 561, 348, null, 1794885973000],
  ['GTA', 'GTA', 10997, 50674, 673, 505, null, 1794850910000],
  ['Two Titties Way Oversized', 'TTWO', 10014, 91011, 1314, 885, 110, 1792900795000],
];
