/* ============================================================
 * バス座席表メーカー ／ 座席の割り当てロジック（純粋関数）
 *
 * このファイルは画面（DOM）に一切触れません。
 * ブラウザからも Node からも同じ関数を呼べるようにしてあります。
 *   ブラウザ: window.BusSeat
 *   Node    : require('./js/seat.js')
 * テストは test/run.js から、このファイルだけを読み込んで実行します。
 *
 * 考え方（手書きの座席表に合わせています）
 *   グループの席は「大きな1つの四角（ブロック）」になるように割り当て、
 *   その中に名前と人数を1回だけ書く。斜めに泣き別れることはありません。
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
    var lastRow = def.rows;

    for (var r = 1; r <= lastRow; r++) {
      var cols = r < lastRow ? [1, 2, 3, 4] : [1, 2, 3, 4, 5];
      for (var i = 0; i < cols.length; i++) {
        seats.push({
          id: 'r' + r + '-' + cols[i],
          row: r,
          col: cols[i],
          side: r === lastRow ? 'B' : (cols[i] <= 2 ? 'L' : 'R'),
          isBackRow: r === lastRow,
          // 最前列の運転席側（右）2席は業務席
          isCrew: r === CREW_ROW && cols[i] >= 3
        });
      }
    }

    var usableSeats = seats.filter(function (s) { return !s.isCrew; });

    return {
      type: def.id,
      name: def.name,
      rows: def.rows,
      lastRow: lastRow,
      seats: seats,
      seatCount: seats.length,
      crewSeatCount: seats.length - usableSeats.length,
      usableSeatCount: usableSeats.length
    };
  }

  /**
   * 画面に描くときの横位置（1〜5）。通路を3番目のすき間として数えます。
   * 通常列： col1→1, col2→2, col3→4, col4→5（3は通路）
   * 最後部列：col1〜5 をそのまま 1〜5
   */
  function trackOf(layout, row, col) {
    if (row === layout.lastRow) return col;
    return col <= 2 ? col : col + 1;
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
   * 入力の整え
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
   * 相席（別グループの人と隣り合って座ること）をそもそも無くせるか。
   * 空席に余裕があり、奇数人数グループの端数を全部「空席」で吸収できるなら不要。
   */
  function shouldAvoidSharing(layout, groups) {
    var total = groups.reduce(function (s, g) { return s + g.size; }, 0);
    var spare = layout.usableSeatCount - total;
    var odd = groups.filter(function (g) { return g.size % 2 === 1; }).length;
    return spare >= odd;
  }

  /* ---------------------------------------------------------
   * 割り当て（1日分）
   *
   * ・グループは必ず「連続した四角いブロック」に入れる
   * ・席に余裕があるときは、四角が埋まらないぶんはそのグループの空席として確保する
   *   （3名なら 2席×2列の四角に3名＋空席1。手書きの座席表と同じ形）
   * ・常に前から詰める。日ごとの入れ替えは「グループの順番をずらす」ことで行う
   *   （3日間なら3分の1ずつ、4日間なら4分の1ずつ、輪のように回します）
   * ------------------------------------------------------- */

  // 横幅ごとの好み。2席（片側にきれいに収まる）がいちばん良い。
  var WIDTH_PENALTY = { 1: 4, 2: 0, 3: 3, 4: 0.5, 5: 0 };
  var MAX_WASTE = 2; // 四角にするために空けてよい席数の上限

  /**
   * d日目の「並べ始めるグループ」を決める。
   * 前席オプションを除いたグループを輪（循環リスト）とみなし、
   * 全体の人数の (d / 日数) ぶんだけ先に進んだところにある、グループの切れ目を返します。
   * グループを途中で切ることはありません。
   * @returns {number} 何番目のグループから並べ始めるか（0起点）
   */
  function startIndexForDay(rotatingGroups, dayIndex, dayCount) {
    var n = rotatingGroups.length;
    if (n === 0 || dayIndex <= 0 || dayCount <= 1) return 0;

    var total = rotatingGroups.reduce(function (s, g) { return s + g.size; }, 0);
    var target = total * (dayIndex / dayCount);

    var cum = 0;
    for (var i = 0; i < n; i++) {
      if (cum >= target - 1e-9) return i;
      cum += rotatingGroups[i].size;
    }
    return 0; // 一周した
  }

  function assignDay(layout, groups, opt) {
    opt = opt || {};
    var startIndex = Math.max(0, Number(opt.startIndex) || 0);
    var sharing = opt.sharing !== false; // true = 席が窮屈なので相席もありうる
    var warnings = [];
    var lastRow = layout.lastRow;

    var byPos = {};
    layout.seats.forEach(function (s) { byPos[s.row + ',' + s.col] = s; });
    function at(r, c) { return byPos[r + ',' + c] || null; }

    var placements = {};   // seatId -> { groupId, gender }
    var reserved = {};     // seatId -> groupId（四角を保つための、そのグループ用の空席）
    var seatsOfGroup = {};

    function taken(seat) {
      return !seat || seat.isCrew || !!placements[seat.id] || !!reserved[seat.id];
    }
    function ownerOf(seat) {
      var p = placements[seat.id];
      if (p) return p.groupId;
      return reserved[seat.id] || null;
    }
    // 通路をはさまずに隣り合う席（＝相席になりうる相手）
    function neighborsOf(seat) {
      var out = [];
      if (seat.row === lastRow) {
        [seat.col - 1, seat.col + 1].forEach(function (c) {
          var n = at(seat.row, c);
          if (n) out.push(n);
        });
      } else {
        var partner = seat.col % 2 === 1 ? seat.col + 1 : seat.col - 1;
        var n2 = at(seat.row, partner);
        if (n2) out.push(n2);
      }
      return out;
    }

    function rectSeats(r0, c0, w, h) {
      var out = [];
      for (var r = r0; r < r0 + h; r++) {
        for (var c = c0; c < c0 + w; c++) {
          var s = at(r, c);
          if (!s) return null;
          out.push(s);
        }
      }
      return out;
    }

    /**
     * この四角に、この人たちを座らせられるか。
     * 座らせられるなら「誰をどの席に」の計画を返す。無理なら null。
     */
    function planMembers(seats, members, count, groupId) {
      var inRect = {};
      seats.forEach(function (s) { inRect[s.id] = true; });

      // 通路をはさまずに別グループと隣り合う席と、そこで求められる性別
      var constraints = [];
      var hasForeign = false;
      seats.forEach(function (s) {
        var need = [];
        neighborsOf(s).forEach(function (n) {
          if (inRect[n.id]) return;
          var o = ownerOf(n);
          if (!o || o === groupId) return;
          hasForeign = true;
          var p = placements[n.id];
          if (p) need.push(p.gender);
        });
        if (need.length) constraints.push({ seat: s, need: need });
      });

      // 相席を作らない設定のときは、別グループと隣り合う四角は選ばない
      if (!sharing && hasForeign) return null;

      var pool = members.slice(0, count).map(function (m, i) { return { gender: m.gender, idx: i }; });
      var plan = {};
      var used = {};

      // 制約のある席から先に、性別の合う人を決める
      for (var i = 0; i < constraints.length; i++) {
        var c = constraints[i];
        var found = -1;
        for (var j = 0; j < pool.length; j++) {
          if (used[j]) continue;
          var okAll = c.need.every(function (g) { return genderCompatible(g, pool[j].gender); });
          if (okAll) { found = j; break; }
        }
        if (found < 0) return null; // 男女が並んでしまうので、この四角は使えない
        used[found] = true;
        plan[c.seat.id] = pool[found];
      }

      // 残りの人を、前の席から順に埋める
      var rest = [];
      for (var k = 0; k < pool.length; k++) if (!used[k]) rest.push(pool[k]);
      var ri = 0;
      var empties = [];
      seats.forEach(function (s) {
        if (plan[s.id]) return;
        if (ri < rest.length) plan[s.id] = rest[ri++];
        else empties.push(s);
      });
      if (ri < rest.length) return null;

      return { plan: plan, empties: empties };
    }

    /**
     * いちばん前で、いちばん形のよい四角を探す。
     * @param {number} count   座らせたい人数
     * @param {boolean} allowPad 四角にするために空席を作ってよいか
     * @param {boolean} frontOnly 前から3列目までに限るか
     */
    function findRect(count, allowPad, frontOnly, group, members) {
      for (var r0 = 1; r0 <= lastRow; r0++) {
        if (frontOnly && r0 > FRONT_ROWS) return null;
        var maxH = r0 === lastRow ? 1 : lastRow - r0; // 最後部列と通常列はまたがない
        var maxW = r0 === lastRow ? 5 : 4;
        var best = null;

        for (var h = 1; h <= maxH; h++) {
          if (frontOnly && r0 + h - 1 > FRONT_ROWS) break;
          for (var w = 1; w <= maxW; w++) {
            var area = w * h;
            if (area < count) continue;
            var waste = area - count;
            if (!allowPad && waste !== 0) continue;
            if (waste > MAX_WASTE) continue;

            for (var c0 = 1; c0 + w - 1 <= maxW; c0++) {
              var seats = rectSeats(r0, c0, w, h);
              if (!seats) continue;
              var blocked = false;
              for (var i = 0; i < seats.length; i++) {
                if (taken(seats[i])) { blocked = true; break; }
              }
              if (blocked) continue;

              var planned = planMembers(seats, members, count, group.id);
              if (!planned) continue;

              var score = WIDTH_PENALTY[w] + h * 0.4 + waste * 0.6;
              if (!best || score < best.score - 1e-9 ||
                  (Math.abs(score - best.score) < 1e-9 && c0 < best.c0)) {
                best = {
                  r0: r0, c0: c0, w: w, h: h,
                  seats: seats, score: score,
                  plan: planned.plan, empties: planned.empties
                };
              }
            }
          }
        }
        if (best) return best; // いちばん前の列で見つかったものを使う
      }
      return null;
    }

    // 前席オプションのグループを先に、申し込み順のまま。
    // 残りは日によって並べ始める位置をずらす（配置そのものは常に前から詰める）。
    var frontGroups = groups.filter(function (g) { return g.frontOption; });
    var restGroups = groups.filter(function (g) { return !g.frontOption; });
    if (restGroups.length > 0) {
      var k = startIndex % restGroups.length;
      restGroups = restGroups.slice(k).concat(restGroups.slice(0, k));
    }
    var ordered = frontGroups.concat(restGroups);

    ordered.forEach(function (g) {
      var members = g.members.slice();
      var placedCount = 0;
      seatsOfGroup[g.id] = [];
      var warnedFront = false;

      while (placedCount < g.size) {
        var left = g.size - placedCount;
        var rest = members.slice(placedCount);
        var pick = null;

        // 1. 希望どおりの場所に、四角を1つで
        if (g.frontOption) {
          pick = findRect(left, !sharing, true, g, rest) || findRect(left, false, true, g, rest);
          if (!pick) {
            pick = findRect(left, !sharing, false, g, rest) || findRect(left, false, false, g, rest);
            if (pick && !warnedFront) {
              warnedFront = true;
              warnings.push({
                type: 'front-overflow',
                groupId: g.id,
                message: '前席をご希望のグループが前から3列目までに収まりませんでした（グループ' + (g.order + 1) + '）。'
              });
            }
          }
        } else {
          pick = findRect(left, !sharing, false, g, rest) || findRect(left, false, false, g, rest);
        }

        // 2. 1つの四角にできないときは、いちばん大きい四角に分けて置く
        if (!pick) {
          for (var size = left - 1; size >= 1 && !pick; size--) {
            pick = findRect(size, false, g.frontOption, g, rest) ||
                   (g.frontOption ? findRect(size, false, false, g, rest) : null);
          }
          if (pick) {
            warnings.push({
              type: 'split',
              groupId: g.id,
              message: 'グループ' + (g.order + 1) + 'は、席の空きぐあいの都合で2か所以上に分かれました。'
            });
          }
        }

        if (!pick) {
          warnings.push({
            type: 'no-seat',
            groupId: g.id,
            message: '座席が足りません。グループ' + (g.order + 1) + 'の' + left + '名分を配置できませんでした。'
          });
          break;
        }

        pick.seats.forEach(function (s) {
          var m = pick.plan[s.id];
          if (m) {
            placements[s.id] = { groupId: g.id, gender: m.gender };
            seatsOfGroup[g.id].push(s.id);
            placedCount++;
          } else {
            reserved[s.id] = g.id; // 四角を保つための、このグループ用の空席
          }
        });
      }
    });

    var day = {
      startIndex: startIndex,
      shifted: startIndex > 0,
      groupOrder: ordered.map(function (g) { return g.id; }),
      sharing: sharing,
      placements: placements,
      reserved: reserved,
      seatsOfGroup: seatsOfGroup,
      warnings: warnings
    };

    day.shared = sharedPairs(layout, day);
    day.shared.forEach(function (sh) {
      if (sh.mixedGender) {
        warnings.push({
          type: 'mixed-gender',
          message: sh.row + '列目で、男女が並んで座っています。手動で入れ替えてください。'
        });
      }
    });

    return day;
  }

  /* ---------------------------------------------------------
   * 相席（通路をはさまずに別グループと隣り合っている席）の一覧
   * ------------------------------------------------------- */

  function sharedPairs(layout, day) {
    var lastRow = layout.lastRow;
    var byPos = {};
    layout.seats.forEach(function (s) { byPos[s.row + ',' + s.col] = s; });

    var out = [];
    var seen = {};
    layout.seats.forEach(function (seat) {
      var a = day.placements[seat.id];
      if (!a) return;
      var partners = [];
      if (seat.row === lastRow) {
        partners = [byPos[seat.row + ',' + (seat.col - 1)], byPos[seat.row + ',' + (seat.col + 1)]];
      } else {
        partners = [byPos[seat.row + ',' + (seat.col % 2 === 1 ? seat.col + 1 : seat.col - 1)]];
      }
      partners.forEach(function (n) {
        if (!n) return;
        var b = day.placements[n.id];
        if (!b || b.groupId === a.groupId) return;
        var key = [seat.id, n.id].sort().join('|');
        if (seen[key]) return;
        seen[key] = true;
        out.push({
          key: key,
          row: seat.row,
          seatIds: [seat.id, n.id],
          groupIds: [a.groupId, b.groupId],
          genders: [a.gender, b.gender],
          mixedGender: a.gender !== 'unknown' && b.gender !== 'unknown' && a.gender !== b.gender
        });
      });
    });
    return out;
  }

  /* ---------------------------------------------------------
   * ブロック（グループを囲む四角）の組み立て
   * 席の入れ替えをしたあとでも、そのときの座席から作り直せます。
   * ------------------------------------------------------- */

  function computeBlocks(layout, day) {
    var lastRow = layout.lastRow;
    var byPos = {};
    layout.seats.forEach(function (s) { byPos[s.row + ',' + s.col] = s; });

    var ownerBySeat = {};
    Object.keys(day.placements).forEach(function (id) {
      ownerBySeat[id] = day.placements[id].groupId;
    });
    Object.keys(day.reserved || {}).forEach(function (id) {
      if (!ownerBySeat[id]) ownerBySeat[id] = day.reserved[id];
    });

    var byGroup = {};
    Object.keys(ownerBySeat).forEach(function (id) {
      var g = ownerBySeat[id];
      (byGroup[g] = byGroup[g] || {})[id] = true;
    });

    var blocks = [];
    Object.keys(byGroup).forEach(function (gid) {
      var pool = byGroup[gid];
      var guard = 0;
      while (Object.keys(pool).length > 0 && guard++ < 100) {
        var best = biggestRect(pool);
        if (!best) break;
        best.seats.forEach(function (s) { delete pool[s.id]; });
        blocks.push({
          groupId: gid,
          row0: best.r0, row1: best.r0 + best.h - 1,
          col0: best.c0, col1: best.c0 + best.w - 1,
          trackStart: trackOf(layout, best.r0, best.c0),
          trackEnd: trackOf(layout, best.r0, best.c0 + best.w - 1),
          seatIds: best.seats.map(function (s) { return s.id; }),
          people: best.seats.filter(function (s) { return !!day.placements[s.id]; }).length
        });
      }
    });

    // 前の席のブロックほど先に。ラベルはブロックに1回だけ描きます。
    blocks.sort(function (a, b) { return a.row0 - b.row0 || a.col0 - b.col0; });
    return blocks;

    function biggestRect(pool) {
      var best = null;
      for (var r0 = 1; r0 <= lastRow; r0++) {
        var maxH = r0 === lastRow ? 1 : lastRow - r0;
        var maxW = r0 === lastRow ? 5 : 4;
        for (var h = 1; h <= maxH; h++) {
          for (var w = 1; w <= maxW; w++) {
            for (var c0 = 1; c0 + w - 1 <= maxW; c0++) {
              var seats = [];
              var ok = true;
              for (var r = r0; r < r0 + h && ok; r++) {
                for (var c = c0; c < c0 + w; c++) {
                  var s = byPos[r + ',' + c];
                  if (!s || !pool[s.id]) { ok = false; break; }
                  seats.push(s);
                }
              }
              if (!ok) continue;
              var area = w * h;
              if (!best || area > best.area || (area === best.area && r0 < best.r0)) {
                best = { r0: r0, c0: c0, w: w, h: h, area: area, seats: seats };
              }
            }
          }
        }
      }
      return best;
    }
  }

  /**
   * 使われていない後方のかたまり（＝自由席として囲む領域）。
   * 誰も座っていない列が後ろに続いている場合だけ返します。
   */
  function freeAreaBlock(layout, day) {
    var used = {};
    Object.keys(day.placements).forEach(function (id) { used[id] = true; });
    Object.keys(day.reserved || {}).forEach(function (id) { used[id] = true; });

    var lastUsedRow = 0;
    layout.seats.forEach(function (s) {
      if (used[s.id] && s.row > lastUsedRow) lastUsedRow = s.row;
    });
    if (lastUsedRow === 0) return null;          // 誰も乗っていない
    if (lastUsedRow >= layout.lastRow) return null; // 後方に空きがない

    return { row0: lastUsedRow + 1, row1: layout.lastRow, rows: layout.lastRow - lastUsedRow };
  }

  /* ---------------------------------------------------------
   * グループの色分け（隣り合うグループが同色にならないように）
   * ------------------------------------------------------- */

  var COLOR_COUNT = 6;

  function buildColors(layout, days, groups) {
    var seatById = {};
    layout.seats.forEach(function (s) { seatById[s.id] = s; });

    var adj = {};
    groups.forEach(function (g) { adj[g.id] = {}; });

    days.forEach(function (day) {
      var owner = {};
      Object.keys(day.placements).forEach(function (id) { owner[id] = day.placements[id].groupId; });
      Object.keys(day.reserved || {}).forEach(function (id) {
        if (!owner[id]) owner[id] = day.reserved[id];
      });

      Object.keys(owner).forEach(function (seatId) {
        var seat = seatById[seatId];
        var me = owner[seatId];
        layout.seats.forEach(function (other) {
          if (other.id === seatId) return;
          var near =
            (other.row === seat.row && Math.abs(other.col - seat.col) === 1) ||
            (Math.abs(other.row - seat.row) === 1 && other.col === seat.col);
          if (!near) return;
          var o = owner[other.id];
          if (!o || o === me) return;
          if (!adj[me] || !adj[o]) return;
          adj[me][o] = true;
          adj[o][me] = true;
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

    var rotating = groups.filter(function (g) { return !g.frontOption; });

    var days = [];
    for (var d = 0; d < dayCount; d++) {
      var day = assignDay(layout, groups, {
        startIndex: startIndexForDay(rotating, d, dayCount),
        sharing: sharing
      });
      day.dayIndex = d;
      day.blocks = computeBlocks(layout, day);
      day.freeArea = freeAreaBlock(layout, day);
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

  function swapSeats(layout, day, seatIdA, seatIdB) {
    var p = day.placements;
    var res = day.reserved || (day.reserved = {});
    var a = p[seatIdA], b = p[seatIdB];
    var ra = res[seatIdA], rb = res[seatIdB];

    if (a) p[seatIdB] = a; else delete p[seatIdB];
    if (b) p[seatIdA] = b; else delete p[seatIdA];
    // 四角を保つための空席も一緒に入れ替える
    if (ra) res[seatIdB] = ra; else delete res[seatIdB];
    if (rb) res[seatIdA] = rb; else delete res[seatIdA];
    // 人が座った席は「確保しただけの空席」ではなくなる
    if (p[seatIdA]) delete res[seatIdA];
    if (p[seatIdB]) delete res[seatIdB];

    day.seatsOfGroup = {};
    Object.keys(p).forEach(function (sid) {
      var gid = p[sid].groupId;
      (day.seatsOfGroup[gid] = day.seatsOfGroup[gid] || []).push(sid);
    });

    day.shared = sharedPairs(layout, day);
    day.blocks = computeBlocks(layout, day);
    day.freeArea = freeAreaBlock(layout, day);
    return day;
  }

  return {
    LAYOUTS: LAYOUTS,
    FRONT_ROWS: FRONT_ROWS,
    COLOR_COUNT: COLOR_COUNT,
    buildLayout: buildLayout,
    trackOf: trackOf,
    normalizeGroups: normalizeGroups,
    shouldAvoidSharing: shouldAvoidSharing,
    startIndexForDay: startIndexForDay,
    assignDay: assignDay,
    assign: assign,
    resolveLabels: resolveLabels,
    buildColors: buildColors,
    computeBlocks: computeBlocks,
    freeAreaBlock: freeAreaBlock,
    sharedPairs: sharedPairs,
    swapSeats: swapSeats,
    maru: maru
  };
});
