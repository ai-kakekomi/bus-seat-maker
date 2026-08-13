/* ============================================================
 * バス座席表メーカー 自動テスト（外部パッケージ不要）
 *   実行: node test/run.js
 * ============================================================ */
'use strict';

var path = require('path');
var fs = require('fs');
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
    rearOption: !!opt.rearOption,
    surname: opt.surname || '', givenName: opt.givenName || ''
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

// グループの席を、指定した席の並びへ手で移す（1席ずつの入れ替えだけを使う）
function moveGroupSeats(S2, layout, day, groupId, targets) {
  targets.forEach(function (want) {
    var cur = (day.seatsOfGroup[groupId] || []).slice();
    if (cur.indexOf(want) >= 0) return;
    var from = cur.filter(function (id) { return targets.indexOf(id) < 0; })[0];
    if (from) S2.swapSeats(layout, day, from, want);
  });
  return day;
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

test('3名グループは通路をまたいだ横一列（■■｜■）になる', function () {
  // 最前列は業務席で2席しか使えないので、そこは2名の組にふさいでもらう
  var r = S.assign({ layoutType: '11x45', groups: [group('g0', 2), group('g1', 3)], days: 1 });
  var day = r.days[0];
  var bs = blocksOf(day, 'g1');
  eq(bs.length, 1, 'ブロック数');
  eq(bs[0].seatIds.length, 3, '枠に含まれる席数（空席を含めない）');
  eq(bs[0].people, 3, '枠の中の人数');
  eq(bs[0].row0, bs[0].row1, '同じ列に並んでいない（横一列でない）');
  eq(bs[0].col1 - bs[0].col0 + 1, 3, '横幅3席になっていない');
  ok(isConnected(bs[0].seatIds), 'つながっていない');
  eq(Object.keys(day.reserved).length, 0, '枠の中の取り置き空席');
});

// 人数ごとの理想のかたち（ゆみさん＝阪急交通社の現場回答にもとづく）
//   4名 ＝ 通路をまたいだ横一列／5名 ＝ 正方形＋通路をまたいで1／6名 ＝ 横一列4＋2
//   7名 ＝ 横2列から窓側1席を空ける／8名 ＝ 横2列をまるごと
//   9名以上 ＝ 横一列（4席）の列を必要なだけ重ね、あまりを次の列に置く
[[4, 4, 1], [5, 3, 2], [6, 4, 2], [7, 4, 2], [8, 4, 2],
 [9, 4, 3], [10, 4, 3], [11, 4, 3], [12, 4, 3], [13, 4, 4]].forEach(function (c) {
  var size = c[0], wantW = c[1], wantH = c[2];
  test(size + '名グループは外わく' + wantW + '席×' + wantH + '列に収まる', function () {
    var r = S.assign({ layoutType: '11x45', groups: [group('g0', 2), group('g1', size)], days: 1 });
    var day = r.days[0];
    var bs = blocksOf(day, 'g1');
    eq(bs.length, 1, 'ブロック数');
    eq(bs[0].people, size, '枠の中の人数');
    eq(bs[0].col1 - bs[0].col0 + 1, wantW, '横幅');
    eq(bs[0].row1 - bs[0].row0 + 1, wantH, '列数');
    eq(Object.keys(day.reserved).length, 0, '枠の中の取り置き空席');
  });
});

// 空きが1席だけになる人数（7名・11名…）は、その1席を窓側にする
[7, 11].forEach(function (size) {
test(size + '名グループが空ける1席は窓側になる', function () {
  var r = S.assign({ layoutType: '11x45', groups: [group('g0', 2), group('g1', size)], days: 1 });
  var day = r.days[0];
  var bs = blocksOf(day, 'g1');
  eq(bs.length, 1, 'ブロック数');
  eq(bs[0].people, size, '枠の中の人数');

  // 外わくのうち、座っていない1席を探す
  var used = {};
  day.seatsOfGroup['g1'].forEach(function (id) { used[id] = true; });
  var holes = [];
  for (var row = bs[0].row0; row <= bs[0].row1; row++) {
    for (var col = bs[0].col0; col <= bs[0].col1; col++) {
      if (!used['r' + row + '-' + col]) holes.push(col);
    }
  }
  eq(holes.length, 1, '空いている席の数');
  ok(holes[0] === 1 || holes[0] === 4, '空けた席が窓側でない: col' + holes[0]);
});
});

test('大人数のグループは横一列を重ねた形になり、前後に長い警告も出ない', function () {
  [9, 10, 12, 15].forEach(function (size) {
    var r = S.assign({ layoutType: '11x45', groups: [group('g0', 2), group('g1', size)], days: 1 });
    var day = r.days[0];
    eq(blocksOf(day, 'g1').length, 1, size + '名がひとつづきでない');
    eq(S.nonIdealGroups(r.groups, day).length, 0, size + '名が本来のかたちでない');
    eq(day.warnings.length, 0, size + '名で警告が出ている: ' +
      day.warnings.map(function (w) { return w.type; }).join(','));
  });
});

test('相席なしのおひとり様は窓側に座る', function () {
  // 1列目の左（col1）が窓側。右2席は業務席なので、2組目は2列目に回る
  var r = S.assign({ layoutType: '11x45', groups: [group('g1', 1), group('g2', 1)], days: 1 });
  var day = r.days[0];
  function colOf(id) {
    var sid = day.seatsOfGroup[id][0];
    return Number(sid.split('-')[1]);
  }
  ok(colOf('g1') === 1 || colOf('g1') === 4, 'g1が通路側に座っている: col' + colOf('g1'));
  ok(colOf('g2') === 1 || colOf('g2') === 4, 'g2が通路側に座っている: col' + colOf('g2'));
});

// 混んでいても、かたちをそろえるために席をずらす（前は満席だと切っていた）。
// 見本「ほぼ満席」と同じ構成で、崩れる組がゼロになること
test('ほぼ満席の見本は、全組が本来のかたちに収まる（テトリス最適）', function () {
  // 画面の見本「ほぼ満席」と同じ構成。手作業の座席表と同じ結果になります。
  // 崩れる組は 5組 → 0組。ここが増えたら作り直しの合図です
  var base = [
    group('A', 2, { frontOption: true }), group('B', 2, { frontOption: true }),
    group('C', 3, { frontOption: true }), group('D', 4, { frontOption: true }),
    group('E', 4), group('F', 3), group('G', 5), group('H', 1), group('I', 2),
    group('J', 3), group('K', 1), group('L', 6), group('M', 1), group('N', 5)
  ];
  [true, false].forEach(function (withFrontD) {
    var groups = base.map(function (g, i) {
      // 前席オプションを外した状態でも確かめる（検収で見つかった構成）
      if (i === 3 && !withFrontD) {
        return group('D', 4);
      }
      return g;
    });
    var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
    eq(r.totalPeople, 42, '人数');
    var label = withFrontD ? 'Dは前席' : 'Dの前席を外す';
    eq(S.nonIdealGroups(r.groups, r.days[0]).length, 0,
      label + '：かたちが崩れた組がある（' +
      S.nonIdealGroups(r.groups, r.days[0]).map(function (g) { return g.id; }).join(',') + '）');
    eq(splitGroupCount(r.days[0]), 0, label + '：分かれた組がある');
  });
});

test('5名×8組＋3名の43名満席でも、離れ離れになる組は出さない', function () {
  // 5名の組は端数が1と2の両方できるので、いちばん敷き詰めにくい構成。
  // 本来のかたちのままでは埋まらないので、かたちを変えて端数を打ち消します
  var groups = [];
  for (var i = 0; i < 8; i++) groups.push(group('f' + i, 5));
  groups.push(group('t', 3));
  [1, 2].forEach(function (days) {
    var r = S.assign({ layoutType: '11x45', groups: groups, days: days });
    eq(r.totalPeople, 43, '人数');
    r.days.forEach(function (day, di) {
      eq(Object.keys(day.placements).length, 43, (di + 1) + '日目に座れない人がいる');
      eq(splitGroupCount(day), 0, (di + 1) + '日目に分かれた組がある');
    });
  });
});

test('2名×19組＋5名の43名満席は、5名が最後部列に収まってぴったり埋まる', function () {
  // 2名の組が最前列から順に埋まり、最後に残る最後部列の5席に5名の組が入ります
  var groups = [group('X', 5)];
  for (var i = 0; i < 19; i++) groups.push(group('p' + i, 2));
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  var day = r.days[0];
  eq(Object.keys(day.placements).length, 43, '座れない人がいる');
  eq(splitGroupCount(day), 0, '分かれた組がある');
  day.seatsOfGroup['X'].forEach(function (sid) {
    eq(seatRow(sid), r.layout.lastRow, '5名の組が最後部列にいない');
  });
});

test('最後部列にぴったり収まった組を「崩れている」と言わない', function () {
  // 満席43名。5名の組が1つだけなので、最後部（5席）はその組が埋める。
  // 5席横並びは最後部列の自然なかたちなので、お知らせの対象にしない
  var groups = [group('X', 5)];
  for (var i = 0; i < 19; i++) groups.push(group('p' + i, 2));
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  var day = r.days[0];

  var backRow = day.seatsOfGroup['X'].every(function (id) {
    return seatRow(id) === r.layout.lastRow;
  });
  ok(backRow, '5名の組が最後部列にいない');
  eq(S.nonIdealGroups(r.groups, day).filter(function (g) { return g.id === 'X'; }).length, 0,
    '最後部列の組が「かたちが崩れている」扱いになっている');
});

// テトリス方式：申し込み順にかたまりを落とし、すき間は後続の小さい組が埋める
test('おひとり様は、片側がふさがっている席から埋める（相席ありのとき）', function () {
  // 画面の見本「ほぼ満席」と同じ構成。1名の組が3つある
  var groups = [
    group('A', 2, { frontOption: true }), group('B', 2, { frontOption: true }),
    group('C', 3, { frontOption: true }), group('D', 4, { frontOption: true }),
    group('E', 4), group('F', 3), group('G', 5), group('H', 1), group('I', 2),
    group('J', 3), group('K', 1), group('L', 6), group('M', 1), group('N', 5)
  ];
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  eq(r.sharing, true, '相席ありの構成になっていない');
  var day = r.days[0];

  // 誰がどの席にいるか
  var owner = {};
  Object.keys(day.placements).forEach(function (id) { owner[id] = day.placements[id].groupId; });

  r.groups.forEach(function (g) {
    if (g.size !== 1) return;
    var sid = day.seatsOfGroup[g.id][0];
    var row = seatRow(sid), col = seatCol(sid);
    if (row === r.layout.lastRow) return; // 最後部列は2人掛けではない
    var mate = 'r' + row + '-' + (col % 2 === 1 ? col + 1 : col - 1);
    ok(!!owner[mate],
      g.id + '（おひとり様）が、まっさらな2人掛けを崩している: ' + sid);
  });
});

/* ---------------------------------------------------------
 * 端数の勘定（本来のかたちで敷き詰められるか）
 * ------------------------------------------------------- */

test('半端な列の使用席数を、人数から求める', function () {
  eq(S.partialRows(4).join(','), '', '4名は列をまるごと使う');
  eq(S.partialRows(8).join(','), '', '8名も同じ');
  eq(S.partialRows(3).join(','), '3', '3名は3席使って端数1');
  eq(S.partialRows(7).join(','), '3', '7名も同じ');
  eq(S.partialRows(2).join(','), '2', '2名は2席使って端数2');
  eq(S.partialRows(6).join(','), '2', '6名も同じ');
  eq(S.partialRows(1).join(','), '1', '1名は1席使って端数3');
  eq(S.partialRows(5).join(','), '3,2', '5名だけは3席の列と2席の列が同時にできる');
});

test('全組を本来のかたちにできるかを、端数の勘定で言い当てる', function () {
  var layout = S.buildLayout('11x45');
  function feasible(sizes) {
    var gs = S.normalizeGroups(sizes.map(function (n, i) { return group('g' + i, n); }));
    return S.idealFeasibility(layout, gs);
  }

  // 見本「ほぼ満席」。最前列2席に2名、最後部5席に5名が収まるので足りる
  ok(feasible([2, 2, 3, 4, 4, 3, 5, 1, 2, 3, 1, 6, 1, 5]).possible,
    '見本の構成が「できない」と判定された');

  // 3名だらけ。端数1がたくさん出るのに、埋められるおひとり様が1人しかいない
  var manyTrios = [];
  for (var i = 0; i < 14; i++) manyTrios.push(3);
  manyTrios.push(1);
  eq(feasible(manyTrios).possible, false, '3名だらけの構成が「できる」と判定された');

  // 2名だけなら、端数2どうしが打ち消し合うので敷き詰められる
  var pairs = [];
  for (var j = 0; j < 21; j++) pairs.push(2);
  ok(feasible(pairs).possible, '2名だけの構成が「できない」と判定された');
});

test('端数の勘定と、実際に組んだ座席表が食い違わない', function () {
  var layout = S.buildLayout('11x45');
  // 決まった手順で構成を作る（毎回おなじ結果になります）
  var seed = 12345;
  function rnd(max) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % max; }

  var checked = 0;
  for (var t = 0; t < 60; t++) {
    var sizes = [], total = 0, cap = 30 + rnd(14);
    while (total < cap) {
      var n = 1 + rnd(8);
      if (total + n > cap) n = cap - total;
      if (n <= 0) break;
      sizes.push(n); total += n;
    }
    if (sizes.length < 2) continue;

    var groups = sizes.map(function (n2, i) { return group('g' + i, n2); });
    var f = S.idealFeasibility(layout, S.normalizeGroups(groups));
    var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
    var off = S.nonIdealGroups(r.groups, r.days[0]).length;
    checked++;

    // 「できない」と言い切ったのに、実際は全組そろっていた → 勘定が間違っている
    ok(f.possible || off > 0,
      '「できない」判定なのに全組そろった: ' + sizes.join(','));
    // 「できる」はずなのに、そろえられなかった → 並べ方の探索が足りない
    ok(!f.possible || off === 0,
      '「できる」はずがそろえられなかった: ' + sizes.join(','));
  }
  ok(checked >= 50, '検証した構成が少なすぎる: ' + checked);
});

test('できない構成では、お知らせの言い方が変わる', function () {
  var groups = [];
  for (var i = 0; i < 14; i++) groups.push(group('g' + i, 3));
  groups.push(group('one', 1));
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  var note = r.days[0].warnings.filter(function (w) { return w.type === 'shape-differs'; });
  eq(note.length, 1, 'お知らせが出ていない');
  ok(note[0].message.indexOf('端数の計算上') >= 0,
    '「直しようがない」ことが伝わらない: ' + note[0].message);
  ok(note[0].message.indexOf('手で入れ替えてください') < 0,
    'できない構成なのに手直しを促している');
});

test('本来のかたちに収まらなかった組は、座席表の下でお知らせする', function () {
  // 満席43名を3名の組だけで埋める。3名は横一列（4席のうち3席）が本来のかたちなので、
  // 全組をそのかたちにすると席が足りません。どこかは崩れます
  var groups = [];
  for (var i = 0; i < 14; i++) groups.push(group('g' + i, 3));
  groups.push(group('one', 1));
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  eq(r.totalPeople, 43, '人数');
  var day = r.days[0];

  var off = S.nonIdealGroups(r.groups, day);
  ok(off.length > 0, 'この構成では本来のかたちに収まらない組が出るはず');

  var note = day.warnings.filter(function (w) { return w.type === 'shape-differs'; });
  eq(note.length, 1, 'お知らせは1件にまとめる');
  ok(note[0].message.indexOf(off.length + '組') >= 0, '組数が入っていない');
  ok(note[0].message.indexOf('通路をまたいだ横一列') >= 0, '本来のかたちが書かれていない');
});

test('本来のかたちに収まっていれば、お知らせは出ない', function () {
  var groups = [group('g1', 3), group('g2', 4), group('g3', 5), group('g4', 6)];
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  eq(S.nonIdealGroups(r.groups, r.days[0]).length, 0, '本来のかたちに収まっていない組がある');
  eq(r.days[0].warnings.filter(function (w) { return w.type === 'shape-differs'; }).length, 0,
    '余計なお知らせが出ている');
});

test('2名グループが通路をはさんで分かれることはない', function () {
  // 通常列の2人掛けは col1-col2 と col3-col4。col2-col3 は通路をまたぐのでNG
  function checkNoAisleSplit(r, where) {
    r.days.forEach(function (day, di) {
      r.groups.forEach(function (g) {
        if (g.size !== 2) return;
        var ids = day.seatsOfGroup[g.id] || [];
        if (ids.length !== 2) return;
        var a = ids[0].split('-'), b = ids[1].split('-');
        var rowA = Number(a[0].slice(1)), rowB = Number(b[0].slice(1));
        if (rowA !== rowB || rowA === r.layout.lastRow) return; // 最後部列に通路はない
        var lo = Math.min(Number(a[1]), Number(b[1]));
        ok(lo !== 2, where + ' ' + (di + 1) + '日目：' + g.id + ' が通路で分かれた（' + ids.join(',') + '）');
      });
    });
  }

  // ゆったり
  var few = [];
  for (var i = 0; i < 8; i++) few.push(group('a' + i, 2));
  checkNoAisleSplit(S.assign({ layoutType: '11x45', groups: few, days: 2 }), 'ゆったり');

  // ぎゅうぎゅう（2名だけで42名）
  var many = [];
  for (var j = 0; j < 21; j++) many.push(group('b' + j, 2));
  checkNoAisleSplit(S.assign({ layoutType: '11x45', groups: many, days: 3 }), '2名だけ42名');

  // 満席（奇数グループ混じり）
  var mix = [];
  for (var k = 0; k < 13; k++) mix.push(group('c' + k, 3));
  mix.push(group('d1', 2));
  mix.push(group('d2', 2));
  var r3 = S.assign({ layoutType: '11x45', groups: mix, days: 2 });
  eq(r3.totalPeople, 43, '満席の人数');
  checkNoAisleSplit(r3, '満席');
});

// 最前列はお客様が座れるのが2席だけ（運転席側2席が業務席）。
// この2席は次の列とひとまとめに使えること
test('5名・6名の組は、最前列2席＋次の列で本来のかたちに収まる', function () {
  [[5, 3, 2], [6, 4, 2]].forEach(function (c) {
    var r = S.assign({ layoutType: '11x45', groups: [group('g1', c[0])], days: 1 });
    var day = r.days[0];
    var bs = blocksOf(day, 'g1');
    eq(bs.length, 1, c[0] + '名のブロック数');
    eq(bs[0].row0, 1, c[0] + '名が最前列を使っていない');
    eq(bs[0].col1 - bs[0].col0 + 1, c[1], c[0] + '名の横幅');
    eq(bs[0].row1 - bs[0].row0 + 1, c[2], c[0] + '名の列数');
  });
});

test('最前列に3名・4名は入らないので、最前列は空けたまま次の列へ送る', function () {
  // 最前列はお客様が座れるのが2席だけ。3名・4名の本来のかたちは横一列なので、
  // ここに詰め込むとかたちが崩れます。テトリスと同じで、置けない列は飛ばします
  [3, 4].forEach(function (size) {
    var r = S.assign({ layoutType: '11x45', groups: [group('g1', size)], days: 1 });
    var day = r.days[0];
    var b = blocksOf(day, 'g1')[0];
    eq(b.row0, 2, size + '名が最前列に詰め込まれている');
    eq(b.row0, b.row1, size + '名が横一列になっていない');
    // 本来のかたちに収まっているので、お知らせは出さない
    eq(day.warnings.filter(function (w) { return w.type === 'shape-differs'; }).length, 0,
      size + '名で余計なお知らせが出ている');
  });
});

test('最前列の2席にも、かたちを崩さず入れる組なら入れる（5名の 2＋3）', function () {
  // 5名の本来のかたちは「正方形＋通路をまたいで1」。前後どちらに寄せるかは区別しないので、
  // 最前列2席＋次の列3席も本来のかたちです。入れるなら最前列から使います
  var r = S.assign({ layoutType: '11x45', groups: [group('g1', 5)], days: 1 });
  var rows = r.days[0].seatsOfGroup['g1'].map(seatRow);
  eq(Math.min.apply(null, rows), 1, '5名が最前列を空けている');
  eq(S.nonIdealGroups(r.groups, r.days[0]).length, 0, '本来のかたちに収まっていない');
});

test('窓側から埋める（通路側だけ使って窓側を空けない）', function () {
  var r = S.assign({ layoutType: '11x45', groups: [group('g1', 3)], days: 1 });
  var cols = r.days[0].seatsOfGroup['g1'].map(seatCol);
  ok(cols.indexOf(1) >= 0, '左窓（col1）を空けている: col' + cols.join(','));
});

test('最前列の2席は、前席をご希望の2名の組にゆずる', function () {
  // 最前列はお客様が座れるのが2席だけ。3名の組を先に置くと、
  // 2席に収まらず次の列へはみ出して、かたちが崩れてしまう
  var groups = [
    group('trio', 3, { frontOption: true }),
    group('quad', 4, { frontOption: true }),
    group('pair', 2, { frontOption: true }),
    group('rest', 6)
  ];
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  var day = r.days[0];

  // 申し込み順は変えません。3名の組は最前列に入らないので次の列へ送られ、
  // 空いたままの最前列2席に、あとから来た2名の組がぴったり収まります
  var pairRows = day.seatsOfGroup['pair'].map(seatRow);
  eq(Math.min.apply(null, pairRows), 1, '2名の組が最前列にいない');
  eq(Math.max.apply(null, pairRows), 1, '2名の組が最前列からはみ出している');

  // 3名の組は、はみ出さずに横一列で収まる
  var bs = blocksOf(day, 'trio');
  eq(bs.length, 1, '3名のブロック数');
  eq(bs[0].row0, bs[0].row1, '3名が横一列になっていない');
});

test('最後部列（5席横並び）は最終手段で、空きがあるうちは使わない', function () {
  var r = S.assign({ layoutType: '11x45', groups: [group('g1', 4), group('g2', 3)], days: 1 });
  var day = r.days[0];
  var lastRow = r.layout.lastRow;
  var usedBack = Object.keys(day.placements).filter(function (id) {
    return id.indexOf('r' + lastRow + '-') === 0;
  });
  eq(usedBack.length, 0, '空きがあるのに最後部列を使っている');
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

console.log('\n--- 3の4. 失敗したときの理由コード ---');

test('業務席を指定したら crew-seat', function () {
  var r = S.assign({ layoutType: '11x45', groups: [group('g1', 2), group('g2', 2)], days: 1 });
  var day = r.days[0];
  var crew = r.layout.seats.filter(function (x) { return x.isCrew; })[0].id;
  var before = JSON.stringify(day.placements);

  var res = S.swapSeats(r.layout, day, day.seatsOfGroup['g1'][0], crew);
  eq(res.ok, false, '入れ替えの成否');
  eq(res.reason, 'crew-seat', '理由コード');
  eq(JSON.stringify(day.placements), before, '座席が変わってしまった');
});

test('同じ席を2回指定したら same-seat', function () {
  var r = S.assign({ layoutType: '11x45', groups: [group('g1', 2)], days: 1 });
  var day = r.days[0];
  var sid = day.seatsOfGroup['g1'][0];
  var res = S.swapSeats(r.layout, day, sid, sid);
  eq(res.ok, false, '成否');
  eq(res.reason, 'same-seat', '理由コード');
});

test('知らない席なら seat-not-found', function () {
  var r = S.assign({ layoutType: '11x45', groups: [group('g1', 2)], days: 1 });
  var day = r.days[0];
  eq(S.swapSeats(r.layout, day, 'r99-9', 'r5-1').reason, 'seat-not-found');
  eq(S.swapSeats(r.layout, day, 'r5-1', 'r99-9').reason, 'seat-not-found');
});

test('うまくいったときは ok と理由コードが返る', function () {
  var r = S.assign({ layoutType: '11x45', groups: [group('g1', 2), group('g2', 2)], days: 1 });
  var day = r.days[0];
  var res = S.swapSeats(r.layout, day, day.seatsOfGroup['g1'][0], 'r10-4');
  eq(res.ok, true, '成否');
  eq(res.reason, 'swapped', '理由コード');
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

  moveGroupSeats(S, r.layout, day, 'f1', ['r7-1', 'r7-2']);

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
  moveGroupSeats(S, r.layout, day, 'f1', ['r7-1', 'r7-2']);
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
  moveGroupSeats(S, first.layout, first.days[0], 'g1', ['r9-1', 'r9-2', 'r10-1', 'r10-2']);
  S.swapSeats(first.layout, first.days[1], first.days[1].seatsOfGroup['g2'][0],
    first.days[1].seatsOfGroup['g4'][0]);
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
  moveGroupSeats(S, first.layout, first.days[0], 'g2', ['r11-1', 'r11-2', 'r11-3', 'r11-4']);
  moveGroupSeats(S, first.layout, first.days[0], 'g1', ['r10-3', 'r10-4', 'r9-4']);

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
  moveGroupSeats(S, r.layout, r.days[0], 'g1', ['r8-1', 'r8-2', 'r9-1', 'r9-2']);
  S.swapSeats(r.layout, r.days[0], r.days[0].seatsOfGroup['g1'][0], r.days[0].seatsOfGroup['g2'][0]);
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
    moveGroupSeats(S, r.layout, day, 'g3', ['r9-1', 'r9-2', 'r9-3']);
    var issues = S.inspectDay(r.layout, r.groups, day).filter(function (i) { return i.type === 'front-out'; });
    eq(issues.length, 0, (di + 1) + '日目に誤警告: ' + issues.map(function (i) { return i.message; }).join(' / '));
  });
});

test('3列目ちょうどは警告にならず、4列目から警告になる（境界）', function () {
  var r = S.assign({ layoutType: '11x45', groups: [group('f1', 2, { frontOption: true }), group('g1', 4)], days: 1 });
  var day = r.days[0];

  // 3列目ちょうどに動かす → 警告なし
  moveGroupSeats(S, r.layout, day, 'f1', ['r3-3', 'r3-4']);
  eq(Math.max.apply(null, day.seatsOfGroup['f1'].map(seatRow)), 3, '3列目にいること');
  eq(S.inspectDay(r.layout, r.groups, day).filter(function (i) { return i.type === 'front-out'; }).length,
     0, '3列目で警告が出た');

  // 4列目に動かす → 警告あり
  moveGroupSeats(S, r.layout, day, 'f1', ['r4-3', 'r4-4']);
  eq(Math.min.apply(null, day.seatsOfGroup['f1'].map(seatRow)), 4, '4列目にいること');
  eq(S.inspectDay(r.layout, r.groups, day).filter(function (i) { return i.type === 'front-out'; }).length,
     1, '4列目で警告が出ない');
});

test('警告が出るのは、その日に実際に逸脱している日だけ', function () {
  var groups = [group('f1', 2, { frontOption: true }), group('g1', 4), group('g2', 4)];
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 3 });

  // 2日目だけ前席組を後ろへ
  moveGroupSeats(S, r.layout, r.days[1], 'f1', ['r8-1', 'r8-2']);

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

test('ほぼ満席の見本では、もう泣き別れが起きない', function () {
  var r = S.assign({ layoutType: '11x45', groups: fullHouseGroups(), days: 1 });
  eq(r.warnings.filter(function (w) { return w.type === 'split'; }).length, 0,
    '分割の警告: ' + r.warnings.filter(function (w) { return w.type === 'split'; })
      .map(function (w) { return w.message; }).join(' / '));
  r.groups.forEach(function (g) {
    eq(blocksOf(r.days[0], g.id).length, 1, g.id + ' が分かれている');
  });
});

test('分かれてしまったときは、人数と理由が分かる警告が出る', function () {
  // 定員ぎりぎりまで大人数グループを詰めて、どうしても分かれる状況をつくる。
  // 12名は3列ぶん、7名は2列ぶん。43席にきれいには入りません
  var groups = [group('g1', 12), group('g2', 12), group('g3', 12), group('g4', 7)];
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  var w = r.warnings.filter(function (x) { return x.type === 'split'; });
  ok(w.length >= 1, '分割の警告が出ていない（テスト条件が不適切）');
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

  moveGroupSeats(S, r.layout, day, 'f1', ['r8-1', 'r8-2']);
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

test('2日ツアーは前後をひっくり返す（前の人はうしろへ、うしろの人は前へ）', function () {
  var groups = [];
  for (var i = 1; i <= 8; i++) groups.push(group('g' + i, 4)); // 計32名

  var r = S.assign({ layoutType: '11x45', groups: groups, days: 2 });
  eq(r.days[0].reversed, false, '1日目は反転しない');
  eq(r.days[1].reversed, true, '2日目は反転する');
  ok(frontRow(r.days[1], 'g1') > frontRow(r.days[0], 'g1'), 'g1が後方に回っていない');
  ok(frontRow(r.days[1], 'g8') < frontRow(r.days[0], 'g8'), 'g8が前方に来ていない');
  eq(r.days[1].groupOrder.join(','), 'g8,g7,g6,g5,g4,g3,g2,g1', '2日目の順序');
});

test('まん中のグループは、2日目もさほど動かない', function () {
  var groups = [];
  for (var i = 1; i <= 9; i++) groups.push(group('g' + i, 3)); // 計27名
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 2 });
  // 端の組は大きく動き、まん中（g5）はほとんど動かない
  var move = function (id) {
    return Math.abs(frontRow(r.days[1], id) - frontRow(r.days[0], id));
  };
  ok(move('g1') >= 4, 'g1（先頭）が動いていない: ' + move('g1'));
  ok(move('g9') >= 4, 'g9（最後尾）が動いていない: ' + move('g9'));
  ok(move('g5') <= 2, 'g5（まん中）が動きすぎ: ' + move('g5'));
});

test('3日ツアーは、3日目に並べ始める位置をずらす', function () {
  var groups = [];
  for (var i = 1; i <= 9; i++) groups.push(group('g' + i, 3)); // 計27名

  var r = S.assign({ layoutType: '11x45', groups: groups, days: 3 });
  eq(r.days[1].groupOrder.join(','), 'g9,g8,g7,g6,g5,g4,g3,g2,g1', '2日目の順序（前後反転）');
  eq(r.days[2].reversed, false, '3日目は反転しない');
  ok(r.days[2].startIndex > 0, '3日目の開始位置がずれていない');

  // 3日とも並びが違う
  var seen = {};
  r.days.forEach(function (d, i) {
    var key = d.groupOrder.join(',');
    ok(!seen[key], (i + 1) + '日目が' + seen[key] + '日目と同じ並び');
    seen[key] = i + 1;
  });

  // どのグループも一度は前方に来る
  ['g1', 'g4', 'g7'].forEach(function (id) {
    var rows = r.days.map(function (d) { return frontRow(d, id); });
    ok(Math.min.apply(null, rows) <= 4, id + ' が一度も前方に来ない: ' + rows.join(','));
  });
});

test('4日ツアーは「ずらす」と「前後反転」を組み合わせる', function () {
  var groups = [];
  for (var i = 1; i <= 8; i++) groups.push(group('g' + i, 4)); // 計32名

  var r = S.assign({ layoutType: '11x45', groups: groups, days: 4 });
  eq(r.days.map(function (d) { return d.reversed ? 'R' : '-'; }).join(''), '-R-R', '反転する日');
  eq(r.days[2].groupOrder.join(','), 'g3,g4,g5,g6,g7,g8,g1,g2', '3日目の順序');
  eq(r.days[3].groupOrder.join(','), 'g2,g1,g8,g7,g6,g5,g4,g3', '4日目の順序');
  // 1日目とまったく同じ並びになる日はない
  var seen = {};
  r.days.forEach(function (d, i) {
    var key = d.groupOrder.join(',');
    ok(!seen[key], (i + 1) + '日目が' + seen[key] + '日目と同じ並び');
    seen[key] = i + 1;
  });
});

test('人数がばらばらでもグループは切らずに前後反転する', function () {
  var groups = [group('a', 5), group('b', 1), group('c', 4), group('d', 2), group('e', 3), group('f', 1)];
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 2 });
  eq(r.days[1].groupOrder.join(','), 'f,e,d,c,b,a', '2日目の順序');
  // グループが分断されていないこと
  r.days.forEach(function (day, di) {
    groups.forEach(function (g) {
      ok(isConnected(ownedSeats(day, g.id)), (di + 1) + '日目に' + g.id + 'が分断された');
    });
  });
});

test('人数の割合で並べ始める位置を決める（グループは切らない）', function () {
  // 5,1,4,2,3,1 の計16名。半分（8名）に達する最初の切れ目は3組目（a+b+c=10名）のあと
  var groups = [group('a', 5), group('b', 1), group('c', 4), group('d', 2), group('e', 3), group('f', 1)];
  eq(starts(groups, 2).join(','), '0,3', '並べ始めるグループ');
});

test('前席オプション組も、2日目は逆順になる（同じ組が毎日いちばん前にならない）', function () {
  var groups = [
    group('f1', 2, { frontOption: true }),
    group('f2', 2, { frontOption: true }),
    group('f3', 2, { frontOption: true }),
    group('g1', 4), group('g2', 4)
  ];
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 3 });

  // 日ごとに前席組の並び順が変わる
  eq(r.days[0].groupOrder.slice(0, 3).join(','), 'f1,f2,f3', '1日目の前席組');
  eq(r.days[1].groupOrder.slice(0, 3).join(','), 'f1,f3,f2', '2日目の前席組（順ぐりのうえ逆順）');
  eq(r.days[2].groupOrder.slice(0, 3).join(','), 'f3,f1,f2', '3日目の前席組');

  // どの日も、前席組は前から3列目までに収まっている
  r.days.forEach(function (d, di) {
    ['f1', 'f2', 'f3'].forEach(function (id) {
      d.seatsOfGroup[id].forEach(function (sid) {
        ok(seatRow(sid) <= 3, (di + 1) + '日目に' + id + 'が前3列を出た: ' + sid);
      });
    });
  });

  // 前席組の並びは、日ごとに変わる
  var orders = r.days.map(function (d) { return d.groupOrder.slice(0, 3).join(','); });
  ok(orders[0] !== orders[1], '1日目と2日目で前席組の並びが同じ');
  ok(orders[1] !== orders[2], '2日目と3日目で前席組の並びが同じ');
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
    // 4名の横一列は最前列（お客様は2席）に入らないので、最前列は空けたまま2列目から
    eq(rows[0], 2, (di + 1) + '日目が2列目から始まっていない');
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

console.log('\n--- 4の1の2. 回転日でも泣き別れを起こさない ---');

function splitGroupCount(day) {
  var per = {};
  (day.blocks || []).forEach(function (b) { per[b.groupId] = (per[b.groupId] || 0) + 1; });
  return Object.keys(per).filter(function (gid) { return per[gid] > 1; }).length;
}

test('ほぼ満席の見本は、1日でも5日でも全日で泣き別れゼロ', function () {
  [1, 2, 3, 4, 5].forEach(function (days) {
    var r = S.assign({ layoutType: '11x45', groups: fullHouseGroups(), days: days });
    r.days.forEach(function (day, di) {
      eq(splitGroupCount(day), 0, days + '日ツアーの' + (di + 1) + '日目で分かれた組がある');
      eq(Object.keys(day.placements).length, 42, days + '日ツアーの' + (di + 1) + '日目の着席');
    });
    eq(r.warnings.filter(function (w) { return w.type === 'split'; }).length, 0,
      days + '日ツアーで分割の警告');
  });
});

test('巡回シフトは、分かれにくい開始位置を選ぶ（おおよそ均等に回る）', function () {
  var r = S.assign({ layoutType: '11x45', groups: fullHouseGroups(), days: 3 });
  var starts = r.days.map(function (d) { return d.startIndex; });
  // 1日目の開始位置は申し込み順（0）が目標ですが、そこにこだわると
  // かたちが崩れたり泣き別れが出たりするので、ずれることがあります
  r.days.forEach(function (day, di) {
    eq(splitGroupCount(day), 0, (di + 1) + '日目で分かれた組がある');
  });
  // 日ごとに並びが変わること。
  // 開始位置が同じでも、反転する日としない日では並びがまるごと変わります
  var orders = {};
  r.days.forEach(function (d, i) {
    var key = d.groupOrder.join(',');
    ok(!orders[key], (i + 1) + '日目が' + orders[key] + '日目と同じ並び');
    orders[key] = i + 1;
  });
  ok(starts[1] !== starts[0] || r.days[1].reversed !== r.days[0].reversed,
    '2日目が1日目とまったく同じ決め方');
  // 全員が同じ席に固定されていないこと
  var same = 0;
  r.groups.forEach(function (g) {
    var a = r.days[0].seatsOfGroup[g.id].slice().sort().join(',');
    var b = r.days[1].seatsOfGroup[g.id].slice().sort().join(',');
    if (a === b) same++;
  });
  ok(same <= r.groups.length - 4, '2日目にほとんどの組が動いていない（' + same + '組が同じ席）');
});

test('分かれてしまったときは、置く順番を変えてもう一度試す', function () {
  // 目標の開始位置そのままだと解けない構成でも、探索で解けること
  var sizes = [6, 5, 4, 3, 2, 1, 6, 5, 4, 3, 2, 1];
  var groups = sizes.map(function (n, i) { return group('g' + i, n); });
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 3 });
  r.days.forEach(function (day, di) {
    eq(Object.keys(day.placements).length, 42, (di + 1) + '日目の着席');
  });
  var total = r.days.reduce(function (a, d) { return a + splitGroupCount(d); }, 0);
  ok(total <= 1, '3日ぶんで分かれた組が ' + total + '組もある');
});

test('近くの開始位置で解けないときは、すべての開始位置を試す', function () {
  // 検収で見つかった構成（11列45席・3日・42名）。
  // 目標の前後±3では解けず、離れた開始位置にだけ答えがある
  var sizes = [4, 3, 3, 1, 2, 4, 3, 1, 5, 3, 2, 3, 1, 3, 2, 2, 3, 2];
  var groups = [];
  var total = 0;
  for (var i = 0; i < sizes.length && total < 42; i++) {
    var n = Math.min(sizes[i], 42 - total);
    if (n <= 0) break;
    var g = i % 2 ? 'female' : 'male';
    var genders = [];
    for (var k = 0; k < n; k++) genders.push(g);
    groups.push(group('g' + i, n, { genders: genders }));
    total += n;
  }
  eq(total, 42, '人数');

  var r = S.assign({ layoutType: '11x45', groups: groups, days: 3 });
  r.days.forEach(function (day, di) {
    eq(Object.keys(day.placements).length, 42, (di + 1) + '日目の着席');
    eq(splitGroupCount(day), 0, (di + 1) + '日目で分かれた組がある');
  });
  eq(r.warnings.filter(function (w) { return w.type === 'split'; }).length, 0, '分割の警告');
});

test('日ごとの並びは、なるべく前の日と同じにしない', function () {
  var sizes = [4, 3, 3, 1, 2, 4, 3, 1, 5, 3, 2, 3, 1, 3, 2, 2];
  var groups = sizes.map(function (n, i) { return group('g' + i, n); });
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 3 });

  function sig(day) {
    return Object.keys(day.placements).sort().map(function (sid) {
      return sid + ':' + day.placements[sid].groupId;
    }).join(',');
  }
  var sigs = r.days.map(sig);
  eq(new Set(sigs).size, 3, '同じ並びの日がある');

  // 席替えとして意味があること（となりの日で、ほとんどの組が動いている）
  var same = 0;
  groups.forEach(function (g) {
    if (r.days[0].seatsOfGroup[g.id].join() === r.days[1].seatsOfGroup[g.id].join()) same++;
  });
  ok(same <= groups.length / 3, '1日目と2日目で ' + same + '組が同じ席のまま');
});

test('同じ並びを避けることより、離れ離れにしないことを優先する', function () {
  // 分かれずに済む並びが1通りしかない場合は、同じ並びが続いてもよい
  var groups = [];
  for (var i = 1; i <= 7; i++) groups.push(group('g' + i, 6)); // 42名／43席
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 3 });
  r.days.forEach(function (day, di) {
    eq(Object.keys(day.placements).length, 42, (di + 1) + '日目の着席');
  });
  // 分割が出るとしても、警告つきであること
  r.days.forEach(function (day, di) {
    if (splitGroupCount(day) > 0) {
      ok(day.warnings.some(function (w) { return w.type === 'split'; }),
        (di + 1) + '日目に分割の警告がない');
    }
  });
});

test('相席の当番は日ごとに回る（1日目に相席なしだった組が2日目に相席になる）', function () {
  // 席が窮屈で、相席が避けられない構成
  var sizes = [1, 1, 1, 3, 3, 3, 5, 5, 5, 3, 3, 1, 1, 3, 3]; // 計41名
  var groups = sizes.map(function (n, i) { return group('g' + i, n); });
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 2 });
  eq(r.sharing, true, '相席ありの構成になっていない');

  function sharedIds(day) {
    var out = {};
    (day.shared || []).forEach(function (sh) {
      sh.groupIds.forEach(function (id) { out[id] = true; });
    });
    return out;
  }
  var d1 = sharedIds(r.days[0]);
  var d2 = sharedIds(r.days[1]);

  var restedThenShared = r.groups.filter(function (g) { return !d1[g.id] && d2[g.id]; });
  ok(restedThenShared.length > 0, '1日目に相席なしだった組が、2日目も全員そのまま');
  ok(Object.keys(d1).sort().join(',') !== Object.keys(d2).sort().join(','),
    '相席の顔ぶれが1日目と2日目でまったく同じ');
});

test('2日つづけて後方に座らされる組は出ない（ほぼ満席の見本と同じ構成）', function () {
  // 画面の見本「ほぼ満席」と同じ 14組42名（43席／空席1）。
  // ここで 5名・6名の組が最後部に居座ってしまう不具合があった
  var groups = [
    group('A', 2, { frontOption: true }), group('B', 2, { frontOption: true }),
    group('C', 3, { frontOption: true }), group('D', 4, { frontOption: true }),
    group('E', 4), group('F', 3), group('G', 5), group('H', 1), group('I', 2),
    group('J', 3), group('K', 1), group('L', 6), group('M', 1), group('N', 5)
  ];
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 3 });
  eq(r.totalPeople, 42, '人数');

  var rearFrom = r.layout.lastRow - 1; // うしろ2列を「後方」とみなす
  function frontRowOf(day, id) {
    return Math.min.apply(null, day.seatsOfGroup[id].map(seatRow));
  }
  for (var d = 1; d < r.days.length; d++) {
    var stuck = r.groups.filter(function (g) {
      if (g.frontOption) return false;
      return frontRowOf(r.days[d - 1], g.id) >= rearFrom &&
             frontRowOf(r.days[d], g.id) >= rearFrom;
    }).map(function (g) { return g.id; });
    eq(stuck.join(','), '', d + '日目と' + (d + 1) + '日目で後方に居座った組');
  }

  // 席替えとして成立していること（分かれた組も出ないこと）
  r.days.forEach(function (day, di) {
    eq(Object.keys(day.placements).length, 42, (di + 1) + '日目の着席');
    eq(splitGroupCount(day), 0, (di + 1) + '日目で分かれた組がある');
  });
});

test('どうしても後方が続くときは、座席表の下でお知らせする', function () {
  // 満席43名。5名の組が1つだけなので、最後部（5席）はその組しか埋められない
  var groups = [group('X', 5)];
  for (var i = 0; i < 19; i++) groups.push(group('p' + i, 2));
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 2 });
  eq(r.totalPeople, 43, '人数');

  var note = r.days[1].warnings.filter(function (w) { return w.type === 'rear-stay'; });
  eq(note.length, 1, 'お知らせが出ていない');
  ok(note[0].message.indexOf('お客様A（5名）') >= 0, '対象の組が書かれていない');

  // 1日目には出ない（比べる前の日がないため）
  eq(r.days[0].warnings.filter(function (w) { return w.type === 'rear-stay'; }).length, 0,
    '1日目にお知らせが出ている');
});

test('後方が続かないときは、お知らせを出さない', function () {
  var groups = [
    group('A', 2, { frontOption: true }), group('B', 2, { frontOption: true }),
    group('C', 3, { frontOption: true }), group('D', 4, { frontOption: true }),
    group('E', 4), group('F', 3), group('G', 5), group('H', 1), group('I', 2),
    group('J', 3), group('K', 1), group('L', 6), group('M', 1), group('N', 5)
  ];
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 3 });
  var all = r.days.reduce(function (a, d) {
    return a.concat(d.warnings.filter(function (w) { return w.type === 'rear-stay'; }));
  }, []);
  eq(all.length, 0, '見本の構成で余計なお知らせが出ている');
});

test('「後ろのお席にまとめる」を選んだ組は、ほかのお客様よりうしろになる', function () {
  var groups = [
    group('f1', 2, { frontOption: true }),
    group('n1', 3), group('n2', 2), group('n3', 4), group('n4', 2),
    group('r1', 8, { rearOption: true }),
    group('r2', 6, { rearOption: true })
  ];
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 2 });

  function frontRowOf(day, id) {
    return Math.min.apply(null, day.seatsOfGroup[id].map(seatRow));
  }
  function lastRowOf(day, id) {
    return Math.max.apply(null, day.seatsOfGroup[id].map(seatRow));
  }

  r.days.forEach(function (day, di) {
    // ふつうの組より、必ずうしろにいること
    var normalLast = Math.max(
      lastRowOf(day, 'n1'), lastRowOf(day, 'n2'),
      lastRowOf(day, 'n3'), lastRowOf(day, 'n4')
    );
    ['r1', 'r2'].forEach(function (id) {
      ok(frontRowOf(day, id) > normalLast,
        (di + 1) + '日目：' + id + ' がふつうの組より前にいる');
    });
    // 席がゆったりしていても、最後部まで飛ばすことはしない
    // （ぽつんと離れて座るとかえって目立つため。ほかのお客様のすぐうしろに続く）
    var lastUsed = 0;
    Object.keys(day.placements).forEach(function (sid) {
      if (seatRow(sid) > lastUsed) lastUsed = seatRow(sid);
    });
    ok(lastUsed < r.layout.lastRow,
      (di + 1) + '日目：空席が多いのに最後部列まで使っている');
  });

  // ご希望どおりなので「連日後方」のお知らせは出さない
  var notes = r.days.reduce(function (a, d) {
    return a.concat(d.warnings.filter(function (w) { return w.type === 'rear-stay'; }));
  }, []);
  eq(notes.length, 0, 'ご希望どおりなのにお知らせが出ている');
});

test('前席と後方の両方が指定されたら、前席を優先する', function () {
  var gs = S.normalizeGroups([{ id: 'g1', size: 2, frontOption: true, rearOption: true }]);
  eq(gs[0].frontOption, true, '前席');
  eq(gs[0].rearOption, false, '後方は取り下げる');
});

test('日ごとの並びは「似ぐあい」で見る（1人動かしただけでは別物にしない）', function () {
  var r = S.assign({ layoutType: '11x45', groups: fullHouseGroups(), days: 3 });
  var maps = r.days.map(S.daySeatMap);

  // となりの日どうしは、大きく入れ替わっていること
  eq(S.daySimilarity(maps[0], maps[1]) < 0.5, true,
    '1日目と2日目が似すぎている（' + S.daySimilarity(maps[0], maps[1]).toFixed(2) + '）');
  eq(S.daySimilarity(maps[1], maps[2]) < 0.5, true,
    '2日目と3日目が似すぎている（' + S.daySimilarity(maps[1], maps[2]).toFixed(2) + '）');

  // ほとんどの組が、日ごとに実際に席を移っていること
  [[0, 1], [1, 2]].forEach(function (pair) {
    var stay = 0;
    r.groups.forEach(function (g) {
      var a = r.days[pair[0]].seatsOfGroup[g.id].slice().sort().join(',');
      var b = r.days[pair[1]].seatsOfGroup[g.id].slice().sort().join(',');
      if (a === b) stay++;
    });
    ok(stay <= r.groups.length / 4,
      (pair[0] + 1) + '日目と' + (pair[1] + 1) + '日目で ' + stay + '組が同じ席のまま');
  });
});

test('似ぐあいの計算（1席だけ違っても「ほぼ同じ」と分かる）', function () {
  var a = { 'r1-1': 'g1', 'r1-2': 'g1', 'r2-1': 'g2', 'r2-2': 'g2' };
  var b = { 'r1-1': 'g1', 'r1-2': 'g1', 'r2-1': 'g2', 'r2-2': 'g3' };
  eq(S.daySimilarity(a, a), 1, 'まったく同じ');
  eq(S.daySimilarity(a, b), 0.75, '1席だけ違う');
  eq(S.daySimilarity(a, {}), 0, 'まったく違う');
});

test('前席オプションでない組も、空いていれば前3列に座れる', function () {
  // 前席オプションが1組だけなら、前3列の残りは通常のグループが使ってよい
  var groups = [group('f1', 2, { frontOption: true }), group('g1', 1), group('g2', 4), group('g3', 4)];
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  var day = r.days[0];

  // 前席オプションの組は前3列に入っている
  day.seatsOfGroup['f1'].forEach(function (sid) {
    ok(seatRow(sid) <= 3, '前席オプションが前3列を出た');
  });
  // 前3列に空きがあれば、ほかの組が使ってよい（前から詰める仕様）
  var frontOthers = [];
  ['g1', 'g2', 'g3'].forEach(function (id) {
    day.seatsOfGroup[id].forEach(function (sid) { if (seatRow(sid) <= 3) frontOthers.push(sid); });
  });
  ok(frontOthers.length > 0, '前3列が空いているのに誰も使っていない');
  // それでも注意は出ない（決まりに反していないため）
  eq(S.inspectDay(r.layout, r.groups, day).length, 0, '注意が出ている');
});

test('男女がとなり合った席は、両方が警告の対象として分かる', function () {
  var groups = [
    group('g1', 2, { genders: ['male', 'male'] }),
    group('g2', 2, { genders: ['female', 'female'] }),
    group('g3', 2, { genders: ['male', 'male'] })
  ];
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  var day = r.days[0];
  eq(day.shared.filter(function (sh) { return sh.mixedGender; }).length, 0, '自動割り当て直後');

  // 手で入れ替えて、男女がとなり合う状態をつくる
  S.swapSeats(r.layout, day, day.seatsOfGroup['g1'][1], day.seatsOfGroup['g2'][0]);

  var mixed = day.shared.filter(function (sh) { return sh.mixedGender; });
  ok(mixed.length >= 1, '男女のとなり合わせが検出されていない');
  mixed.forEach(function (sh) {
    // 画面で色を付ける対象は、必ず2席そろっていること
    eq(sh.seatIds.length, 2, '対象の席が2つでない');
    sh.seatIds.forEach(function (sid) {
      ok(!!day.placements[sid], sid + ' に人が座っていない');
    });
    // 2席は別のグループで、性別が違うこと
    var a = day.placements[sh.seatIds[0]], b = day.placements[sh.seatIds[1]];
    ok(a.groupId !== b.groupId, '同じグループどうしが対象になっている');
    ok(a.gender !== b.gender, '同じ性別なのに対象になっている');
    // 通路をはさまず、となり合っていること
    eq(seatRow(sh.seatIds[0]), seatRow(sh.seatIds[1]), '同じ列でない');
    eq(Math.abs(seatCol(sh.seatIds[0]) - seatCol(sh.seatIds[1])), 1, 'となりでない');
  });

  // 警告メッセージと1対1で対応していること
  var msgs = S.inspectDay(r.layout, r.groups, day)
    .filter(function (i) { return i.type === 'mixed-gender'; });
  var rows = {};
  mixed.forEach(function (sh) { rows[sh.row] = true; });
  eq(msgs.length, Object.keys(rows).length, '警告の数と、色を付ける列の数が合わない');
});

test('男女のとなり合わせを直すと、警告の対象から外れる', function () {
  var groups = [
    group('g1', 2, { genders: ['male', 'male'] }),
    group('g2', 2, { genders: ['female', 'female'] }),
    group('g3', 2, { genders: ['male', 'male'] })
  ];
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  var day = r.days[0];
  var a = day.seatsOfGroup['g1'][1], b = day.seatsOfGroup['g2'][0];

  S.swapSeats(r.layout, day, a, b);
  ok(day.shared.filter(function (sh) { return sh.mixedGender; }).length >= 1, '作れていない');

  S.swapSeats(r.layout, day, a, b); // 元に戻す
  eq(day.shared.filter(function (sh) { return sh.mixedGender; }).length, 0, '直したのに残っている');
});

console.log('\n--- 4の1の3. 分かれた席の強調表示 ---');

test('分かれたグループは、どの断片にも印が付く', function () {
  var r = S.assign({ layoutType: '11x45', groups: [group('g1', 4), group('g2', 4)], days: 1 });
  var day = r.days[0];
  day.blocks.forEach(function (b) {
    eq(b.isSplit, false, '分かれていないのに印が付いている');
    eq(b.pieces, 1, 'かたまりの数');
  });

  // 手で1席だけ離れた場所へ動かして、分かれた状態をつくる
  var far = r.layout.seats.filter(function (s) {
    return !s.isCrew && !day.placements[s.id] && !day.reserved[s.id] && !day.blocked[s.id];
  }).pop().id;
  S.swapSeats(r.layout, day, day.seatsOfGroup['g1'][0], far);

  var mine = day.blocks.filter(function (b) { return b.groupId === 'g1'; });
  eq(mine.length, 2, 'g1 のかたまりの数');
  mine.forEach(function (b) {
    eq(b.isSplit, true, '分かれた断片に印が付いていない');
    eq(b.pieces, 2, '断片の数');
  });
  // ほかのグループには影響しない
  day.blocks.filter(function (b) { return b.groupId === 'g2'; }).forEach(function (b) {
    eq(b.isSplit, false, '関係ないグループに印が付いている');
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

console.log('\n--- 4の1の4. 1席ブロックのラベルが枠に収まるか ---');

// CSSで決めている寸法（css/style.css・css/print.css と揃えること）
var LABEL_STYLE = {
  screen: { cellW: 4.6 * 17, cellH: 3.4 * 17, padBottom: 1.0 * 17, pad: 0.1 * 17,
            fsBase: 0.66 * 17, fsLong: 0.58 * 17, fsCount: 0.68 * 17, lh: 1.12 },
  print:  { cellW: 30, cellH: 13, padBottom: 3.4, pad: 0.8,
            fsBase: 7 * 0.3528, fsLong: 6.2 * 0.3528, fsCount: 7 * 0.3528, lh: 1.1 }
};

// 全角はフォントサイズぶん、英数はおよそ0.56倍の幅として見積もる
function textWidth(ch, fs) {
  return /[　-鿿＀-￯]/.test(ch) ? fs : fs * 0.56;
}
function labelFits(name, hasCount, st) {
  var isLong = name.length > 12;
  var fs = isLong ? st.fsLong : st.fsBase;
  var usableW = st.cellW - st.pad * 2;
  var lines = 1, cur = 0;
  for (var i = 0; i < name.length; i++) {
    var w = textWidth(name[i], fs);
    if (cur + w > usableW) { lines++; cur = w; } else { cur += w; }
  }
  var clamp = hasCount ? 2 : 3;
  if (lines > clamp) return { ok: false, why: '行数 ' + lines + ' が上限 ' + clamp + ' を超える' };
  var h = lines * fs * st.lh + (hasCount ? st.fsCount * st.lh : 0);
  var usableH = st.cellH - st.padBottom;
  if (h > usableH) return { ok: false, why: '高さ ' + h.toFixed(1) + ' > ' + usableH.toFixed(1) };
  return { ok: true, lines: lines };
}

test('1席ブロックのラベルは、長い名字でも枠からはみ出さない', function () {
  var names = [
    'お客様A', 'お客様AA', 'お客様AAA',
    '伊藤様', '長谷川様', '五十嵐様', '勅使河原様',
    '長谷川小路右衛門様', '勅使河原三郎左衛門様'
  ];
  ['screen', 'print'].forEach(function (mode) {
    var st = LABEL_STYLE[mode];
    names.forEach(function (n) {
      // 1名グループ（人数表記なし）
      var a = labelFits(n, false, st);
      ok(a.ok, mode + ' の「' + n + '」（人数表記なし）が収まらない: ' + a.why);
      // 分割の断片など、人数表記が残るケース
      var b = labelFits(n, true, st);
      ok(b.ok, mode + ' の「' + n + '」（人数表記あり）が収まらない: ' + b.why);
    });
  });
});

test('1名のグループは、1席ブロックで人数表記を省く（1席＝1名で自明）', function () {
  var labels = S.resolveLabels([
    { id: 'g1', size: 1, surname: '勅使河原' },
    { id: 'g2', size: 4, surname: '佐藤' }
  ], { useRealName: true });
  eq(labels[0].size, 1, '1名グループ');
  eq(labels[0].label, '勅使河原様', 'ラベル');
  eq(labels[1].size, 4, '4名グループ');
  // 画面側は size===1 のときだけ人数表記を省く（app.js の hideCount 条件）
  ok(labels[0].size === 1, '省略の判断に使う size が取れる');
});

console.log('\n--- 4の1の5. 印刷の線の使い分け ---');

test('グループ枠は全色とも実線（線の種類は状態の区別だけに使う）', function () {
  var css = fs.readFileSync(path.join(__dirname, '..', 'css', 'print.css'), 'utf8');
  for (var i = 0; i < 10; i++) {
    var re = new RegExp('\\.blk\\.c' + i + ' \\{([^}]*)\\}');
    var m = css.match(re);
    ok(m, '.blk.c' + i + ' の指定がない');
    ok(!/dashed|dotted|double/.test(m[1]),
      '.blk.c' + i + ' に線の種類が指定されている: ' + m[1].trim());
  }
  // 太さも色ごとに変えない
  ok(!/\.blk\.c\d\.bt/.test(css), '色ごとの線の太さ指定が残っている');
});

test('意味のある線（分割・男女・自由席）は残っている', function () {
  var css = fs.readFileSync(path.join(__dirname, '..', 'css', 'print.css'), 'utf8');
  ok(/\.blk\.is-split \{[^}]*solid/.test(css), '分割の赤い実線がない');
  ok(/\.seat\.is-mixed \{[^}]*dashed/.test(css), '男女のオレンジ破線がない');
  ok(/\.blk-free \{[^}]*dashed/.test(css), '自由席の破線がない');
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

test('同姓が複数いるときは、名字に下のお名前をつづけて表示する', function () {
  var labels = S.resolveLabels([
    { id: 'g1', size: 2, surname: '佐藤', givenName: '太郎' },
    { id: 'g2', size: 1, surname: '佐藤', givenName: '花子' },
    { id: 'g3', size: 1, surname: '鈴木', givenName: '一郎' }
  ], { useRealName: true });
  eq(labels[0].label, '佐藤太郎様');
  eq(labels[1].label, '佐藤花子様');
  eq(labels[2].label, '鈴木様', '同姓でない人は下のお名前を出さない');
});

test('同姓なのに下のお名前が未入力なら印が付く', function () {
  var labels = S.resolveLabels([
    { id: 'g1', size: 1, surname: '佐藤' },
    { id: 'g2', size: 1, surname: '佐藤' }
  ], { useRealName: true });
  eq(labels[0].needsGivenName, true);
  eq(labels[0].label, '佐藤様');
});

test('同姓のグループどうしが、おたがいの相手を指し示す', function () {
  var labels = S.resolveLabels([
    { id: 'g1', size: 1, surname: '佐藤' },
    { id: 'g2', size: 1, surname: '鈴木' },
    { id: 'g3', size: 1, surname: '佐藤' },
    { id: 'g4', size: 1, surname: '佐藤' }
  ], { useRealName: true });
  eq(labels[0].sameSurnameGroupIds.join(','), 'g3,g4', '佐藤（1組目）から見た同姓');
  eq(labels[2].sameSurnameGroupIds.join(','), 'g1,g4', '佐藤（3組目）から見た同姓');
  eq(labels[1].sameSurnameGroupIds.join(','), '', '同姓のいない組');
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

test('色は10色の範囲に収まり、混んできたら色数を広く使う', function () {
  eq(S.COLOR_COUNT, 10, '色の数');
  var groups = [];
  for (var i = 1; i <= 14; i++) groups.push(group('g' + i, 3));
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 2 });
  Object.keys(r.colors).forEach(function (id) {
    ok(r.colors[id] >= 0 && r.colors[id] < S.COLOR_COUNT, id + ' の色 ' + r.colors[id]);
  });
  // 14組もあれば、色は広く散らばってほしい
  var used = {};
  Object.keys(r.colors).forEach(function (id) { used[r.colors[id]] = true; });
  ok(Object.keys(used).length >= 8, '使われた色が ' + Object.keys(used).length + '種しかない');
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
