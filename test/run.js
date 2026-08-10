/* ============================================================
 * バス座席表メーカー 自動テスト（外部パッケージ不要）
 *   実行: node test/run.js
 * ============================================================ */
'use strict';

var path = require('path');
var S = require(path.join(__dirname, '..', 'js', 'seat.js'));

var 通過 = 0, 失敗 = 0;
var 失敗詳細 = [];

function test(name, fn) {
  try {
    fn();
    通過++;
    console.log('  OK   ' + name);
  } catch (e) {
    失敗++;
    失敗詳細.push(name + ' … ' + e.message);
    console.log('  NG   ' + name + ' … ' + e.message);
  }
}
function eq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error((msg ? msg + ': ' : '') + '期待 ' + JSON.stringify(expected) + ' / 実際 ' + JSON.stringify(actual));
  }
}
function ok(cond, msg) { if (!cond) throw new Error(msg || '条件を満たしません'); }

function group(id, size, opt) {
  opt = opt || {};
  var members = [];
  var g = opt.genders || [];
  for (var i = 0; i < size; i++) members.push({ gender: g[i] || 'unknown' });
  return {
    id: id, size: size, members: members,
    frontOption: !!opt.frontOption,
    surname: opt.surname || '', fullName: opt.fullName || ''
  };
}
function seatRow(seatId) { return Number(String(seatId).split('-')[0].slice(1)); }
function seatCol(seatId) { return Number(String(seatId).split('-')[1]); }

// 席がひとつづきか（前後左右のとなり。通路をはさむ左右もとなりとして扱う）
function isConnected(seatIds) {
  if (seatIds.length <= 1) return true;
  var set = {};
  seatIds.forEach(function (id) { set[seatRow(id) + ',' + seatCol(id)] = true; });
  var first = seatIds[0];
  var queue = [[seatRow(first), seatCol(first)]];
  var seen = {}; seen[queue[0][0] + ',' + queue[0][1]] = true;
  var n = 1;
  while (queue.length) {
    var cur = queue.pop();
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
      var k = (cur[0] + d[0]) + ',' + (cur[1] + d[1]);
      if (set[k] && !seen[k]) { seen[k] = true; n++; queue.push([cur[0] + d[0], cur[1] + d[1]]); }
    });
  }
  return n === seatIds.length;
}

// グループの席（確保した空席を含む）が、ぴったり四角になっているか
function blocksOf(day, groupId) {
  return (day.blocks || []).filter(function (b) { return b.groupId === groupId; });
}
function isRectangle(seatIds) {
  var rows = seatIds.map(seatRow), cols = seatIds.map(seatCol);
  var r0 = Math.min.apply(null, rows), r1 = Math.max.apply(null, rows);
  var c0 = Math.min.apply(null, cols), c1 = Math.max.apply(null, cols);
  if ((r1 - r0 + 1) * (c1 - c0 + 1) !== seatIds.length) return false;
  var set = {};
  seatIds.forEach(function (id) { set[seatRow(id) + ',' + seatCol(id)] = true; });
  for (var r = r0; r <= r1; r++) {
    for (var c = c0; c <= c1; c++) if (!set[r + ',' + c]) return false;
  }
  return true;
}
// そのグループが占めている席（人＋確保した空席）
function ownedSeats(day, groupId) {
  var out = [];
  Object.keys(day.placements).forEach(function (id) {
    if (day.placements[id].groupId === groupId) out.push(id);
  });
  Object.keys(day.reserved || {}).forEach(function (id) {
    if (day.reserved[id] === groupId && out.indexOf(id) < 0) out.push(id);
  });
  return out;
}
function occupiedRows(day) {
  var rows = {};
  Object.keys(day.placements).forEach(function (id) { rows[seatRow(id)] = true; });
  return Object.keys(rows).map(Number).sort(function (a, b) { return a - b; });
}

console.log('\n--- 1. 座席レイアウト ---');

test('11列45席：総席数45・業務席2・利用可能43', function () {
  var L = S.buildLayout('11x45');
  eq(L.seatCount, 45, '総席数');
  eq(L.crewSeatCount, 2, '業務席');
  eq(L.usableSeatCount, 43, '利用可能席');
  eq(L.rows, 11, '列数');
});

test('12列49席：総席数49・業務席2・利用可能47', function () {
  var L = S.buildLayout('12x49');
  eq(L.seatCount, 49, '総席数');
  eq(L.crewSeatCount, 2, '業務席');
  eq(L.usableSeatCount, 47, '利用可能席');
  eq(L.rows, 12, '列数');
});

test('最後部列だけ5席、それ以外は4席', function () {
  ['11x45', '12x49'].forEach(function (t) {
    var L = S.buildLayout(t);
    for (var r = 1; r <= L.rows; r++) {
      var n = L.seats.filter(function (s) { return s.row === r; }).length;
      eq(n, r === L.lastRow ? 5 : 4, t + ' の' + r + '列目');
    }
  });
});

test('業務席は最前列の運転席側（右）2席だけ', function () {
  var L = S.buildLayout('11x45');
  var crew = L.seats.filter(function (s) { return s.isCrew; });
  eq(crew.length, 2, '業務席の数');
  crew.forEach(function (s) {
    eq(s.row, 1, '業務席の列');
    ok(s.col === 3 || s.col === 4, '業務席は右側');
  });
});

test('業務席にはお客様を配置しない', function () {
  var groups = [];
  for (var i = 1; i <= 43; i++) groups.push(group('g' + i, 1));
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  Object.keys(r.days[0].placements).forEach(function (sid) {
    var seat = r.layout.seats.filter(function (s) { return s.id === sid; })[0];
    ok(!seat.isCrew, '業務席 ' + sid + ' に配置された');
  });
});

console.log('\n--- 2. 前席オプション ---');

test('前席オプションのグループは前から3列目までに入る', function () {
  var groups = [
    group('g1', 4), group('g2', 4), group('g3', 4), group('g4', 4),
    group('g5', 2, { frontOption: true })
  ];
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  r.days[0].seatsOfGroup['g5'].forEach(function (sid) {
    ok(seatRow(sid) <= 3, '前席のはずが ' + sid);
  });
  eq(r.warnings.filter(function (w) { return w.type === 'front-overflow'; }).length, 0, '警告なし');
});

test('前席オプションが多すぎると溢れて警告が出る', function () {
  var groups = [];
  // 前3列の利用可能席は 4+4+4-2(業務席)=10席。12名ぶん申し込む
  for (var i = 1; i <= 6; i++) groups.push(group('f' + i, 2, { frontOption: true }));
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  ok(r.warnings.some(function (w) { return w.type === 'front-overflow'; }), '溢れの警告が出ていない');
});

test('前席オプションはずらす対象外（どの日も前3列のまま）', function () {
  var groups = [
    group('f1', 2, { frontOption: true }),
    group('g1', 4), group('g2', 4), group('g3', 4)
  ];
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 3 });
  r.days.forEach(function (d) {
    eq(d.groupOrder[0], 'f1', '前席オプションが先頭でない');
  });
  r.days.forEach(function (d, i) {
    d.seatsOfGroup['f1'].forEach(function (sid) {
      ok(seatRow(sid) <= 3, (i + 1) + '日目に前席から外れた: ' + sid);
    });
  });
});

console.log('\n--- 3. 相席（男女の同席回避・空席が多いときの相席なし） ---');

test('空席に余裕があるときは相席が発生しない', function () {
  var groups = [group('g1', 3), group('g2', 3), group('g3', 1), group('g4', 5)];
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  eq(r.sharing, false, '相席モード');
  eq(r.days[0].shared.length, 0, '相席の数');
});

test('満席に近いときは相席が起きる。男女の並びは避けるが、席が足りないときだけ例外', function () {
  // 43席に対して42名。男だけ／女だけの3名グループを詰められるだけ詰める
  var groups = [];
  for (var i = 1; i <= 14; i++) {
    groups.push(group('g' + i, 3, { genders: i % 2 ? ['male', 'male', 'male'] : ['female', 'female', 'female'] }));
  }
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  eq(r.sharing, true, '相席モード');
  ok(r.days[0].shared.length > 0, '相席が1件も起きていない（テスト条件が不適切）');

  // いちばん大事なのは、全員に席があること
  eq(Object.keys(r.days[0].placements).length, 42, '席にあぶれた人がいる');
  eq(r.warnings.filter(function (w) { return w.type === 'no-seat'; }).length, 0, '席不足の警告');

  // 男女が並ぶのは最後の手段。起きた場合は必ず知らせる
  var mixed = r.days[0].shared.filter(function (sh) { return sh.mixedGender; });
  var warned = r.warnings.filter(function (w) { return w.type === 'mixed-gender'; });
  if (mixed.length > 0) {
    ok(warned.length > 0, '男女が並んでいるのに警告が出ていない');
    ok(mixed.length <= 2, '男女の並びが多すぎる（' + mixed.length + '組）');
  } else {
    eq(warned.length, 0, '男女は並んでいないのに警告が出ている');
  }
});

test('席にゆとりがあるときは、男女の並びはまったく起きない', function () {
  var groups = [];
  for (var i = 1; i <= 10; i++) {
    groups.push(group('g' + i, 3, { genders: i % 2 ? ['male', 'male', 'male'] : ['female', 'female', 'female'] }));
  }
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 2 }); // 30名／43席
  r.days.forEach(function (day, di) {
    eq(day.shared.filter(function (sh) { return sh.mixedGender; }).length, 0,
      (di + 1) + '日目に男女が並んだ');
  });
  eq(r.warnings.filter(function (w) { return w.type === 'mixed-gender'; }).length, 0, '男女相席の警告');
});

test('席の数に収まる人数なら、誰も席にあぶれない', function () {
  var patterns = [
    [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],          // 42名
    [5, 5, 5, 5, 5, 5, 5, 5],                              // 40名
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 4, 5, 6, 5, 4],  // 43名
    [6, 6, 6, 6, 6, 6, 1],                                 // 37名
    [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3] // 43名
  ];
  patterns.forEach(function (sizes, pi) {
    var total = sizes.reduce(function (a, b) { return a + b; }, 0);
    var groups = sizes.map(function (n, i) { return group('g' + i, n); });
    var r = S.assign({ layoutType: '11x45', groups: groups, days: 3 });
    ok(total <= r.layout.usableSeatCount, 'パターン' + pi + ' が定員超過（テスト条件が不適切）');
    r.days.forEach(function (day, di) {
      eq(Object.keys(day.placements).length, total,
        'パターン' + pi + ' の' + (di + 1) + '日目で席にあぶれた人がいる');
    });
    eq(r.warnings.filter(function (w) { return w.type === 'no-seat'; }).length, 0,
      'パターン' + pi + ' で席不足の警告');
  });
});

test('性別が未入力の人は誰とでも相席できる（判定は入力頼み）', function () {
  var groups = [];
  for (var i = 1; i <= 14; i++) groups.push(group('g' + i, 3));
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  eq(r.warnings.filter(function (w) { return w.type === 'mixed-gender'; }).length, 0, '未入力で警告は出さない');
});

console.log('\n--- 3の2. グループを囲む枠（四角・L字） ---');

test('各グループの席はひとつながりになる（斜めだけの接続はしない）', function () {
  var groups = [group('g1', 2), group('g2', 4), group('g3', 3), group('g4', 6), group('g5', 1), group('g6', 5)];
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  var day = r.days[0];
  groups.forEach(function (g) {
    var owned = ownedSeats(day, g.id);
    ok(owned.length >= g.size, g.id + ' の席が足りない');
    ok(isConnected(owned), g.id + ' の席が離れている: ' + owned.join(','));
  });
  day.blocks.forEach(function (b) {
    ok(isConnected(b.seatIds), 'ブロックが離れている: ' + b.seatIds.join(','));
  });
});

test('3名グループはL字（2席＋となりの1席）で空席ゼロになる', function () {
  var r = S.assign({ layoutType: '11x45', groups: [group('g1', 3)], days: 1 });
  var day = r.days[0];
  var bs = blocksOf(day, 'g1');
  eq(bs.length, 1, 'ブロック数');
  eq(bs[0].seatIds.length, 3, '枠に含まれる席数（空席を含めない）');
  eq(bs[0].people, 3, '枠の中の人数');
  eq(bs[0].isRect, false, 'L字になっていない（四角のまま）');
  ok(isConnected(bs[0].seatIds), 'L字がつながっていない');
  eq(Object.keys(day.reserved).length, 0, '枠の中の取り置き空席');
});

test('5名グループもL字で空席ゼロになる', function () {
  var r = S.assign({ layoutType: '11x45', groups: [group('g1', 5)], days: 1 });
  var bs = blocksOf(r.days[0], 'g1');
  eq(bs.length, 1, 'ブロック数');
  eq(bs[0].seatIds.length, 5, '枠に含まれる席数');
  eq(bs[0].people, 5, '枠の中の人数');
  ok(isConnected(bs[0].seatIds), 'つながっていない');
});

test('1名グループの枠は1席ぶん（2人組に見えない）', function () {
  var r = S.assign({ layoutType: '11x45', groups: [group('g1', 1), group('g2', 1), group('g3', 4)], days: 1 });
  var day = r.days[0];
  ['g1', 'g2'].forEach(function (id) {
    var bs = blocksOf(day, id);
    eq(bs.length, 1, id + ' のブロック数');
    eq(bs[0].seatIds.length, 1, id + ' の枠に含まれる席数');
    eq(bs[0].people, 1, id + ' の枠の中の人数');
    eq(ownedSeats(day, id).length, 1, id + ' が持っている席数');
  });
  // 相席回避のために空けた席は「枠の外」にあること
  Object.keys(day.blocked).forEach(function (sid) {
    day.blocks.forEach(function (b) {
      ok(b.seatIds.indexOf(sid) < 0, '取り置きの空席 ' + sid + ' が枠の中に入っている');
    });
    ok(!day.placements[sid], sid + ' に人が座っている');
  });
});

test('1名グループでも相席は起きない（となりは空けておく）', function () {
  var groups = [group('g1', 1, { genders: ['male'] }), group('g2', 1, { genders: ['female'] }),
                group('g3', 1, { genders: ['female'] }), group('g4', 2)];
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  eq(r.sharing, false, '相席モード');
  eq(r.days[0].shared.length, 0, '相席の数');
});

test('席が窮屈なときはL字を積極的に使って空席を出さない', function () {
  var groups = [];
  for (var i = 1; i <= 14; i++) groups.push(group('g' + i, 3)); // 42名／43席
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  eq(r.sharing, true, '相席モード');
  eq(Object.keys(r.days[0].placements).length, 42, '座れた人数');
  eq(Object.keys(r.days[0].reserved).length, 0, '取り置きの空席');
});

test('4名グループは正方形（2列×2席）または同一列の4席になる', function () {
  var groups = [group('g1', 4), group('g2', 4), group('g3', 4), group('g4', 4)];
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  groups.forEach(function (g) {
    var bs = blocksOf(r.days[0], g.id);
    eq(bs.length, 1, g.id + ' が複数ブロックに割れた');
    var b = bs[0];
    eq(b.isRect, true, g.id + ' が四角でない');
    var w = b.col1 - b.col0 + 1, h = b.row1 - b.row0 + 1;
    ok((w === 2 && h === 2) || (w === 4 && h === 1), g.id + ' の形が ' + w + '席×' + h + '列');
  });
});

test('ブロックは1グループにつき1つ（分割の必要がないとき）', function () {
  var groups = [group('g1', 2), group('g2', 3), group('g3', 4), group('g4', 6)];
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  groups.forEach(function (g) {
    eq(blocksOf(r.days[0], g.id).length, 1, g.id + ' のブロック数');
  });
  eq(r.warnings.filter(function (w) { return w.type === 'split'; }).length, 0, '分割の警告');
});

test('通路を跨ぐブロックは左右にまたがる1つの枠になる', function () {
  // 1列目は業務席があるので左2席だけ。2列目からの8名グループは 4席×2列（通路を跨ぐ）
  var r = S.assign({ layoutType: '11x45', groups: [group('先', 2), group('g1', 8)], days: 1 });
  var bs = blocksOf(r.days[0], 'g1');
  eq(bs.length, 1, 'ブロック数');
  eq(bs[0].col0, 1, '左端');
  eq(bs[0].col1, 4, '右端');
  eq(bs[0].trackStart, 1, '描画の左端');
  eq(bs[0].trackEnd, 5, '描画の右端（通路を跨ぐ）');
  eq(bs[0].bridges.length, 2, '通路をつなぐ線の数（2列ぶん）');
});

test('ラベルは1ブロックにつき1か所ぶんだけ決まる', function () {
  var r = S.assign({ layoutType: '11x45', groups: [group('g1', 3), group('g2', 5)], days: 1 });
  r.days[0].blocks.forEach(function (b) {
    ok(b.label, b.groupId + ' のラベル位置がない');
    // ラベルの四角は、そのブロックの中に収まっていること
    for (var rr = b.label.row0; rr <= b.label.row1; rr++) {
      for (var cc = b.label.col0; cc <= b.label.col1; cc++) {
        ok(b.seatIds.indexOf('r' + rr + '-' + cc) >= 0,
          b.groupId + ' のラベルが枠からはみ出している');
      }
    }
  });
});

test('席を入れ替えたあともブロックは作り直される', function () {
  var r = S.assign({ layoutType: '11x45', groups: [group('g1', 4), group('g2', 4)], days: 1 });
  var day = r.days[0];
  eq(blocksOf(day, 'g1').length, 1, '入れ替え前');
  var a = day.seatsOfGroup['g1'][0];
  var far = r.layout.seats.filter(function (s) {
    return !s.isCrew && !day.placements[s.id] && !day.reserved[s.id] && !day.blocked[s.id];
  }).pop().id;
  S.swapSeats(r.layout, day, a, far);
  ok(blocksOf(day, 'g1').length >= 1, '入れ替え後にブロックが無い');
  ok(day.blocks.every(function (b) { return isConnected(b.seatIds); }), 'ブロックがつながっていない');
});

console.log('\n--- 3の3. グループごと動かす ---');

test('2つのグループの場所を入れ替えられる', function () {
  var r = S.assign({ layoutType: '11x45', groups: [group('g1', 2), group('g2', 4), group('g3', 2)], days: 1 });
  var day = r.days[0];
  var before1 = S.originOfGroup(day, 'g1');
  var before3 = S.originOfGroup(day, 'g3');

  var res = S.swapGroups(r.layout, r.groups, day, 'g1', 'g3');
  eq(res.ok, true, '入れ替えの成否: ' + res.message);
  var after1 = S.originOfGroup(day, 'g1');
  var after3 = S.originOfGroup(day, 'g3');
  eq(after1.row, before3.row, 'g1が g3のいた列に来ていない');
  eq(after3.row, before1.row, 'g3が g1のいた列に来ていない');
  eq(day.seatsOfGroup['g1'].length, 2, 'g1の人数');
  eq(day.seatsOfGroup['g3'].length, 2, 'g3の人数');
});

test('人数が違うグループどうしでも入れ替えられる', function () {
  var r = S.assign({ layoutType: '11x45', groups: [group('g1', 2), group('g2', 4), group('g3', 5)], days: 1 });
  var day = r.days[0];
  var before1 = S.originOfGroup(day, 'g1');
  var before3 = S.originOfGroup(day, 'g3');

  var res = S.swapGroups(r.layout, r.groups, day, 'g1', 'g3');
  eq(res.ok, true, '入れ替えの成否: ' + res.message);
  eq(day.seatsOfGroup['g1'].length, 2, 'g1の人数');
  eq(day.seatsOfGroup['g3'].length, 5, 'g3の人数');
  ok(isConnected(ownedSeats(day, 'g3')), 'g3が離れてしまった');

  // 少ない人数のほうは、相手のいた場所にぴったり入る
  var after1 = S.originOfGroup(day, 'g1');
  eq(after1.row + '-' + after1.col, before3.row + '-' + before3.col, 'g1がg3のいた場所に来ていない');
  // 多い人数のほうは、相手のいた場所に入りきらなければ近いところへ
  var after3 = S.originOfGroup(day, 'g3');
  ok(after3.row !== before3.row || after3.col !== before3.col, 'g3が動いていない');
  ok(after3.row >= before1.row, 'g3が元より前に行ってしまった');
});

test('空いているところへグループを引っ越しできる', function () {
  var r = S.assign({ layoutType: '11x45', groups: [group('g1', 2), group('g2', 4)], days: 1 });
  var day = r.days[0];
  var res = S.moveGroup(r.layout, r.groups, day, 'g1', 'r8-1');
  eq(res.ok, true, '移動の成否: ' + res.message);
  var o = S.originOfGroup(day, 'g1');
  eq(o.row, 8, '移動先の列');
  eq(o.col, 1, '移動先の席');
  eq(day.seatsOfGroup['g1'].length, 2, 'g1の人数');
  ok(isConnected(ownedSeats(day, 'g1')), 'g1が離れてしまった');
});

test('引っ越し先が使えないときは元のままにする', function () {
  var groups = [];
  for (var i = 1; i <= 21; i++) groups.push(group('g' + i, 2)); // 42名／43席でほぼ満席
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  var day = r.days[0];
  var before = JSON.stringify(day.placements);
  var res = S.moveGroup(r.layout, r.groups, day, 'g1', 'r2-1'); // すでに埋まっている
  ok(res.ok === true || res.ok === false, '戻り値がある');
  if (!res.ok) eq(JSON.stringify(day.placements), before, '失敗したのに座席が変わった');
  eq(day.seatsOfGroup['g1'].length, 2, 'g1の人数');
});

test('グループを動かしても、ほかのグループはそのまま', function () {
  var r = S.assign({ layoutType: '11x45', groups: [group('g1', 2), group('g2', 4), group('g3', 2)], days: 1 });
  var day = r.days[0];
  var before2 = day.seatsOfGroup['g2'].slice().sort().join(',');
  S.moveGroup(r.layout, r.groups, day, 'g1', 'r9-3');
  eq(day.seatsOfGroup['g2'].slice().sort().join(','), before2, 'g2が動いてしまった');
});

console.log('\n--- 3の3の2. ブロックの形の決まり（横並び優先・奥行き2列まで） ---');

// ブロックの寸法（何席幅 × 何列）
function blockSize(b) {
  return { w: b.col1 - b.col0 + 1, h: b.row1 - b.row0 + 1 };
}
// 形の決まりに反しているブロックを集める
function badBlocks(day) {
  return (day.blocks || []).filter(function (b) {
    var s = blockSize(b);
    return s.h > 2 || (s.h >= 2 && s.w < 2);
  });
}

test('2名グループは必ず横並び（縦に並べない）', function () {
  var groups = [];
  for (var i = 1; i <= 12; i++) groups.push(group('g' + i, 2));
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 2 });
  r.days.forEach(function (day, di) {
    groups.forEach(function (g) {
      var bs = blocksOf(day, g.id);
      eq(bs.length, 1, (di + 1) + '日目の' + g.id + ' のブロック数');
      var s = blockSize(bs[0]);
      eq(s.h, 1, (di + 1) + '日目の' + g.id + ' が縦並びになっている');
      eq(s.w, 2, (di + 1) + '日目の' + g.id + ' の横幅');
      eq(seatRow(bs[0].seatIds[0]), seatRow(bs[0].seatIds[1]), '同じ列に並んでいない');
    });
  });
});

test('どのブロックも奥行きは2列まで', function () {
  var sizes = [1, 2, 3, 4, 5, 6, 7, 8];
  sizes.forEach(function (n) {
    var r = S.assign({ layoutType: '11x45', groups: [group('g1', n)], days: 1 });
    var bs = blocksOf(r.days[0], 'g1');
    bs.forEach(function (b) {
      var s = blockSize(b);
      ok(s.h <= 2, n + '名の形が ' + s.w + '席幅×' + s.h + '列（奥行きが深すぎる）');
      ok(!(s.h >= 2 && s.w < 2), n + '名が縦並びになっている');
    });
  });
});

test('3名・4名は縦1列に並べない', function () {
  [3, 4].forEach(function (n) {
    var r = S.assign({ layoutType: '11x45', groups: [group('g1', n)], days: 1 });
    var b = blocksOf(r.days[0], 'g1')[0];
    var s = blockSize(b);
    ok(s.w >= 2, n + '名が幅1席の縦並びになっている');
    ok(s.h <= 2, n + '名の奥行きが ' + s.h + '列');
  });
});

test('5名は2列以内に収まる（前後に間延びしない）', function () {
  var r = S.assign({ layoutType: '11x45', groups: [group('g1', 5)], days: 1 });
  var b = blocksOf(r.days[0], 'g1')[0];
  var s = blockSize(b);
  ok(s.h <= 2, '5名の奥行きが ' + s.h + '列');
  eq(b.seatIds.length, 5, '席数');
});

test('いろいろな込み具合でも、形の決まりを破らない', function () {
  var patterns = [
    [2, 2, 2, 2, 2, 2],
    [1, 1, 1, 1, 2, 3, 4],
    [4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    [6, 5, 4, 3, 2, 1, 6, 5, 4, 3],
    [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
    [8, 7, 6, 5, 4, 3, 2, 1, 2, 3]
  ];
  patterns.forEach(function (sizes, pi) {
    var groups = sizes.map(function (n, i) { return group('g' + i, n); });
    ['11x45', '12x49'].forEach(function (type) {
      var r = S.assign({ layoutType: type, groups: groups, days: 2 });
      r.days.forEach(function (day, di) {
        var bad = badBlocks(day);
        // 形の決まりを外すのは、必ず何かの注意とセットであること
        // （前後に長い／形が整わない／泣き別れ のいずれか）
        bad.forEach(function (b) {
          var warned = r.warnings.some(function (w) {
            return (w.type === 'deep-block' || w.type === 'odd-shape' || w.type === 'split') &&
              w.groupId === b.groupId;
          });
          ok(warned, 'パターン' + pi + '(' + type + ') ' + (di + 1) + '日目：' +
            b.groupId + ' が ' + blockSize(b).w + '席幅×' + blockSize(b).h + '列なのに警告なし');
        });
      });
    });
  });
});

test('5名は「片側だけ」か「4＋1」になる（2＋3に割らない）', function () {
  // 前に置くグループを変えて、5名グループの入り方をいろいろ試す
  [[], [2], [4], [2, 2], [2, 4], [4, 4], [1, 2]].forEach(function (before) {
    var groups = before.map(function (n, i) { return group('b' + i, n); });
    groups.push(group('five', 5));
    var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
    var bs = blocksOf(r.days[0], 'five');
    eq(bs.length, 1, '前提' + before.join('+') + ' でブロックが分かれた');

    var left = 0, right = 0;
    bs[0].seatIds.forEach(function (id) {
      if (seatRow(id) === r.layout.lastRow) return; // 最後部列は通路なし
      if (seatCol(id) <= 2) left++; else right++;
    });
    if (left > 0 && right > 0) {
      eq(Math.min(left, right), 1,
        '前提' + before.join('+') + ' で通路の両側が ' + left + '＋' + right + ' に割れた（4＋1にしたい）');
    }
  });
});

test('7名も、通路の両側が半端に割れないようにする', function () {
  var r = S.assign({ layoutType: '11x45', groups: [group('先', 2), group('seven', 7)], days: 1 });
  var bs = blocksOf(r.days[0], 'seven');
  eq(bs.length, 1, 'ブロック数');
  var left = 0, right = 0;
  bs[0].seatIds.forEach(function (id) {
    if (seatCol(id) <= 2) left++; else right++;
  });
  // 片側は最大4席なので 4＋3 が最も偏った形
  ok(Math.max(left, right) >= 4, '片側に寄せられていない（' + left + '＋' + right + '）');
});

test('ほぼ満席でも、形の決まりを破らずに全員が座れる', function () {
  var groups = fullHouseGroups();
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  eq(Object.keys(r.days[0].placements).length, 42, '着席した人数');
  eq(badBlocks(r.days[0]).length, 0, '形の決まりを破ったブロック: ' +
    badBlocks(r.days[0]).map(function (b) { return b.groupId; }).join(','));
  eq(r.warnings.filter(function (w) { return w.type === 'deep-block'; }).length, 0, '前後に長い形の警告');
});

test('満席近くでは、泣き別れより「1かたまりのまま縦長」を選ぶ', function () {
  // 41名／43席。最後の2名が入る場所が縦にしか残らない構成
  var sizes = [1, 3, 1, 5, 2, 2, 2, 2, 3, 3, 5, 3, 3, 2, 2, 2];
  var groups = sizes.map(function (n, i) { return group('g' + i, n); });
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  var day = r.days[0];

  eq(Object.keys(day.placements).length, 41, '全員が座れていない');
  eq(r.warnings.filter(function (w) { return w.type === 'split'; }).length, 0,
    '泣き別れが起きた（縦長で1かたまりにできるはず）');

  var odd = r.warnings.filter(function (w) {
    return w.type === 'odd-shape' || w.type === 'deep-block';
  });
  ok(odd.length >= 1, '形をゆるめた警告が出ていない');

  // 警告の出たグループは、離れずに1かたまりのままであること
  odd.forEach(function (w) {
    eq(blocksOf(day, w.groupId).length, 1, w.groupId + ' が分かれてしまった');
  });
  // どのグループも1かたまり
  groups.forEach(function (g) {
    eq(blocksOf(day, g.id).length, 1, g.id + ' のかたまりの数');
  });
});

test('泣き別れの警告はいちばん重い扱い（先頭・error）', function () {
  var groups = fullHouseGroups();
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  r.warnings.forEach(function (w) {
    if (w.type === 'split' || w.type === 'no-seat') eq(w.level, 'error', w.type + ' の重み');
    else eq(w.level, 'warn', w.type + ' の重み');
  });

  // 見直しの一覧でも、重いものが先に並ぶ
  var day = r.days[0];
  S.moveGroup(r.layout, r.groups, day, 'g1', 'r9-1');
  var issues = S.inspectDay(r.layout, r.groups, day);
  var firstWarn = -1, lastError = -1;
  issues.forEach(function (i, idx) {
    if (i.level === 'error') lastError = idx;
    else if (firstWarn < 0) firstWarn = idx;
  });
  if (lastError >= 0 && firstWarn >= 0) ok(lastError < firstWarn, '重いものが後ろに回っている');
});

test('手で縦長にしてしまったら、見直しで注意が出る', function () {
  var r = S.assign({ layoutType: '11x45', groups: [group('g1', 3), group('g2', 4)], days: 1 });
  var day = r.days[0];
  eq(S.inspectDay(r.layout, r.groups, day).length, 0, '動かす前');

  // g1 の1席を、前後に離れた席へ動かして縦長のかたまりを作る
  var seats = day.seatsOfGroup['g1'];
  var top = seats.map(seatRow).sort(function (a, b) { return a - b; })[0];
  var target = 'r' + (top + 2) + '-' + seatCol(seats[0]);
  var free = r.layout.seats.filter(function (s) {
    return s.id === target && !day.placements[s.id] && !day.reserved[s.id];
  });
  if (free.length) {
    S.swapSeats(r.layout, day, seats[seats.length - 1], target);
    var deep = S.inspectDay(r.layout, r.groups, day).filter(function (i) {
      return i.type === 'deep-block' || i.type === 'vertical-pair' || i.type === 'split';
    });
    ok(deep.length >= 1, '縦長にしたのに注意が出ない');
  }
});

console.log('\n--- 3の4. 失敗したときの理由コード ---');

test('業務席を指定したら crew-seat', function () {
  var r = S.assign({ layoutType: '11x45', groups: [group('g1', 2), group('g2', 2)], days: 1 });
  var day = r.days[0];
  var crew = r.layout.seats.filter(function (s) { return s.isCrew; })[0].id;
  var before = JSON.stringify(day.placements);

  var res = S.moveGroup(r.layout, r.groups, day, 'g1', crew);
  eq(res.ok, false, '移動の成否');
  eq(res.reason, 'crew-seat', '理由コード');
  eq(JSON.stringify(day.placements), before, '座席が変わってしまった');

  var res2 = S.swapSeats(r.layout, day, day.seatsOfGroup['g1'][0], crew);
  eq(res2.ok, false, '席入れ替えの成否');
  eq(res2.reason, 'crew-seat', '理由コード');
});

test('同じグループの席を指定したら same-group', function () {
  var r = S.assign({ layoutType: '11x45', groups: [group('g1', 4), group('g2', 2)], days: 1 });
  var day = r.days[0];
  var mine = day.seatsOfGroup['g1'][1];
  var res = S.moveGroup(r.layout, r.groups, day, 'g1', mine);
  eq(res.ok, false, '移動の成否');
  eq(res.reason, 'same-group', '理由コード');

  var res2 = S.swapGroups(r.layout, r.groups, day, 'g1', 'g1');
  eq(res2.ok, false, '入れ替えの成否');
  eq(res2.reason, 'same-group', '理由コード');
});

test('同じ席を2回指定したら same-seat', function () {
  var r = S.assign({ layoutType: '11x45', groups: [group('g1', 2)], days: 1 });
  var day = r.days[0];
  var sid = day.seatsOfGroup['g1'][0];
  var res = S.swapSeats(r.layout, day, sid, sid);
  eq(res.ok, false, '成否');
  eq(res.reason, 'same-seat', '理由コード');
});

test('空きが足りないときは no-room（座席は元のまま）', function () {
  var groups = [];
  for (var i = 1; i <= 25; i++) groups.push(group('g' + i, 2)); // 50名／43席
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  var day = r.days[0];

  // 席が用意できなかったグループを探す
  var homeless = null;
  r.groups.forEach(function (g) {
    if (!homeless && (day.seatsOfGroup[g.id] || []).length === 0) homeless = g.id;
  });
  ok(homeless, '席なしのグループがない（テスト条件が不適切）');

  var before = JSON.stringify(day.placements);
  var res = S.moveGroup(r.layout, r.groups, day, homeless, 'r5-1');
  eq(res.ok, false, '移動の成否');
  eq(res.reason, 'no-room', '理由コード');
  eq(res.size, 2, '人数（画面のメッセージに使う）');
  eq(JSON.stringify(day.placements), before, '失敗したのに座席が変わった');
});

test('知らないグループ・席なら not-found 系', function () {
  var r = S.assign({ layoutType: '11x45', groups: [group('g1', 2)], days: 1 });
  var day = r.days[0];
  eq(S.moveGroup(r.layout, r.groups, day, 'なにこれ', 'r5-1').reason, 'group-not-found');
  eq(S.moveGroup(r.layout, r.groups, day, 'g1', 'r99-9').reason, 'seat-not-found');
  eq(S.swapSeats(r.layout, day, 'r99-9', 'r5-1').reason, 'seat-not-found');
});

test('うまくいったときは ok と理由コードが返る', function () {
  var r = S.assign({ layoutType: '11x45', groups: [group('g1', 2), group('g2', 2)], days: 1 });
  var day = r.days[0];
  eq(S.moveGroup(r.layout, r.groups, day, 'g1', 'r8-1').reason, 'moved');
  eq(S.swapGroups(r.layout, r.groups, day, 'g1', 'g2').reason, 'swapped');
  eq(S.swapSeats(r.layout, day, day.seatsOfGroup['g1'][0], 'r10-4').reason, 'swapped');
});

console.log('\n--- 3の5. 手で直したあとの見直し ---');

test('自動で決めたあとは注意が出ない', function () {
  var groups = [
    group('f1', 2, { frontOption: true, genders: ['male', 'female'] }),
    group('g1', 4), group('g2', 3), group('g3', 1), group('g4', 5)
  ];
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 2 });
  r.days.forEach(function (day, di) {
    var issues = S.inspectDay(r.layout, r.groups, day);
    eq(issues.length, 0, (di + 1) + '日目の注意: ' + issues.map(function (i) { return i.message; }).join(' / '));
  });
});

test('前席オプション組を後ろに動かすと注意が出る', function () {
  var groups = [group('f1', 2, { frontOption: true }), group('g1', 4), group('g2', 4)];
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  var day = r.days[0];
  eq(S.inspectDay(r.layout, r.groups, day).length, 0, '動かす前');

  var res = S.moveGroup(r.layout, r.groups, day, 'f1', 'r7-1');
  eq(res.ok, true, '移動の成否');

  var issues = S.inspectDay(r.layout, r.groups, day);
  var front = issues.filter(function (i) { return i.type === 'front-out'; });
  eq(front.length, 1, '前席オプションの注意');
  eq(front[0].groupId, 'f1', '対象グループ');
  ok(front[0].message.indexOf('お客様A') >= 0, 'グループの記号が入っていない: ' + front[0].message);
  ok(front[0].message.indexOf('前席オプション') >= 0, '前席オプションと書かれていない');
  ok(front[0].message.indexOf('4列目以降') >= 0, '列の説明が入っていない: ' + front[0].message);
});

test('手で入れ替えて男女が相席になると注意が出る', function () {
  // 男性2名と女性2名を、通路をはさまない となりどうしにする
  var groups = [
    group('g1', 2, { genders: ['male', 'male'] }),
    group('g2', 2, { genders: ['female', 'female'] }),
    group('g3', 2, { genders: ['male', 'male'] })
  ];
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  var day = r.days[0];
  eq(S.inspectDay(r.layout, r.groups, day).length, 0, '入れ替える前');

  // g1 の1席と g2 の1席を入れ替えて、男女が並ぶ状態を作る
  var a = day.seatsOfGroup['g1'][1];
  var b = day.seatsOfGroup['g2'][0];
  var res = S.swapSeats(r.layout, day, a, b);
  eq(res.ok, true, '入れ替えの成否');

  var issues = S.inspectDay(r.layout, r.groups, day);
  var mixed = issues.filter(function (i) { return i.type === 'mixed-gender'; });
  ok(mixed.length >= 1, '男女相席の注意が出ていない');
  ok(/\d+列目で男女が相席になっています。/.test(mixed[0].message), 'メッセージの形: ' + mixed[0].message);

  // 同じ内容の注意が重複して出ないこと
  var texts = issues.map(function (i) { return i.type + '|' + i.message; });
  eq(texts.length, texts.filter(function (t, i) { return texts.indexOf(t) === i; }).length, '重複した注意');
});

test('グループが離れ離れになると注意が出る', function () {
  var r = S.assign({ layoutType: '11x45', groups: [group('g1', 4), group('g2', 4)], days: 1 });
  var day = r.days[0];
  eq(S.inspectDay(r.layout, r.groups, day).length, 0, '動かす前');

  var far = r.layout.seats.filter(function (s) {
    return !s.isCrew && !day.placements[s.id] && !day.reserved[s.id] && !day.blocked[s.id];
  }).pop().id;
  S.swapSeats(r.layout, day, day.seatsOfGroup['g1'][0], far);

  var issues = S.inspectDay(r.layout, r.groups, day);
  var split = issues.filter(function (i) { return i.type === 'split'; });
  eq(split.length, 1, '離れ離れの注意');
  eq(split[0].groupId, 'g1', '対象グループ');
});

test('注意のメッセージには個人名を出さない（記号だけ）', function () {
  var groups = [
    group('f1', 2, { frontOption: true, surname: '山田' }),
    group('g1', 4, { surname: '鈴木' }), group('g2', 4, { surname: '佐藤' })
  ];
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1, useRealName: true });
  var day = r.days[0];
  S.moveGroup(r.layout, r.groups, day, 'f1', 'r7-1');
  S.inspectDay(r.layout, r.groups, day).forEach(function (i) {
    ['山田', '鈴木', '佐藤'].forEach(function (n) {
      ok(i.message.indexOf(n) < 0, '注意に名字が出ている: ' + i.message);
    });
  });
});

console.log('\n--- 3の6. 自動で割り当て直したときのリセット ---');

// 1日ぶんの座席状態をそのまま文字列にする（比較用）
function dayState(day) {
  return JSON.stringify({
    p: sortedEntries(day.placements, function (v) { return v.groupId + ':' + v.gender; }),
    r: sortedEntries(day.reserved, function (v) { return v; }),
    b: sortedEntries(day.blocked, function (v) { return v; })
  });
}
function sortedEntries(map, fmt) {
  return Object.keys(map || {}).sort().map(function (k) { return k + '=' + fmt(map[k]); });
}
function allState(r) { return r.days.map(dayState).join('||'); }

test('手で直したあと割り当て直すと、初回とまったく同じになる', function () {
  var input = {
    layoutType: '11x45',
    days: 3,
    groups: [
      group('f1', 2, { frontOption: true }), group('f2', 2, { frontOption: true }),
      group('g1', 4), group('g2', 3), group('g3', 1), group('g4', 5), group('g5', 2)
    ]
  };
  var first = S.assign(input);
  var before = allState(first);

  // 3日ぶん、いろいろ手で直す
  S.moveGroup(first.layout, first.groups, first.days[0], 'g1', 'r9-1');
  S.swapGroups(first.layout, first.groups, first.days[1], 'g2', 'g4');
  S.swapSeats(first.layout, first.days[2], first.days[2].seatsOfGroup['g1'][0], 'r10-4');
  ok(allState(first) !== before, '手で直しても変化していない（テスト条件が不適切）');

  // 同じ入力で割り当て直す
  var again = S.assign(input);
  eq(allState(again), before, '割り当て直した結果が初回と違う');
});

test('割り当て直しは日ごとの残りかすを持ち越さない', function () {
  var input = {
    layoutType: '12x49', days: 2,
    groups: [group('g1', 3), group('g2', 4), group('g3', 2)]
  };
  var first = S.assign(input);
  var before = first.days.map(dayState);

  // 1日目だけ大きく崩す
  S.moveGroup(first.layout, first.groups, first.days[0], 'g2', 'r11-1');
  S.moveGroup(first.layout, first.groups, first.days[0], 'g1', 'r10-3');

  var again = S.assign(input);
  again.days.forEach(function (day, i) {
    eq(dayState(day), before[i], (i + 1) + '日目が初回と違う');
  });
  // 見直しの注意も出ない状態に戻っていること
  again.days.forEach(function (day, i) {
    eq(S.inspectDay(again.layout, again.groups, day).length, 0, (i + 1) + '日目の注意');
  });
});

test('手で直しても、元の割り当て結果のグループ情報は壊れない', function () {
  var input = { layoutType: '11x45', days: 1, groups: [group('g1', 4), group('g2', 2)] };
  var r = S.assign(input);
  var membersBefore = JSON.stringify(r.groups.map(function (g) { return g.members; }));
  S.moveGroup(r.layout, r.groups, r.days[0], 'g1', 'r8-1');
  S.swapGroups(r.layout, r.groups, r.days[0], 'g1', 'g2');
  eq(JSON.stringify(r.groups.map(function (g) { return g.members; })), membersBefore, 'メンバー情報が書き換わった');
});

console.log('\n--- 3の7. 前席オプションの警告が出すぎないか ---');

test('前3列に収まっている前席組には front-out を出さない', function () {
  var groups = [
    group('f1', 2, { frontOption: true }), group('f2', 2, { frontOption: true }),
    group('g1', 4), group('g2', 4), group('g3', 3)
  ];
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 3 });

  r.days.forEach(function (day, di) {
    // 前提：前席組はどの日も前3列に収まっている
    ['f1', 'f2'].forEach(function (id) {
      day.seatsOfGroup[id].forEach(function (sid) {
        ok(seatRow(sid) <= 3, (di + 1) + '日目に' + id + 'が前3列を出た');
      });
    });
    // 前席組に触れない手動編集をしても、front-out は出ない
    S.moveGroup(r.layout, r.groups, day, 'g3', 'r9-1');
    var issues = S.inspectDay(r.layout, r.groups, day).filter(function (i) { return i.type === 'front-out'; });
    eq(issues.length, 0, (di + 1) + '日目に誤警告: ' + issues.map(function (i) { return i.message; }).join(' / '));
  });
});

test('3列目ちょうどは警告にならず、4列目から警告になる（境界）', function () {
  var r = S.assign({ layoutType: '11x45', groups: [group('f1', 2, { frontOption: true }), group('g1', 4)], days: 1 });
  var day = r.days[0];

  // 3列目ちょうどに動かす → 警告なし
  eq(S.moveGroup(r.layout, r.groups, day, 'f1', 'r3-3').ok, true, '3列目への移動');
  eq(Math.max.apply(null, day.seatsOfGroup['f1'].map(seatRow)), 3, '3列目にいること');
  eq(S.inspectDay(r.layout, r.groups, day).filter(function (i) { return i.type === 'front-out'; }).length,
     0, '3列目で警告が出た');

  // 4列目に動かす → 警告あり
  eq(S.moveGroup(r.layout, r.groups, day, 'f1', 'r4-3').ok, true, '4列目への移動');
  eq(Math.min.apply(null, day.seatsOfGroup['f1'].map(seatRow)), 4, '4列目にいること');
  eq(S.inspectDay(r.layout, r.groups, day).filter(function (i) { return i.type === 'front-out'; }).length,
     1, '4列目で警告が出ない');
});

test('警告が出るのは、その日に実際に逸脱している日だけ', function () {
  var groups = [group('f1', 2, { frontOption: true }), group('g1', 4), group('g2', 4)];
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 3 });

  // 2日目だけ前席組を後ろへ
  S.moveGroup(r.layout, r.groups, r.days[1], 'f1', 'r8-1');

  eq(S.inspectDay(r.layout, r.groups, r.days[0]).length, 0, '1日目');
  eq(S.inspectDay(r.layout, r.groups, r.days[1])
      .filter(function (i) { return i.type === 'front-out'; }).length, 1, '2日目');
  eq(S.inspectDay(r.layout, r.groups, r.days[2]).length, 0, '3日目');
});

console.log('\n--- 3の8. ほぼ満席のとき ---');

// （fullHouseGroups は下の「ほぼ満席」節で定義しています）
function fullHouseGroups() {
  var M = 'male', F = 'female';
  return [
    group('f1', 2, { frontOption: true, genders: [M, F] }),
    group('f2', 2, { frontOption: true, genders: [F, F] }),
    group('f3', 3, { frontOption: true, genders: [M, M, F] }),
    group('f4', 4, { frontOption: true, genders: [M, F, F, M] }),
    group('a', 4, { genders: [M, F, F, F] }),
    group('b', 3, { genders: [M, M, F] }),
    group('c', 5, { genders: [M, M, M, F, F] }),
    group('d', 1, { genders: [M] }),
    group('e', 2, { genders: [M, F] }),
    group('h', 3, { genders: [F, F, F] }),
    group('i', 1, { genders: [F] }),
    group('j', 6, { genders: [M, M, F, F, F, M] }),
    group('k', 1, { genders: [M] }),
    group('l', 5, { genders: [F, F, M, M, F] })
  ];
}

test('ほぼ満席（42名／43席）でも全員が着席し、握りつぶしがない', function () {
  var groups = fullHouseGroups();
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  eq(r.totalPeople, 42, '総人数');
  eq(r.spareSeats, 1, '空席');
  eq(Object.keys(r.days[0].placements).length, 42, '実際に座った人数');
  eq(r.warnings.filter(function (w) { return w.type === 'no-seat'; }).length, 0, '席不足の警告');
  groups.forEach(function (g) {
    eq((r.days[0].seatsOfGroup[g.id] || []).length, g.size, g.id + ' の席数');
  });
});

test('ほぼ満席では相席モードに自動で切り替わる', function () {
  var r = S.assign({ layoutType: '11x45', groups: fullHouseGroups(), days: 1 });
  eq(r.sharing, true, '相席モード');
  ok(r.days[0].shared.length > 0, '相席が1件も起きていない');
  eq(Object.keys(r.days[0].reserved).length, 0, '取り置き空席（窮屈なので0のはず）');
});

test('ほぼ満席でも男女の相席は起きない', function () {
  var r = S.assign({ layoutType: '11x45', groups: fullHouseGroups(), days: 1 });
  var mixed = r.days[0].shared.filter(function (sh) { return sh.mixedGender; });
  eq(mixed.length, 0, '男女が並んだ席: ' + mixed.map(function (m) { return m.seatIds.join('+'); }).join(','));
  eq(r.warnings.filter(function (w) { return w.type === 'mixed-gender'; }).length, 0, '男女相席の警告');
});

test('前席オプションが定員を超えると、理由の分かる警告が出る', function () {
  var r = S.assign({ layoutType: '11x45', groups: fullHouseGroups(), days: 1 });
  var w = r.warnings.filter(function (x) { return x.type === 'front-overflow'; });
  eq(w.length, 1, '前席溢れの警告');
  ok(w[0].message.indexOf('10席') >= 0, '前3列の定員が書かれていない: ' + w[0].message);
  ok(w[0].message.indexOf('4列目以降') >= 0, 'どうなるかが書かれていない: ' + w[0].message);
  ok(/お客様[A-Z]+（\d+名）/.test(w[0].message), '対象と人数が書かれていない: ' + w[0].message);
});

test('分かれてしまったときは、人数と理由が分かる警告が出る', function () {
  var r = S.assign({ layoutType: '11x45', groups: fullHouseGroups(), days: 1 });
  var w = r.warnings.filter(function (x) { return x.type === 'split'; });
  ok(w.length >= 1, '分割の警告が出ていない');
  ok(/【要確認】お客様[A-Z]+（\d+名）が離れた席に分かれてしまいました/.test(w[0].message),
    '理由が書かれていない: ' + w[0].message);
  ok(w[0].message.indexOf('ひとつづきに座れる場所がありません') >= 0, '原因が書かれていない');
  eq(w[0].level, 'error', '重み');
});

test('「分かれました」の警告は、結果としてつながっていた場合には出さない', function () {
  var r = S.assign({ layoutType: '11x45', groups: fullHouseGroups(), days: 1 });
  var blocks = {};
  r.days[0].blocks.forEach(function (b) { blocks[b.groupId] = (blocks[b.groupId] || 0) + 1; });
  r.warnings.filter(function (w) { return w.type === 'split'; }).forEach(function (w) {
    ok(blocks[w.groupId] > 1, w.groupId + ' はつながっているのに分割の警告が出ている');
  });
});

test('ほぼ満席でも無限ループにならず、すぐ終わる', function () {
  var t0 = Date.now();
  for (var i = 0; i < 20; i++) S.assign({ layoutType: '11x45', groups: fullHouseGroups(), days: 3 });
  var ms = Date.now() - t0;
  ok(ms < 8000, '20回×3日の割り当てに ' + ms + 'ms かかった');
});

test('自動割り当ての注意は「もともとの注意」として記録される', function () {
  var r = S.assign({ layoutType: '11x45', groups: fullHouseGroups(), days: 1 });
  var day = r.days[0];
  ok(day.baselineIssues.length > 0, 'ほぼ満席なら、もともとの注意があるはず');

  var issues = S.inspectDay(r.layout, r.groups, day);
  eq(issues.filter(function (i) { return !i.preexisting; }).length, 0,
    '自動直後なのに「手で直して増えた注意」がある');
  ok(issues.every(function (i) { return i.preexisting; }), 'もともとの印が付いていない');
});

test('手で直して増えた注意だけが preexisting=false になる', function () {
  var groups = [group('f1', 2, { frontOption: true }), group('g1', 4), group('g2', 4)];
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  var day = r.days[0];
  eq(day.baselineIssues.length, 0, '空いているので、もともとの注意はなし');

  S.moveGroup(r.layout, r.groups, day, 'f1', 'r8-1');
  var issues = S.inspectDay(r.layout, r.groups, day);
  eq(issues.length, 1, '注意の数');
  eq(issues[0].preexisting, false, '手で直して増えた注意');
});

console.log('\n--- 4. 複数日と巡回シフト ---');

function starts(groups, dayCount) {
  var norm = S.normalizeGroups(groups).filter(function (g) { return !g.frontOption; });
  var out = [];
  for (var d = 0; d < dayCount; d++) out.push(S.startIndexForDay(norm, d, dayCount));
  return out;
}
// そのグループが座っている、いちばん前の列
function frontRow(day, id) {
  return Math.min.apply(null, day.seatsOfGroup[id].map(seatRow));
}

test('2日ツアーは半周ずらす（1日目の前方グループが後方に回る）', function () {
  var groups = [];
  for (var i = 1; i <= 8; i++) groups.push(group('g' + i, 4)); // 計32名
  eq(starts(groups, 2).join(','), '0,4', '並べ始めるグループ');

  var r = S.assign({ layoutType: '11x45', groups: groups, days: 2 });
  ok(frontRow(r.days[1], 'g1') > frontRow(r.days[0], 'g1'), 'g1が後方に回っていない');
  ok(frontRow(r.days[1], 'g8') < frontRow(r.days[0], 'g8'), 'g8が前方に来ていない');
  eq(r.days[1].groupOrder.join(','), 'g5,g6,g7,g8,g1,g2,g3,g4', '2日目の順序');
});

test('3日ツアーは3分の1ずつずらす（全員が前・中・後を1日ずつ）', function () {
  var groups = [];
  for (var i = 1; i <= 9; i++) groups.push(group('g' + i, 3)); // 計27名
  eq(starts(groups, 3).join(','), '0,3,6', '並べ始めるグループ');

  var r = S.assign({ layoutType: '11x45', groups: groups, days: 3 });
  eq(r.days[1].groupOrder.join(','), 'g4,g5,g6,g7,g8,g9,g1,g2,g3', '2日目の順序');
  eq(r.days[2].groupOrder.join(','), 'g7,g8,g9,g1,g2,g3,g4,g5,g6', '3日目の順序');

  // g1 は 1日目に先頭、2日目にいちばん後ろ、3日目に真ん中あたり
  eq(r.days[0].groupOrder.indexOf('g1'), 0, '1日目のg1の順番');
  eq(r.days[1].groupOrder.indexOf('g1'), 6, '2日目のg1の順番');
  eq(r.days[2].groupOrder.indexOf('g1'), 3, '3日目のg1の順番');

  // どの日も、どのグループも一度は前方に来る
  ['g1', 'g4', 'g7'].forEach(function (id) {
    var rows = r.days.map(function (d) { return frontRow(d, id); });
    ok(Math.min.apply(null, rows) <= 4, id + ' が一度も前方に来ない: ' + rows.join(','));
  });
});

test('4日ツアーは4分の1ずつずらす', function () {
  var groups = [];
  for (var i = 1; i <= 8; i++) groups.push(group('g' + i, 4)); // 計32名
  eq(starts(groups, 4).join(','), '0,2,4,6', '並べ始めるグループ');

  var r = S.assign({ layoutType: '11x45', groups: groups, days: 4 });
  eq(r.days[2].groupOrder.join(','), 'g5,g6,g7,g8,g1,g2,g3,g4', '3日目の順序');
  eq(r.days[3].groupOrder.join(','), 'g7,g8,g1,g2,g3,g4,g5,g6', '4日目の順序');
  // 1日目とまったく同じ並びになる日はない
  var seen = {};
  r.days.forEach(function (d, i) {
    var key = d.groupOrder.join(',');
    ok(!seen[key], (i + 1) + '日目が' + seen[key] + '日目と同じ並び');
    seen[key] = i + 1;
  });
});

test('人数がばらばらでもグループは切らずに、人数の割合でずらす', function () {
  // 5,1,4,2,3,1 の計16名。半分（8名）に達する最初の切れ目は3組目（a+b+c=10名）のあと
  var groups = [group('a', 5), group('b', 1), group('c', 4), group('d', 2), group('e', 3), group('f', 1)];
  eq(starts(groups, 2).join(','), '0,3', '並べ始めるグループ');
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 2 });
  eq(r.days[1].groupOrder.join(','), 'd,e,f,a,b,c', '2日目の順序');
  // グループが分断されていないこと
  r.days.forEach(function (day, di) {
    groups.forEach(function (g) {
      ok(isConnected(ownedSeats(day, g.id)), (di + 1) + '日目に' + g.id + 'が分断された');
    });
  });
});

test('前席オプション組も、前3列のなかで日ごとに巡回する', function () {
  var groups = [
    group('f1', 2, { frontOption: true }),
    group('f2', 2, { frontOption: true }),
    group('f3', 2, { frontOption: true }),
    group('g1', 4), group('g2', 4)
  ];
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 3 });

  // 日ごとに前席組の並び順が変わる
  eq(r.days[0].groupOrder.slice(0, 3).join(','), 'f1,f2,f3', '1日目の前席組');
  eq(r.days[1].groupOrder.slice(0, 3).join(','), 'f2,f3,f1', '2日目の前席組');
  eq(r.days[2].groupOrder.slice(0, 3).join(','), 'f3,f1,f2', '3日目の前席組');

  // どの日も、前席組は前から3列目までに収まっている
  r.days.forEach(function (d, di) {
    ['f1', 'f2', 'f3'].forEach(function (id) {
      d.seatsOfGroup[id].forEach(function (sid) {
        ok(seatRow(sid) <= 3, (di + 1) + '日目に' + id + 'が前3列を出た: ' + sid);
      });
    });
  });

  // f1 は毎日同じ席ではない
  var f1 = r.days.map(function (d) { return d.seatsOfGroup['f1'].slice().sort().join(','); });
  ok(f1[0] !== f1[1], 'f1が1日目と2日目で同じ席');
  ok(f1[1] !== f1[2], 'f1が2日目と3日目で同じ席');
});

test('前席オプションが1組だけなら実質固定でよい', function () {
  var groups = [group('f1', 2, { frontOption: true }), group('g1', 4), group('g2', 4)];
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 3 });
  r.days.forEach(function (d, di) {
    eq(d.frontStartIndex, 0, (di + 1) + '日目の前席組の開始位置');
    d.seatsOfGroup['f1'].forEach(function (sid) {
      ok(seatRow(sid) <= 3, (di + 1) + '日目に前3列を出た');
    });
  });
});

test('1日ツアーはずらさない', function () {
  var groups = [group('g1', 4), group('g2', 4)];
  eq(starts(groups, 1).join(','), '0', '並べ始めるグループ');
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  eq(r.days[0].shifted, false, 'ずらしていないこと');
});

test('日数分の座席表ができる', function () {
  var r = S.assign({ layoutType: '12x49', groups: [group('g1', 2)], days: 3 });
  eq(r.days.length, 3, '日数');
});

test('ずらした日も前から詰める（後方に空白の島を作らない）', function () {
  var groups = [];
  for (var i = 1; i <= 6; i++) groups.push(group('g' + i, 4));
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 2 });
  r.days.forEach(function (day, di) {
    var rows = occupiedRows(day);
    eq(rows[0], 1, (di + 1) + '日目が1列目から始まっていない');
    // 使っている列が飛び飛びになっていないこと
    for (var i = 1; i < rows.length; i++) {
      eq(rows[i], rows[i - 1] + 1, (di + 1) + '日目の' + rows[i - 1] + '列目と' + rows[i] + '列目のあいだが空いている');
    }
  });
});

test('ずらした日でもグループの席はひとつながりのまま', function () {
  var groups = [group('g1', 2), group('g2', 3), group('g3', 4), group('g4', 5), group('g5', 6)];
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 2 });
  r.days.forEach(function (day, di) {
    groups.forEach(function (g) {
      ok(isConnected(ownedSeats(day, g.id)), (di + 1) + '日目の' + g.id + ' が離れている');
    });
  });
});

console.log('\n--- 4の2. 自由席（使わない後方のかたまり） ---');

test('後方が丸ごと空いていれば自由席の枠になる', function () {
  var r = S.assign({ layoutType: '11x45', groups: [group('g1', 4), group('g2', 4)], days: 1 });
  var fa = r.days[0].freeArea;
  ok(fa, '自由席の枠がない');
  eq(fa.row1, 11, '自由席の最後尾');
  ok(fa.row0 > 1 && fa.row0 <= 11, '自由席の開始列: ' + fa.row0);
  // 自由席の範囲に誰も座っていないこと
  Object.keys(r.days[0].placements).forEach(function (id) {
    ok(seatRow(id) < fa.row0, id + ' が自由席の範囲に入っている');
  });
});

test('最後部まで埋まっていれば自由席は出ない', function () {
  var groups = [];
  for (var i = 1; i <= 21; i++) groups.push(group('g' + i, 2));
  groups.push(group('last', 1));
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  eq(r.days[0].freeArea, null, '自由席の枠');
});

console.log('\n--- 5. 表示ラベル ---');

test('既定は自動ラベル「お客様A」（個人名を出さない）', function () {
  var labels = S.resolveLabels([
    { id: 'g1', size: 2, surname: '山田' },
    { id: 'g2', size: 1, surname: '鈴木' }
  ], {});
  eq(labels[0].label, 'お客様A');
  eq(labels[1].label, 'お客様B');
});

test('申し込み順の記号は A・B・C…、26組を超えたら AA・AB…', function () {
  eq(S.alpha(1), 'A');
  eq(S.alpha(2), 'B');
  eq(S.alpha(26), 'Z');
  eq(S.alpha(27), 'AA');
  eq(S.alpha(28), 'AB');
  eq(S.alpha(52), 'AZ');
  eq(S.alpha(53), 'BA');
  eq(S.alpha(703), 'AAA');
});

test('30組でも自動ラベルが重複しない', function () {
  var groups = [];
  for (var i = 1; i <= 30; i++) groups.push({ id: 'g' + i, size: 1 });
  var labels = S.resolveLabels(groups, {});
  eq(labels[25].label, 'お客様Z', '26組目');
  eq(labels[26].label, 'お客様AA', '27組目');
  var seen = {};
  labels.forEach(function (l) {
    ok(!seen[l.label], '重複したラベル: ' + l.label);
    seen[l.label] = true;
  });
});

test('グループの記号と人数の丸数字は別の表記になる（見間違い防止）', function () {
  var labels = S.resolveLabels([{ id: 'g1', size: 2 }, { id: 'g2', size: 3 }], {});
  eq(labels[0].label, 'お客様A');
  eq(labels[0].sizeMark, '②');
  eq(labels[1].label, 'お客様B');
  eq(labels[1].sizeMark, '③');
  eq(labels[1].mark, 'B', 'グループの記号');
});

test('実名表示ONなら「名字＋様」', function () {
  var labels = S.resolveLabels([
    { id: 'g1', size: 2, surname: '山田' },
    { id: 'g2', size: 1, surname: '鈴木' }
  ], { useRealName: true });
  eq(labels[0].label, '山田様');
  eq(labels[1].label, '鈴木様');
});

test('同姓が複数いるときは自動でフルネーム表示になる', function () {
  var labels = S.resolveLabels([
    { id: 'g1', size: 2, surname: '佐藤', fullName: '佐藤太郎' },
    { id: 'g2', size: 1, surname: '佐藤', fullName: '佐藤花子' },
    { id: 'g3', size: 1, surname: '鈴木', fullName: '鈴木一郎' }
  ], { useRealName: true });
  eq(labels[0].label, '佐藤太郎様');
  eq(labels[1].label, '佐藤花子様');
  eq(labels[2].label, '鈴木様', '同姓でない人はフルネームにしない');
});

test('同姓なのにフルネーム未入力なら印が付く', function () {
  var labels = S.resolveLabels([
    { id: 'g1', size: 1, surname: '佐藤' },
    { id: 'g2', size: 1, surname: '佐藤' }
  ], { useRealName: true });
  eq(labels[0].needsFullName, true);
  eq(labels[0].label, '佐藤様');
});

test('ラベルに前席オプションの印が付く（画面のストライプ表示に使う）', function () {
  var labels = S.resolveLabels([
    { id: 'g1', size: 2, frontOption: true },
    { id: 'g2', size: 3 }
  ], {});
  eq(labels[0].frontOption, true, '前席オプション組');
  eq(labels[1].frontOption, false, 'ふつうの組');
});

test('割り当て結果からも前席オプションかどうかが分かる', function () {
  var groups = [group('f1', 2, { frontOption: true }), group('g1', 4)];
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  var flags = {};
  r.groups.forEach(function (g) { flags[g.id] = g.frontOption; });
  eq(flags['f1'], true, 'f1');
  eq(flags['g1'], false, 'g1');
  var byLabel = {};
  r.labels.forEach(function (l) { byLabel[l.groupId] = l.frontOption; });
  eq(byLabel['f1'], true, 'ラベル側のf1');
});

test('名字が未入力なら実名表示ONでも自動ラベルのまま', function () {
  var labels = S.resolveLabels([{ id: 'g1', size: 3 }], { useRealName: true });
  eq(labels[0].label, 'お客様A');
});

test('人数の丸数字（①②…㊿）', function () {
  eq(S.maru(1), '①');
  eq(S.maru(2), '②');
  eq(S.maru(20), '⑳');
  eq(S.maru(21), '㉑');
  eq(S.maru(45), '㊺');
  eq(S.maru(51), '(51)');
});

console.log('\n--- 6. 色分け ---');

test('隣り合うグループは違う色になる', function () {
  var groups = [];
  for (var i = 1; i <= 10; i++) groups.push(group('g' + i, 4));
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 2 });
  var L = r.layout;
  r.days.forEach(function (day) {
    L.seats.forEach(function (a) {
      L.seats.forEach(function (b) {
        var near = (a.row === b.row && Math.abs(a.col - b.col) === 1) ||
                   (Math.abs(a.row - b.row) === 1 && a.col === b.col);
        if (!near) return;
        var pa = day.placements[a.id], pb = day.placements[b.id];
        if (!pa || !pb || pa.groupId === pb.groupId) return;
        ok(r.colors[pa.groupId] !== r.colors[pb.groupId],
          a.id + ' と ' + b.id + ' が同じ色');
      });
    });
  });
});

test('色は6色の範囲に収まる', function () {
  var groups = [];
  for (var i = 1; i <= 12; i++) groups.push(group('g' + i, 3));
  var r = S.assign({ layoutType: '12x49', groups: groups, days: 1 });
  Object.keys(r.colors).forEach(function (id) {
    ok(r.colors[id] >= 0 && r.colors[id] < S.COLOR_COUNT, id + ' の色 ' + r.colors[id]);
  });
});

console.log('\n--- 7. 席数オーバーと手動入れ替え ---');

test('席数を超える申し込みには警告を出す', function () {
  var groups = [];
  for (var i = 1; i <= 25; i++) groups.push(group('g' + i, 2));
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  ok(r.warnings.some(function (w) { return w.type === 'no-seat'; }), '席不足の警告が出ていない');
  eq(r.spareSeats, 43 - 50, '空席数');
});

test('2席の入れ替えができる', function () {
  var r = S.assign({ layoutType: '11x45', groups: [group('g1', 2), group('g2', 2)], days: 1 });
  var day = r.days[0];
  var a = day.seatsOfGroup['g1'][0];
  var b = day.seatsOfGroup['g2'][0];
  S.swapSeats(r.layout, day, a, b);
  eq(day.placements[a].groupId, 'g2');
  eq(day.placements[b].groupId, 'g1');
  ok(day.seatsOfGroup['g1'].indexOf(b) >= 0, '入れ替え後の席一覧');
});

test('空席との入れ替えもできる', function () {
  var r = S.assign({ layoutType: '11x45', groups: [group('g1', 1)], days: 1 });
  var day = r.days[0];
  var a = day.seatsOfGroup['g1'][0];
  var empty = r.layout.seats.filter(function (s) {
    return !s.isCrew && !day.placements[s.id] && !day.reserved[s.id];
  })[0].id;
  S.swapSeats(r.layout, day, a, empty);
  ok(!day.placements[a], '元の席が空いていない');
  eq(day.placements[empty].groupId, 'g1');
});

console.log('\n============================================');
console.log('  テスト ' + (通過 + 失敗) + '件中 ' + 通過 + '件通過 / ' + 失敗 + '件失敗');
console.log('============================================\n');
if (失敗 > 0) {
  失敗詳細.forEach(function (d) { console.log('  - ' + d); });
  process.exit(1);
}
