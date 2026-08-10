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

  /**
   * 申し込み順の記号（A・B・C…、26組を超えたら AA・AB…）。
   * 人数の丸数字（②など）と見分けやすいよう、グループの呼び名は英字にしています。
   */
  function alpha(n) {
    n = Number(n);
    if (!isFinite(n) || n < 1) return String(n);
    var out = '';
    while (n > 0) {
      var r = (n - 1) % 26;
      out = String.fromCharCode(65 + r) + out;
      n = Math.floor((n - 1) / 26);
    }
    return out;
  }

  /* ---------------------------------------------------------
   * 表示ラベル
   *  - 既定は「お客様A」（申し込み順の記号）。個人名は出さない。
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
      var auto = 'お客様' + alpha(no);
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
        mark: alpha(no),
        label: label,
        frontOption: !!g.frontOption,
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

  /**
   * 座席を配置するための道具ひとそろい。
   * 1日ぶんの状態（day）に対して働きます。自動割り当てにも、あとからの手動移動にも同じものを使います。
   */
  function createPlacer(layout, day) {
    var lastRow = layout.lastRow;
    var byPos = {};
    layout.seats.forEach(function (s) { byPos[s.row + ',' + s.col] = s; });

    day.placements = day.placements || {};
    day.reserved = day.reserved || {};   // 四角の中の、そのグループ用の空席
    day.blocked = day.blocked || {};     // 四角の外だが、相席を避けるため空けておく席

    function at(r, c) { return byPos[r + ',' + c] || null; }
    function sharing() { return day.sharing !== false; }

    function taken(seat) {
      return !seat || seat.isCrew ||
        !!day.placements[seat.id] || !!day.reserved[seat.id] || !!day.blocked[seat.id];
    }
    function ownerOf(seat) {
      var p = day.placements[seat.id];
      if (p) return p.groupId;
      return day.reserved[seat.id] || null;
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

      var constraints = [];
      var hasForeign = false;
      seats.forEach(function (s) {
        var need = [];
        neighborsOf(s).forEach(function (n) {
          if (inRect[n.id]) return;
          var o = ownerOf(n);
          if (!o || o === groupId) return;
          hasForeign = true;
          var pp = day.placements[n.id];
          if (pp) need.push(pp.gender);
        });
        if (need.length) constraints.push({ seat: s, need: need });
      });

      // 相席を作らない設定のときは、別グループと隣り合う四角は選ばない
      if (!sharing() && hasForeign) return null;

      var pool = members.slice(0, count).map(function (m) { return { gender: m.gender }; });
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

      var rest = [];
      for (var k = 0; k < pool.length; k++) if (!used[k]) rest.push(pool[k]);
      var ri = 0;
      seats.forEach(function (s) {
        if (plan[s.id]) return;
        if (ri < rest.length) plan[s.id] = rest[ri++];
      });
      if (ri < rest.length) return null;

      return { plan: plan };
    }

    /**
     * いちばん前（または指定の列から近い順）で、いちばん形のよいかたまりを探す。
     * 形は「四角」を基本に、角を欠けさせたL字も候補にします。
     * 好みの順は 四角（ぴったり） ＞ L字（空席なし） ＞ 取り置き空席つきの四角。
     * @param {number} count    座らせたい人数
     * @param {boolean} allowPad 四角にするために空席を作ってよいか
     * @param {object} opt      { frontOnly, fromRow, origin:{row,col}, groupId, members }
     */
    function findRect(count, allowPad, opt) {
      opt = opt || {};
      // 1名は必ず1席ぶんの枠にする（2人組に見えてしまうため、余分な席を枠に含めない）
      if (count <= 1) allowPad = false;

      var rows = rowOrder(opt);
      for (var ri = 0; ri < rows.length; ri++) {
        var r0 = rows[ri];
        if (opt.frontOnly && r0 > FRONT_ROWS) continue;
        if (opt.origin && r0 !== opt.origin.row) continue;

        var maxH = r0 === lastRow ? 1 : lastRow - r0; // 最後部列と通常列はまたがない
        var maxW = r0 === lastRow ? 5 : 4;
        var best = null;

        for (var h = 1; h <= maxH; h++) {
          if (opt.frontOnly && r0 + h - 1 > FRONT_ROWS) break;
          for (var w = 1; w <= maxW; w++) {
            var area = w * h;
            if (area < count) continue;
            if (area - count > MAX_WASTE) continue;

            for (var c0 = 1; c0 + w - 1 <= maxW; c0++) {
              if (opt.origin && c0 !== opt.origin.col) continue;
              var full = rectSeats(r0, c0, w, h);
              if (!full) continue;
              var busy = false;
              for (var i = 0; i < full.length; i++) {
                if (taken(full[i])) { busy = true; break; }
              }
              if (busy) continue;

              // 候補の形（そのままの四角／角を欠けさせたL字）
              var shapes = shapeCandidates(full, w, h, count, allowPad);
              for (var si = 0; si < shapes.length; si++) {
                var sh = shapes[si];
                var planned = planMembers(sh.seats, opt.members, count, opt.groupId);
                if (!planned) continue;

                var score = WIDTH_PENALTY[w] + h * 0.4 + sh.waste * 0.6 + sh.cut * 0.15;
                if (!best || score < best.score - 1e-9 ||
                    (Math.abs(score - best.score) < 1e-9 && c0 < best.c0)) {
                  best = {
                    r0: r0, c0: c0, w: w, h: h, cut: sh.cut,
                    seats: sh.seats, score: score, plan: planned.plan
                  };
                }
              }
            }
          }
        }
        if (best) return best; // 見つかった列のなかでいちばん形のよいもの
      }
      return null;
    }

    /**
     * 四角の枠から、実際に使う席のかたまりの候補を作る。
     * ・そのままの四角（余るぶんは取り置きの空席になる）
     * ・角を1〜2席ぶん欠けさせたL字（空席が出ない）
     * 欠けさせたあとも、前後左右でひとつながりであることを確かめます。
     */
    function shapeCandidates(full, w, h, count, allowPad) {
      var out = [];
      var area = full.length;
      var waste = area - count;

      if (waste === 0) {
        out.push({ seats: full, cut: 0, waste: 0 });
        return out;
      }
      if (allowPad) out.push({ seats: full, cut: 0, waste: waste });
      if (waste > 2) return out;

      // 角から waste 席ぶん欠けさせる。
      // 前の列・窓側を残したいので、後ろ・通路側の角から先に試します。
      var corners = [[h - 1, w - 1], [h - 1, 0], [0, w - 1], [0, 0]];
      var seen = {};
      corners.forEach(function (cn) {
        var patterns = [[cn]];
        if (waste === 2) {
          patterns = [];
          // 角のとなり（同じ列方向／同じ席方向）をもう1席
          if (w >= 2) patterns.push([cn, [cn[0], cn[1] === 0 ? 1 : w - 2]]);
          if (h >= 2) patterns.push([cn, [cn[0] === 0 ? 1 : h - 2, cn[1]]]);
        }
        patterns.forEach(function (cells) {
          var drop = {};
          cells.forEach(function (c) { drop[c[0] + ',' + c[1]] = true; });
          if (Object.keys(drop).length !== waste) return;

          var kept = [];
          for (var i = 0; i < h; i++) {
            for (var j = 0; j < w; j++) {
              if (!drop[i + ',' + j]) kept.push({ i: i, j: j, seat: full[i * w + j] });
            }
          }
          if (kept.length !== count) return;
          if (!isConnectedCells(kept)) return;

          var key = kept.map(function (k) { return k.seat.id; }).join('|');
          if (seen[key]) return;
          seen[key] = true;
          out.push({
            seats: kept.map(function (k) { return k.seat; }),
            cut: waste, waste: 0
          });
        });
      });
      return out;
    }

    // 前後左右でひとつながりか（斜めだけのつながりは認めない）
    function isConnectedCells(cells) {
      if (cells.length <= 1) return true;
      var set = {};
      cells.forEach(function (c) { set[c.i + ',' + c.j] = c; });
      var queue = [cells[0]];
      var seen = {};
      seen[cells[0].i + ',' + cells[0].j] = true;
      var n = 1;
      while (queue.length) {
        var cur = queue.pop();
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
          var k = (cur.i + d[0]) + ',' + (cur.j + d[1]);
          if (set[k] && !seen[k]) { seen[k] = true; n++; queue.push(set[k]); }
        });
      }
      return n === cells.length;
    }

    // 探す列の順番。ふつうは前から。移動のときは指定の列から後ろへ、なければ前へ戻る。
    function rowOrder(opt) {
      var all = [];
      for (var r = 1; r <= lastRow; r++) all.push(r);
      if (!opt.fromRow || opt.fromRow <= 1) return all;
      var k = Math.min(opt.fromRow, lastRow) - 1;
      return all.slice(k).concat(all.slice(0, k));
    }

    /** 決まった四角に、実際に座らせる */
    function applyRect(pick, group) {
      var inRect = {};
      pick.seats.forEach(function (s) { inRect[s.id] = true; });

      pick.seats.forEach(function (s) {
        var m = pick.plan[s.id];
        if (m) {
          day.placements[s.id] = { groupId: group.id, gender: m.gender };
        } else {
          day.reserved[s.id] = group.id; // 四角を保つための、このグループ用の空席
        }
      });

      // 相席を作らない設定のときは、四角からはみ出す2人掛けの相方を空けておく。
      // この席は枠の外に置き、ふつうの空席として見せる（1名を2名に見せないため）。
      if (!sharing()) {
        pick.seats.forEach(function (s) {
          neighborsOf(s).forEach(function (n) {
            if (inRect[n.id] || taken(n)) return;
            day.blocked[n.id] = group.id;
          });
        });
      }
    }

    /** グループを座席表から取り除く */
    function removeGroup(groupId) {
      [day.placements, day.reserved, day.blocked].forEach(function (map) {
        Object.keys(map).forEach(function (id) {
          var owner = map === day.placements ? map[id].groupId : map[id];
          if (owner === groupId) delete map[id];
        });
      });
    }

    /**
     * グループ1組ぶんを置く。1つの四角に収まらないときは分割する。
     * @returns {array} 出た注意の一覧
     */
    function placeGroup(g, opt) {
      opt = opt || {};
      var warnings = [];
      var pad = sharing() ? false : true;
      var placedCount = 0;
      var warnedFront = false;
      var guard = 0;

      while (placedCount < g.size && guard++ < 60) {
        var left = g.size - placedCount;
        var rest = g.members.slice(placedCount);
        var base = { groupId: g.id, members: rest, fromRow: opt.fromRow };
        var pick = null;

        if (opt.origin && placedCount === 0) {
          // 指定の席を起点にできるなら、そこに置く
          pick = findRect(left, pad, merge(base, { origin: opt.origin })) ||
                 findRect(left, false, merge(base, { origin: opt.origin }));
        }

        if (!pick && g.frontOption && !opt.ignoreFront) {
          pick = findRect(left, pad, merge(base, { frontOnly: true })) ||
                 findRect(left, false, merge(base, { frontOnly: true }));
          if (!pick) {
            pick = findRect(left, pad, base) || findRect(left, false, base);
            if (pick && !warnedFront) {
              warnedFront = true;
              warnings.push({
                type: 'front-overflow',
                groupId: g.id,
                message: '前席をご希望のグループが前から3列目までに収まりませんでした（お客様' + alpha(g.order + 1) + '）。'
              });
            }
          }
        } else if (!pick) {
          pick = findRect(left, pad, base) || findRect(left, false, base);
        }

        // 1つの四角にできないときは、いちばん大きい四角に分けて置く
        if (!pick) {
          for (var size = left - 1; size >= 1 && !pick; size--) {
            pick = findRect(size, false, base);
          }
          if (pick) {
            warnings.push({
              type: 'split',
              groupId: g.id,
              message: 'お客様' + alpha(g.order + 1) + 'は、席の空きぐあいの都合で2か所以上に分かれました。'
            });
          }
        }

        if (!pick) {
          warnings.push({
            type: 'no-seat',
            groupId: g.id,
            message: '座席が足りません。お客様' + alpha(g.order + 1) + 'の' + left + '名分を配置できませんでした。'
          });
          break;
        }

        applyRect(pick, g);
        placedCount += Object.keys(pick.plan).length;
      }
      return warnings;
    }

    function merge(a, b) {
      var out = {};
      Object.keys(a).forEach(function (k) { out[k] = a[k]; });
      Object.keys(b).forEach(function (k) { out[k] = b[k]; });
      return out;
    }

    return {
      at: at,
      taken: taken,
      neighborsOf: neighborsOf,
      findRect: findRect,
      applyRect: applyRect,
      removeGroup: removeGroup,
      placeGroup: placeGroup
    };
  }

  /** そのグループが占めている四角の左上（いちばん前・いちばん左）の席 */
  function originOfGroup(day, groupId) {
    var row = null, col = null;
    function check(id, owner) {
      if (owner !== groupId) return;
      var m = /^r(\d+)-(\d+)$/.exec(id);
      if (!m) return;
      var r = Number(m[1]), c = Number(m[2]);
      if (row === null || r < row || (r === row && c < col)) { row = r; col = c; }
    }
    Object.keys(day.placements).forEach(function (id) { check(id, day.placements[id].groupId); });
    Object.keys(day.reserved || {}).forEach(function (id) { check(id, day.reserved[id]); });
    return row === null ? null : { row: row, col: col };
  }

  function refreshDay(layout, day) {
    day.seatsOfGroup = {};
    Object.keys(day.placements).forEach(function (sid) {
      var gid = day.placements[sid].groupId;
      (day.seatsOfGroup[gid] = day.seatsOfGroup[gid] || []).push(sid);
    });
    day.shared = sharedPairs(layout, day);
    day.blocks = computeBlocks(layout, day);
    day.freeArea = freeAreaBlock(layout, day);
    return day;
  }

  function assignDay(layout, groups, opt) {
    opt = opt || {};
    var startIndex = Math.max(0, Number(opt.startIndex) || 0);
    var frontStartIndex = Math.max(0, Number(opt.frontStartIndex) || 0);
    var warnings = [];

    var day = {
      startIndex: startIndex,
      frontStartIndex: frontStartIndex,
      shifted: startIndex > 0 || frontStartIndex > 0,
      sharing: opt.sharing !== false, // true = 席が窮屈なので相席もありうる
      placements: {},
      reserved: {},
      blocked: {},
      warnings: warnings
    };
    var placer = createPlacer(layout, day);

    // 前席オプションのグループを先に。
    // 前席組は「前3列のなか」で、それ以外は「バス全体」で、日ごとに並べ始める位置をずらす。
    var frontGroups = rotate(groups.filter(function (g) { return g.frontOption; }), frontStartIndex);
    var restGroups = rotate(groups.filter(function (g) { return !g.frontOption; }), startIndex);
    var ordered = frontGroups.concat(restGroups);
    day.groupOrder = ordered.map(function (g) { return g.id; });

    ordered.forEach(function (g) {
      placer.placeGroup(g).forEach(function (w) { warnings.push(w); });
    });

    refreshDay(layout, day);
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

  function rotate(list, k) {
    if (list.length === 0) return list;
    var n = k % list.length;
    return list.slice(n).concat(list.slice(0, n));
  }

  /* ---------------------------------------------------------
   * 手動調整：グループごと動かす
   * ------------------------------------------------------- */

  function snapshot(day) {
    return JSON.stringify({ p: day.placements, r: day.reserved, b: day.blocked });
  }
  function restore(day, snap) {
    var s = JSON.parse(snap);
    day.placements = s.p; day.reserved = s.r; day.blocked = s.b;
  }
  function groupById(groups, id) {
    for (var i = 0; i < groups.length; i++) if (groups[i].id === id) return groups[i];
    return null;
  }

  /**
   * グループを、指定した席を起点に動かす。
   * その席にぴったり置けないときは、その列から近いところに置き直します。
   * @returns {object} { ok, reason, groupId, size, seatId, warnings }
   *   reason は失敗の理由コード。日本語の文にするのは画面側（app.js）の仕事です。
   */
  function moveGroup(layout, groups, day, groupId, targetSeatId) {
    var g = groupById(groups, groupId);
    if (!g) return { ok: false, reason: 'group-not-found' };

    var seat = seatById(layout, targetSeatId);
    if (!seat) return { ok: false, reason: 'seat-not-found', seatId: targetSeatId };
    if (seat.isCrew) return { ok: false, reason: 'crew-seat', seatId: targetSeatId };

    var owner = ownerOfSeat(day, targetSeatId);
    if (owner === groupId) {
      return { ok: false, reason: 'same-group', groupId: groupId, seatId: targetSeatId };
    }

    var origin = { row: seat.row, col: seat.col };
    var snap = snapshot(day);
    var placer = createPlacer(layout, day);
    placer.removeGroup(groupId);

    var warnings = placer.placeGroup(g, { origin: origin, fromRow: origin.row, ignoreFront: true });
    if (warnings.some(function (w) { return w.type === 'no-seat'; })) {
      restore(day, snap);
      refreshDay(layout, day);
      return { ok: false, reason: 'no-room', groupId: groupId, size: g.size, seatId: targetSeatId };
    }
    refreshDay(layout, day);
    return { ok: true, reason: 'moved', groupId: groupId, seatId: targetSeatId, warnings: warnings };
  }

  /**
   * 2つのグループの場所を入れ替える。
   * 人数が違う場合は、相手のいた場所を起点に置き直します。
   * @returns {object} { ok, reason, groupId, otherGroupId, size, warnings }
   */
  function swapGroups(layout, groups, day, groupIdA, groupIdB) {
    var ga = groupById(groups, groupIdA);
    var gb = groupById(groups, groupIdB);
    if (!ga) return { ok: false, reason: 'group-not-found', groupId: groupIdA };
    if (!gb) return { ok: false, reason: 'group-not-found', groupId: groupIdB };
    if (groupIdA === groupIdB) {
      return { ok: false, reason: 'same-group', groupId: groupIdA };
    }

    var oa = originOfGroup(day, groupIdA);
    var ob = originOfGroup(day, groupIdB);
    if (!oa) return { ok: false, reason: 'not-seated', groupId: groupIdA };
    if (!ob) return { ok: false, reason: 'not-seated', groupId: groupIdB };

    var snap = snapshot(day);
    var placer = createPlacer(layout, day);
    placer.removeGroup(groupIdA);
    placer.removeGroup(groupIdB);

    var wa = placer.placeGroup(ga, { origin: ob, fromRow: ob.row, ignoreFront: true });
    var wb = placer.placeGroup(gb, { origin: oa, fromRow: oa.row, ignoreFront: true });
    var failed = null;
    if (wa.some(function (w) { return w.type === 'no-seat'; })) failed = ga;
    else if (wb.some(function (w) { return w.type === 'no-seat'; })) failed = gb;

    if (failed) {
      restore(day, snap);
      refreshDay(layout, day);
      return {
        ok: false, reason: 'no-room-swap',
        groupId: failed.id, size: failed.size,
        otherGroupId: failed.id === groupIdA ? groupIdB : groupIdA
      };
    }
    refreshDay(layout, day);
    return {
      ok: true, reason: 'swapped',
      groupId: groupIdA, otherGroupId: groupIdB,
      warnings: wa.concat(wb)
    };
  }

  function seatById(layout, seatId) {
    for (var i = 0; i < layout.seats.length; i++) {
      if (layout.seats[i].id === seatId) return layout.seats[i];
    }
    return null;
  }
  function ownerOfSeat(day, seatId) {
    var p = day.placements[seatId];
    if (p) return p.groupId;
    return (day.reserved || {})[seatId] || null;
  }

  /* ---------------------------------------------------------
   * 手動で直したあとの見直し
   * 自動割り当ては決まりを守るので、ふつうは何も出ません。
   * 手で動かして決まりから外れたときだけ、注意として拾い上げます。
   * ------------------------------------------------------- */

  function inspectDay(layout, groups, day) {
    var issues = [];
    var byId = {};
    groups.forEach(function (g) { byId[g.id] = g; });
    function nameOf(g) { return 'お客様' + alpha(g.order + 1); }

    // 1. 前席オプションのグループが前3列の外に出ていないか
    groups.forEach(function (g) {
      if (!g.frontOption) return;
      var seats = (day.seatsOfGroup && day.seatsOfGroup[g.id]) || [];
      var out = seats.filter(function (sid) {
        var m = /^r(\d+)-/.exec(sid);
        return m && Number(m[1]) > FRONT_ROWS;
      });
      if (out.length) {
        issues.push({
          type: 'front-out', groupId: g.id,
          message: nameOf(g) + '（前席オプション）が' + (FRONT_ROWS + 1) + '列目以降にいます。'
        });
      }
    });

    // 2. 男女の相席が起きていないか
    (day.shared || []).forEach(function (sh) {
      if (!sh.mixedGender) return;
      issues.push({
        type: 'mixed-gender', row: sh.row,
        message: sh.row + '列目で男女が相席になっています。'
      });
    });

    // 3. グループが離れ離れになっていないか
    var blockCount = {};
    (day.blocks || []).forEach(function (b) {
      blockCount[b.groupId] = (blockCount[b.groupId] || 0) + 1;
    });
    Object.keys(blockCount).forEach(function (gid) {
      if (blockCount[gid] > 1 && byId[gid]) {
        issues.push({
          type: 'split', groupId: gid,
          message: nameOf(byId[gid]) + 'の席が' + blockCount[gid] + 'か所に分かれています。'
        });
      }
    });

    // 4. 人数ぶんの席があるか
    groups.forEach(function (g) {
      var seats = (day.seatsOfGroup && day.seatsOfGroup[g.id]) || [];
      if (seats.length !== g.size) {
        issues.push({
          type: 'seat-count', groupId: g.id,
          message: nameOf(g) + '（' + g.size + '名）の席が' + seats.length + '席しかありません。'
        });
      }
    });

    // 5. 業務席にお客様が座っていないか
    layout.seats.forEach(function (s) {
      if (s.isCrew && day.placements[s.id]) {
        issues.push({
          type: 'crew-seat', seatId: s.id,
          message: s.row + '列目の業務席にお客様が座っています。'
        });
      }
    });

    // 同じ内容の注意は1件にまとめる
    var seen = {};
    return issues.filter(function (i) {
      var key = i.type + '|' + i.message;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
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
   * ブロック（グループを囲む枠）の組み立て
   * 席の入れ替えをしたあとでも、そのときの座席から作り直せます。
   * 形は四角に限らず、L字などひとつながりの形をそのまま囲みます。
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
      components(byGroup[gid]).forEach(function (comp) {
        blocks.push(describe(gid, comp));
      });
    });

    blocks.sort(function (a, b) { return a.row0 - b.row0 || a.col0 - b.col0; });
    return blocks;

    // ひとつながりのかたまりに分ける（前後左右でつながっていること）
    function components(pool) {
      var rest = {};
      Object.keys(pool).forEach(function (id) { rest[id] = true; });
      var out = [];
      while (true) {
        var ids = Object.keys(rest);
        if (ids.length === 0) break;
        var queue = [ids[0]];
        delete rest[ids[0]];
        var comp = [];
        while (queue.length) {
          var id = queue.pop();
          var seat = byIdSeat(id);
          comp.push(seat);
          neighbors(seat).forEach(function (n) {
            if (n && rest[n.id]) { delete rest[n.id]; queue.push(n.id); }
          });
        }
        out.push(comp);
      }
      return out;
    }

    function byIdSeat(id) {
      var m = /^r(\d+)-(\d+)$/.exec(id);
      return byPos[Number(m[1]) + ',' + Number(m[2])];
    }

    // 前後左右のとなり。通路をはさむ左右（2席目と3席目）もとなりとして扱います。
    function neighbors(seat) {
      return [
        byPos[seat.row + ',' + (seat.col - 1)],
        byPos[seat.row + ',' + (seat.col + 1)],
        seat.row === lastRow ? null : byPos[(seat.row - 1) + ',' + seat.col],
        seat.row + 1 === lastRow ? null : byPos[(seat.row + 1) + ',' + seat.col]
      ];
    }

    // かたまりの外周をなぞるための情報を作る
    function describe(gid, comp) {
      var inBlock = {};
      comp.forEach(function (s) { inBlock[s.row + ',' + s.col] = true; });
      function has(r, c) { return !!inBlock[r + ',' + c]; }

      var cells = comp.map(function (s) {
        return {
          seatId: s.id,
          row: s.row,
          col: s.col,
          track: trackOf(layout, s.row, s.col),
          top: !has(s.row - 1, s.col) || s.row === lastRow,
          bottom: !has(s.row + 1, s.col) || s.row + 1 === lastRow,
          left: !has(s.row, s.col - 1),
          right: !has(s.row, s.col + 1)
        };
      });

      // 通路をまたいでつながっている行は、通路のすじにも枠の線を渡す
      var bridges = [];
      if (comp[0].row !== lastRow) {
        var rows = {};
        comp.forEach(function (s) { rows[s.row] = true; });
        Object.keys(rows).map(Number).forEach(function (r) {
          if (has(r, 2) && has(r, 3)) bridges.push({ row: r, track: 3 });
        });
      }

      var rowsAll = comp.map(function (s) { return s.row; });
      var colsAll = comp.map(function (s) { return s.col; });
      var r0 = Math.min.apply(null, rowsAll), r1 = Math.max.apply(null, rowsAll);
      var c0 = Math.min.apply(null, colsAll), c1 = Math.max.apply(null, colsAll);

      return {
        groupId: gid,
        row0: r0, row1: r1, col0: c0, col1: c1,
        trackStart: trackOf(layout, r0, c0),
        trackEnd: trackOf(layout, r0, c1),
        isRect: comp.length === (r1 - r0 + 1) * (c1 - c0 + 1),
        cells: cells,
        bridges: bridges,
        // ラベルは、かたまりの中でいちばん広い四角の真ん中に1回だけ描く
        label: widestRect(inBlock, r0, r1, c0, c1),
        seatIds: comp.map(function (s) { return s.id; }),
        people: comp.filter(function (s) { return !!day.placements[s.id]; }).length
      };
    }

    // かたまりの中に収まる、いちばん広い四角
    function widestRect(inBlock, r0, r1, c0, c1) {
      var best = null;
      for (var ra = r0; ra <= r1; ra++) {
        for (var rb = ra; rb <= r1; rb++) {
          for (var ca = c0; ca <= c1; ca++) {
            for (var cb = ca; cb <= c1; cb++) {
              var ok = true;
              for (var r = ra; r <= rb && ok; r++) {
                for (var c = ca; c <= cb; c++) {
                  if (!inBlock[r + ',' + c]) { ok = false; break; }
                }
              }
              if (!ok) continue;
              var area = (rb - ra + 1) * (cb - ca + 1);
              var wide = cb - ca + 1;
              if (!best || area > best.area || (area === best.area && wide > best.wide)) {
                best = {
                  area: area, wide: wide,
                  row0: ra, row1: rb, col0: ca, col1: cb,
                  trackStart: trackOf(layout, ra, ca),
                  trackEnd: trackOf(layout, ra, cb)
                };
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

    // 前席オプション組は「前3列のなか」で、それ以外は「バス全体」で、それぞれ日ごとに巡回させる
    var frontRotating = groups.filter(function (g) { return g.frontOption; });
    var rotating = groups.filter(function (g) { return !g.frontOption; });

    var days = [];
    for (var d = 0; d < dayCount; d++) {
      var day = assignDay(layout, groups, {
        startIndex: startIndexForDay(rotating, d, dayCount),
        frontStartIndex: startIndexForDay(frontRotating, d, dayCount),
        sharing: sharing
      });
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

  function swapSeats(layout, day, seatIdA, seatIdB) {
    if (seatIdA === seatIdB) return { ok: false, reason: 'same-seat', seatId: seatIdA };
    var sa = seatById(layout, seatIdA);
    var sb = seatById(layout, seatIdB);
    if (!sa) return { ok: false, reason: 'seat-not-found', seatId: seatIdA };
    if (!sb) return { ok: false, reason: 'seat-not-found', seatId: seatIdB };
    if (sa.isCrew) return { ok: false, reason: 'crew-seat', seatId: seatIdA };
    if (sb.isCrew) return { ok: false, reason: 'crew-seat', seatId: seatIdB };

    var p = day.placements;
    var res = day.reserved || (day.reserved = {});
    var blk = day.blocked || (day.blocked = {});
    var a = p[seatIdA], b = p[seatIdB];
    var ra = res[seatIdA], rb = res[seatIdB];
    var ba = blk[seatIdA], bb = blk[seatIdB];

    if (a) p[seatIdB] = a; else delete p[seatIdB];
    if (b) p[seatIdA] = b; else delete p[seatIdA];
    // 取り置きの空席も一緒に入れ替える
    if (ra) res[seatIdB] = ra; else delete res[seatIdB];
    if (rb) res[seatIdA] = rb; else delete res[seatIdA];
    if (ba) blk[seatIdB] = ba; else delete blk[seatIdB];
    if (bb) blk[seatIdA] = bb; else delete blk[seatIdA];
    // 人が座った席は「取り置きの空席」ではなくなる
    [seatIdA, seatIdB].forEach(function (id) {
      if (p[id]) { delete res[id]; delete blk[id]; }
    });

    refreshDay(layout, day);
    return { ok: true, reason: 'swapped', seatIds: [seatIdA, seatIdB] };
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
    alpha: alpha,
    buildColors: buildColors,
    computeBlocks: computeBlocks,
    freeAreaBlock: freeAreaBlock,
    sharedPairs: sharedPairs,
    originOfGroup: originOfGroup,
    inspectDay: inspectDay,
    swapSeats: swapSeats,
    moveGroup: moveGroup,
    swapGroups: swapGroups,
    maru: maru
  };
});
