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
function unitOf(layout, seatId) {
  for (var i = 0; i < layout.units.length; i++) {
    if (layout.units[i].seats.some(function (s) { return s.id === seatId; })) return layout.units[i];
  }
  return null;
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

test('前席オプションは反転日でも前3列のまま', function () {
  var groups = [
    group('f1', 2, { frontOption: true }),
    group('g1', 4), group('g2', 4), group('g3', 4)
  ];
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 3 });
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

test('満席に近いときは相席が起きるが、男女は同席にならない', function () {
  // 43席に対して 奇数グループを多く詰める
  var groups = [];
  for (var i = 1; i <= 14; i++) {
    groups.push(group('g' + i, 3, { genders: i % 2 ? ['male', 'male', 'male'] : ['female', 'female', 'female'] }));
  }
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  eq(r.sharing, true, '相席モード');
  ok(r.days[0].shared.length > 0, '相席が1件も起きていない（テスト条件が不適切）');
  r.days[0].shared.forEach(function (sh) {
    var g = sh.genders.filter(function (x) { return x !== 'unknown'; });
    ok(g.every(function (x) { return x === g[0]; }), sh.unitId + ' で男女が同席している');
  });
  eq(r.warnings.filter(function (w) { return w.type === 'mixed-gender'; }).length, 0, '男女同席の警告');
});

test('性別が未入力の人は誰とでも相席できる（判定は入力頼み）', function () {
  var groups = [];
  for (var i = 1; i <= 14; i++) groups.push(group('g' + i, 3));
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  eq(r.warnings.filter(function (w) { return w.type === 'mixed-gender'; }).length, 0, '未入力で警告は出さない');
});

test('グループの席はできるだけ固まる（2人組は同じ2人掛け）', function () {
  var L = S.buildLayout('11x45');
  var groups = [group('g1', 2), group('g2', 2), group('g3', 2)];
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  ['g1', 'g2', 'g3'].forEach(function (id) {
    var us = r.days[0].seatsOfGroup[id].map(function (sid) { return unitOf(L, sid).id; });
    eq(us[0], us[1], id + ' が別々の席に分かれた');
  });
});

console.log('\n--- 4. 複数日と前後反転 ---');

test('2日目は1日目の前方グループが後方に回る', function () {
  var groups = [];
  for (var i = 1; i <= 8; i++) groups.push(group('g' + i, 4));
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 2 });
  var d1 = Math.min.apply(null, r.days[0].seatsOfGroup['g1'].map(seatRow));
  var d2 = Math.min.apply(null, r.days[1].seatsOfGroup['g1'].map(seatRow));
  ok(d2 > d1, '1日目' + d1 + '列 → 2日目' + d2 + '列（後方に回っていない）');

  var last = 'g8';
  var e1 = Math.min.apply(null, r.days[0].seatsOfGroup[last].map(seatRow));
  var e2 = Math.min.apply(null, r.days[1].seatsOfGroup[last].map(seatRow));
  ok(e2 < e1, '最後尾グループが前方に来ていない');
});

test('3日目は1日目と同じ向き（交互に反転）', function () {
  var groups = [];
  for (var i = 1; i <= 8; i++) groups.push(group('g' + i, 4));
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 4 });
  eq(r.days[0].reversed, false, '1日目');
  eq(r.days[1].reversed, true, '2日目');
  eq(r.days[2].reversed, false, '3日目');
  eq(r.days[3].reversed, true, '4日目');
  eq(JSON.stringify(r.days[0].placements), JSON.stringify(r.days[2].placements), '1日目と3日目');
});

test('日数分の座席表ができる', function () {
  var r = S.assign({ layoutType: '12x49', groups: [group('g1', 2)], days: 3 });
  eq(r.days.length, 3, '日数');
});

console.log('\n--- 5. 表示ラベル ---');

test('既定は自動ラベル「お客様①」（個人名を出さない）', function () {
  var labels = S.resolveLabels([
    { id: 'g1', size: 2, surname: '山田' },
    { id: 'g2', size: 1, surname: '鈴木' }
  ], {});
  eq(labels[0].label, 'お客様①');
  eq(labels[1].label, 'お客様②');
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

test('名字が未入力なら実名表示ONでも自動ラベルのまま', function () {
  var labels = S.resolveLabels([{ id: 'g1', size: 3 }], { useRealName: true });
  eq(labels[0].label, 'お客様①');
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
  var a = r.days[0].seatsOfGroup['g1'][0];
  var b = r.days[0].seatsOfGroup['g2'][0];
  S.swapSeats(day, a, b);
  eq(day.placements[a].groupId, 'g2');
  eq(day.placements[b].groupId, 'g1');
  ok(day.seatsOfGroup['g1'].indexOf(b) >= 0, '入れ替え後の席一覧');
});

test('空席との入れ替えもできる', function () {
  var r = S.assign({ layoutType: '11x45', groups: [group('g1', 1)], days: 1 });
  var day = r.days[0];
  var a = day.seatsOfGroup['g1'][0];
  var empty = r.layout.seats.filter(function (s) { return !s.isCrew && !day.placements[s.id]; })[0].id;
  S.swapSeats(day, a, empty);
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
