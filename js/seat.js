/* ============================================================
 * バス座席表メーカー ／ 座席の割り当てロジック（純粋関数）
 *
 * このファイルは画面（DOM）に一切触れません。
 * ブラウザからも Node からも同じ関数を呼べるようにしてあります。
 *   ブラウザ: window.BusSeat
 *   Node    : require('./js/seat.js')
 * テストは test/run.js から、このファイルだけを読み込んで実行します。
 * ============================================================ */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BusSeat = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------------------------------------------------
   * 座席レイアウト
   * ------------------------------------------------------- */

  // 日本の大型観光バスは運転席が右。最前列の右2席を業務席（乗務員・添乗員用）とする。
  var LAYOUTS = {
    '11x45': { id: '11x45', rows: 11, seatCount: 45, name: '11列45席' },
    '12x49': { id: '12x49', rows: 12, seatCount: 49, name: '12列49席' }
  };

  var CREW_ROW = 1;   // 業務席のある列
  var FRONT_ROWS = 3; // 「前席」とみなす列数（前から3列目まで）

  /**
   * 座席レイアウトを組み立てる。
   * 通常列は 左2席（col 1,2）＋通路＋右2席（col 3,4）。最後部列だけ5席横並び（col 1〜5）。
   * col1 = 左窓 / col2 = 左通路 / col3 = 右通路 / col4 = 右窓
   */
  function buildLayout(type) {
    var def = LAYOUTS[type];
    if (!def) throw new Error('知らない座席レイアウトです: ' + type);

    var seats = [];
    var units = [];
    var lastRow = def.rows;

    for (var r = 1; r <= lastRow; r++) {
      if (r < lastRow) {
        makeUnit('L', [1, 2]);
        makeUnit('R', [3, 4]);
      } else {
        makeUnit('B', [1, 2, 3, 4, 5]);
      }
    }

    function makeUnit(side, cols) {
      var us = [];
      for (var i = 0; i < cols.length; i++) {
        var seat = {
          id: 'r' + r + '-' + cols[i],
          row: r,
          col: cols[i],
          side: side,
          isBackRow: r === lastRow,
          // 最前列の運転席側（右）2席は業務席
          isCrew: r === CREW_ROW && side === 'R'
        };
        seats.push(seat);
        us.push(seat);
      }
      units.push({
        id: 'u' + r + side,
        row: r,
        side: side,
        seats: us,
        capacity: us.length,
        isCrew: us[0].isCrew
      });
    }

    var usableSeats = seats.filter(function (s) { return !s.isCrew; });

    return {
      type: def.id,
      name: def.name,
      rows: def.rows,
      lastRow: lastRow,
      seats: seats,
      units: units,
      seatCount: seats.length,
      crewSeatCount: seats.length - usableSeats.length,
      usableSeatCount: usableSeats.length
    };
  }

  /* ---------------------------------------------------------
   * 丸数字（①②③…）
   * ------------------------------------------------------- */

  function maru(n) {
    n = Number(n);
    if (!isFinite(n) || n < 1) return String(n);
    if (n <= 20) return String.fromCharCode(0x2460 + (n - 1));   // ①〜⑳
    if (n <= 35) return String.fromCharCode(0x3251 + (n - 21));  // ㉑〜㉟
    if (n <= 50) return String.fromCharCode(0x32b1 + (n - 36));  // ㊱〜㊿
    return '(' + n + ')';
  }

  /* ---------------------------------------------------------
   * 表示ラベル
   *  - 既定は「お客様①」（申し込み順の番号）。個人名は出さない。
   *  - 実名表示をONにしたときだけ「名字＋様」。同姓が複数いればフルネームに切り替える。
   * ------------------------------------------------------- */

  function resolveLabels(groups, options) {
    options = options || {};
    var useRealName = !!options.useRealName;

    var count = {};
    groups.forEach(function (g) {
      var s = (g.surname || '').trim();
      if (s) count[s] = (count[s] || 0) + 1;
    });

    return groups.map(function (g, i) {
      var no = i + 1;
      var auto = 'お客様' + maru(no);
      var surname = (g.surname || '').trim();
      var full = (g.fullName || '').trim();
      var label = auto;
      var duplicated = false;

      if (useRealName && surname) {
        duplicated = count[surname] > 1;
        if (duplicated && full) label = full + '様';
        else label = surname + '様';
      }

      return {
        groupId: g.id,
        no: no,
        label: label,
        autoLabel: auto,
        usedRealName: useRealName && !!surname,
        duplicatedSurname: duplicated,
        // 同姓が複数なのにフルネーム未入力 → 画面で注意を出すための印
        needsFullName: duplicated && !full,
        size: g.size,
        sizeMark: maru(g.size)
      };
    });
  }

  /* ---------------------------------------------------------
   * 割り当て
   * ------------------------------------------------------- */

  function normalizeGroups(groups) {
    return (groups || []).map(function (g, i) {
      var size = Math.max(1, Number(g.size) || 1);
      var members = [];
      for (var m = 0; m < size; m++) {
        var raw = (g.members && g.members[m] && g.members[m].gender) || 'unknown';
        members.push({ gender: raw === 'male' || raw === 'female' ? raw : 'unknown' });
      }
      return {
        id: g.id != null ? g.id : 'g' + (i + 1),
        order: i,
        size: size,
        members: members,
        frontOption: !!g.frontOption,
        surname: g.surname || '',
        fullName: g.fullName || ''
      };
    });
  }

  function genderCompatible(a, b) {
    if (a === 'unknown' || b === 'unknown') return true;
    return a === b;
  }

  /**
   * 相席（別グループの人と同じ2人掛けに座ること）をそもそも無くせるか。
   * 空席に余裕があり、奇数人数グループの端数ぶんを全部「空席」で吸収できるなら不要。
   */
  function shouldAvoidSharing(layout, groups) {
    var total = groups.reduce(function (s, g) { return s + g.size; }, 0);
    var spare = layout.usableSeatCount - total;
    var odd = groups.filter(function (g) { return g.size % 2 === 1; }).length;
    return spare >= odd;
  }

  /**
   * 1日分の割り当て。
   * @param {object} layout buildLayout() の戻り値
   * @param {array}  groups normalizeGroups() 済みのグループ
   * @param {object} opt    { reversed: boolean, sharing: boolean }
   */
  function assignDay(layout, groups, opt) {
    opt = opt || {};
    var reversed = !!opt.reversed;
    var sharing = opt.sharing !== false;
    var warnings = [];

    // 業務席の列は割り当て対象から外す
    var usableUnits = layout.units.filter(function (u) { return !u.isCrew; });

    var state = usableUnits.map(function (u) {
      return { unit: u, occupants: [] };
    });
    var byUnitId = {};
    state.forEach(function (s) { byUnitId[s.unit.id] = s; });

    var forward = state.slice();
    var backward = state.slice().reverse();
    var frontUnits = forward.filter(function (s) { return s.unit.row <= FRONT_ROWS; });

    // 前席オプションのグループを先に、申し込み順のまま処理する
    var ordered = groups.filter(function (g) { return g.frontOption; })
      .concat(groups.filter(function (g) { return !g.frontOption; }));

    var placements = {};   // seatId -> { groupId, gender }
    var seatsOfGroup = {}; // groupId -> [seatId]

    ordered.forEach(function (g) {
      // 前席オプションは常に前3列から詰める（反転の対象外）。溢れたら後ろへ流す。
      var cands = g.frontOption ? frontUnits.concat(forward) : (reversed ? backward : forward);
      var members = g.members.slice();
      var placed = 0;
      seatsOfGroup[g.id] = [];

      while (placed < g.size) {
        var need = g.size - placed;
        var gender = members[placed].gender;
        var target =
          findSameGroup(cands, g.id) ||
          (need === 1 && sharing ? findShareable(cands, gender) : null) ||
          findEmpty(cands) ||
          (sharing ? findShareable(cands, gender) : null);

        if (!target) {
          warnings.push({
            type: 'no-seat',
            groupId: g.id,
            message: '座席が足りません。グループ' + (g.order + 1) + 'の' + (g.size - placed) + '名分を配置できませんでした。'
          });
          break;
        }

        var free = target.unit.capacity - target.occupants.length;
        var take = Math.min(free, need);
        for (var i = 0; i < take; i++) {
          var seat = target.unit.seats[target.occupants.length];
          target.occupants.push({ groupId: g.id, gender: members[placed].gender });
          placements[seat.id] = { groupId: g.id, gender: members[placed].gender };
          seatsOfGroup[g.id].push(seat.id);
          placed++;
        }

        if (g.frontOption && target.unit.row > FRONT_ROWS) {
          warnings.push({
            type: 'front-overflow',
            groupId: g.id,
            message: '前席をご希望のグループが前から3列目までに収まりませんでした（グループ' + (g.order + 1) + '）。'
          });
        }
      }
    });

    // 相席（別グループと同じ2人掛け／最後部列で同席）の一覧
    var shared = [];
    state.forEach(function (s) {
      var ids = {};
      s.occupants.forEach(function (o) { ids[o.groupId] = true; });
      if (Object.keys(ids).length > 1) {
        shared.push({
          unitId: s.unit.id,
          row: s.unit.row,
          groupIds: Object.keys(ids),
          genders: s.occupants.map(function (o) { return o.gender; })
        });
      }
    });

    // 男女が同じ2人掛けになってしまった場合は警告（入力に不整合があるときのみ起きる）
    shared.forEach(function (sh) {
      var g = sh.genders.filter(function (x) { return x !== 'unknown'; });
      var mixed = g.some(function (x) { return x !== g[0]; });
      if (mixed) {
        warnings.push({
          type: 'mixed-gender',
          message: sh.row + '列目で、男女が同じ席に並んでいます。手動で入れ替えてください。'
        });
      }
    });

    return {
      reversed: reversed,
      sharing: sharing,
      placements: placements,
      seatsOfGroup: seatsOfGroup,
      shared: shared,
      warnings: warnings
    };

    function findEmpty(list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].occupants.length === 0) return list[i];
      }
      return null;
    }
    function findSameGroup(list, id) {
      for (var i = 0; i < list.length; i++) {
        var s = list[i];
        if (s.occupants.length > 0 &&
            s.occupants.length < s.unit.capacity &&
            s.occupants.every(function (o) { return o.groupId === id; })) return s;
      }
      return null;
    }
    function findShareable(list, gender) {
      for (var i = 0; i < list.length; i++) {
        var s = list[i];
        if (s.occupants.length === 0) continue;
        if (s.occupants.length >= s.unit.capacity) continue;
        var ok = s.occupants.every(function (o) { return genderCompatible(o.gender, gender); });
        if (ok) return s;
      }
      return null;
    }
  }

  /* ---------------------------------------------------------
   * グループの色分け（隣り合うグループが同じ色にならないように）
   * ------------------------------------------------------- */

  var COLOR_COUNT = 6;

  function buildColors(layout, days, groups) {
    var seatById = {};
    layout.seats.forEach(function (s) { seatById[s.id] = s; });

    // 隣接（同じ列の隣の席／前後の列の同じ位置／同じ2人掛け）を集める
    var adj = {};
    groups.forEach(function (g) { adj[g.id] = {}; });

    days.forEach(function (day) {
      Object.keys(day.placements).forEach(function (seatId) {
        var seat = seatById[seatId];
        var me = day.placements[seatId].groupId;
        layout.seats.forEach(function (other) {
          if (other.id === seatId) return;
          var near =
            (other.row === seat.row && Math.abs(other.col - seat.col) === 1) ||
            (Math.abs(other.row - seat.row) === 1 && other.col === seat.col);
          if (!near) return;
          var p = day.placements[other.id];
          if (!p || p.groupId === me) return;
          adj[me][p.groupId] = true;
          adj[p.groupId][me] = true;
        });
      });
    });

    var colors = {};
    groups.forEach(function (g) {
      var used = {};
      Object.keys(adj[g.id]).forEach(function (other) {
        if (colors[other] != null) used[colors[other]] = true;
      });
      var c = 0;
      while (used[c] && c < COLOR_COUNT - 1) c++;
      colors[g.id] = c;
    });
    return colors;
  }

  /* ---------------------------------------------------------
   * まとめて割り当て（複数日）
   * ------------------------------------------------------- */

  /**
   * @param {object} input {
   *   layoutType: '11x45' | '12x49',
   *   groups: [...],
   *   days: 1以上の整数,
   *   useRealName: boolean
   * }
   */
  function assign(input) {
    input = input || {};
    var layout = buildLayout(input.layoutType || '11x45');
    var groups = normalizeGroups(input.groups);
    var dayCount = Math.max(1, Number(input.days) || 1);
    var sharing = input.sharing != null ? !!input.sharing : !shouldAvoidSharing(layout, groups);

    var days = [];
    for (var d = 0; d < dayCount; d++) {
      var day = assignDay(layout, groups, { reversed: d % 2 === 1, sharing: sharing });
      day.dayIndex = d;
      days.push(day);
    }

    var labels = resolveLabels(groups, { useRealName: input.useRealName });
    var colors = buildColors(layout, days, groups);

    var total = groups.reduce(function (s, g) { return s + g.size; }, 0);

    return {
      layout: layout,
      groups: groups,
      labels: labels,
      colors: colors,
      days: days,
      sharing: sharing,
      totalPeople: total,
      spareSeats: layout.usableSeatCount - total,
      warnings: days.reduce(function (a, d2) { return a.concat(d2.warnings); }, [])
    };
  }

  /* ---------------------------------------------------------
   * 手動調整：2席を入れ替える
   * ------------------------------------------------------- */

  function swapSeats(day, seatIdA, seatIdB) {
    var p = day.placements;
    var a = p[seatIdA];
    var b = p[seatIdB];
    if (!a && !b) return day;
    if (a) p[seatIdB] = a; else delete p[seatIdB];
    if (b) p[seatIdA] = b; else delete p[seatIdA];

    // seatsOfGroup を作り直す
    day.seatsOfGroup = {};
    Object.keys(p).forEach(function (sid) {
      var gid = p[sid].groupId;
      (day.seatsOfGroup[gid] = day.seatsOfGroup[gid] || []).push(sid);
    });
    return day;
  }

  return {
    LAYOUTS: LAYOUTS,
    FRONT_ROWS: FRONT_ROWS,
    COLOR_COUNT: COLOR_COUNT,
    buildLayout: buildLayout,
    normalizeGroups: normalizeGroups,
    shouldAvoidSharing: shouldAvoidSharing,
    assignDay: assignDay,
    assign: assign,
    resolveLabels: resolveLabels,
    buildColors: buildColors,
    swapSeats: swapSeats,
    maru: maru
  };
});
