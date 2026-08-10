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
    ok(!sh.mixedGender, sh.seatIds.join('/') + ' で男女が並んでいる');
  });
  eq(r.warnings.filter(function (w) { return w.type === 'mixed-gender'; }).length, 0, '男女同席の警告');
});

test('性別が未入力の人は誰とでも相席できる（判定は入力頼み）', function () {
  var groups = [];
  for (var i = 1; i <= 14; i++) groups.push(group('g' + i, 3));
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  eq(r.warnings.filter(function (w) { return w.type === 'mixed-gender'; }).length, 0, '未入力で警告は出さない');
});

console.log('\n--- 3の2. グループは大きな四角（ブロック）で囲む ---');

test('各グループの席は四角いブロックになる（斜めに割れない）', function () {
  var groups = [group('g1', 2), group('g2', 4), group('g3', 3), group('g4', 6), group('g5', 1), group('g6', 5)];
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  var day = r.days[0];
  groups.forEach(function (g) {
    var owned = ownedSeats(day, g.id);
    ok(owned.length >= g.size, g.id + ' の席が足りない');
    ok(isRectangle(owned), g.id + ' の席が四角になっていない: ' + owned.join(','));
  });
});

test('4名グループは正方形（2列×2席）または同一列の4席になる', function () {
  var groups = [group('g1', 4), group('g2', 4), group('g3', 4), group('g4', 4)];
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 1 });
  groups.forEach(function (g) {
    var bs = blocksOf(r.days[0], g.id);
    eq(bs.length, 1, g.id + ' が複数ブロックに割れた');
    var b = bs[0];
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

test('端数のグループは四角を保つため空席を確保する（3名なら2席×2列）', function () {
  var r = S.assign({ layoutType: '11x45', groups: [group('g1', 3)], days: 1 });
  var day = r.days[0];
  var owned = ownedSeats(day, 'g1');
  eq(owned.length, 4, '確保した席数');
  eq(day.seatsOfGroup['g1'].length, 3, '人が座る席数');
  eq(Object.keys(day.reserved).length, 1, '四角を保つための空席');
  ok(isRectangle(owned), '四角になっていない');
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
});

test('席を入れ替えたあともブロックは作り直される', function () {
  var r = S.assign({ layoutType: '11x45', groups: [group('g1', 4), group('g2', 4)], days: 1 });
  var day = r.days[0];
  var before = blocksOf(day, 'g1').length;
  eq(before, 1, '入れ替え前');
  var a = day.seatsOfGroup['g1'][0];
  var far = r.layout.seats.filter(function (s) {
    return !s.isCrew && !day.placements[s.id] && !day.reserved[s.id];
  }).pop().id;
  S.swapSeats(r.layout, day, a, far);
  ok(blocksOf(day, 'g1').length >= 1, '入れ替え後にブロックが無い');
  ok(day.blocks.every(function (b) { return isRectangle(b.seatIds); }), 'ブロックが四角でない');
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
      ok(isRectangle(ownedSeats(day, g.id)), (di + 1) + '日目に' + g.id + 'が分断された');
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

test('ずらした日でもグループのブロックは四角のまま', function () {
  var groups = [group('g1', 2), group('g2', 3), group('g3', 4), group('g4', 5), group('g5', 6)];
  var r = S.assign({ layoutType: '11x45', groups: groups, days: 2 });
  r.days.forEach(function (day, di) {
    groups.forEach(function (g) {
      ok(isRectangle(ownedSeats(day, g.id)), (di + 1) + '日目の' + g.id + ' が四角でない');
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
