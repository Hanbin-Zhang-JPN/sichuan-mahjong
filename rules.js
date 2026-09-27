/* Dependency-free Sichuan Mahjong engine. Works in browsers and Node. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Mahjong = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SUITS = ['万', '条', '筒'];
  const NAMES = ['你', '川叔', '竹影', '蓉姐'];
  const suit = t => Math.floor(t / 9);
  const rank = t => t % 9 + 1;
  const label = t => rank(t) + SUITS[suit(t)];
  const counts = tiles => { const c = Array(27).fill(0); for (const t of tiles) c[t]++; return c; };
  const sort = tiles => tiles.sort((a, b) => a - b);
  function deck(random = Math.random) {
    const d = Array.from({ length: 108 }, (_, i) => Math.floor(i / 4));
    for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
    return d;
  }
  function groups(c, remaining) {
    const t = c.findIndex(n => n > 0);
    if (t < 0) return remaining === 0;
    if (remaining <= 0) return false;
    if (c[t] >= 3) { c[t] -= 3; const ok = groups(c, remaining - 1); c[t] += 3; if (ok) return true; }
    if (t % 9 <= 6 && c[t + 1] && c[t + 2]) {
      c[t]--; c[t + 1]--; c[t + 2]--; const ok = groups(c, remaining - 1);
      c[t]++; c[t + 1]++; c[t + 2]++; if (ok) return true;
    }
    return false;
  }
  function isHu(hand, melds = [], missing = -1) {
    if (hand.length !== (4 - melds.length) * 3 + 2) return false;
    if (hand.some(t => suit(t) === missing) || melds.some(m => suit(m.tile) === missing)) return false;
    const c = counts(hand);
    if (counts(hand.concat(melds.flatMap(m => Array(m.kind === 'peng' ? 3 : 4).fill(m.tile)))).some(n => n > 4)) return false;
    if (!melds.length && c.every(n => n % 2 === 0)) return true;
    for (let t = 0; t < 27; t++) if (c[t] >= 2) {
      c[t] -= 2; const ok = groups(c, 4 - melds.length); c[t] += 2; if (ok) return true;
    }
    return false;
  }
  function allTriplets(hand) {
    const c = counts(hand);
    for (let i = 0; i < 27; i++) if (c[i] >= 2) {
      c[i] -= 2; const ok = c.every(n => n % 3 === 0); c[i] += 2; if (ok) return true;
    }
    return false;
  }
  function scoreHand(hand, melds = [], missing = -1, context = {}) {
    if (!isHu(hand, melds, missing)) return null;
    const c = counts(hand), full = hand.concat(melds.flatMap(m => Array(m.kind === 'peng' ? 3 : 4).fill(m.tile)));
    const fc = counts(full), seven = !melds.length && c.every(n => n % 2 === 0), items = [];
    if (seven) items.push({ name: '七对', fan: 2 });
    else if (allTriplets(hand)) items.push({ name: '对对胡', fan: 1 });
    if (new Set(full.map(suit)).size === 1) items.push({ name: '清一色', fan: 2 });
    if (melds.length === 4) items.push({ name: '金钩钓', fan: 1 });
    const roots = fc.filter(n => n === 4).length;
    if (roots) items.push({ name: roots + '根', fan: roots });
    for (const [key, name] of [['afterGang', '杠上花'], ['gangDiscard', '杠后炮'], ['robGang', '抢杠胡'], ['lastTile', '海底胡']]) {
      if (context[key]) items.push({ name, fan: 1 });
    }
    const rawFan = items.reduce((n, x) => n + x.fan, 0), fan = Math.min(4, rawFan);
    if (!items.length) items.push({ name: '平胡', fan: 0 });
    return { fan, rawFan, base: 2 ** fan, items, text: items.map(x => x.name).join(' · ') };
  }
  function waits(hand, melds = [], missing = -1) {
    const c = counts(hand.concat(melds.flatMap(m => Array(m.kind === 'peng' ? 3 : 4).fill(m.tile)))), out = [];
    for (let t = 0; t < 27; t++) if (suit(t) !== missing && c[t] < 4) {
      const score = scoreHand(hand.concat(t), melds, missing); if (score) out.push({ tile: t, ...score });
    }
    return out;
  }
  // Exact standard/seven-pairs shanten search, cached for AI candidate evaluation.
  const shantenCache = new Map();
  function shanten(hand, meldCount = 0) {
    const c = counts(hand), key = meldCount + ':' + c.join('');
    if (shantenCache.has(key)) return shantenCache.get(key);
    let best = 8;
    function dfs(start, m, taatsu, pair) {
      while (start < 27 && c[start] === 0) start++;
      if (start === 27) { best = Math.min(best, 8 - 2 * (m + meldCount) - Math.min(taatsu, 4 - m - meldCount) - pair); return; }
      const t = start;
      if (m + meldCount < 4) {
        if (c[t] >= 3) { c[t] -= 3; dfs(t, m + 1, taatsu, pair); c[t] += 3; }
        if (t % 9 < 7 && c[t + 1] && c[t + 2]) { c[t]--; c[t + 1]--; c[t + 2]--; dfs(t, m + 1, taatsu, pair); c[t]++; c[t + 1]++; c[t + 2]++; }
      }
      if (c[t] >= 2) {
        c[t] -= 2;
        if (!pair) dfs(t, m, taatsu, 1);
        if (m + taatsu + meldCount < 4) dfs(t, m, taatsu + 1, pair);
        c[t] += 2;
      }
      if (m + taatsu + meldCount < 4) for (const gap of [1, 2]) if (t % 9 + gap < 9 && c[t + gap]) {
        c[t]--; c[t + gap]--; dfs(t, m, taatsu + 1, pair); c[t]++; c[t + gap]++;
      }
      c[t]--; dfs(t, m, taatsu, pair); c[t]++;
    }
    dfs(0, 0, 0, 0);
    if (!meldCount) best = Math.min(best, 6 - c.filter(n => n >= 2).length + Math.max(0, 7 - c.filter(n => n > 0).length));
    if (shantenCache.size > 30000) shantenCache.clear();
    shantenCache.set(key, best); return best;
  }
  function chooseMissing(hand) {
    const c = counts(hand);
    return [0, 1, 2].sort((a, b) => {
      function strength(s) {
        let n = 0; for (let t = s * 9; t < s * 9 + 9; t++) {
          n += c[t] * 3 + (c[t] >= 2 ? 2 : 0);
          if (t % 9 < 8) n += Math.min(c[t], c[t + 1]);
        } return n;
      }
      return strength(a) - strength(b) || a - b;
    })[0];
  }
  function exchangeChoice(hand) {
    const order = [chooseMissing(hand), 0, 1, 2];
    for (const s of order) {
      const ix = hand.map((t, i) => ({ t, i })).filter(x => suit(x.t) === s);
      if (ix.length >= 3) return ix.slice(0, 3).map(x => x.i);
    }
    throw new Error('No legal exchange');
  }
  function aiDelay(random = Math.random) { return 500 + Math.floor(random() * 1001); }
  class Game {
    constructor({ random = Math.random, totals = [0, 0, 0, 0], round = 1, dealer = 0 } = {}) {
      this.random = random; this.totals = totals.slice(); this.round = round; this.dealer = dealer;
      this.wall = deck(random); this.players = NAMES.map(name => ({ name, hand: [], melds: [], missing: -1, won: false, delta: 0, passed: -1, win: null }));
      for (let j = 0; j < 13; j++) for (let p = 0; p < 4; p++) this.players[p].hand.push(this.wall.shift());
      this.players[dealer].hand.push(this.wall.shift()); this.players.forEach(p => sort(p.hand));
      this.phase = 'exchange'; this.turn = dealer; this.direction = [1, 2, 3][Math.floor(random() * 3)];
      this.discards = []; this.transfers = []; this.logs = []; this.winners = []; this.last = null; this.pending = null; this.afterGang = false; this.drawn = null;
      this.log('第 ' + round + ' 局开桌，' + NAMES[dealer] + '坐庄。');
    }
    log(text) { this.logs.push(text); }
    active() { return this.players.map((p, i) => p.won ? -1 : i).filter(i => i >= 0); }
    next(p) { for (let n = 1; n <= 4; n++) if (!this.players[(p + n) % 4].won) return (p + n) % 4; return p; }
    exchange(indices) {
      if (this.phase !== 'exchange') return false;
      if (indices.length !== 3 || new Set(indices).size !== 3 || indices.some(i => i < 0 || i >= this.players[0].hand.length)) return false;
      const chosen = indices.map(i => this.players[0].hand[i]);
      if (new Set(chosen.map(suit)).size !== 1) return false;
      const picks = this.players.map((p, i) => (i ? exchangeChoice(p.hand) : indices).map(ix => p.hand[ix]));
      this.players.forEach((p, i) => { for (const t of picks[i]) p.hand.splice(p.hand.indexOf(t), 1); });
      this.players.forEach((p, i) => { p.hand.push(...picks[(i - this.direction + 4) % 4]); sort(p.hand); });
      this.phase = 'missing';
      this.log('换三张完成：' + { 1: '交给下家', 2: '与对家交换', 3: '交给上家' }[this.direction] + '。'); return true;
    }
    setMissing(s) {
      if (this.phase !== 'missing' || ![0, 1, 2].includes(s)) return false;
      this.players.forEach((p, i) => { p.missing = i ? chooseMissing(p.hand) : s; });
      this.phase = 'play'; this.turn = this.dealer;
      this.log(this.players.map(p => p.name + '缺' + SUITS[p.missing]).join('；') + '。'); return true;
    }
    legalDiscards(i = this.turn) {
      const p = this.players[i], missing = p.hand.some(t => suit(t) === p.missing);
      return p.hand.map((t, ix) => ix).filter(ix => !missing || suit(p.hand[ix]) === p.missing);
    }
    turnOptions() {
      if (this.phase !== 'play') return [];
      const p = this.players[this.turn], options = [];
      if (isHu(p.hand, p.melds, p.missing)) options.push({ type: 'hu' });
      if (this.wall.length && !p.hand.some(t => suit(t) === p.missing)) {
        const c = counts(p.hand);
        c.forEach((n, t) => { if (n === 4) options.push({ type: 'angang', tile: t }); });
        p.melds.forEach(m => { if (m.kind === 'peng' && c[m.tile]) options.push({ type: 'bugang', tile: m.tile }); });
      }
      return options;
    }
    huScore(i, tile, context = {}) {
      const p = this.players[i]; return scoreHand(tile == null ? p.hand : p.hand.concat(tile), p.melds, p.missing, context);
    }
    transfer(from, to, amount, reason, kind = 'hu') {
      this.players[from].delta -= amount; this.players[to].delta += amount;
      this.transfers.push({ from, to, amount, reason, kind });
    }
    draw(i, afterGang = false) {
      if (this.active().length <= 1) { this.end(false); return; }
      if (!this.wall.length) { this.end(true); return; }
      const t = afterGang ? this.wall.pop() : this.wall.shift();
      const p = this.players[i]; p.hand.push(t); sort(p.hand); p.passed = -1;
      this.drawn = t; this.turn = i; this.afterGang = afterGang; this.phase = 'play'; this.pending = null;
    }
    discard(index) {
      if (this.phase !== 'play' || !this.legalDiscards().includes(index) || this.turnOptions().some(o => o.type === 'hu')) return false;
      const from = this.turn, p = this.players[from], [tile] = p.hand.splice(index, 1);
      const record = { from, tile, claimed: false }; this.discards.push(record); this.last = record;
      this.log(p.name + '打出 ' + label(tile) + '。'); this.drawn = null;
      this.prepareResponses(from, tile, { gangDiscard: this.afterGang, lastTile: this.wall.length === 0 }, record);
      this.afterGang = false; return true;
    }
    prepareResponses(from, tile, context, record = null, rob = false) {
      const queue = [];
      for (let n = 1; n < 4; n++) {
        const i = (from + n) % 4, p = this.players[i]; if (p.won) continue;
        const options = [], score = this.huScore(i, tile, context);
        if (score && score.base > p.passed) options.push({ type: 'hu' });
        if (!rob && !p.hand.some(t => suit(t) === p.missing) && suit(tile) !== p.missing) {
          const nSame = p.hand.filter(t => t === tile).length;
          if (nSame >= 3 && this.wall.length) options.push({ type: 'minggang', tile });
          if (nSame >= 2) options.push({ type: 'peng', tile });
        }
        if (options.length) queue.push({ i, options, choice: null });
      }
      this.pending = { from, tile, context, record, rob, queue };
      this.phase = 'response'; if (!queue.length) this.resolveResponses();
    }
    responder() { return this.pending?.queue.find(q => q.choice == null) || null; }
    respond(type) {
      if (this.phase !== 'response') return false;
      const q = this.responder(); if (!q) return false;
      if (type !== 'pass' && !q.options.some(o => o.type === type)) return false;
      if (type !== 'hu' && this.wall.length <= 4 && q.options.some(o => o.type === 'hu')) return false;
      if (type !== 'hu' && q.options.some(o => o.type === 'hu')) this.players[q.i].passed = this.huScore(q.i, this.pending.tile, this.pending.context).base;
      q.choice = type; if (!this.responder()) this.resolveResponses(); return true;
    }
    resolveResponses() {
      const pending = this.pending, winners = pending.queue.filter(q => q.choice === 'hu').map(q => q.i);
      if (winners.length) {
        if (pending.record) { pending.record.claimed = true; pending.record.hu = true; }
        if (pending.rob) this.discards.push({ from: pending.from, tile: pending.tile, claimed: true, robbed: true, hu: true });
        for (const i of winners) this.win(i, pending.from, pending.tile, pending.context);
        this.pending = null;
        if (this.active().length <= 1) this.end(false);
        else this.draw(this.next(pending.from));
        return;
      }
      if (pending.rob) { this.completeGang(pending.from, pending.tile, 'bugang'); return; }
      const claim = pending.queue.find(q => q.choice === 'peng' || q.choice === 'minggang');
      if (claim) {
        const p = this.players[claim.i], gang = claim.choice === 'minggang';
        for (let j = 0; j < (gang ? 3 : 2); j++) p.hand.splice(p.hand.indexOf(pending.tile), 1);
        p.melds.push({ kind: gang ? 'minggang' : 'peng', tile: pending.tile, from: pending.from });
        pending.record.claimed = true; this.log(p.name + (gang ? '点杠 ' : '碰 ') + label(pending.tile) + '。');
        this.pending = null; this.turn = claim.i; this.phase = 'play'; this.drawn = null; this.afterGang = false;
        if (gang) { this.transfer(pending.from, claim.i, 2, '点杠', 'gang'); this.draw(claim.i, true); }
        return;
      }
      this.pending = null; this.draw(this.next(pending.from));
    }
    act(type, tile) {
      const options = this.turnOptions();
      if (type !== 'hu' && options.some(o => o.type === 'hu')) return false;
      if (!options.some(o => o.type === type && (o.tile == null || o.tile === tile))) return false;
      const i = this.turn, p = this.players[i];
      if (type === 'hu') {
        this.win(i, null, null, { afterGang: this.afterGang, lastTile: this.wall.length === 0 });
        if (this.active().length <= 1) this.end(false); else this.draw(this.next(i)); return true;
      }
      if (type === 'angang') {
        for (let j = 0; j < 4; j++) p.hand.splice(p.hand.indexOf(tile), 1);
        this.completeGang(i, tile, type); return true;
      }
      p.hand.splice(p.hand.indexOf(tile), 1);
      this.log(p.name + '申请补杠 ' + label(tile) + '。');
      this.prepareResponses(i, tile, { robGang: true, lastTile: false }, null, true); return true;
    }
    completeGang(i, tile, kind) {
      const p = this.players[i];
      if (kind === 'bugang') p.melds.find(m => m.kind === 'peng' && m.tile === tile).kind = kind;
      else p.melds.push({ kind, tile, from: i });
      for (const other of this.active()) if (other !== i) this.transfer(other, i, kind === 'angang' ? 2 : 1, kind === 'angang' ? '暗杠' : '补杠', 'gang');
      this.log(p.name + (kind === 'angang' ? '暗杠 ' : '补杠 ') + label(tile) + '，补牌。'); this.draw(i, true);
    }
    win(i, from, tile, context) {
      const p = this.players[i], score = this.huScore(i, tile, context);
      if (!score) throw new Error('Illegal win');
      if (from == null) for (const other of this.active()) { if (other !== i) this.transfer(other, i, score.base + 1, '自摸 · ' + score.text); }
      else this.transfer(from, i, score.base, (context.robGang ? '抢杠胡' : '点炮胡') + ' · ' + score.text);
      p.won = true; p.win = { from, tile, score, order: this.winners.length + 1 }; this.winners.push(i);
      this.log(p.name + (from == null ? '自摸' : '胡 ' + NAMES[from] + '的 ' + label(tile)) + '！' + score.text + '，' + score.fan + '番。');
    }
    end(exhausted) {
      if (this.phase === 'ended') return;
      this.exhausted = exhausted; this.checks = {};
      if (exhausted) {
        const active = this.active(), pigs = active.filter(i => this.players[i].hand.some(t => suit(t) === this.players[i].missing));
        for (const i of pigs) for (let j = 0; j < 4; j++) if (!pigs.includes(j)) this.transfer(i, j, 16, '查花猪', 'penalty');
        const ws = new Map();
        for (const i of active) if (!pigs.includes(i)) ws.set(i, waits(this.players[i].hand, this.players[i].melds, this.players[i].missing));
        const notReady = active.filter(i => pigs.includes(i) || !ws.get(i)?.length);
        for (const [i, list] of ws) if (!list.length) for (const [j, ready] of ws) if (ready.length) this.transfer(i, j, Math.max(...ready.map(x => x.base)), '查大叫', 'penalty');
        const gangs = this.transfers.filter(t => t.kind === 'gang' && notReady.includes(t.to));
        for (const t of gangs) this.transfer(t.to, t.from, t.amount, '退杠分', 'refund');
        for (const i of active) this.checks[i] = pigs.includes(i) ? '花猪' : ws.get(i)?.length ? '已听牌' : '未听牌';
      }
      this.phase = 'ended'; this.pending = null;
      this.players.forEach((p, i) => { this.totals[i] += p.delta; });
      this.log(exhausted ? '牌墙摸完，已完成查花猪、查叫及退杠分。' : '三家胡牌，本局结束。');
    }
  }
  function visibleCounts(game, i) {
    // Only own concealed hand and public information: no wall/opponent hand access.
    const visible = game.players[i].hand.slice();
    for (const p of game.players) for (const m of p.melds) visible.push(...Array(m.kind === 'peng' ? 3 : 4).fill(m.tile));
    for (const d of game.discards) if (!d.claimed || d.hu) visible.push(d.tile);
    for (const [j, p] of game.players.entries()) if (p.won && j !== i) visible.push(...p.hand);
    return counts(visible);
  }
  function chooseDiscard(game, i = game.turn) {
    const p = game.players[i], legal = game.legalDiscards(i), own = counts(p.hand), seen = visibleCounts(game, i);
    const candidates = [...new Set(legal.map(ix => p.hand[ix]))];
    const scored = candidates.map(t => {
      const h = p.hand.slice(); h.splice(h.indexOf(t), 1);
      const filtered = h.filter(x => suit(x) !== p.missing), missingCount = h.length - filtered.length;
      let sh = shanten(filtered, p.melds.length), outs = 0;
      if (missingCount === 0 && sh <= 1) {
        for (let x = 0; x < 27; x++) if (suit(x) !== p.missing && seen[x] < 4 && shanten(filtered.concat(x), p.melds.length) < sh) outs += 4 - seen[x];
      }
      let connection = own[t] >= 2 ? 3 : 0;
      for (const gap of [-2, -1, 1, 2]) if (t + gap >= 0 && t + gap < 27 && suit(t + gap) === suit(t) && own[t + gap]) connection += Math.abs(gap) === 1 ? 1.2 : .5;
      let danger = 0;
      for (const [j, other] of game.players.entries()) if (j !== i && !other.won && suit(t) !== other.missing) {
        if (!game.discards.some(d => d.from === j && d.tile === t)) danger += (rank(t) >= 3 && rank(t) <= 7 ? 1.2 : .7) + other.melds.length * .5;
      }
      return { ix: p.hand.indexOf(t), value: sh * 100 + missingCount * 80 - outs * 2 + connection + danger * (game.wall.length < 20 ? 4 : .35) };
    });
    scored.sort((a, b) => a.value - b.value || a.ix - b.ix); return scored[0]?.ix ?? legal[0];
  }
  function chooseResponse(game, q = game.responder()) {
    if (q.options.some(o => o.type === 'hu')) return 'hu';
    const p = game.players[q.i], t = game.pending.tile;
    if (q.options.some(o => o.type === 'minggang')) return 'minggang';
    if (q.options.some(o => o.type === 'peng')) {
      const before = shanten(p.hand, p.melds.length), after = p.hand.slice();
      for (let j = 0; j < 2; j++) after.splice(after.indexOf(t), 1);
      let best = 8;
      for (let j = 0; j < after.length; j++) best = Math.min(best, shanten(after.filter((_, ix) => ix !== j), p.melds.length + 1));
      if (best < before) return 'peng';
    }
    return 'pass';
  }
  function chooseTurn(game) {
    const options = game.turnOptions();
    if (options.some(o => o.type === 'hu')) return { type: 'hu' };
    // Avoid destroying a ready hand for a speculative extra point.
    for (const o of options) {
      const p = game.players[game.turn], after = p.hand.slice();
      for (let j = 0; j < (o.type === 'angang' ? 4 : 1); j++) after.splice(after.indexOf(o.tile), 1);
      const meldCount = p.melds.length + (o.type === 'angang' ? 1 : 0);
      if (shanten(after, meldCount) <= shanten(p.hand, p.melds.length)) return o;
    }
    return { type: 'discard', index: chooseDiscard(game) };
  }
  return { SUITS, NAMES, suit, rank, label, counts, deck, isHu, scoreHand, waits, shanten, chooseMissing, exchangeChoice, aiDelay, Game, visibleCounts, chooseDiscard, chooseResponse, chooseTurn };
});
