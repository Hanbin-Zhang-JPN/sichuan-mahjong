const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../rules.js');
function rng(seed) { return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296); }
function hand(text) { return text.split(' ').flatMap((str, s) => [...str].map(n => s * 9 + Number(n) - 1)); }
function conserved(g) {
  const all = g.wall.slice();
  for (const p of g.players) { all.push(...p.hand); for (const m of p.melds) all.push(...Array(m.kind === 'peng' ? 3 : 4).fill(m.tile)); }
  for (const d of g.discards) if (!d.claimed || d.hu) all.push(d.tile);
  if (g.pending?.rob) all.push(g.pending.tile);
  assert.equal(all.length, 108); assert.deepEqual(M.counts(all), Array(27).fill(4));
  assert.equal(g.players.reduce((n,p) => n+p.delta,0),0);
}
test('108 tiles: four of each, 14 dealer / 13 others / 55 wall', () => {
  const g = new M.Game({random:rng(1)}); assert.deepEqual(g.players.map(p=>p.hand.length),[14,13,13,13]); assert.equal(g.wall.length,55); conserved(g);
});
test('exchange requires exactly three same-suit physical tiles and preserves all tiles', () => {
  const g = new M.Game({random:rng(2)}); assert.equal(g.exchange([0,0,0]),false);
  const ix = M.exchangeChoice(g.players[0].hand); assert.equal(new Set(ix.map(i=>M.suit(g.players[0].hand[i]))).size,1);
  assert.equal(g.exchange(ix),true); conserved(g); assert.equal(g.phase,'missing');
});
test('standard wins, seven pairs, roots, suit boundaries, and missing restrictions', () => {
  assert.equal(M.isHu(hand('123456789 11122')),true);
  assert.equal(M.isHu(hand('11223344556677')),true);
  assert.equal(M.isHu(hand('11112233445566')),true);
  assert.equal(M.isHu(hand('123456789 11122'),[],0),false);
  assert.equal(M.isHu(hand('123456789 11124')),false);
  assert.equal(M.isHu([7,8,9,0,0,0,3,3,3,12,12,12,15,15]),false);
  assert.equal(M.isHu(hand('11111222333444')),false);
  const score = M.scoreHand(hand('11112233445566')); assert.equal(score.rawFan,5); assert.equal(score.base,16); assert.match(score.text,/七对/); assert.match(score.text,/1根/);
});
test('fan table and cap, self-draw context not baked into base', () => {
  const s=M.scoreHand(hand('111333777 22255')); assert.equal(s.fan,1); assert.equal(s.base,2);
  const pure=M.scoreHand(hand('11133377788822')); assert.equal(pure.fan,3);
  const cap=M.scoreHand(hand('11133377788822'),[],-1,{afterGang:true,lastTile:true}); assert.equal(cap.fan,4); assert.equal(cap.rawFan,5);
  const melds=[0,3,6,9].map(tile=>({kind:'peng',tile})); const gold=M.scoreHand([12,12],melds); assert.equal(gold.fan,2);
});
test('missing tiles must be discarded first and block claims and wins', () => {
  const g=new M.Game({random:rng(3)}); g.exchange(M.exchangeChoice(g.players[0].hand));g.setMissing(0);
  const p=g.players[0];p.hand=hand('123456 12345677');g.phase='play';g.turn=0;
  assert.ok(g.legalDiscards().every(i=>M.suit(p.hand[i])===0)); assert.equal(g.discard(p.hand.findIndex(t=>M.suit(t)===1)),false);
  assert.equal(g.turnOptions().some(o=>o.type==='hu'),false);
});
test('one discard may have multiple winners, all hu claims beat a peng', () => {
  const g=new M.Game(); g.phase='play';g.turn=0;g.players.forEach(p=>{p.missing=2;p.hand=[];});
  g.players[1].hand=hand('1123456789 111');g.players[2].hand=hand('1123456789 111');
  g.players[3].hand=[0,0,2,3,4,5,6,7,9,10,11,12,13];
  const record={from:0,tile:0,claimed:false};g.discards.push(record);g.prepareResponses(0,0,{},record);
  while(g.phase==='response') {const q=g.responder();g.respond(q.options.some(o=>o.type==='hu')?'hu':q.options.some(o=>o.type==='peng')?'peng':'pass');}
  assert.deepEqual(g.winners,[1,2]);assert.equal(g.players[3].melds.length,0);assert.equal(g.players[0].delta,-2);assert.equal(record.hu,true);
});
test('passed hu blocks same/lower score until own draw; last four forces hu', () => {
  const g=new M.Game();g.players.forEach(p=>{p.missing=2;p.hand=[];});g.players[1].hand=hand('1123456789 111');
  g.prepareResponses(3,0,{}, {from:3,tile:0});assert.equal(g.responder().i,1);g.respond('pass');assert.equal(g.players[1].passed,1);
  g.prepareResponses(3,0,{}, {from:3,tile:0});assert.ok(!g.pending || !g.pending.queue.some(q=>q.i===1&&q.options.some(o=>o.type==='hu')));
  g.draw(1);assert.equal(g.players[1].passed,-1);
  g.players[1].hand=hand('1123456789 111');g.wall=[1,2,3,4];g.prepareResponses(0,0,{}, {from:0,tile:0});assert.equal(g.respond('pass'),false);assert.equal(g.respond('peng'),false);assert.equal(g.respond('hu'),true);
});
test('supplemental gang is robbed without charging gang points and keeps original peng', () => {
  const g=new M.Game();g.players.forEach(p=>{p.missing=2;p.hand=[];});g.phase='play';g.turn=0;
  g.players[0].hand=[0,1,2,3,4,5,6,7,8,9,9];g.players[0].melds=[{kind:'peng',tile:0,from:3}];g.players[1].hand=hand('1123456789 111');
  assert.equal(g.act('bugang',0),true);assert.equal(g.phase,'response');g.respond('hu');assert.equal(g.players[0].melds[0].kind,'peng');assert.equal(g.transfers.filter(t=>t.kind==='gang').length,0);assert.equal(g.discards.filter(d=>d.robbed).length,1);
});
test('wall exhaustion settles flower pig, ready hand, and refunds only received gang scores', () => {
  const g=new M.Game();g.phase='play';g.players.forEach(p=>{p.missing=2;p.hand=[];});
  g.players[0].hand=hand('123456789 1234');g.players[1].hand=hand('123456789 1123');g.players[2].hand=hand('123456 123456 1');g.players[3].hand=hand('1123456789 111');
  g.transfer(3,2,2,'暗杠','gang');g.end(true);
  assert.equal(g.checks[2],'花猪');assert.equal(g.transfers.filter(t=>t.reason==='查花猪').length,3);assert.equal(g.transfers.filter(t=>t.kind==='refund').length,1);assert.equal(g.players.reduce((n,p)=>n+p.delta,0),0);assert.deepEqual(g.totals,g.players.map(p=>p.delta));
});
test('AI uses only public information, not concealed opponent/wall order', () => {
  const g=new M.Game({random:rng(10)});g.exchange(M.exchangeChoice(g.players[0].hand));g.setMissing(M.chooseMissing(g.players[0].hand));
  const chosen=M.chooseDiscard(g,0);g.wall.reverse();for(let i=1;i<4;i++)g.players[i].hand.fill(26);
  assert.equal(M.chooseDiscard(g,0),chosen);
});
test('AI delay stays 0.5–1.5 seconds with independently sampled values', () => {
  const random=rng(123);const delays=Array.from({length:100},()=>M.aiDelay(random));assert.ok(delays.every(t=>t>=500&&t<=1500));assert.ok(new Set(delays).size>80);
});
test('40 complete deterministic AI games preserve all physical tiles, zero-sum scores and terminate', () => {
  for(let seed=1;seed<=40;seed++) {
    const g=new M.Game({random:rng(seed),dealer:seed%4});conserved(g);g.exchange(M.exchangeChoice(g.players[0].hand));g.setMissing(M.chooseMissing(g.players[0].hand));let n=0;
    while(g.phase!=='ended'&&n++<400) {
      if(g.phase==='response')assert.equal(g.respond(M.chooseResponse(g)),true);
      else {const a=M.chooseTurn(g);assert.equal(a.type==='discard'?g.discard(a.index):g.act(a.type,a.tile),true);}
      conserved(g);
    }
    assert.equal(g.phase,'ended','seed '+seed);assert.ok(n<400);
  }
});
