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

  /** 同じ組の席がつながっているか（前後・左右。通路をまたぐ横も隣とみなす） */
  function connected(seats) {
    var key = function (s) { return s.row + '-' + s.col; };
    var have = {};
    seats.forEach(function (s) { have[key(s)] = s; });
    var seen = {};
    var stack = [seats[0]];
    seen[key(seats[0])] = true;
    while (stack.length) {
      var s = stack.pop();
      [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(function (d) {
        var k = (s.row + d[0]) + '-' + (s.col + d[1]);
        if (have[k] && !seen[k]) { seen[k] = true; stack.push(have[k]); }
      });
    }
    return Object.keys(seen).length === seats.length;
  }

  /**
   * 1日ぶんを検査して、決まりに反したところを返す。
   *   split        … 組が離ればなれ（泣き別れ）
   *   vertical     … 1席ずつの列が前後に続く（縦並び。2名・3名・4名の縦一列など）
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
      if (!connected(seats)) {
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
    return lines.join('\n');
  }

  return { inspect: inspect, draw: draw, seatsByGroup: seatsByGroup };
});
