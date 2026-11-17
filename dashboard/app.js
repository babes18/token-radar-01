// Token Radar's page: no network, no framework. It reads window.RADAR (dashboard/data.js) and
// renders the ranked board, a per-protocol detail view with the model's own inputs and a farm plan,
// a launching-soon watchlist of bonding-curve tokens near graduation, a live-token reference view,
// and a Method tab that states the model and shows the multiples it calibrated. The page recomputes
// each row's implied value from the same figures board.json carries, so the page and the board agree.
//
// Hash state (so a view can be linked): #q=search, #category=, #chain=, #watchlist=1, #tab=board|
// launching|live|method, #sort=, #dir=asc|desc, #p=<slug> opens the detail view.

'use strict';

/* global window, document, URLSearchParams */

const DATA = window.RADAR;
if (!DATA || !Array.isArray(DATA.rows)) throw new Error('token radar: no board data');
const MODEL = DATA.model || {};
const MULT_MIN = MODEL.multiple_min ?? 0.05;
const MULT_MAX = MODEL.multiple_max ?? 1.5;
const GROWTH_WEIGHT = MODEL.growth_weight ?? 0.5;
const GROWTH_FLOOR = MODEL.growth_floor ?? -60;
const GROWTH_CAP = MODEL.growth_cap ?? 120;
const MATURITY_FLOOR = MODEL.maturity_floor ?? 0.6;
const MATURITY_RANGE = MODEL.maturity_range ?? 0.4;
const MATURITY_DAYS = MODEL.maturity_days ?? 1095;
const UNKNOWN_AGE = MODEL.unknown_age_days ?? 365;
const MOMENTUM_WEIGHT = MODEL.momentum_weight ?? 0.25;
const MOMENTUM_FLOOR = MODEL.momentum_floor ?? -30;
const MOMENTUM_CAP = MODEL.momentum_cap ?? 60;
const RISK_YOUNG_DAYS = MODEL.risk_young_days ?? 90;
const RISK_VOL_MID = MODEL.risk_vol_mid ?? 15;
const RISK_VOL_HIGH = MODEL.risk_vol_high ?? 30;

/** The watchlist's slugs, for the watchlist-only filter and the badges. */
const WATCHLIST = new Set(DATA.watchlist || []);
/** The chain names, once: rows and live rows carry indices into this table. */
const CHAINS = DATA.chains || [];
/** The category names, once: rows, live rows and multiples carry indices into this table. */
const CATEGORIES = DATA.categories || [];
/** The multiples the program calibrated from the snapshot, by category. Compact arrays: [category,
 *  n, median, multiple, momentum, momentum_n], with category an index into CATEGORIES. The source
 *  wording is derived from the two counts: n >= 3 names the median of n token-bearing protocols,
 *  else the global median; momentum_n >= 3 names the 7d median of momentum_n, else the global one. */
const MULTIPLES = new Map((DATA.multiples || []).map((m) => [CATEGORIES[m[0]] ?? 'Other', {
  category: CATEGORIES[m[0]] ?? 'Other',
  n: m[1],
  median: m[2],
  multiple: m[3],
  source: m[1] >= (MODEL.multiple_min_n ?? 3) ? `median of ${m[1]} token-bearing protocols` : `only ${m[1]}: global median`,
  momentum: m[4],
  momentum_n: m[5],
  momentum_source: m[5] >= (MODEL.multiple_min_n ?? 3) ? `7d median of ${m[5]}` : 'global 7d median',
}]));

/** A board row as named fields. Rows are arrays: [rank, slug, name, category, chains, tvl_usd, change_7d,
 *  age_days, implied_value_usd], with category and chains as indices into the categories and chains
 *  tables. The three multipliers are recomputed below from the same figures, never stored twice. */
function toRow(a) {
  return {
    rank: a[0],
    slug: a[1],
    name: a[2],
    category: a[3] >= 0 ? (CATEGORIES[a[3]] ?? null) : null,
    chains: a[4].map((i) => CHAINS[i] ?? ''),
    tvl_usd: a[5],
    change_7d: a[6],
    age_days: a[7],
    implied_value_usd: a[8],
  };
}
const ROWS = DATA.rows.map(toRow);
const BY_SLUG = new Map(ROWS.map((r) => [r.slug, r]));
/** The live-token reference set. Compact arrays: [slug, name, category, chains, tvl_usd, mcap_usd, change_7d], with category and chains as indices. */
const LIVE = (DATA.live || []).map((a) => ({ slug: a[0], name: a[1], category: a[2] >= 0 ? (CATEGORIES[a[2]] ?? null) : null, chains: a[3].map((i) => CHAINS[i] ?? ''), tvl_usd: a[4], mcap_usd: a[5], change_7d: a[6] }));
/** The Launching-soon watchlist: pump.fun bonding-curve tokens closest to graduation, frozen at
 *  build time. [name, symbol, mcap, vol24, buys24, sells24, holders, created_ms]. */
const GRAD = (DATA.graduating || []).map((a) => ({ name: a[0], symbol: a[1], mcap: a[2], vol24: a[3], buys24: a[4], sells24: a[5], holders: a[6], created: a[7] }));
const GRAD_MCAP = DATA.graduation_mcap_usd || 30000;
const MAX_IMPLIED = ROWS.length > 0 ? ROWS[0].implied_value_usd : 1;

const $ = (s) => document.querySelector(s);
const main = $('#board');

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fmtUsd(n) {
  if (n === null || n === undefined) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(abs >= 1e11 ? 0 : 2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(abs >= 1e8 ? 0 : 1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}
function fmtPct(n) {
  if (n === null || n === undefined) return '—';
  const v = Math.round(n * 10) / 10;
  return `${v > 0 ? '+' : ''}${v}%`;
}
function pctClass(n) {
  if (n === null || n === undefined || n === 0) return 'flat';
  return n > 0 ? 'up' : 'down';
}
function fmtAge(days) {
  if (days === null || days === undefined) return 'unknown';
  if (days < 30) return `${days}d`;
  if (days < 365) return `${(days / 30).toFixed(1)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}
function fmtMult(n) {
  return `${Math.round(n * 100) / 100}×`;
}
function ordinal(n) {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}

/** The multiple one protocol's category gets: its own category's, or the global median. */
function multipleFor(category) {
  const row = MULTIPLES.get(category ?? 'Other');
  if (row) return { multiple: row.multiple, source: row.source };
  return { multiple: DATA.global_multiple, source: 'no token-bearing protocol in this category: global median' };
}

/** The momentum one protocol's category gets: its own category's, or the global momentum. */
function momentumFor(category) {
  const row = MULTIPLES.get(category ?? 'Other');
  if (row) return { momentum: row.momentum, source: row.momentum_source };
  return { momentum: DATA.global_momentum, source: 'no token-bearing protocol in this category: global momentum' };
}

/** Four decimals, as the program rounds each calibrated signal before it enters the product. */
function round4(n) {
  return Math.round(n * 1e4) / 1e4;
}

/** The row's growth multiplier, from its own 7-day change, full precision for the recompute. */
function growthMultOf(row) {
  const growth = Math.min(GROWTH_CAP, Math.max(GROWTH_FLOOR, row.change_7d ?? 0));
  return 1 + (growth / 100) * GROWTH_WEIGHT;
}

/** The row's maturity multiplier, from its age, full precision for the recompute. */
function maturityMultOf(row) {
  const age = row.age_days ?? UNKNOWN_AGE;
  return MATURITY_FLOOR + (Math.min(Math.max(age, 0), MATURITY_DAYS) / MATURITY_DAYS) * MATURITY_RANGE;
}

/** The row's risk multiplier, recomputed on the page from the same three figures the program
 *  uses: age, 7-day TVL swing and chain count. Young, volatile or single-chain rows are worth
 *  less than the same TVL in an old, steady, multi-chain protocol. */
function riskOf(row) {
  let discount = 0;
  const flags = [];
  if (row.age_days === null || row.age_days === undefined) { discount += 0.02; flags.push('no listing date'); }
  else if (row.age_days < RISK_YOUNG_DAYS) { discount += 0.05; flags.push('under 90 days old'); }
  else if (row.age_days < UNKNOWN_AGE) { discount += 0.02; flags.push('under a year old'); }
  if (row.change_7d === null || row.change_7d === undefined) { discount += 0.02; flags.push('no 7-day change reported'); }
  else {
    const swing = Math.abs(row.change_7d);
    if (swing > RISK_VOL_HIGH) { discount += 0.05; flags.push(`TVL swung ${Math.round(swing)}% in 7 days`); }
    else if (swing > RISK_VOL_MID) { discount += 0.02; flags.push(`TVL moved ${Math.round(swing)}% in 7 days`); }
  }
  if (row.chains.length <= 1) { discount += 0.05; flags.push(row.chains.length === 0 ? 'no chain listed' : 'single chain'); }
  else if (row.chains.length === 2) { discount += 0.02; flags.push('two chains'); }
  discount = Math.min(discount, 0.15);
  return { multiplier: round4(1 - discount), discount: round4(discount), flags };
}

/** The row's implied value, recomputed on the page from the same figures board.json carries. */
function impliedOf(row) {
  const growthMult = growthMultOf(row);
  const maturityMult = maturityMultOf(row);
  const { multiple } = multipleFor(row.category);
  const { momentum } = momentumFor(row.category);
  const { multiplier: riskMult } = riskOf(row);
  return Math.max(1, Math.round(row.tvl_usd * multiple * growthMult * maturityMult * momentum * riskMult));
}

/** Why this row ranks where it does, in words from its own figures: the size of its TVL against the
 *  board, its category's multiple against the global median, its own 7-day change, its age, and its
 *  category's momentum. Every clause is a reading of a number the row carries, never a slogan. */
function reasonFor(row) {
  const tvlRank = ROWS.filter((r) => r.tvl_usd > row.tvl_usd).length + 1;
  const { multiple, source } = multipleFor(row.category);
  const { momentum } = momentumFor(row.category);
  const parts = [];
  parts.push(`#${row.rank} on ${fmtUsd(row.tvl_usd)} of TVL — the ${tvlRank === 1 ? 'largest' : `${ordinal(tvlRank)}-largest`} on the board`);
  if (source.includes('global median')) parts.push(`its ${escapeHtml(row.category || 'uncategorised')} category is too thin to price on its own, so it takes the global median multiple of ${fmtMult(DATA.global_multiple ?? 0.21)}`);
  else if (multiple > (DATA.global_multiple ?? 0.21)) parts.push(`its category prices at ${fmtMult(multiple)}, above the global median of ${fmtMult(DATA.global_multiple ?? 0.21)}`);
  else if (multiple < (DATA.global_multiple ?? 0.21)) parts.push(`its category prices at ${fmtMult(multiple)}, below the global median of ${fmtMult(DATA.global_multiple ?? 0.21)}`);
  else parts.push(`its category prices at the global median of ${fmtMult(DATA.global_multiple ?? 0.21)}`);
  if (row.change_7d === null || row.change_7d === undefined) parts.push('with no 7-day change reported, so growth counts as flat');
  else if (row.change_7d > 0) parts.push(`with TVL up ${Math.round(row.change_7d * 10) / 10}% in 7 days, which lifts it`);
  else if (row.change_7d < 0) parts.push(`with TVL down ${Math.round(-row.change_7d * 10) / 10}% in 7 days, which trims it`);
  else parts.push('with TVL flat over 7 days');
  if (row.age_days === null || row.age_days === undefined) parts.push('and no listing date, so it is counted as a year old');
  else if (row.age_days < 180) parts.push(`and only ${fmtAge(row.age_days)} old, so maturity still discounts it`);
  else parts.push(`and ${fmtAge(row.age_days)} old, so maturity barely discounts it`);
  if (momentum > 1.005) parts.push(`its category's traded peers are up this week, a ${fmtMult(momentum)} lift`);
  else if (momentum < 0.995) parts.push(`its category's traded peers are down this week, a ${fmtMult(momentum)} drag`);
  else parts.push('its category\'s traded peers are flat this week, momentum 1×');
  const risk = riskOf(row);
  if (risk.discount > 0) parts.push(`and a risk discount to ${fmtMult(risk.multiplier)} (${risk.flags.join(', ')})`);
  else parts.push('and no risk discount: old, steady and multi-chain');
  return `Why #${row.rank}: ${parts.join('; ')}.`;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(row) {
  if (row.tvl_usd >= 5e9) return 250;
  if (row.tvl_usd >= 1e9) return 150;
  if (row.tvl_usd >= 1e8) return 100;
  return 50;
}
function holdDaysFor(age) {
  if (age === null || age === undefined) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}
function gasFor(chain) {
  if (chain === 'Ethereum') return '$3–$8';
  if (chain === 'Solana') return '$0.01';
  if (chain === 'Tron') return '$1–$2';
  if (chain === 'Bitcoin') return 'the network fee';
  const cheap = new Set(['Base', 'Arbitrum', 'Optimism', 'Ink', 'Blast', 'Mode', 'Zora', 'Unichain', 'World Chain', 'Linea', 'Scroll', 'ZkSync', 'Polygon', 'Avalanche', 'Binance', 'Berachain', 'Sui', 'Aptos', 'Monad', 'Pharos', 'Plume Mainnet', 'Robinhood Chain', 'Stellar', 'Flare', 'Bittensor', 'Mantle', 'Celo', 'Gnosis', 'Fantom', 'Sei', 'Injective', 'Movement', 'MegaETH']);
  if (cheap.has(chain)) return '$0.10–$1';
  return 'under $3';
}
function actionFor(row, capital, chain) {
  const c = (row.category || '').toLowerCase();
  const name = row.name;
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
function weeklyFor(row) {
  const c = (row.category || '').toLowerCase();
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
/** A protocol's farm plan, from its own record: the same six steps the program writes to board.json. */
function farmSteps(row) {
  const chain = row.chains.length > 0 ? row.chains[0] : 'its main chain';
  const capital = capitalFor(row);
  const hold = holdDaysFor(row.age_days);
  const gas = gasFor(chain);
  const steps = [
    { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
    { text: actionFor(row, capital, chain), cost: `$${capital} of capital and about ${gas} of gas`, time: '15 minutes to set up' },
    { text: weeklyFor(row), cost: `about ${gas} of gas a week`, time: '10 minutes a week' },
    { text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`, cost: `the $${capital} stays in the position`, time: `${hold} days` },
    { text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`, cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
    { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' },
  ];
  return steps.map((s) => {
    let out = `${s.text} Cost: ${s.cost}. Time: ${s.time}.`;
    if (out.length > 600) out = `${out.slice(0, 596)}...`;
    if (out.length < 20) out = `${out} Hold the position and check the protocol's own page.`;
    return out;
  });
}

/** The page's state, read from and written back to the hash. */
function readState() {
  const p = new URLSearchParams(window.location.hash.slice(1));
  return {
    q: p.get('q') || '',
    category: p.get('category') || '',
    chain: p.get('chain') || '',
    watchlist: p.get('watchlist') === '1',
    tab: p.get('tab') || 'board',
    sort: p.get('sort') || 'rank',
    dir: p.get('dir') || 'asc',
    detail: p.get('p') || '',
  };
}
function writeState(state) {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.category) p.set('category', state.category);
  if (state.chain) p.set('chain', state.chain);
  if (state.watchlist) p.set('watchlist', '1');
  if (state.tab !== 'board') p.set('tab', state.tab);
  if (state.sort !== 'rank') p.set('sort', state.sort);
  if (state.dir !== 'asc') p.set('dir', state.dir);
  if (state.detail) p.set('p', state.detail);
  const next = `#${p.toString()}`;
  if (window.location.hash !== next) window.history.replaceState(null, '', next);
}
let state = readState();

function filteredRows() {
  const q = state.q.trim().toLowerCase();
  return ROWS.filter((r) => {
    if (state.watchlist && !WATCHLIST.has(r.slug)) return false;
    if (state.category && r.category !== state.category) return false;
    if (state.chain && !r.chains.includes(state.chain)) return false;
    if (q && !r.name.toLowerCase().includes(q) && !r.slug.toLowerCase().includes(q)) return false;
    return true;
  });
}
function sortedRows(rows) {
  const key = state.sort;
  const dir = state.dir === 'desc' ? -1 : 1;
  const val = (r) => {
    if (key === 'name') return r.name.toLowerCase();
    if (key === 'category') return (r.category || '').toLowerCase();
    if (key === 'category_multiple') return multipleFor(r.category).multiple;
    if (key === 'risk') return riskOf(r).multiplier;
    return r[key];
  };
  return [...rows].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    if (x === null || x === undefined) return 1;
    if (y === null || y === undefined) return -1;
    if (typeof x === 'string') return dir * (x < y ? -1 : x > y ? 1 : 0);
    return dir * (x - y);
  });
}

function optionList(values) {
  const counts = new Map();
  for (const v of values) if (v) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([v, n]) => `<option value="${escapeHtml(v)}">${escapeHtml(v)} (${n})</option>`).join('');
}

function boardHtml() {
  const rows = sortedRows(filteredRows());
  const sortAttr = (key) => state.sort === key ? ` aria-sort="${state.dir === 'asc' ? 'ascending' : 'descending'}"` : '';
  const th = (key, label, cls) => `<th class="${cls || ''}" data-sort="${key}"${sortAttr(key)}>${label}</th>`;
  const body = rows.map((r) => {
    const pct = fmtPct(r.change_7d);
    const pctCls = pctClass(r.change_7d);
    const risk = riskOf(r);
    const watch = WATCHLIST.has(r.slug) ? '<span class="badge watch" title="On the watchlist">WATCHLIST</span>' : '';
    const early = !WATCHLIST.has(r.slug) ? '<span class="badge" title="Below the watchlist floor: the early radar">EARLY</span>' : '';
    const bar = Math.max(2, Math.round((r.implied_value_usd / MAX_IMPLIED) * 100));
    return `<tr${state.detail === r.slug ? ' class="selected"' : ''}>
      <td class="num">${r.rank}</td>
      <td><button class="linklike" data-detail="${escapeHtml(r.slug)}">${escapeHtml(r.name)}</button>${watch}${early}</td>
      <td>${escapeHtml(r.category || '—')}</td>
      <td>${r.chains.slice(0, 2).map((c) => `<span class="pill">${escapeHtml(c)}</span>`).join(' ')}${r.chains.length > 2 ? ` <span class="pill">+${r.chains.length - 2}</span>` : ''}</td>
      <td class="num">${fmtUsd(r.tvl_usd)}</td>
      <td class="num ${pctCls}">${pct}</td>
      <td class="num">${fmtAge(r.age_days)}</td>
      <td class="num">${fmtMult(multipleFor(r.category).multiple)}</td>
      <td class="num" title="${risk.flags.length ? escapeHtml(risk.flags.join('; ')) : 'old, steady and multi-chain'}">${fmtMult(risk.multiplier)}</td>
      <td class="num implied">${fmtUsd(r.implied_value_usd)}<div class="implied-bar"><i style="width:${bar}%"></i></div></td>
    </tr>`;
  }).join('');
  return `<div class="tablewrap"><table>
    <thead><tr>${th('rank', 'Rank', 'num')}${th('name', 'Protocol')}${th('category', 'Category')}<th>Chains</th>${th('tvl_usd', 'TVL', 'num')}${th('change_7d', '7d', 'num')}${th('age_days', 'Age', 'num')}${th('category_multiple', 'Multiple', 'num')}${th('risk', 'Risk', 'num')}${th('implied_value_usd', 'Implied value', 'num')}</tr></thead>
    <tbody>${body || '<tr><td colspan="10" class="empty">No protocol matches this filter.</td></tr>'}</tbody>
  </table></div>`;
}

function liveHtml() {
  const rows = [...LIVE].sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0));
  const body = rows.map((r) => `<tr>
    <td>${escapeHtml(r.name)}</td>
    <td>${escapeHtml(r.category || '—')}</td>
    <td>${r.chains.slice(0, 2).map((c) => `<span class="pill">${escapeHtml(c)}</span>`).join(' ')}</td>
    <td class="num">${fmtUsd(r.tvl_usd)}</td>
    <td class="num">${fmtUsd(r.mcap_usd)}</td>
    <td class="num ${pctClass(r.change_7d)}">${fmtPct(r.change_7d)}</td>
  </tr>`).join('');
  return `<p class="lede">These protocols already trade, so the board shows the market's own value, not a model's. They are the calibration set: their mcap / TVL ratios set the multiples the pre-token board is ranked with.</p>
  <div class="tablewrap"><table>
    <thead><tr><th>Protocol</th><th>Category</th><th>Chains</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">7d</th></tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

/** Bonding-curve tokens on pump.fun, closest to graduation first. The curve completes when ~85 SOL
 *  has entered it — about ${fmtUsd(GRAD_MCAP)} of market cap at SOL $72 — so the bar is an estimate:
 *  the trigger is SOL, not dollars. Ages are as of the fetch date, not today: this tab is a frozen
 *  fetch, dated in its first line. */
function launchingHtml() {
  const asOfMs = Date.parse(`${DATA.extras_as_of || '2026-11-17'}T00:00:00Z`);
  const rows = [...GRAD].sort((a, b) => b.mcap - a.mcap);
  const body = rows.map((g) => {
    const prog = Math.min(99, Math.round((g.mcap / GRAD_MCAP) * 100));
    const trades = g.buys24 + g.sells24;
    const buyShare = trades > 0 ? Math.round((g.buys24 / trades) * 100) : null;
    const age = Math.max(0, Math.floor((asOfMs - g.created) / 86400000));
    return `<tr>
      <td><b>${escapeHtml(g.name)}</b> <span class="pill">${escapeHtml(g.symbol)}</span></td>
      <td class="num">${fmtUsd(g.mcap)}</td>
      <td class="num"><div class="implied-bar"><i style="width:${prog}%"></i></div><small>${prog}%</small></td>
      <td class="num">${fmtUsd(g.vol24)}</td>
      <td class="num">${g.buys24} / ${g.sells24}${buyShare === null ? '' : ` <small>(${buyShare}% buys)</small>`}</td>
      <td class="num">${g.holders === null ? '—' : g.holders}</td>
      <td class="num">${age}d</td>
    </tr>`;
  }).join('');
  return `<p class="lede">Bonding-curve tokens on pump.fun, closest to graduation first. A curve completes when ~85 SOL has entered it — about ${fmtUsd(GRAD_MCAP)} of market cap at SOL $72 — so the bar is an estimate: the trigger is SOL, not dollars. Fewer than 2% of pump.fun tokens ever graduate; a high market cap with dead volume is a stalled curve, not a launch. GoPlus reports no live mint or freeze authority on any of these twelve. Data as of <b>${escapeHtml(DATA.extras_as_of || '')}</b>, from DexScreener pairs and GoPlus token security.</p>
  <div class="tablewrap"><table>
    <thead><tr><th>Token</th><th class="num">Market cap</th><th class="num">To graduation</th><th class="num">Volume 24h</th><th class="num">Buys / sells 24h</th><th class="num">Holders</th><th class="num">Age</th></tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

function methodHtml() {
  const multRows = [...MULTIPLES.values()].sort((a, b) => b.multiple - a.multiple || (a.category < b.category ? -1 : 1));
  const body = multRows.map((m) => `<tr>
    <td>${escapeHtml(m.category)}</td><td class="num">${m.n}</td><td class="num">${fmtMult(m.median)}</td><td class="num">${fmtMult(m.multiple)}</td><td class="num">${fmtMult(m.momentum)} <small>(${escapeHtml(m.momentum_source)})</small></td><td>${escapeHtml(m.source)}</td>
  </tr>`).join('');
  return `<section class="method" aria-label="Method">
    <h2>How the ranking is made</h2>
    <p>Every row is scored by the same formula, from the snapshot's own figures. The multiple and the momentum are calibrated from the snapshot itself: the median mcap / TVL and the median 7-day change of the token-bearing protocols in the row's own category. No protocol's name is special-cased, and no figure comes from outside the snapshot.</p>
    <p><code>implied = TVL × multiple × growth × maturity × momentum × risk</code></p>
    <h3>The multiple and the momentum</h3>
    <p>A category keeps its own medians only with at least ${MODEL.multiple_min_n ?? 3} token-bearing protocols behind it; anything thinner falls back to the global median of ${fmtMult(DATA.global_multiple ?? 0.21)} and the global momentum of ${fmtMult(DATA.global_momentum ?? 0.98)}. The multiple is clamped to ${fmtMult(MULT_MIN)}–${fmtMult(MULT_MAX)}.</p>
    <div class="tablewrap"><table>
      <thead><tr><th>Category</th><th class="num">Protocols</th><th class="num">Median mcap / TVL</th><th class="num">Multiple used</th><th class="num">Momentum</th><th>Source</th></tr></thead>
      <tbody>${body}</tbody>
    </table></div>
    <h3>TVL against implied value</h3>
    <p>Each dot is one board row: amber for the watchlist, teal for the early rows. The dashed line is implied = TVL × the global median multiple — where the multiple alone sets the value. Rows off the line are moved by their own growth, their age, their category's momentum, or their risk discount.</p>
    ${scatterSvg()}
    <h3>The other four terms</h3>
    <ul class="rules">
      <li><b>Growth:</b> the 7-day change, clamped to ${GROWTH_FLOOR}%–${GROWTH_CAP}%, times a weight of ${GROWTH_WEIGHT}: <code>1 + growth / 100 × ${GROWTH_WEIGHT}</code>. A protocol down 60% still keeps half its multiple; one up 120% gains at most 60%.</li>
      <li><b>Maturity:</b> <code>${MATURITY_FLOOR} + min(age, ${MATURITY_DAYS} days) / ${MATURITY_DAYS} × ${MATURITY_RANGE}</code>. A protocol listed for three years scores 1.00; a new listing scores 0.60. A protocol with no listing date is given ${UNKNOWN_AGE} days.</li>
      <li><b>Momentum:</b> the median 7-day TVL change of the category's token-bearing protocols, clamped to ${MOMENTUM_FLOOR}%–${MOMENTUM_CAP}%, times a weight of ${MOMENTUM_WEIGHT}: <code>1 + median7d / 100 × ${MOMENTUM_WEIGHT}</code>. A category whose traded protocols are down 30% or more scores 0.93×; one up 60% scores 1.15×.</li>
      <li><b>Risk:</b> a discount of at most 0.15, from the row's own record: under ${RISK_YOUNG_DAYS} days old costs 0.05, a 7-day TVL swing past ${RISK_VOL_HIGH}% costs 0.05, one chain costs 0.05; smaller versions of each cost 0.02. The multiplier stays in 0.85–1.00, so a young, volatile, single-chain protocol never outranks the same TVL in an old, steady, multi-chain one.</li>
      <li><b>What counts as pre-token:</b> no market cap, no CoinGecko id and no symbol in the snapshot. The board keeps out wrapped, staked and bridged products of a token that trades, and names ending in a version marker — they are pools of another protocol, not a launch.</li>
      <li><b>Coverage:</b> the board holds all ${DATA.watchlist_size} watchlist slugs, plus ${DATA.early_size} early rows below the watchlist floor. The page recomputes each row's implied value from the same figures; the detail view shows the check.</li>
    </ul>
    <p class="note">Implied value is a ranking device, not a price. It says what a protocol would be worth if it launched a token at its category's median ratio — it is not a promise that it will launch one, or at that value.</p>
  </section>`;
}

/** A log-log scatter of TVL against implied value, drawn as inline SVG from the board rows: no
 *  image, no network, and the same data the table above states. */
function scatterSvg() {
  const W = 720, H = 360, L = 58, R = 14, T = 12, B = 36;
  const xs = ROWS.map((r) => Math.log10(Math.max(1, r.tvl_usd)));
  const ys = ROWS.map((r) => Math.log10(Math.max(1, r.implied_value_usd)));
  const x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs));
  const y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
  const X = (v) => L + ((v - x0) / (x1 - x0)) * (W - L - R);
  const Y = (v) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const label = (e) => (e >= 9 ? `$${Math.round(10 ** (e - 9))}B` : e >= 6 ? `$${Math.round(10 ** (e - 6))}M` : `$${Math.round(10 ** e / 1e3)}K`);
  let grid = '';
  for (let e = x0; e <= x1; e++) grid += `<line x1="${X(e).toFixed(1)}" y1="${T}" x2="${X(e).toFixed(1)}" y2="${H - B}" stroke="#2a3648"/><text x="${X(e).toFixed(1)}" y="${H - B + 16}" fill="#8b98a9" font-size="10" text-anchor="middle">${label(e)}</text>`;
  for (let e = y0; e <= y1; e++) grid += `<line x1="${L}" y1="${Y(e).toFixed(1)}" x2="${W - R}" y2="${Y(e).toFixed(1)}" stroke="#2a3648"/><text x="${L - 6}" y="${(Y(e) + 3).toFixed(1)}" fill="#8b98a9" font-size="10" text-anchor="end">${label(e)}</text>`;
  const g = Math.log10(DATA.global_multiple || 0.21);
  let ax = x0, ay = x0 + g, bx = x1, by = x1 + g;
  if (ay < y0) { ax = y0 - g; ay = y0; }
  if (ay > y1) { ax = y1 - g; ay = y1; }
  if (by < y0) { bx = y0 - g; by = y0; }
  if (by > y1) { bx = y1 - g; by = y1; }
  const ref = ax < bx ? `<line x1="${X(ax).toFixed(1)}" y1="${Y(ay).toFixed(1)}" x2="${X(bx).toFixed(1)}" y2="${Y(by).toFixed(1)}" stroke="#f0b429" stroke-dasharray="5 4"/>` : '';
  const dots = ROWS.map((r, i) => `<circle cx="${X(xs[i]).toFixed(1)}" cy="${Y(ys[i]).toFixed(1)}" r="3" fill="${WATCHLIST.has(r.slug) ? '#f0b429' : '#2dd4bf'}" opacity="0.85"/>`).join('');
  return `<svg class="scatter" viewBox="0 0 ${W} ${H}" role="img" aria-label="Scatter chart of TVL against implied value, log scales">
    ${grid}${ref}${dots}
  </svg>`;
}

function render() {
  const tab = state.tab;
  const tabBtn = (id, label) => `<button role="tab" data-tab="${id}" aria-selected="${tab === id}">${label}</button>`;
  main.innerHTML = `
    <h1>Token Radar: <span class="amber">pre-token protocols</span>, ranked by implied value</h1>
    <p class="lede">From the sealed snapshot of every protocol DefiLlama tracks, <b>${ROWS.length} pre-token protocols</b> are ranked by what they would be worth if they launched a token at their category's median ratio. <b>${DATA.watchlist_size} are the watchlist</b> — the ${fmtUsd(DATA.floor_usd)} floor and up — and <b class="early">${DATA.early_size} are the early rows</b> below it, the launches this radar exists to find. ${LIVE.length} protocols that already trade are set aside as the calibration set.</p>
    <ul class="facts">
      <li>Snapshot <b>${escapeHtml(DATA.as_of)}</b></li>
      <li>Extras <b>${escapeHtml(DATA.extras_as_of || '')}</b></li>
      <li>Board <b>${ROWS.length} rows</b></li>
      <li>Watchlist <b>${DATA.watchlist_size}</b></li>
      <li>Early <b class="early">${DATA.early_size}</b></li>
      <li>Model <b>${escapeHtml(DATA.model_version || 'radar-4')}</b></li>
      <li>Top implied <b>${fmtUsd(MAX_IMPLIED)}</b></li>
    </ul>
    <div class="tabs" role="tablist" aria-label="Views">${tabBtn('board', 'Board')}${tabBtn('launching', 'Launching soon')}${tabBtn('live', 'Live tokens')}${tabBtn('method', 'Method')}</div>
    ${tab === 'board' ? `
    <div class="controls">
      <input type="search" id="q" placeholder="Search a protocol…" value="${escapeHtml(state.q)}" aria-label="Search protocols">
      <select id="category" aria-label="Filter by category"><option value="">All categories</option>${optionList(ROWS.map((r) => r.category))}</select>
      <select id="chain" aria-label="Filter by chain"><option value="">All chains</option>${optionList(ROWS.flatMap((r) => r.chains))}</select>
      <label><input type="checkbox" id="watchlist" ${state.watchlist ? 'checked' : ''}> Watchlist only</label>
      <span class="count" id="count"></span>
    </div>` : ''}
    <div id="view">${tab === 'board' ? boardHtml() : tab === 'launching' ? launchingHtml() : tab === 'live' ? liveHtml() : methodHtml()}</div>
    <p class="note">Implied value is a ranking device, not a price, and no airdrop is guaranteed. A protocol that records no token in the snapshot may still have one under another name; check the protocol's own page before you farm it. This page renders with no network.</p>
    <footer>Built from a sealed DefiLlama snapshot of ${escapeHtml(DATA.as_of)}. Launching-soon data as of ${escapeHtml(DATA.extras_as_of || '')}. The snapshot's source and the program that scored it are in the repository beside this page.</footer>`;
  main.setAttribute('aria-busy', 'false');
  if (tab === 'board') {
    const cat = $('#category');
    const ch = $('#chain');
    if (cat) cat.value = state.category;
    if (ch) ch.value = state.chain;
    const count = $('#count');
    if (count) count.textContent = `Showing ${filteredRows().length} of ${ROWS.length} rows`;
    $('#q').addEventListener('input', (e) => { state.q = e.target.value; state.detail = ''; writeState(state); render(); const q = $('#q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); });
    cat.addEventListener('change', (e) => { state.category = e.target.value; writeState(state); render(); });
    ch.addEventListener('change', (e) => { state.chain = e.target.value; writeState(state); render(); });
    $('#watchlist').addEventListener('change', (e) => { state.watchlist = e.target.checked; writeState(state); render(); });
    main.querySelectorAll('[data-sort]').forEach((th) => th.addEventListener('click', () => {
      const key = th.getAttribute('data-sort');
      if (state.sort === key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
      else { state.sort = key; state.dir = key === 'name' || key === 'category' ? 'asc' : 'desc'; }
      writeState(state); render();
    }));
  }
  main.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { state.tab = b.getAttribute('data-tab'); writeState(state); render(); }));
  main.querySelectorAll('[data-detail]').forEach((b) => b.addEventListener('click', () => openDetail(b.getAttribute('data-detail'))));
  if (state.detail && BY_SLUG.has(state.detail)) openDetail(state.detail, true);
}

let dialog = null;
function openDetail(slug, fromHash) {
  const row = BY_SLUG.get(slug);
  if (!row) return;
  state.detail = slug;
  writeState(state);
  const recomputed = impliedOf(row);
  const matches = recomputed === row.implied_value_usd;
  const risk = riskOf(row);
  const { multiple, source } = multipleFor(row.category);
  const steps = farmSteps(row);
  const growth = Math.min(GROWTH_CAP, Math.max(GROWTH_FLOOR, row.change_7d ?? 0));
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.setAttribute('aria-label', 'Protocol detail');
    document.body.appendChild(dialog);
    dialog.addEventListener('close', () => { state.detail = ''; writeState(state); render(); });
  }
  dialog.innerHTML = `
    <div class="dlg-head"><h2>${escapeHtml(row.name)}</h2><button class="close" data-close>Close</button></div>
    <div class="dlg-body">
      <p style="margin:4px 0 0;color:var(--muted)">${escapeHtml(row.category || 'No category')} · ${row.chains.map((c) => escapeHtml(c)).join(', ') || 'no chain listed'} · rank #${row.rank}${WATCHLIST.has(row.slug) ? ' · watchlist' : ' · early'}</p>
      <p class="why">${escapeHtml(reasonFor(row))}</p>
      <dl class="kv">
        <div><dt>Implied value</dt><dd>${fmtUsd(row.implied_value_usd)}<small>${matches ? 'The page recomputes this from the same figures — it matches board.json.' : `The page recomputes ${fmtUsd(recomputed)} — it does not match board.json.`}</small></dd></div>
        <div><dt>TVL</dt><dd>${fmtUsd(row.tvl_usd)}</dd></div>
        <div><dt>7-day change</dt><dd class="${pctClass(row.change_7d)}">${fmtPct(row.change_7d)}</dd></div>
        <div><dt>Age</dt><dd>${fmtAge(row.age_days)}<small>${row.age_days === null ? 'no listing date in the snapshot' : 'since first listed'}</small></dd></div>
        <div><dt>Category multiple</dt><dd>${fmtMult(multiple)}<small>${escapeHtml(source)}</small></dd></div>
        <div><dt>Growth multiplier</dt><dd>${fmtMult(growthMultOf(row))}<small>7d ${fmtPct(growth)} clamped to ${GROWTH_FLOOR}%–${GROWTH_CAP}%</small></dd></div>
        <div><dt>Maturity multiplier</dt><dd>${fmtMult(maturityMultOf(row))}<small>${MATURITY_FLOOR} + age / ${MATURITY_DAYS}d × ${MATURITY_RANGE}</small></dd></div>
        <div><dt>Momentum multiplier</dt><dd>${fmtMult(momentumFor(row.category).momentum)}<small>its category's traded peers, 7d median: ${escapeHtml(momentumFor(row.category).source)}</small></dd></div>
        <div><dt>Risk multiplier</dt><dd>${fmtMult(risk.multiplier)}<small>${risk.flags.length ? escapeHtml(risk.flags.join('; ')) : 'old, steady and multi-chain: no discount'}</small></dd></div>
      </dl>
      <h3>How to farm it</h3>
      <ol class="steps">${steps.map((s) => {
        const m = s.match(/^(.*?) Cost: (.*?)\. Time: (.*?)\.$/);
        if (!m) return `<li>${escapeHtml(s)}</li>`;
        return `<li>${escapeHtml(m[1])}<small>Cost: ${escapeHtml(m[2])} · Time: ${escapeHtml(m[3])}</small></li>`;
      }).join('')}</ol>
      <p class="warn">This protocol records no token in the snapshot — that is what the snapshot says, not proof it has none, and no airdrop is guaranteed. Check the protocol's own page before you farm it.</p>
    </div>`;
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  if (!dialog.open) dialog.showModal();
}

window.addEventListener('hashchange', () => {
  state = readState();
  if (dialog && dialog.open && !state.detail) dialog.close();
  render();
});
render();
