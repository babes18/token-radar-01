'use strict';
const DATA = window.RADAR;
if (!DATA || !Array.isArray(DATA.rows)) throw new Error('token radar: no board data');
const CURVE = DATA.curve || { intercept: 3.025, slope: 0.522, r2: 0.194, n: 128 };
const RESIDUAL = DATA.residual_log10 ?? 0.532;
const ODDS_CELLS = DATA.odds_cells || [];
const BASE_ODDS = DATA.odds_base_rate ?? 0.549;
const AGE_BANDS = ['under 90 days', '90–364 days', '1–3 years', 'over 3 years', 'listed date unknown'];
const ROWS = DATA.rows.map((r) => ({
rank: r[0], slug: r[1], name: r[2], category: r[3], chains: r[4], tvl_usd: r[5],
change_7d: r[6], age_days: r[7], implied_value_usd: r[8],
}));
const LIVE = (DATA.live || []).map((r) => ({
slug: r[0], name: r[1], category: r[2], chains: r[3], tvl_usd: r[4], mcap_usd: r[5], change_7d: r[6],
}));
const CAT = (DATA.categories || []).map((c) => String(c));
const CHAIN = (DATA.chains || []).map((c) => String(c));
const BY_SLUG = new Map(ROWS.map((r) => [r.slug, r]));
function finite(v) {
return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function fmtMoney(n) {
if (n === null || n === undefined) return '—';
const abs = Math.abs(n);
if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
if (abs >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
if (abs >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
return '$' + n.toFixed(0);
}
function fmtMoneyFull(n) {
if (n === null || n === undefined) return '—';
return '$' + Math.round(n).toLocaleString('en-US');
}
function fmtPct(v) {
if (v === null) return '—';
return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1) + '%';
}
function fmtMult(v) {
if (v === null || v === undefined) return '—';
return v.toFixed(3) + '×';
}
function fmtAge(days) {
if (days === null || days === undefined) return 'Unknown';
if (days < 365) return days + 'd';
const y = Math.floor(days / 365);
const m = Math.floor((days % 365) / 30);
return y + 'y' + (m > 0 ? ' ' + m + 'mo' : '');
}
function esc(s) {
return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
function curveValue(tvlUsd) {
return Math.pow(10, CURVE.intercept + CURVE.slope * Math.log10(Math.max(1, tvlUsd)));
}
function curveImpliedOf(row) {
return Math.max(1, Math.round(curveValue(row.tvl_usd)));
}
function oddsFor(row) {
const band = row.age_days === null ? 4 : row.age_days < 90 ? 0 : row.age_days < 365 ? 1 : row.age_days < 1095 ? 2 : 3;
const cell = ODDS_CELLS.find((c) => c[0] === row.category && c[1] === band);
if (cell) return { odds: cell[2], peers: cell[3], cell: (CAT[row.category] ?? 'Other') + ' · ' + AGE_BANDS[band] };
return { odds: BASE_ODDS, peers: 0, cell: (CAT[row.category] ?? 'Other') + ' · ' + AGE_BANDS[band] };
}
function expectedOf(row) {
return Math.max(1, Math.round(curveImpliedOf(row) * oddsFor(row).odds));
}
function intervalOf(row) {
const factor = Math.pow(10, RESIDUAL);
return { low: Math.max(1, Math.round(expectedOf(row) / factor)), high: Math.round(expectedOf(row) * factor) };
}
function rankRangeOf(row) {
const iv = intervalOf(row);
const expecteds = ROWS.map((r) => expectedOf(r));
return {
low: 1 + expecteds.filter((e) => e > iv.high).length,
high: 1 + expecteds.filter((e) => e > iv.low).length,
};
}
function stepText(step) {
let s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
if (s.length > 600) s = s.slice(0, 596) + '...';
if (s.length < 20) s = s + ' Hold the position and check the protocol\'s own page.';
return s;
}
function chainOf(row) {
return row.chains.length > 0 ? CHAIN[row.chains[0]] : 'its main chain';
}
function capitalFor(row) {
if (row.tvl_usd >= 5_000_000_000) return 250;
if (row.tvl_usd >= 1_000_000_000) return 150;
if (row.tvl_usd >= 100_000_000) return 100;
return 50;
}
function holdDaysFor(ageDays) {
if (ageDays === null) return 30;
if (ageDays < 180) return 60;
if (ageDays < 365) return 45;
return 30;
}
const CHEAP_CHAINS = new Set([
'Base', 'Arbitrum', 'Optimism', 'Ink', 'Blast', 'Mode', 'Zora', 'Unichain', 'World Chain',
'Linea', 'Scroll', 'ZkSync', 'Polygon', 'Avalanche', 'Binance', 'Berachain', 'Sui', 'Aptos',
'Monad', 'Pharos', 'Plume Mainnet', 'Robinhood Chain', 'Stellar', 'Flare', 'Bittensor',
'Mantle', 'Celo', 'Gnosis', 'Fantom', 'Sei', 'Injective', 'Movement', 'MegaETH',
]);
function gasFor(chain) {
if (chain === 'Ethereum') return '$3–$8';
if (chain === 'Solana') return '$0.01';
if (chain === 'Tron') return '$1–$2';
if (chain === 'Bitcoin') return 'the network fee';
if (CHEAP_CHAINS.has(chain)) return '$0.10–$1';
return 'under $3';
}
function gasUsd(chain) {
if (chain === 'Ethereum') return 5.5;
if (chain === 'Solana') return 0.01;
if (chain === 'Tron') return 1.5;
if (chain === 'Bitcoin') return 10;
if (CHEAP_CHAINS.has(chain)) return 0.55;
return 3;
}
function verdictFor(row) {
const chain = chainOf(row);
const capital = capitalFor(row);
const hold = holdDaysFor(row.age_days);
const weeks = Math.ceil(hold / 7);
const gasTotal = Math.round(gasUsd(chain) * (1 + weeks) * 100) / 100;
const verdict = gasTotal <= 25 ? 'FARM' : gasTotal <= 75 ? 'THIN' : 'SKIP';
return { verdict, gasTotal, capital, hold };
}
function actionFor(row, capital, chain) {
const c = (CAT[row.category] ?? '').toLowerCase();
const name = row.name;
if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
if (c.includes('yield aggregator')) return 'Deposit $' + capital + ' of USDC into a ' + name + ' vault on ' + chain + ' and keep the shares.';
if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return 'Provide $' + capital + ' of liquidity to ' + name + '\'s main pool on ' + chain + ' and keep the position open.';
if (c.includes('bridge')) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
if (c.includes('staking') || c.includes('restak')) return 'Stake $' + capital + ' of the chain\'s staking asset through ' + name + ' and keep the receipt.';
if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
if (c.includes('prediction')) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
if (c.includes('basis')) return 'Deposit $' + capital + ' into ' + name + '\'s basis vault on ' + chain + ' and keep the position open.';
if (c.includes('stable')) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
if (c.includes('rwa')) return 'Mint $' + capital + ' of the protocol\'s yield asset on ' + chain + ' and hold it.';
if (c.includes('insurance')) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
if (c.includes('chain')) return 'Use ' + name + '\'s app on ' + chain + ' with $' + capital + ' and keep the position open.';
if (c.includes('payment')) return 'Send or hold $' + capital + ' through ' + name + ' on ' + chain + ' and keep the balance.';
if (c.includes('governance')) return 'Deposit $' + capital + ' into ' + name + '\'s governance vault on ' + chain + ' and keep the shares.';
if (c.includes('launchpad')) return 'Join a ' + name + ' launch on ' + chain + ' with $' + capital + ' and hold the allocation.';
if (c.includes('locker')) return 'Lock $' + capital + ' of assets in ' + name + ' on ' + chain + ' and keep the lock open.';
return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
}
function weeklyFor(row) {
const c = (CAT[row.category] ?? '').toLowerCase();
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
function farmSteps(row) {
const chain = chainOf(row);
const capital = capitalFor(row);
const hold = holdDaysFor(row.age_days);
const gas = gasFor(chain);
const v = verdictFor(row);
return [
{
text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.',
cost: 'under $3 of gas for the first transaction',
time: '5 minutes',
},
{
text: actionFor(row, capital, chain),
cost: '$' + capital + ' of capital and about ' + gas + ' of gas',
time: '15 minutes to set up',
},
{
text: weeklyFor(row),
cost: 'about ' + gas + ' of gas a week',
time: '10 minutes a week',
},
{
text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.',
cost: 'the $' + capital + ' stays in the position',
time: hold + ' days',
},
{
text: 'Before you withdraw, open the protocol\'s own points or rewards page and claim only from the link it publishes.',
cost: 'no fee to check, and never pay to claim',
time: '10 minutes',
},
{
text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.',
cost: 'nothing but the log',
time: '5 minutes',
},
{
text: 'Verdict: ' + v.verdict + ' — all-in about $' + v.gasTotal + ' of gas over ' + hold + ' days on $' + capital + ' of capital. It pays only if the eventual allocation tops $' + v.gasTotal + ' of gas, and no token is promised.',
cost: '$' + v.gasTotal + ' of gas in all',
time: hold + ' days',
},
].map(stepText);
}
function sizeWords(tvl) {
const ranked = ROWS.filter((r) => r.tvl_usd >= tvl).length;
if (ranked === 1) return 'the largest TVL on this board';
if (ranked <= 10) return 'one of the ten largest TVLs on this board';
if (ranked <= 25) return 'one of the 25 largest TVLs on this board';
if (ranked <= 50) return 'in the top 50 TVLs on this board';
return 'in the lower half of the board by TVL';
}
function reasonFor(row) {
const curveImplied = curveImpliedOf(row);
const o = oddsFor(row);
const expected = expectedOf(row);
const iv = intervalOf(row);
const rr = rankRangeOf(row);
const parts = [
row.name + ' has ' + sizeWords(row.tvl_usd) + ' (' + fmtMoney(row.tvl_usd) + '), so the fitted size curve puts its launch value at about ' + fmtMoney(curveImplied) + '.',
'Its launch odds are ' + (o.odds * 100).toFixed(0) + '% — ' + o.peers + ' ' + (CAT[row.category] ?? 'other') + ' protocols in its age band (' + o.cell + ') launched a token, out of the protocols the snapshot records — so the expected value is ' + fmtMoney(expected) + '.',
'The curve\'s held-out error is a factor of ' + Math.pow(10, RESIDUAL).toFixed(1) + '×, so the value could really be anywhere from ' + fmtMoney(iv.low) + ' to ' + fmtMoney(iv.high) + ', and the rank anywhere from ' + rr.low + ' to ' + rr.high + '.',
'Growth, maturity, momentum and risk are documented in the Method tab, but they are not in the price: each one was tested on held-out data and none of them beat the curve alone.',
];
return parts.join(' ');
}
const main = document.getElementById('board');
const $ = (s) => main.querySelector(s);
const WATCHLIST = new Set(DATA.watchlist || []);
const MAX_EXPECTED = Math.max(...ROWS.map((r) => expectedOf(r)));
let state = {
tab: 'board',
q: '',
category: '',
chain: '',
watchlist: false,
sort: 'rank',
dir: 'asc',
detail: '',
};
const SORT_KEYS = {
rank: (r) => r.rank,
name: (r) => r.name.toLowerCase(),
category: (r) => CAT[r.category] ?? '',
tvl_usd: (r) => r.tvl_usd,
change_7d: (r) => finite(r.change_7d) ?? -Infinity,
age_days: (r) => r.age_days === null ? Infinity : r.age_days,
odds: (r) => oddsFor(r).odds,
curve_implied_usd: (r) => curveImpliedOf(r),
expected_value_usd: (r) => expectedOf(r),
};
const SORT_LABELS = {
rank: 'Rank', name: 'Protocol', category: 'Category', tvl_usd: 'TVL',
change_7d: '7d change', age_days: 'Age', odds: 'Launch odds',
curve_implied_usd: 'Curve value', expected_value_usd: 'Expected value',
};
function readState() {
const h = new URLSearchParams(location.hash.slice(1));
return {
tab: ['board', 'live', 'method'].includes(h.get('tab')) ? h.get('tab') : 'board',
q: h.get('q') || '',
category: h.get('category') || '',
chain: h.get('chain') || '',
watchlist: h.get('watchlist') === '1',
sort: SORT_KEYS[h.get('sort')] ? h.get('sort') : 'rank',
dir: h.get('dir') === 'desc' ? 'desc' : 'asc',
detail: h.get('p') || '',
};
}
function writeState(s) {
const h = new URLSearchParams();
if (s.q) h.set('q', s.q);
if (s.category) h.set('category', s.category);
if (s.chain) h.set('chain', s.chain);
if (s.watchlist) h.set('watchlist', '1');
if (s.tab !== 'board') h.set('tab', s.tab);
if (s.sort !== 'rank') h.set('sort', s.sort);
if (s.dir !== 'asc') h.set('dir', s.dir);
if (s.detail) h.set('p', s.detail);
const str = h.toString();
history.replaceState(null, '', str ? '#' + str : location.pathname);
}
function optionList(values) {
return [...new Set(values.filter((v) => v !== undefined && v !== null && v !== ''))].sort().map((v) => '<option value="' + esc(v) + '">' + esc(v) + '</option>').join('');
}
function filteredRows() {
const q = state.q.trim().toLowerCase();
let rows = ROWS;
if (state.watchlist) rows = rows.filter((r) => WATCHLIST.has(r.slug));
if (state.category) rows = rows.filter((r) => CAT[r.category] === state.category);
if (state.chain) rows = rows.filter((r) => r.chains.some((c) => CHAIN[c] === state.chain));
if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q) || (CAT[r.category] || '').toLowerCase().includes(q));
const key = SORT_KEYS[state.sort];
rows = rows.slice().sort((a, b) => {
const va = key(a);
const vb = key(b);
if (va < vb) return state.dir === 'asc' ? -1 : 1;
if (va > vb) return state.dir === 'asc' ? 1 : -1;
return a.rank - b.rank;
});
return rows;
}
function boardHtml() {
const rows = filteredRows();
const th = (key, label, cls) => {
const aria = state.sort === key ? (state.dir === 'asc' ? 'ascending' : 'descending') : 'none';
return '<th class="' + (cls || '') + '" aria-sort="' + aria + '" data-sort="' + key + '">' + label + '</th>';
};
let html = '<div class="tablewrap"><table><thead><tr>'
+ th('rank', 'Rank', 'num') + th('name', 'Protocol') + th('category', 'Category')
+ th('tvl_usd', 'TVL', 'num') + th('change_7d', '7d', 'num') + th('age_days', 'Age')
+ th('odds', 'Launch odds', 'num') + th('expected_value_usd', 'Expected value', 'num')
+ '</tr></thead><tbody>';
if (rows.length === 0) {
html += '<tr><td colspan="8" class="empty">No protocols match these filters.</td></tr>';
}
for (const r of rows) {
const expected = expectedOf(r);
const o = oddsFor(r);
const isWatch = WATCHLIST.has(r.slug);
const chg = finite(r.change_7d);
const chgCls = chg === null ? 'flat' : chg > 0 ? 'up' : chg < 0 ? 'down' : 'flat';
const pct = Math.round((expected / MAX_EXPECTED) * 100);
html += '<tr' + (state.detail === r.slug ? ' class="selected"' : '') + '>'
+ '<td class="num">' + r.rank + '</td>'
+ '<td><button class="linklike" data-detail="' + esc(r.slug) + '">' + esc(r.name) + '</button>'
+ (isWatch ? '<span class="badge watch">Watchlist</span>' : '<span class="badge">Early</span>') + '</td>'
+ '<td>' + esc(CAT[r.category] ?? '—') + '</td>'
+ '<td class="num">' + fmtMoney(r.tvl_usd) + '</td>'
+ '<td class="num ' + chgCls + '">' + fmtPct(chg) + '</td>'
+ '<td>' + fmtAge(r.age_days) + '</td>'
+ '<td class="num">' + (o.odds * 100).toFixed(0) + '%<br><small style="color:var(--muted)">' + o.peers + ' peers</small></td>'
+ '<td class="num implied">' + fmtMoney(expected) + '<div class="implied-bar"><i style="width:' + pct + '%"></i></div></td>'
+ '</tr>';
}
html += '</tbody></table></div>';
return html;
}
function liveHtml() {
const maxMcap = Math.max(...LIVE.map((r) => r.mcap_usd ?? 0));
let html = '<p class="lede">The tokens that already launched, by market cap — the calibration set the size curve was fitted on, and the contrast the board is measured against. These protocols are <b>not</b> ranked: their tokens exist, so there is nothing to farm.</p>'
+ '<div class="tablewrap"><table><thead><tr><th>Protocol</th><th>Category</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">Multiple</th><th class="num">7d</th></tr></thead><tbody>';
for (const r of LIVE) {
const chg = finite(r.change_7d);
const chgCls = chg === null ? 'flat' : chg > 0 ? 'up' : chg < 0 ? 'down' : 'flat';
const pct = Math.round(((r.mcap_usd ?? 0) / maxMcap) * 100);
html += '<tr><td>' + esc(r.name) + '</td>'
+ '<td>' + esc(CAT[r.category] ?? '—') + '</td>'
+ '<td class="num">' + fmtMoney(r.tvl_usd) + '</td>'
+ '<td class="num implied">' + fmtMoney(r.mcap_usd) + '<div class="implied-bar"><i style="width:' + pct + '%"></i></div></td>'
+ '<td class="num">' + fmtMult(r.mcap_usd === null ? null : r.mcap_usd / r.tvl_usd) + '</td>'
+ '<td class="num ' + chgCls + '">' + fmtPct(chg) + '</td></tr>';
}
html += '</tbody></table></div>';
return html;
}
function scatterSvg() {
const W = 720;
const H = 360;
const PAD = 44;
const xs = ROWS.map((r) => Math.log10(Math.max(1, r.tvl_usd)));
const ys = ROWS.map((r) => Math.log10(Math.max(1, expectedOf(r))));
const x0 = Math.floor(Math.min(...xs));
const x1 = Math.ceil(Math.max(...xs));
const y0 = Math.floor(Math.min(...ys));
const y1 = Math.ceil(Math.max(...ys));
const X = (v) => PAD + ((v - x0) / (x1 - x0)) * (W - PAD * 2);
const Y = (v) => H - PAD - ((v - y0) / (y1 - y0)) * (H - PAD * 2);
const label = (e) => (e >= 9 ? '$' + Math.round(10 ** (e - 9)) + 'B' : e >= 6 ? '$' + Math.round(10 ** (e - 6)) + 'M' : '$' + Math.round(10 ** e / 1e3) + 'K');
let svg = '<svg class="scatter" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Scatter of expected value against TVL for the ' + ROWS.length + ' board rows, with the fitted curve">';
for (let g = x0; g <= x1; g++) {
svg += '<line x1="' + X(g) + '" y1="' + (H - PAD) + '" x2="' + X(g) + '" y2="' + PAD + '" stroke="#2a3648" stroke-width="1"/>';
svg += '<text x="' + X(g) + '" y="' + (H - PAD + 18) + '" fill="#8b98a9" font-size="11" text-anchor="middle">' + label(g) + '</text>';
}
for (let g = y0; g <= y1; g++) {
svg += '<line x1="' + PAD + '" y1="' + Y(g) + '" x2="' + (W - PAD) + '" y2="' + Y(g) + '" stroke="#2a3648" stroke-width="1"/>';
svg += '<text x="' + (PAD - 6) + '" y="' + (Y(g) + 4) + '" fill="#8b98a9" font-size="11" text-anchor="end">' + label(g) + '</text>';
}
svg += '<text x="' + (W / 2) + '" y="' + (H - 8) + '" fill="#8b98a9" font-size="12" text-anchor="middle">TVL (USD, log scale)</text>';
svg += '<text x="14" y="' + (H / 2) + '" fill="#8b98a9" font-size="12" text-anchor="middle" transform="rotate(-90 14 ' + (H / 2) + ')">Expected value (USD, log scale)</text>';
let line = '';
for (let i = 0; i <= 40; i++) {
const lx = x0 + ((x1 - x0) * i) / 40;
const ly = CURVE.intercept + CURVE.slope * lx;
line += (i === 0 ? 'M' : 'L') + X(lx).toFixed(1) + ' ' + Y(ly).toFixed(1);
}
svg += '<path d="' + line + '" fill="none" stroke="#f0b429" stroke-width="2"/>';
ROWS.forEach((r, i) => {
svg += '<circle cx="' + X(xs[i]).toFixed(1) + '" cy="' + Y(ys[i]).toFixed(1) + '" r="3" fill="' + (WATCHLIST.has(r.slug) ? '#f0b429' : '#2dd4bf') + '" opacity="0.85"/>';
});
svg += '</svg>';
return svg;
}
function methodHtml() {
const vt = DATA.validation || { splits: [], predictors: [], rows: [] };
const splits = vt.splits;
const predictors = vt.predictors;
const cell = (pred, split) => {
const row = vt.rows.find((r) => predictors[r[1]] === pred && splits[r[0]] === split);
return row ? row[3].toFixed(3) : '—';
};
let table = '<div class="tablewrap"><table><thead><tr><th>Predictor</th>' + splits.map((s) => '<th class="num">' + esc(s) + '</th>').join('') + '</tr></thead><tbody>';
for (const p of predictors) {
table += '<tr><td>' + esc(p) + '</td>' + splits.map((s) => '<td class="num">' + cell(p, s) + '</td>').join('') + '</tr>';
}
table += '</tbody></table></div>';
const a = DATA.audit || {};
const curve = CURVE;
return '<section class="method" aria-label="Method"><h2>Method — how the radar is built</h2>'
+ '<p>Every number on this page comes from the snapshot, a sealed DefiLlama extract dated <b>' + esc(DATA.as_of) + '</b>. The board ranks the ' + DATA.board_size + ' pre-token protocols by <b>expected value</b>: the value the protocol would launch at, times the chance it launches at all.</p>'
+ '<h3>The formula</h3>'
+ '<p><code>expected value = curve value × launch odds</code></p>'
+ '<p>The <b>curve value</b> comes from a fitted size curve over the ' + curve.n + ' live-token protocols with a market cap: <code>log10(market cap) = ' + curve.intercept + ' + ' + curve.slope + ' × log10(TVL)</code> (R² ' + curve.r2 + '). The <b>launch odds</b> come from the protocol\'s (category, age band) cell: how many protocols in that cell launched a token, shrunk toward the category rate and the global rate of ' + (BASE_ODDS * 100).toFixed(1) + '%. A cell with one peer — Risk Curators, for example — barely moves the odds from its category rate.</p>'
+ '<h3>The size curve</h3>'
+ scatterSvg()
+ '<p>Each dot is one board row — amber for the watchlist, teal for the early rows — and the amber line is the fitted curve itself. A row sits on the line when its launch odds are near the average, above it when the odds are high, below it when they are low: the odds are what spread the board out from the curve. The curve\'s held-out error is a factor of ' + Math.pow(10, RESIDUAL).toFixed(1) + '× (median |log10| error ' + RESIDUAL + '), so every value on the board carries an interval and a rank range — the board says how uncertain it is, instead of pretending to be exact.</p>'
+ '<h3>What was tested — and what was dropped</h3>'
+ '<p>Median |log10| error by predictor and split. Lower is better. The curve alone beats the old category median on every split.</p>'
+ table
+ '<p>The old radar priced a protocol by its category median, then multiplied by four terms — growth, maturity, momentum, risk. On leave-one-out over the same 128 protocols the category median scores 0.744 and the old full formula 0.766, worse than the global median at 0.707; the curve scores 0.532. One term at a time on top of the curve — growth, maturity, momentum, risk, growth + maturity — leaves the LOO error at 0.532–0.535, so no single term earns its keep. Adding all four together shaves the median (LOO 0.532 to 0.518) but makes the mean error worse (0.693 to 0.709), the within-2× share worse (0.320 to 0.297) and adds a −0.117 bias, so the combination does not earn its keep either. The terms are documented here, but they are not in the price.</p>'
+ '<h3>The launch odds</h3>'
+ '<p>Leave-one-out Brier score ' + (DATA.odds_brier_loo ?? '—') + ' against the base rate ' + (DATA.odds_brier_loo_base ?? '—') + '; time-split Brier ' + (DATA.odds_brier_time ?? '—') + ' against ' + (DATA.odds_brier_time_base ?? '—') + '. The odds are a fitted rate, not a promise: a protocol with 33% odds is a protocol that would launch one time in three, not a protocol that will launch.</p>'
+ '<h3>The audit — every protocol accounted for</h3>'
+ '<p>' + (a.total ?? 0) + ' protocols in the snapshot: <b>' + (a.ranked ?? 0) + '</b> ranked on this board, <b>' + (a.live_mcap ?? 0) + '</b> live tokens with a market cap, <b>' + (a.token_no_mcap ?? 0) + '</b> tokens with no market cap recorded, <b>' + (a.pretoken_excluded ?? 0) + '</b> pre-token protocols excluded by the watchlist rule (bridges, liquid staking, versioned and wrapped names). ' + (a.ranked ?? 0) + ' + ' + (a.live_mcap ?? 0) + ' + ' + (a.token_no_mcap ?? 0) + ' + ' + (a.pretoken_excluded ?? 0) + ' = ' + (a.total ?? 0) + '.</p>'
+ '<h3>The farm verdicts</h3>'
+ '<p>Every row carries a seven-step farm plan with a costed verdict: <b>FARM</b> when the plan\'s all-in gas is $25 or less, <b>THIN</b> at $75 or less, <b>SKIP</b> above that. The capital is deployed, not spent, so it does not enter the verdict. No step promises a token — the protocol records no token in the snapshot, and an allocation, if any, is the protocol\'s own decision.</p>'
+ '<h3>Rules of the board</h3><ul class="rules">'
+ '<li>Only protocols with no token recorded are ranked. A protocol that already has a token is in the Live tab instead.</li>'
+ '<li>The watchlist (' + DATA.watchlist_size + ' protocols at or above $' + (DATA.floor_usd / 1e6) + 'M TVL) is always covered; the early radar (' + DATA.early_size + ' protocols not on the watchlist) is the rest of the pre-token set.</li>'
+ '<li>Nothing on this page fetches live data. The snapshot never changes between the dev phase and the final, so a radar built on it cannot drift.</li>'
+ '<li>Farm plans use the protocol\'s own record — category, chains, TVL, age — never a hand-written list of names.</li>'
+ '</ul>'
+ '<p class="note">Expected value is a ranking device, not a price. It says what a protocol would be worth if it launched a token at the fitted curve, times the chance it launches one — it is not a promise that it will launch, or at that value.</p></section>';
}
function render() {
const tab = state.tab;
const tabBtn = (id, label) => '<button role="tab" data-tab="' + id + '" aria-selected="' + (tab === id) + '">' + label + '</button>';
const top = ROWS[0];
main.innerHTML = ''
+ '<h1>Token Radar: <span class="amber">pre-token protocols</span>, ranked by expected value</h1>'
+ '<p class="lede">From the sealed snapshot of every protocol DefiLlama tracks, <b>' + ROWS.length + ' pre-token protocols</b> are ranked by expected value: the value the fitted size curve puts on a launch, times the fitted chance the protocol launches at all. <b>' + DATA.watchlist_size + ' are the watchlist</b> — the ' + fmtMoney(DATA.floor_usd) + ' floor and up — and <b class="early">' + DATA.early_size + ' are the early rows</b> not on the watchlist, the launches this radar exists to find. ' + LIVE.length + ' protocols that already trade are set aside as the calibration set.</p>'
+ '<ul class="facts">'
+ '<li>Snapshot <b>' + esc(DATA.as_of) + '</b></li>'
+ '<li>Board <b>' + ROWS.length + ' rows</b></li>'
+ '<li>Watchlist <b>' + DATA.watchlist_size + '</b></li>'
+ '<li>Early <b class="early">' + DATA.early_size + '</b></li>'
+ '<li>Curve <b>R² ' + CURVE.r2 + ' · n=' + CURVE.n + '</b></li>'
+ '<li>Odds Brier <b>' + (DATA.odds_brier_loo ?? '—') + ' vs base ' + (DATA.odds_brier_loo_base ?? '—') + '</b></li>'
+ '<li>Model <b>' + esc(DATA.model_version || 'radar-5') + '</b></li>'
+ '<li>Top expected <b>' + fmtMoney(top ? expectedOf(top) : 0) + '</b></li>'
+ '</ul>'
+ '<div class="tabs" role="tablist" aria-label="Views">' + tabBtn('board', 'Board') + tabBtn('live', 'Live tokens') + tabBtn('method', 'Method') + '</div>'
+ (tab === 'board' ? '<div class="controls">'
+ '<input type="search" id="q" placeholder="Search a protocol…" value="' + esc(state.q) + '" aria-label="Search protocols">'
+ '<select id="category" aria-label="Filter by category"><option value="">All categories</option>' + optionList(ROWS.map((r) => CAT[r.category])) + '</select>'
+ '<select id="chain" aria-label="Filter by chain"><option value="">All chains</option>' + optionList(ROWS.flatMap((r) => r.chains.map((c) => CHAIN[c]))) + '</select>'
+ '<label><input type="checkbox" id="watchlist"' + (state.watchlist ? ' checked' : '') + '> Watchlist only</label>'
+ '<span class="count" id="count"></span></div>' : '')
+ '<div id="view">' + (tab === 'board' ? boardHtml() : tab === 'live' ? liveHtml() : methodHtml()) + '</div>'
+ '<p class="note">Expected value is a ranking device, not a price, and no airdrop is guaranteed. A protocol that records no token in the snapshot may still have one under another name; check the protocol\'s own page before you farm it. This page renders with no network.</p>'
+ '<footer>Built from a sealed DefiLlama snapshot of ' + esc(DATA.as_of) + '. The snapshot\'s source and the program that scored it are in the repository beside this page.</footer>';
main.setAttribute('aria-busy', 'false');
if (tab === 'board') {
const cat = $('#category');
const ch = $('#chain');
if (cat) cat.value = state.category;
if (ch) ch.value = state.chain;
const count = $('#count');
if (count) count.textContent = 'Showing ' + filteredRows().length + ' of ' + ROWS.length + ' rows · sorted by ' + (SORT_LABELS[state.sort] || state.sort) + ' ' + (state.dir === 'asc' ? '↑' : '↓');
$('#q').addEventListener('input', (e) => { state.q = e.target.value; writeState(state); render(); const q = $('#q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); });
cat.addEventListener('change', (e) => { state.category = e.target.value; writeState(state); render(); });
ch.addEventListener('change', (e) => { state.chain = e.target.value; writeState(state); render(); });
$('#watchlist').addEventListener('change', (e) => { state.watchlist = e.target.checked; writeState(state); render(); });
main.querySelectorAll('[data-sort]').forEach((th) => th.addEventListener('click', () => {
const key = th.getAttribute('data-sort');
if (state.sort === key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
else { state.sort = key; state.dir = key === 'name' || key === 'category' ? 'asc' : 'desc'; }
writeState(state);
render();
}));
}
main.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { state.tab = b.getAttribute('data-tab'); state.detail = ''; writeState(state); render(); }));
main.querySelectorAll('[data-detail]').forEach((b) => b.addEventListener('click', () => openDetail(b.getAttribute('data-detail'))));
if (state.detail && BY_SLUG.has(state.detail)) openDetail(state.detail, true);
}
let dialog = null;
function openDetail(slug, fromHash) {
const row = BY_SLUG.get(slug);
if (!row) return;
state.detail = slug;
writeState(state);
const recomputed = expectedOf(row);
const matches = recomputed === row.implied_value_usd;
const o = oddsFor(row);
const iv = intervalOf(row);
const rr = rankRangeOf(row);
const curveImplied = curveImpliedOf(row);
const isWatch = WATCHLIST.has(row.slug);
const v = verdictFor(row);
const steps = farmSteps(row);
if (!dialog) {
dialog = document.createElement('dialog');
dialog.setAttribute('aria-label', 'Protocol detail');
document.body.appendChild(dialog);
dialog.addEventListener('close', () => { state.detail = ''; writeState(state); render(); });
}
dialog.innerHTML = ''
+ '<div class="dlg-head"><h2>' + esc(row.name) + (isWatch ? ' <span class="badge watch">Watchlist</span>' : ' <span class="badge">Early</span>') + '</h2><button class="close" data-close>Close</button></div>'
+ '<div class="dlg-body">'
+ '<p style="margin:4px 0 0;color:var(--muted)">' + esc(CAT[row.category] ?? 'No category') + ' · ' + row.chains.map((c) => esc(CHAIN[c])).join(', ') + ' · rank #' + row.rank + (isWatch ? ' · watchlist' : ' · early') + '</p>'
+ '<p class="why">' + esc(reasonFor(row)) + '</p>'
+ '<dl class="kv">'
+ '<div><dt>Expected value</dt><dd>' + fmtMoneyFull(recomputed) + '<small>rank #' + row.rank + ' · could be #' + rr.low + '–#' + rr.high + ' · ' + (matches ? 'the page recomputes this from the same figures — it matches board.json.' : 'the page recomputes this — it does not match board.json.') + '</small></dd></div>'
+ '<div><dt>Curve value</dt><dd>' + fmtMoneyFull(curveImplied) + '<small>log10(mcap) = ' + CURVE.intercept + ' + ' + CURVE.slope + ' × log10(TVL)</small></dd></div>'
+ '<div><dt>Launch odds</dt><dd>' + (o.odds * 100).toFixed(0) + '%<small>' + o.peers + ' peers · ' + esc(o.cell) + '</small></dd></div>'
+ '<div><dt>Value interval</dt><dd>' + fmtMoney(iv.low) + ' – ' + fmtMoney(iv.high) + '<small>curve held-out error ×' + Math.pow(10, RESIDUAL).toFixed(1) + '</small></dd></div>'
+ '<div><dt>TVL</dt><dd>' + fmtMoneyFull(row.tvl_usd) + '<small>7d ' + fmtPct(finite(row.change_7d)) + '</small></dd></div>'
+ '<div><dt>Age</dt><dd>' + fmtAge(row.age_days) + '<small>' + esc(CAT[row.category] ?? '—') + '</small></dd></div>'
+ '<div><dt>Chains</dt><dd>' + esc(row.chains.map((c) => CHAIN[c]).join(', ') || '—') + '<small>farm verdict: ' + v.verdict + '</small></dd></div>'
+ '</dl>'
+ '<h3>Farm plan — ' + v.verdict + '</h3>'
+ '<ol class="steps">' + steps.map((s) => {
const mm = s.match(/^(.*?) Cost: (.*?)\. Time: (.*?)\.$/);
if (!mm) return '<li>' + esc(s) + '</li>';
return '<li>' + esc(mm[1]) + '<small>Cost: ' + esc(mm[2]) + ' · Time: ' + esc(mm[3]) + '</small></li>';
}).join('') + '</ol>'
+ '<p class="warn">No token is promised. This protocol records no token in the snapshot; an allocation, if any, is the protocol\'s own decision. Never pay to claim, and never connect a wallet from a link you did not open yourself.</p>'
+ '</div>';
dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
if (!dialog.open) dialog.showModal();
}
window.addEventListener('hashchange', () => {
state = readState();
if (dialog && dialog.open && !state.detail) dialog.close();
render();
});
state = readState();
render();
window.__radarTest = { rows: ROWS, board: DATA.rows, liveRows: LIVE, expectedOf, farmSteps, stepText, DATA };
