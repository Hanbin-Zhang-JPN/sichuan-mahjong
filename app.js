(() => {
  'use strict';
  const M = Mahjong, $ = id => document.getElementById(id);
  let game = new M.Game(), selected = [], timer = null, resultShown = false, toast = '';
  const num = n => n > 0 ? '+' + n : String(n);
  const tileHTML = (t, cls = '', ix = null) => {
    const s = M.suit(t), n = M.rank(t), tag = ix == null ? 'span' : 'button';
    return `<${tag} class="tile s${s} ${cls}" ${ix == null ? '' : `data-index="${ix}" aria-label="${M.label(t)}" aria-pressed="${selected.includes(ix)}"`}><span class="number">${['一','二','三','四','五','六','七','八','九'][n-1]}</span><span class="suit">${s === 0 ? '萬' : M.SUITS[s]}</span></${tag}>`;
  };
  function playerInfo(i) {
    const p = game.players[i], active = game.phase === 'play' && game.turn === i || game.phase === 'response' && game.responder()?.i === i;
    return `<div class="player-head ${active ? 'turn' : ''} ${p.won ? 'won' : ''}"><span class="avatar">${['你','川','竹','蓉'][i]}</span><span class="player-name">${p.name}${i ? ' · AI' : ''}</span>${i === game.dealer ? '<span class="badge">庄</span>' : ''}${p.won ? '<span class="badge">已胡 #' + p.win.order + '</span>' : ''}</div><p class="player-meta">${p.missing < 0 ? '等待定缺' : '缺' + M.SUITS[p.missing]} · ${p.hand.length} 张 · 本局 ${num(p.delta)}</p>`;
  }
  function meldHTML(p) {
    return p.melds.map(m => `<div class="meld-group">${Array(m.kind === 'peng' ? 3 : 4).fill(m.tile).map(t => tileHTML(t, 'small')).join('')}<span class="meld-label">${{peng:'碰',angang:'暗杠',minggang:'点杠',bugang:'补杠'}[m.kind]}</span></div>`).join('');
  }
  function button(text, action, primary = false, extra = '') { return `<button class="${primary ? 'primary' : 'quiet'} ${extra}" data-action="${action}">${text}</button>`; }
  function schedule() {
    clearTimeout(timer); timer = null;
    const q = game.responder();
    const ai = game.phase === 'play' && game.turn !== 0 || game.phase === 'response' && q && q.i !== 0;
    if (!ai) return;
    timer = setTimeout(() => {
      if (game.phase === 'response') game.respond(M.chooseResponse(game));
      else if (game.phase === 'play') { const act = M.chooseTurn(game); if (act.type === 'discard') game.discard(act.index); else game.act(act.type, act.tile); }
      selected = []; toast = ''; render(); schedule();
    }, M.aiDelay());
  }
  function render() {
    $('round-label').textContent = '第 ' + game.round + ' 局'; $('wall-label').textContent = '牌墙 ' + game.wall.length + ' 张';
    for (let i = 0; i < 4; i++) {
      const p = game.players[i];
      $('seat-' + i).innerHTML = playerInfo(i) + (i ? `<div class="backs">${p.won || game.phase === 'ended' ? p.hand.map(t => tileHTML(t,'mini')).join('') : Array(p.hand.length).fill('<span class="back"></span>').join('')}</div><div class="melds">${meldHTML(p)}</div>` : '');
    }
    $('human-melds').innerHTML = meldHTML(game.players[0]);
    const p = game.players[0], legal = game.legalDiscards(0);
    $('hand').innerHTML = p.hand.map((t, i) => tileHTML(t, [selected.includes(i) ? 'selected' : '', M.suit(t) === p.missing ? 'missing-tile' : '', game.phase === 'play' && game.turn === 0 && !legal.includes(i) ? 'unavailable' : '', game.turn === 0 && t === game.drawn && p.hand.lastIndexOf(t) === i ? 'drawn' : ''].join(' '), i)).join('');
    $('discard-area').innerHTML = game.players.map((p, i) => `<section class="river"><div class="river-title">${p.name}的牌河</div><div class="river-tiles">${game.discards.filter(d => d.from === i).map(d => tileHTML(d.tile, 'mini' + (d.claimed ? ' claimed' : ''))).join('')}</div></section>`).join('');
    $('last-play').innerHTML = game.last ? tileHTML(game.last.tile) : '';
    $('last-caption').textContent = game.last ? game.players[game.last.from].name + '打出' + M.label(game.last.tile) + (game.last.claimed ? ' · 已被碰 / 杠 / 胡' : '') : { 1:'交给下家', 2:'与对家交换', 3:'交给上家' }[game.direction];
    $('scores').innerHTML = game.players.map((p, i) => `<div class="score-row"><span>${p.name}${p.won ? ' · 已胡' : ''}</span><b class="${game.totals[i] + (game.phase === 'ended' ? 0 : p.delta) < 0 ? 'negative' : ''}">${num(game.totals[i] + (game.phase === 'ended' ? 0 : p.delta))}</b></div>`).join('');
    $('log').innerHTML = game.logs.slice(-30).reverse().map(text => '<li>' + text + '</li>').join('');
    let prompt, hint, actions = '', status;
    if (game.phase === 'exchange') {
      prompt = '选择同一花色的三张牌'; hint = `本局${{1:'交给下家',2:'与对家交换',3:'交给上家'}[game.direction]} · 已选 ${selected.length}/3 张。`;
      actions = button('建议换牌','suggest') + button('确认换牌','exchange',true); status = '换三张';
    } else if (game.phase === 'missing') {
      prompt = '这局，你缺哪一门？'; hint = '定缺后必须先打完这一门，才能胡牌。推荐缺' + M.SUITS[M.chooseMissing(p.hand)] + '。';
      actions = M.SUITS.map((s, i) => button('缺' + s,'missing:' + i,i === M.chooseMissing(p.hand))).join(''); status = '定缺';
    } else if (game.phase === 'response') {
      const q = game.responder(); status = '等待' + game.players[q.i].name;
      if (q.i === 0) {
        prompt = (game.pending.rob ? '有人补杠：' : '有人打出：') + M.label(game.pending.tile);
        hint = '胡牌优先于碰杠；多人可同时胡这一张。';
        const forcedHu = game.wall.length <= 4 && q.options.some(o => o.type === 'hu');
        actions = q.options.filter(o => !forcedHu || o.type === 'hu').map(o => button({hu:'胡牌',peng:'碰',minggang:'点杠'}[o.type], 'respond:' + o.type, true, o.type === 'hu' ? 'win-button' : '')).join('');
        if (!(game.wall.length <= 4 && q.options.some(o => o.type === 'hu'))) actions += button('过','respond:pass');
      } else { prompt = game.players[q.i].name + '正在思考…'; hint = p.won ? '你已胡牌，正在旁观其余玩家。' : 'AI 每次随机思考 0.5～1.5 秒。'; }
    } else if (game.phase === 'play') {
      status = '轮到' + game.players[game.turn].name;
      if (game.turn === 0) {
        const opts = game.turnOptions();
        if (opts.some(o => o.type === 'hu')) { prompt = '可以自摸胡牌'; hint = '本桌自摸必须胡；胡牌后其余玩家继续。'; actions = button('自摸胡牌','hu',true,'win-button'); }
        else {
          prompt = p.hand.some(t => M.suit(t) === p.missing) ? '先打完缺' + M.SUITS[p.missing] + '的牌' : '轮到你出牌';
          const ws = selected.length === 1 ? M.waits(p.hand.filter((_, i) => i !== selected[0]),p.melds,p.missing) : [];
          hint = ws.length ? '打出后听：' + ws.map(w => M.label(w.tile)).join('、') : '单击选牌后打出，或双击直接打出。';
          actions = opts.map(o => button((o.type === 'angang' ? '暗杠 ' : '补杠 ') + M.label(o.tile),o.type + ':' + o.tile)).join('') + button('建议','suggest') + button('打出','discard',true);
        }
      } else { prompt = game.players[game.turn].name + '正在思考…'; hint = p.won ? '你已胡牌，正在旁观其余玩家。' : '留意各家的定缺与牌河，别急着送出危险牌。'; }
    } else { prompt = '本局结束'; hint = '本局所有分数已结算，可以查看明细或开始下一局。'; actions = button('查看结算','result') + button('下一局','next',true); status = '本局结束'; }
    $('prompt').textContent = prompt; $('hint').textContent = toast || hint; $('hint').className = toast ? 'toast' : '';
    $('actions').innerHTML = actions; $('center-status').textContent = status;
    if (game.phase === 'ended' && !resultShown) { resultShown = true; showResult(); }
  }
  function showResult() {
    $('result-title').textContent = '第 ' + game.round + ' 局 · ' + (game.exhausted ? '牌墙摸完' : '三家胡牌');
    $('result-summary').textContent = (game.winners.length ? '胡牌顺序：' + game.winners.map(i => game.players[i].name).join(' → ') + '。' : '本局没有玩家胡牌。') + (game.exhausted ? ' 已完成流局查叫、查花猪与退杠分。' : ' 血战到底结束。');
    $('result-scores').innerHTML = game.players.map((p, i) => `<div class="score-row"><span>${p.name} · ${p.win ? p.win.score.text : game.checks[i] || '未胡牌'}</span><span>本局 <b class="${p.delta < 0 ? 'negative' : ''}">${num(p.delta)}</b>　累计 ${num(game.totals[i])}</span></div>`).join('');
    $('result-details').innerHTML = game.transfers.map(t => `<div class="detail-line">${M.NAMES[t.from]} → ${M.NAMES[t.to]}　${t.amount} 分 · ${t.reason}</div>`).join('') + game.players.map(p => `<h3>${p.name}${p.win ? ' · ' + (p.win.from == null ? '自摸' : '点炮胡') : ''}</h3><div class="revealed-hand">${p.hand.concat(p.win?.tile == null ? [] : [p.win.tile]).map(t => tileHTML(t,'small')).join('')}</div><div class="melds">${meldHTML(p)}</div>`).join('');
    $('result-dialog').showModal();
  }
  function nextRound(reset = false) {
    clearTimeout(timer); if ($('result-dialog').open) $('result-dialog').close();
    game = new M.Game(reset ? {} : { totals: game.totals, round: game.round + 1, dealer: (game.dealer + 1) % 4 });
    selected = []; toast = ''; resultShown = false; render(); schedule();
  }
  $('hand').addEventListener('click', e => {
    const b = e.target.closest('[data-index]'); if (!b) return;
    const i = Number(b.dataset.index);
    if (game.phase === 'exchange') { if (selected.includes(i)) selected = selected.filter(n => n !== i); else if (selected.length < 3) selected.push(i); }
    else if (game.phase === 'play' && game.turn === 0 && game.legalDiscards().includes(i)) selected = [i];
    else return;
    toast = ''; render();
  });
  $('hand').addEventListener('dblclick', e => {
    const b = e.target.closest('[data-index]'); if (b && game.phase === 'play' && game.turn === 0) { selected = [Number(b.dataset.index)]; action('discard'); }
  });
  function action(value) {
    const [type, raw] = value.split(':'); let ok = true; toast = '';
    if (type === 'suggest') selected = game.phase === 'exchange' ? M.exchangeChoice(game.players[0].hand) : [M.chooseDiscard(game,0)];
    else if (type === 'exchange') { ok = game.exchange(selected); if (!ok) toast = '请选三张同一花色的牌。'; }
    else if (type === 'missing') ok = game.setMissing(Number(raw));
    else if (type === 'discard') { ok = selected.length === 1 && game.turn === 0 && game.discard(selected[0]); if (!ok) toast = '请先选中一张可以打出的牌。'; }
    else if (type === 'respond') ok = game.respond(raw);
    else if (['hu','angang','bugang'].includes(type)) ok = game.act(type,Number(raw));
    else if (type === 'result') { showResult(); return; }
    else if (type === 'next') { nextRound(); return; }
    if (ok && type !== 'suggest') selected = [];
    render(); schedule();
  }
  $('actions').addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (b) action(b.dataset.action); });
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && !$('rules-dialog').open && !$('result-dialog').open && game.phase === 'play' && game.turn === 0) { e.preventDefault(); action('discard'); } });
  $('rules-open').onclick = () => $('rules-dialog').showModal(); $('rules-close').onclick = () => $('rules-dialog').close();
  $('new-game').onclick = () => { if (confirm('重新开局会清零本桌积分。确定重新开始？')) nextRound(true); };
  $('next-round').onclick = () => nextRound(); $('result-review').onclick = () => $('result-dialog').close();
  render(); schedule();
})();
