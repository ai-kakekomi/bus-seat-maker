/* 大量テスト: ランダムな申し込みを流して、決まりの違反を数える
 *   実行: node test/stress.js [件数（既定 300）]
 *   違反した件は、シードつきの id を出す（デバッグモードで同じ id を開ける） */
'use strict';
var path = require('path');
var S = require(path.join(__dirname, '..', 'js', 'seat.js'));
var C = require(path.join(__dirname, '..', 'js', 'checks.js'));
var G = require(path.join(__dirname, '..', 'js', 'gen.js'));

var N = Number(process.argv[2]) || 300;
var SPARES = [0, 1, 2, 4, 8];
var counts = {};
var bad = [];
var t0 = Date.now();

for (var i = 0; i < N; i++) {
  var layoutType = i % 4 === 3 ? '12x49' : '11x45';
  var c = G.makeCase({
    seed: i + 1,
    profile: i % 2 ? '意地悪' : 'ふだん',
    spare: SPARES[i % SPARES.length],
    days: 1 + (i % 4),
    layoutType: layoutType,
    usable: S.buildLayout(layoutType).usableSeatCount
  });
  var res = S.assign({ layoutType: c.layoutType, groups: c.groups, days: c.days });
  var found = [];
  res.days.forEach(function (day, d) {
    C.inspect(res.layout, res.groups, day).forEach(function (v) {
      counts[v.type] = (counts[v.type] || 0) + 1;
      found.push((d + 1) + '日目 ' + v.message);
    });
  });
  if (found.length) bad.push(c.id + '  ' + found.slice(0, 3).join(' / '));
}

console.log(N + '件 （' + ((Date.now() - t0) / 1000).toFixed(1) + '秒）  違反のあった件: ' + bad.length);
Object.keys(counts).forEach(function (k) { console.log('  ' + k + ': ' + counts[k]); });
bad.slice(0, 15).forEach(function (b) { console.log('  ✗ ' + b); });
process.exitCode = bad.length ? 1 : 0;
