/* ============================================================
 * バス座席表メーカー ／ 出来あがった座席表の検査（純粋関数）
 *
 * 現場の決まり（添乗員さん 2026-10-23）に反していないかを機械で調べます。
 * デバッグモードと test/ の両方から使います。
 *   ブラウザ: window.BusSeatChecks
 *   Node    : require('./js/checks.js')
 * ============================================================ */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BusSeatChecks = factory();
  }
})(this, function () {
  'use strict';

  /** 1日ぶんの席を、組ごとにまとめる: { groupId: [seat, ...] } */
  function seatsByGroup(layout, day) {
    var byId = {};
    layout.seats.forEach(function (s) { byId[s.id] = s; });
    var out = {};
    Object.keys(day.placements).forEach(function (sid) {
      var p = day.placements[sid];
      (out[p.groupId] = out[p.groupId] || []).push(byId[sid]);
    });
    return out;
  }

  /**
   * 画面の縦すじ（1〜5）。通常の列は col1→1, col2→2, col3→4, col4→5（3は通路）、
   * 最後部の列は col1〜5 をそのまま。前後のとなりは、この縦すじが同じ席どうし
   * （seat.js の trackOf() / physicalNeighbors() と同じ考え方）
   */
  function trackOf(lastRow, s) {
    if (s.row === lastRow) return s.col;
    return s.col <= 2 ? s.col : s.col + 1;
  }

  /** 同じ組の席がつながっているか（前後・左右。通路をまたぐ横も隣とみなす） */
  function connected(seats, lastRow) {
    var key = function (s) { return s.row + '-' + s.col; };
    var have = {};
    var byTrack = {};
    seats.forEach(function (s) {
      have[key(s)] = s;
      byTrack[s.row + '#' + trackOf(lastRow, s)] = s;
    });
    var seen = {};
    var stack = [seats[0]];
    seen[key(seats[0])] = true;
    while (stack.length) {
      var s = stack.pop();
      var next = [have[s.row + '-' + (s.col - 1)], have[s.row + '-' + (s.col + 1)],
        byTrack[(s.row - 1) + '#' + trackOf(lastRow, s)], byTrack[(s.row + 1) + '#' + trackOf(lastRow, s)]];
      next.forEach(function (n) {
        if (n && !seen[key(n)]) { seen[key(n)] = true; stack.push(n); }
      });
    }
    return Object.keys(seen).length === seats.length;
  }

  /**
   * 1日ぶんを検査して、決まりに反したところを返す。
   *   split        … 組が離ればなれ（泣き別れ）
   *   vertical     … 1席ずつの列が前後に続く（縦並び。2名・3名・4名の縦一列など）
   *   pair-shape   … 2名の組が横ペア（同じ列のとなり）になっていない
   *   no-seat      … 席が決まらず、バスの外の「席未定」の枠にいる
   *   even-shared  … 偶数の組の人が、別の組の人と同じ2人掛けに座っている（相席に使われた）
   *   crew         … 業務席にお客様が座っている（H4）
   *   sharing      … 空席に余裕があるのに、相席がある（S1）
   *   mixed-gender … 相席で、男と女が並んでいる（S3）
   *   rear-middle  … ほかに空きがあるのに、最後部の真ん中を使った
   */
  function inspect(layout, groups, day) {
    var out = [];
    var byGroup = seatsByGroup(layout, day);
    var nameOf = {};
    groups.forEach(function (g) { nameOf[g.id] = (g.surname || 'お客様' + String.fromCharCode(65 + (g.order % 26))) + '（' + g.size + '名）'; });

    Object.keys(byGroup).forEach(function (gid) {
      var seats = byGroup[gid];
      if (seats.length < 2) return;
      if (!connected(seats, layout.lastRow)) {
        out.push({ type: 'split', groupId: gid, message: nameOf[gid] + ' が離ればなれ' });
      }
      var perRow = {};
      seats.forEach(function (s) { perRow[s.row] = (perRow[s.row] || 0) + 1; });
      var rows = Object.keys(perRow).map(Number).sort(function (a, b) { return a - b; });
      for (var i = 1; i < rows.length; i++) {
        if (rows[i] === rows[i - 1] + 1 && perRow[rows[i]] === 1 && perRow[rows[i - 1]] === 1) {
          out.push({ type: 'vertical', groupId: gid, message: nameOf[gid] + ' が縦に並んだ（' + rows[i - 1] + '〜' + rows[i] + '列目）' });
          break;
        }
      }
      // 2名は横ペアだけ。通常の列は (1,2) か (3,4)、最後部の列（通路なし）はとなりどうし
      if (seats.length === 2) {
        var a = seats[0], b = seats[1];
        var lo = Math.min(a.col, b.col), hi = Math.max(a.col, b.col);
        var pair = a.row === b.row && hi === lo + 1 &&
          (a.row === layout.lastRow || lo === 1 || lo === 3);
        if (!pair) out.push({ type: 'pair-shape', groupId: gid, message: nameOf[gid] + ' が横ペアになっていない' });
      }
    });

    // 席が決まらず、バスの外の「席未定」の枠にいる組
    var waiting = {};
    (day.unplaced || []).forEach(function (u) { waiting[u.groupId] = (waiting[u.groupId] || 0) + 1; });
    Object.keys(waiting).forEach(function (gid) {
      out.push({ type: 'no-seat', groupId: gid, message: nameOf[gid] + ' のうち' + waiting[gid] + '名が席未定' });
    });

    // 偶数の組は相席に使わない（S2）。2人掛けは通常の列の (1,2) と (3,4)。
    // 最後部の列は5席が地つづきで2人掛けがないので見ない
    var sizeOf = {};
    groups.forEach(function (g) { sizeOf[g.id] = g.size; });
    var evenShared = {};
    for (var r = 1; r < layout.lastRow; r++) {
      [[1, 2], [3, 4]].forEach(function (pc) {
        var p1 = day.placements['r' + r + '-' + pc[0]];
        var p2 = day.placements['r' + r + '-' + pc[1]];
        if (!p1 || !p2 || p1.groupId === p2.groupId) return;
        [p1.groupId, p2.groupId].forEach(function (gid) {
          if (sizeOf[gid] % 2 === 0) evenShared[gid] = true;
        });
      });
    }
    Object.keys(evenShared).forEach(function (gid) {
      out.push({ type: 'even-shared', groupId: gid, message: nameOf[gid] + ' が相席に使われた（偶数の組）' });
    });

    // 業務席にお客様を置かない（H4）
    layout.seats.forEach(function (s) {
      if (s.isCrew && day.placements[s.id]) {
        out.push({ type: 'crew', message: '業務席（' + s.row + '-' + s.col + '）にお客様が座っている' });
      }
    });

    // 相席：となりどうしに、別の組の人が座っている。
    // 通常の列は2人掛け（(1,2) と (3,4)）、最後部の列は5席が地つづきなので、となりの席どうし
    var shared = [];
    for (var sr = 1; sr <= layout.lastRow; sr++) {
      var pairs = sr === layout.lastRow ? [[1, 2], [2, 3], [3, 4], [4, 5]] : [[1, 2], [3, 4]];
      pairs.forEach(function (pc) {
        var q1 = day.placements['r' + sr + '-' + pc[0]];
        var q2 = day.placements['r' + sr + '-' + pc[1]];
        if (q1 && q2 && q1.groupId !== q2.groupId) shared.push({ row: sr, cols: pc, a: q1, b: q2 });
      });
    }

    // 空席に余裕があれば、相席を作らない（S1）。余裕＝空席の数 ≧ 奇数の組の数（設計書 S1 の目安）
    var people = groups.reduce(function (s, g) { return s + g.size; }, 0);
    var spare = layout.seats.filter(function (s) { return !s.isCrew; }).length - people;
    var oddGroups = groups.filter(function (g) { return g.size % 2 === 1; }).length;
    if (spare >= oddGroups && shared.length) {
      out.push({ type: 'sharing', message: '空席に余裕がある（空席' + spare + '・奇数の組' + oddGroups + '）のに、相席が' + shared.length + 'か所ある' });
    }

    // 相席の2人は同性（S3）。性別が未入力の人は、どちらとも合うとみなす
    shared.forEach(function (sh) {
      var g1 = sh.a.gender, g2 = sh.b.gender;
      if (g1 && g2 && g1 !== 'unknown' && g2 !== 'unknown' && g1 !== g2) {
        out.push({ type: 'mixed-gender', message: sh.row + '列目（' + sh.cols.join('・') + '番席）の相席で、男と女が並んでいる' });
      }
    });

    var last = layout.lastRow;
    var middle = 'r' + last + '-3';
    if (day.placements[middle]) {
      var empty = layout.seats.filter(function (s) {
        return !s.isCrew && s.id !== middle && !day.placements[s.id];
      }).length;
      if (empty > 0) {
        out.push({ type: 'rear-middle', message: '空席が' + empty + '席あるのに、最後部の真ん中（' + last + '-3）を使った' });
      }
    }
    return out;
  }

  /** 座席表を文字で描く（デバッグ用）。組には記号 A, B, … を振る */
  function draw(layout, groups, day) {
    var mark = {};
    groups.forEach(function (g, i) { mark[g.id] = String.fromCharCode(65 + (i % 26)); });
    var lines = [];
    for (var r = 1; r <= layout.lastRow; r++) {
      var cells = layout.seats.filter(function (s) { return s.row === r; }).map(function (s) {
        if (s.isCrew) return '業';
        var p = day.placements[s.id];
        return p ? mark[p.groupId] + ' ' : '・';
      });
      var label = (r < 10 ? ' ' : '') + r + '列 ';
      lines.push(r < layout.lastRow
        ? label + cells[0] + cells[1] + '　' + cells[2] + cells[3]
        : label + cells.join(''));
    }
    if (day.unplaced && day.unplaced.length) {
      lines.push('席未定 ' + day.unplaced.map(function (u) { return mark[u.groupId]; }).join(''));
    }
    return lines.join('\n');
  }

  return { inspect: inspect, draw: draw, seatsByGroup: seatsByGroup };
});
