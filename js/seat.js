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

  /**
   * 席の物理的なとなり（前後左右）。
   * 最後部列は5席で、その前の列（4席）とは席の数が違うので、
   * 「画面の縦すじ（track）が同じもの」を前後のとなりとして扱います。
   *   前の列 col1→track1 / col2→track2 / col3→track4 / col4→track5
   *   最後部列 col1〜5 →track1〜5（真ん中のcol3＝track3は通路の延長なので、前に席がない）
   */
  function physicalNeighbors(layout, seat) {
    var lastRow = layout.lastRow;
    var byPos = layout._byPos;
    if (!byPos) {
      byPos = layout._byPos = {};
      layout.seats.forEach(function (x) { byPos[x.row + ',' + x.col] = x; });
    }
    var byTrack = layout._byTrack;
    if (!byTrack) {
      byTrack = layout._byTrack = {};
      layout.seats.forEach(function (x) { byTrack[x.row + '#' + trackOf(layout, x.row, x.col)] = x; });
    }

    var out = [];
    // 左右（通路をはさむ左右も、となりとして数えます）
    [seat.col - 1, seat.col + 1].forEach(function (c) {
      var n = byPos[seat.row + ',' + c];
      if (n) out.push(n);
    });
    // 前後は「縦すじが同じ席」
    var t = trackOf(layout, seat.row, seat.col);
    [seat.row - 1, seat.row + 1].forEach(function (r) {
      if (r < 1 || r > lastRow) return;
      var n = byTrack[r + '#' + t];
      if (n) out.push(n);
    });
    return out;
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
      var given = (g.givenName || '').trim();
      var label = auto;
      var duplicated = false;

      if (useRealName && surname) {
        duplicated = count[surname] > 1;
        // 同姓のお客様がいるときだけ、名字に下のお名前をつづけてフルネームにする
        if (duplicated && given) label = surname + given + '様';
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
        // 同姓が複数なのに下のお名前が未入力 → 画面で注意を出すための印
        needsGivenName: duplicated && !given,
        // 同じ名字のほかのグループ（画面から行き来できるようにするため）
        sameSurnameGroupIds: duplicated ? groups.filter(function (o) {
          return o.id !== g.id && (o.surname || '').trim() === surname;
        }).map(function (o) { return o.id; }) : [],
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
        givenName: g.givenName || ''
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
  var WIDTH_PENALTY = { 1: 4, 2: 0, 3: 1.2, 4: 0.5, 5: 0 };

  /**
   * 人数ごとの「理想のかたち」。実際の座席表（阪急交通社の現場）に合わせています。
   * w = 横幅（通路をまたぐぶんも数える）／ h = 前後の列数。
   * 人数が w×h より少ない形は、角が欠けたかたちになります。
   *
   *   1名  ■          2名  ■■          3名  ■■｜■     （通路をまたいだ横一列）
   *
   *   4名  ■■        5名  ■■｜■      6名  ■■｜■■
   *        ■■             ■■｜□           ■■｜□□
   *
   *   7名  ■■｜■■    8名  ■■｜■■
   *        □■｜■■         ■■｜■■
   *        （空ける1席は窓側。左右どちらの窓側かは問いません）
   *
   * 左右どちらに寄せるか、前後どちらに寄せるかは区別しません
   * （パズルとして解けることを優先します）。
   */
  var IDEAL_SHAPES = {
    1: { w: 1, h: 1 },
    2: { w: 2, h: 1 },
    3: { w: 3, h: 1 },
    4: { w: 2, h: 2 },
    5: { w: 3, h: 2 },
    6: { w: 4, h: 2 }
  };

  var ROW_SEATS = 4; // 通常列の座席数（左2席＋右2席）

  /**
   * 人数から理想のかたちを求める。
   * 7名以上は「横一列（4席）をまるごと使う列を必要なだけ重ね、あまりを次の列に置く」形です。
   *   7名 → 4席×2列から1席空け（空けるのは窓側）
   *   8名 → 4席×2列をまるごと
   *   9名 → 4席×2列＋1名／10名 → ＋2名／11名 → ＋3名（空きは1席なので窓側）
   * あまりを列のどちら端に寄せるかは決めません（パズルとして解けることを優先）。
   */
  function idealShapeOf(count) {
    if (IDEAL_SHAPES[count]) return IDEAL_SHAPES[count];
    if (count < ROW_SEATS * 2 - 1) return null; // 1〜6名は上の表がすべて
    var h = Math.ceil(count / ROW_SEATS);
    var holes = ROW_SEATS * h - count;
    // 空きが1席だけのときは、その1席は窓側にする（通路側にぽつんと空くのは不自然）
    return { w: ROW_SEATS, h: h, holeAtWindow: holes === 1 };
  }

  /** そのグループが使ってよい奥行き（前後の列数）。大人数ほど深くなります */
  function depthLimitFor(count) {
    var want = idealShapeOf(count);
    return want ? Math.max(MAX_DEPTH, want.h) : MAX_DEPTH;
  }

  /** 四角にするために空けてよい席数。大人数は「列のあまり」ぶんまで許します */
  function wasteLimitFor(count) {
    return idealShapeOf(count) ? Math.max(MAX_WASTE, ROW_SEATS - 1) : MAX_WASTE;
  }
  var IDEAL_BONUS = 2.5; // 理想のかたちに収まったときの、ごほうび点（他の好みより強い）
  var ROW_LOOKAHEAD = 1; // 理想のかたちを求めて、うしろの列を何列ぶんまで見にいくか
  var ROW_PENALTY = 1.0; // 1列うしろにずらすことへの減点（IDEAL_BONUS より小さくしてある）
  var WINDOW_PENALTY = 0.3; // おひとり様が窓側でないことへの減点（列の前後より弱くしてある）

  /**
   * おひとり様は窓側が自然なので、通路側だと軽く減点します。
   * 同じ列のなかでの選び分けにだけ効く強さにしてあり、
   * これが理由でうしろの列に回ることはありません。
   * 窓側＝通常列は col1（左窓）と col4（右窓）／最後部列は col1 と col5。
   */
  function windowPenalty(count, cells, lastRow) {
    if (count !== 1 || cells.length !== 1) return 0;
    var c = cells[0];
    var isWindow = c.row === lastRow
      ? (c.col === 1 || c.col === 5)
      : (c.col === 1 || c.col === 4);
    return isWindow ? 0 : WINDOW_PENALTY;
  }

  // 理想のかたちを、お客様に見せる言葉にしたもの
  var IDEAL_SHAPE_NAMES = {
    1: '1席',
    2: '横に2席',
    3: '通路をまたいだ横一列（■■｜■）',
    4: '片側に集めた正方形（■■／■■）',
    5: '正方形＋通路をまたいで1席（■■｜■／■■）',
    6: '横一列4席＋2席（■■｜■■／■■）'
  };

  /** 理想のかたちを、お客様に見せる言葉にする */
  function idealShapeName(count) {
    if (IDEAL_SHAPE_NAMES[count]) return IDEAL_SHAPE_NAMES[count];
    var want = idealShapeOf(count);
    if (!want) return '';
    var full = Math.floor(count / ROW_SEATS);
    var rest = count - full * ROW_SEATS;
    if (rest === 0) return '横一列4席×' + full + '列（' + full + '列まるごと）';
    if (ROW_SEATS - rest === 1) {
      return '横一列4席×' + (full + 1) + '列から、窓側を1席だけ空けた形';
    }
    return '横一列4席×' + full + '列＋次の列に' + rest + '席';
  }

  /**
   * 理想のかたちに収まらなかったグループを拾う。
   * ひとつづきに座れているグループだけを見ます
   * （離れ離れになっている場合は、それ自体をもっと重い注意として別に出すため）。
   */
  function nonIdealGroups(groups, day) {
    var count = {};
    var box = {};
    (day.blocks || []).forEach(function (b) {
      count[b.groupId] = (count[b.groupId] || 0) + 1;
      box[b.groupId] = b;
    });
    return groups.filter(function (g) {
      if (count[g.id] !== 1) return false;
      var want = idealShapeOf(g.size);
      if (!want) return false;
      var b = box[g.id];
      if (b.people !== g.size) return false; // 取り置き空席つきの枠は別の話
      return (b.col1 - b.col0 + 1) !== want.w || (b.row1 - b.row0 + 1) !== want.h;
    });
  }

  /** 「理想のかたちになっていません」のお知らせ文。該当なしなら null */
  function shapeNotice(groups, day) {
    var odd = nonIdealGroups(groups, day);
    if (odd.length === 0) return null;
    var names = odd.map(function (g) {
      return 'お客様' + alpha(g.order + 1) + '（' + g.size + '名）';
    });
    // 人数ごとに「本来のかたち」を1回だけ添える
    var sizes = [];
    odd.forEach(function (g) { if (sizes.indexOf(g.size) < 0) sizes.push(g.size); });
    var shapes = sizes.sort(function (a, b) { return a - b; }).map(function (n) {
      return n + '名の本来のかたちは ' + idealShapeName(n) + ' です。';
    }).join('');

    return {
      type: 'shape-differs', level: 'warn',
      message: '席が混んでいるため、' + odd.length + '組が本来のかたちになっていません：' +
        names.join('、') + '。' + shapes +
        'ほかのグループがひとつづきに座れることを優先した結果です。' +
        'かたちをそろえたい場合は、手で入れ替えてください。'
    };
  }

  /** 席のかたまりの外わく（何列ぶん × 何席ぶんに収まっているか） */
  function cellBox(cells) {
    var rows = cells.map(function (c) { return c.row; });
    var cols = cells.map(function (c) { return c.col; });
    var r0 = Math.min.apply(null, rows), r1 = Math.max.apply(null, rows);
    var c0 = Math.min.apply(null, cols), c1 = Math.max.apply(null, cols);
    return { r0: r0, r1: r1, c0: c0, c1: c1, h: r1 - r0 + 1, w: c1 - c0 + 1 };
  }

  /**
   * 外わくの中で空いている席が、すべて窓側（かたまりの左端か右端）かどうか。
   * 通常列で4席ぶんの幅をとると、その両端がちょうど左窓・右窓になります。
   */
  function holesAtWindow(cells, box) {
    var has = {};
    cells.forEach(function (c) { has[c.row + ',' + c.col] = true; });
    for (var r = box.r0; r <= box.r1; r++) {
      for (var c = box.c0; c <= box.c1; c++) {
        if (has[r + ',' + c]) continue;
        if (c !== box.c0 && c !== box.c1) return false;
      }
    }
    return true;
  }

  /**
   * 理想のかたちに収まっているか。収まっていれば減点（＝ごほうび）を返します。
   * 外わくの大きさで見るので、6名なら「4席の横一列＋2席」だけが理想となり、
   * 同じ2席落としでも「3席×2列」のかたちは理想になりません。
   */
  function idealBonus(count, cells) {
    var want = idealShapeOf(count);
    if (!want || !cells || cells.length !== count) return 0;
    var box = cellBox(cells);
    if (box.w !== want.w || box.h !== want.h) return 0;
    if (want.holeAtWindow && !holesAtWindow(cells, box)) return 0;
    return -IDEAL_BONUS;
  }
  var MAX_WASTE = 2;      // 四角にするために空けてよい席数の上限
  var MAX_DEPTH = 2;      // かたまりの奥行き（前後に何列ぶんまで広げてよいか）
  var AISLE_BALANCE = 0.5; // 通路をまたいで人数が割れることへの好みの重み
  var GENDER_HINT = 0.45;  // 男女が並びそうな場所を、軽く避けるための重み

  /**
   * 通路をまたぐときの分かれ方への点数。
   * またがないのがいちばん良く、またぐなら「大きいかたまり＋ひとり」が自然
   * （5名なら 4＋1。2＋3 のように半端に割れる形は避けます）。
   */
  function aislePenalty(cells, lastRow) {
    if (cells.length === 0) return 0;
    if (cells[0].row === lastRow) return 0; // 最後部列は通路がない
    var left = 0, right = 0;
    cells.forEach(function (c) { if (c.col <= 2) left++; else right++; });
    if (left === 0 || right === 0) return 0;
    return (Math.min(left, right) - 1) * AISLE_BALANCE;
  }

  /**
   * 使ってよい形か。
   *  ・奥行きは2列まで（前後に長く伸びると、グループがバスの前後に間延びするため）
   *  ・幅1席のまま縦に2席以上ならぶ形は禁止（2名の縦並び等。2名は必ず横に並べる）
   *  ・1席だけのときは、もちろん可
   */
  function shapeAllowed(w, h, deepOk, limit) {
    if (h <= 0 || w <= 0) return false;
    if (!deepOk && h > (limit || MAX_DEPTH)) return false;
    if (h >= 2 && w < 2) return false; // 縦並びのペアを作らない
    return true;
  }

  /** 実際に使う席のかたまりが、使ってよい形に収まっているか（角を欠けさせたあとの検査） */
  function cellsAllowed(cells, deepOk, limit) {
    if (cells.length <= 1) return true;
    var rows = cells.map(function (c) { return c.i; });
    var cols = cells.map(function (c) { return c.j; });
    var h = Math.max.apply(null, rows) - Math.min.apply(null, rows) + 1;
    var w = Math.max.apply(null, cols) - Math.min.apply(null, cols) + 1;
    return shapeAllowed(w, h, deepOk, limit);
  }

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

    var byId = {};
    layout.seats.forEach(function (s1) { byId[s1.id] = s1; });

    day.placements = day.placements || {};
    day.reserved = day.reserved || {};   // 四角の中の、そのグループ用の空席
    day.blocked = day.blocked || {};     // 四角の外だが、相席を避けるため空けておく席

    function at(r, c) { return byPos[r + ',' + c] || null; }
    function sharing() { return day.sharing !== false; }

    function taken(seat, ignoreBlocked) {
      if (!seat || seat.isCrew) return true;
      if (day.placements[seat.id] || day.reserved[seat.id]) return true;
      // blocked ＝ 相席を避けるために空けてある席。どうしても足りないときは使います
      return !ignoreBlocked && !!day.blocked[seat.id];
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

    /**
     * 分けて置いたかたまりが、先に置いた同じグループの席とくっついて
     * 前後に長い形（や縦並び）になっていないか。
     * くっついたあとの形を、そのまま形の決まりで確かめます。
     */
    function mergedShapeOk(cells, groupId, deepOk) {
      var pool = {};
      cells.forEach(function (s2) { pool[s2.row + ',' + s2.col] = s2; });
      var extra = 0;
      Object.keys(day.placements).forEach(function (id) {
        if (day.placements[id].groupId !== groupId) return;
        var s3 = byId[id]; if (s3) { pool[s3.row + ',' + s3.col] = s3; extra++; }
      });
      Object.keys(day.reserved).forEach(function (id) {
        if (day.reserved[id] !== groupId) return;
        var s4 = byId[id]; if (s4) { pool[s4.row + ',' + s4.col] = s4; extra++; }
      });
      if (extra === 0) return true; // 先に置いた席がなければ、この四角だけで判断済み

      // 候補の席からたどれる範囲（＝画面で1つの枠になる範囲）を集める
      var startKey = cells[0].row + ',' + cells[0].col;
      var seen = {}; seen[startKey] = true;
      var queue = [pool[startKey]];
      var comp = [];
      while (queue.length) {
        var cur = queue.pop();
        comp.push(cur);
        neighborKeys(cur).forEach(function (k) {
          if (pool[k] && !seen[k]) { seen[k] = true; queue.push(pool[k]); }
        });
      }
      var rows = comp.map(function (c) { return c.row; });
      var cols = comp.map(function (c) { return c.col; });
      var hh = Math.max.apply(null, rows) - Math.min.apply(null, rows) + 1;
      var ww = Math.max.apply(null, cols) - Math.min.apply(null, cols) + 1;
      return shapeAllowed(ww, hh, deepOk);
    }

    // computeBlocks と同じつながり方
    function neighborKeys(s5) {
      return physicalNeighbors(layout, s5).map(function (n) { return n.row + ',' + n.col; });
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
     * この形に、この人たちを座らせられるか。
     * ここでは男女のことは考えません（配置＝パズルに専念）。
     * 男女の並びは、配置が決まったあとに resolveGenders() で整えます。
     */
    function planMembers(seats, members, count, groupId) {
      // 相席を作らない設定のときは、別グループと隣り合う形は選ばない
      if (!sharing()) {
        var inRect = {};
        seats.forEach(function (s2) { inRect[s2.id] = true; });
        var foreign = false;
        seats.forEach(function (s2) {
          neighborsOf(s2).forEach(function (n) {
            if (inRect[n.id]) return;
            var o = ownerOf(n);
            if (o && o !== groupId) foreign = true;
          });
        });
        if (foreign) return null;
      }

      var plan = {};
      var i = 0;
      seats.forEach(function (s3) {
        if (i < count) plan[s3.id] = { gender: members[i].gender };
        i++;
      });
      if (count > seats.length) return null;
      return { plan: plan };
    }

    /**
     * その形に置くと、男女が並んでしまいそうかどうかの目安。
     * 配置を止める決まりではなく、同じくらい良い形が複数あるときの「好み」として使います。
     * （配置＝パズルを歪めないよう、あくまで軽い重みです）
     */
    function genderHint(cells, group) {
      var have = { male: 0, female: 0, unknown: 0 };
      group.members.forEach(function (m) { have[m.gender]++; });
      var inRect = {};
      cells.forEach(function (c) { inRect[c.id] = true; });

      var risky = 0;
      cells.forEach(function (c) {
        neighborsOf(c).forEach(function (n) {
          if (inRect[n.id]) return;
          var p2 = day.placements[n.id];
          if (!p2 || p2.groupId === group.id) return;
          if (p2.gender === 'unknown') return;
          // その性別に合わせられる人が自分のグループにいなければ、並んでしまう
          if (have[p2.gender] === 0 && have.unknown === 0) risky++;
        });
      });
      return risky * GENDER_HINT;
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
      // 前から詰めるのが基本ですが、1〜2列うしろへずらすだけで理想のかたちに収まるなら、
      // そちらを選びます（列を下げるぶんは ROW_PENALTY で割り引きます）。
      // ただし席が窮屈なとき（相席あり）は、前から詰めることを優先します。
      // 空きをまばらに残すと、大きなグループの置き場がなくなって泣き別れを招くためです。
      var lookahead = sharing() ? 0 : ROW_LOOKAHEAD;
      var overall = null;
      var firstHit = -1;
      for (var ri = 0; ri < rows.length; ri++) {
        if (firstHit >= 0 && ri - firstHit > lookahead) break;
        var r0 = rows[ri];
        if (opt.frontOnly && r0 > FRONT_ROWS) continue;
        if (opt.origin && r0 !== opt.origin.row) continue;

        var maxH = r0 === lastRow ? 1 : lastRow - r0; // 最後部列と通常列はまたがない
        // 大人数のグループは、理想のかたちに必要なぶんだけ深く取れるようにする
        var depthLimit = depthLimitFor(count);
        if (!opt.allowDeep && !opt.allowAnyShape) maxH = Math.min(maxH, depthLimit);
        var maxW = r0 === lastRow ? 5 : 4;
        var best = null;

        for (var h = 1; h <= maxH; h++) {
          if (opt.frontOnly && r0 + h - 1 > FRONT_ROWS) break;
          for (var w = 1; w <= maxW; w++) {
            if (!opt.allowAnyShape && !shapeAllowed(w, h, opt.allowDeep, depthLimit)) continue;
            var area = w * h;
            if (area < count) continue;
            if (area - count > wasteLimitFor(count)) continue;

            for (var c0 = 1; c0 + w - 1 <= maxW; c0++) {
              if (opt.origin && c0 !== opt.origin.col) continue;
              var full = rectSeats(r0, c0, w, h);
              if (!full) continue;
              var busy = false;
              for (var i = 0; i < full.length; i++) {
                if (taken(full[i], opt.ignoreBlocked)) { busy = true; break; }
              }
              if (busy) continue;

              // 候補の形（そのままの四角／角を欠けさせたL字）
              var shapes = shapeCandidates(full, w, h, count, allowPad,
                opt.allowDeep || opt.allowAnyShape, depthLimit);
              for (var si = 0; si < shapes.length; si++) {
                var sh = shapes[si];
                if (!opt.allowAnyShape && !mergedShapeOk(sh.seats, opt.groupId, opt.allowDeep)) continue;
                var planned = planMembers(sh.seats, opt.members, count, opt.groupId);
                if (!planned) continue;

                var score = WIDTH_PENALTY[w] + h * 0.4 + sh.waste * 0.6 + sh.cut * 0.15 +
                  aislePenalty(sh.seats, lastRow) +
                  idealBonus(count, sh.seats) +
                  windowPenalty(count, sh.seats, lastRow) +
                  (opt.group ? genderHint(sh.seats, opt.group) : 0);
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
        if (best) {
          if (firstHit < 0) firstHit = ri;
          var adjusted = best.score + (ri - firstHit) * ROW_PENALTY;
          if (!overall || adjusted < overall.adjusted - 1e-9) {
            best.adjusted = adjusted;
            overall = best;
          }
        }
      }
      return overall;
    }

    /**
     * 四角の枠から、実際に使う席のかたまりの候補を作る。
     * ・そのままの四角（余るぶんは取り置きの空席になる）
     * ・角を1〜2席ぶん欠けさせたL字（空席が出ない）
     * 欠けさせたあとも、前後左右でひとつながりであることを確かめます。
     */
    function shapeCandidates(full, w, h, count, allowPad, deepOk, depthLimit) {
      var out = [];
      var area = full.length;
      var waste = area - count;

      if (waste === 0) {
        out.push({ seats: full, cut: 0, waste: 0 });
        return out;
      }
      if (allowPad) out.push({ seats: full, cut: 0, waste: waste });
      if (waste >= w) return out; // 1列ぶん以上あまるなら、そもそも四角が大きすぎる

      var patternList = [];

      // (1) 角から waste 席ぶん欠けさせる（2席ぶんまで）。
      //     前の列・窓側を残したいので、後ろ・通路側の角から先に試します。
      if (waste <= 2) {
        var corners = [[h - 1, w - 1], [h - 1, 0], [0, w - 1], [0, 0]];
        corners.forEach(function (cn) {
          if (waste === 1) { patternList.push([cn]); return; }
          // 角のとなり（同じ列方向／同じ席方向）をもう1席
          if (w >= 2) patternList.push([cn, [cn[0], cn[1] === 0 ? 1 : w - 2]]);
          if (h >= 2) patternList.push([cn, [cn[0] === 0 ? 1 : h - 2, cn[1]]]);
        });
      }

      // (2) 端の列（いちばん前かいちばん後ろ）を、片側から waste 席ぶんだけ欠けさせる。
      //     「横一列をまるごと使う列を重ねて、あまりを1列に置く」大人数の形がこれです。
      [0, h - 1].forEach(function (i) {
        [true, false].forEach(function (fromLeft) {
          var cells = [];
          for (var k = 0; k < waste; k++) {
            cells.push([i, fromLeft ? k : w - 1 - k]);
          }
          patternList.push(cells);
        });
      });

      var seen = {};
      patternList.forEach(function (cells) {
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
        // 欠けさせた結果が縦長になっていないか
        if (!deepOk && !cellsAllowed(kept, false, depthLimit)) return;

        var key = kept.map(function (k) { return k.seat.id; }).join('|');
        if (seen[key]) return;
        seen[key] = true;
        out.push({
          seats: kept.map(function (k) { return k.seat; }),
          cut: waste, waste: 0
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
        delete day.blocked[s.id]; // 空けておいた席を使う場合は、その印を外す
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

    /**
     * グループ1組ぶんを置く。1つの四角に収まらないときは分割する。
     * @returns {array} 出た注意の一覧
     */
    function placeGroup(g, opt) {
      opt = opt || {};
      var warnings = [];
      var pad = sharing() ? false : true;
      opt.frontCapacity = opt.frontCapacity || 0;
      var placedCount = 0;
      var warnedFront = false;
      var warnedDeep = false;
      var warnedOdd = false;
      var warnedSplit = false;
      var guard = 0;

      while (placedCount < g.size && guard++ < 60) {
        var left = g.size - placedCount;
        var rest = g.members.slice(placedCount);
        var base = { groupId: g.id, group: g, members: rest, fromRow: opt.fromRow };
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
                type: 'front-overflow', level: 'warn',
                groupId: g.id,
                message: '前のお席をご希望のグループが多いため、前から3列目まで（お客様が座れるのは' +
                  opt.frontCapacity + '席）に収まりませんでした。お客様' + alpha(g.order + 1) +
                  '（' + g.size + '名）は4列目以降になります。'
              });
            }
          }
        } else if (!pick) {
          pick = findRect(left, pad, base) || findRect(left, false, base);
        }

        // ここから先は「置けなかったとき」の手当て。
        // いちばん避けたいのは泣き別れ（グループが離れた席に分かれること）なので、
        //   ① 形はよいまま1かたまり → ② 前後に長くても1かたまり → ③ 形を崩しても1かたまり
        //   → ④ どうしても無理なときだけ分割
        // の順に手を打ちます。

        // ② 前後に長くなってもよいので、1かたまりのまま置く
        if (!pick) {
          pick = findRect(left, false, merge(base, { allowDeep: true }));
          if (pick && !warnedDeep) {
            warnedDeep = true;
            warnings.push({
              type: 'deep-block', level: 'warn',
              groupId: g.id,
              message: '席が混んでいるため、お客様' + alpha(g.order + 1) + '（' + g.size +
                '名）の席が前後に長くなっています（3列以上）。同じグループはひとつづきになっています。'
            });
          }
        }

        // ③ 形の決まりを外してでも、1かたまりのまま置く
        if (!pick) {
          pick = findRect(left, false, merge(base, { allowAnyShape: true }));
          if (pick && !warnedOdd) {
            warnedOdd = true;
            warnings.push({
              type: 'odd-shape', level: 'warn',
              groupId: g.id,
              message: '席がほとんど埋まっているため、お客様' + alpha(g.order + 1) + '（' + g.size +
                '名）の席の形が整いませんでした（縦並びや前後に長い形）。同じグループはひとつづきになっています。'
            });
          }
        }

        // ③の2 相席を避けるために空けてあった席も使って、1かたまりのまま置く
        if (!pick) {
          pick = findRect(left, false, merge(base, { allowAnyShape: true, ignoreBlocked: true }));
          if (pick && !warnedOdd) {
            warnedOdd = true;
            warnings.push({
              type: 'odd-shape', level: 'warn',
              groupId: g.id,
              message: '席がほとんど埋まっているため、お客様' + alpha(g.order + 1) + '（' + g.size +
                '名）の席の形が整いませんでした（縦並びや前後に長い形）。同じグループはひとつづきになっています。'
            });
          }
        }

        // ④ 最後の手段：いちばん大きいかたまりに分けて置く（泣き別れ）
        if (!pick) {
          for (var size = left - 1; size >= 1 && !pick; size--) {
            // 分けるときも、男女の並びの決まりは守ります
            // （ここで外すと、分割は減らないのに男女の並びだけ増えるため）
            pick = findRect(size, false, base) ||
                   findRect(size, false, merge(base, { allowDeep: true })) ||
                   findRect(size, false, merge(base, { allowAnyShape: true })) ||
                   findRect(size, false, merge(base, { allowAnyShape: true, ignoreBlocked: true }));
          }
          if (pick && !warnedSplit) {
            warnedSplit = true;
            warnings.push({
              type: 'split', level: 'error',
              groupId: g.id,
              message: '【要確認】お客様' + alpha(g.order + 1) + '（' + g.size +
                '名）が離れた席に分かれてしまいました。' + g.size +
                '名がひとつづきに座れる場所がありません。手で直すか、車両・人数の見直しをご検討ください。'
            });
          }
        }

        // ⑤ 相席を避けるために空けてあった席も使って、分けてでも席を用意する
        if (!pick) {
          var loose = merge(base, { allowAnyShape: true, ignoreBlocked: true });
          pick = findRect(left, false, loose);
          if (!pick) {
            for (var gsize = left - 1; gsize >= 1 && !pick; gsize--) {
              pick = findRect(gsize, false, loose);
            }
            if (pick && !warnedSplit) {
              warnedSplit = true;
              warnings.push({
                type: 'split', level: 'error',
                groupId: g.id,
                message: '【要確認】お客様' + alpha(g.order + 1) + '（' + g.size +
                  '名）が離れた席に分かれてしまいました。' + g.size +
                  '名がひとつづきに座れる場所がありません。手で直すか、車両・人数の見直しをご検討ください。'
              });
            }
          }
        }

        if (!pick) {
          warnings.push({
            type: 'no-seat', level: 'error',
            groupId: g.id,
            message: '座席が足りません。お客様' + alpha(g.order + 1) + 'の' + left +
              '名分を置く場所がありませんでした。人数を減らすか、座席の多い車両を選んでください。'
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
      placeGroup: placeGroup
    };
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
    var wantSharing = opt.sharing !== false;

    var day = placeAllGroups(layout, groups, opt, wantSharing);

    // ゆったり配置（相席なし）で席が足りなくなったときは、
    // 詰めた配置（相席あり）でやり直す。お客様を置き去りにしないことを優先します。
    if (!wantSharing && day.warnings.some(function (w) { return w.type === 'no-seat'; })) {
      var retry = placeAllGroups(layout, groups, opt, true);
      var before = Object.keys(day.placements).length;
      var after = Object.keys(retry.placements).length;
      if (after > before) {
        retry.retriedTight = true;
        day = retry;
      }
    }

    // 配置が決まったので、グループの中で誰がどの席かを決めて男女の並びを整える。
    // それでも残る男女の並びは、同じ形どうしのグループ入れ替えで減らす。
    resolveGenders(layout, groups, day);
    relaxGenderConflicts(layout, groups, day);
    day.shared = sharedPairs(layout, day);

    day.shared.forEach(function (sh) {
      if (sh.mixedGender) {
        day.warnings.push({
          type: 'mixed-gender', level: 'warn',
          message: sh.row + '列目で、別のグループの男女が並んで座っています。' +
            '席がほぼ埋まっていて、ほかに組み合わせがありませんでした。気になる場合は手で入れ替えてください。'
        });
      }
    });

    return day;
  }

  /** 1日ぶんを、指定した詰め方（相席あり／なし）で実際に置く */
  function placeAllGroups(layout, groups, opt, sharing) {
    var startIndex = Math.max(0, Number(opt.startIndex) || 0);
    var frontStartIndex = Math.max(0, Number(opt.frontStartIndex) || 0);
    var warnings = [];

    var day = {
      startIndex: startIndex,
      frontStartIndex: frontStartIndex,
      reversed: !!opt.reversed,
      shifted: startIndex > 0 || frontStartIndex > 0 || !!opt.reversed,
      sharing: sharing, // true = 席が窮屈なので相席もありうる
      placements: {},
      reserved: {},
      blocked: {},
      warnings: warnings
    };
    var placer = createPlacer(layout, day);
    var frontCapacity = layout.seats.filter(function (x) {
      return !x.isCrew && x.row <= FRONT_ROWS;
    }).length;

    // 前席オプションのグループを先に。
    // 前席組は「前3列のなか」で、それ以外は「バス全体」で、日ごとに並べ始める位置をずらす。
    var frontGroups = rotate(groups.filter(function (g) { return g.frontOption; }), frontStartIndex);
    var restGroups = rotate(groups.filter(function (g) { return !g.frontOption; }), startIndex);

    // 2日目以降の席替えは「前後の入れかえ」で行う。
    // 前から順に置いていくので、並べる順番をひっくり返すと
    // うしろにいた組が前へ、前にいた組がうしろへ、まん中の組はあまり動かない、となる。
    // 前席をご希望の組は入れかえの対象外（2日目も前のまま）。
    // 前席をご希望の組は、どの日も前3列にいるので入れかえの対象にしません。
    // （前3列のなかでの並びは、日ごとに順ぐりにずらします）
    if (opt.reversed) restGroups = restGroups.slice().reverse();

    var ordered = frontGroups.concat(restGroups);

    // 置く順番を指定されているときは、そちらを使う（分かれてしまった組を先に置き直すため）
    if (opt.orderOverride) {
      var pos = {};
      opt.orderOverride.forEach(function (id, i) { pos[id] = i; });
      ordered = ordered.slice().sort(function (a, b) {
        var pa = pos[a.id] === undefined ? 9999 : pos[a.id];
        var pb = pos[b.id] === undefined ? 9999 : pos[b.id];
        return pa - pb;
      });
      // 前席オプションの組は、やはり先に置く（前3列を確保するため）
      ordered = ordered.filter(function (g) { return g.frontOption; })
        .concat(ordered.filter(function (g) { return !g.frontOption; }));
    }
    day.groupOrder = ordered.map(function (g) { return g.id; });

    ordered.forEach(function (g) {
      placer.placeGroup(g, { frontCapacity: frontCapacity }).forEach(function (w) { warnings.push(w); });
    });

    refreshDay(layout, day);

    // 置くときは2回に分けたが、結果としてつながっていた場合は「分かれました」を取り下げる。
    // ただし、つながった形が縦長などになっていれば、その注意に置きかえます。
    var blockCount = {};
    var blockOf = {};
    day.blocks.forEach(function (b) {
      blockCount[b.groupId] = (blockCount[b.groupId] || 0) + 1;
      blockOf[b.groupId] = b;
    });
    for (var wi = warnings.length - 1; wi >= 0; wi--) {
      var w0 = warnings[wi];
      if (w0.type !== 'split' || (blockCount[w0.groupId] || 0) > 1) continue;

      var b0 = blockOf[w0.groupId];
      var g0 = groups.filter(function (x) { return x.id === w0.groupId; })[0];
      var okShape = true;
      if (b0) {
        var hh0 = b0.row1 - b0.row0 + 1;
        var ww0 = b0.col1 - b0.col0 + 1;
        okShape = shapeAllowed(ww0, hh0, false, g0 ? depthLimitFor(g0.size) : MAX_DEPTH);
      }
      if (okShape || !g0) {
        warnings.splice(wi, 1); // きれいにつながったので、注意は不要
      } else {
        // つながってはいるが、縦長など形が崩れている
        warnings[wi] = {
          type: 'odd-shape', level: 'warn', groupId: w0.groupId,
          message: '席がほとんど埋まっているため、お客様' + alpha(g0.order + 1) + '（' + g0.size +
            '名）の席の形が整いませんでした（縦並びや前後に長い形）。同じグループはひとつづきになっています。'
        };
      }
    }
    // 理想のかたちに収まらなかった組があれば、まとめて1件お知らせする
    var shapeNote = shapeNotice(groups, day);
    if (shapeNote) warnings.push(shapeNote);

    // 同じ内容の注意が重ならないようにする
    var wseen = {};
    for (var wj = warnings.length - 1; wj >= 0; wj--) {
      var kk = warnings[wj].type + '|' + warnings[wj].message;
      if (wseen[kk]) warnings.splice(wj, 1); else wseen[kk] = true;
    }

    return day;
  }

  /** その日の出来ばえ。小さいほど良い（席にあぶれない ＞ 分かれない ＞ 男女が並ばない） */
  function dayScore(groups, day) {
    var seated = Object.keys(day.placements).length;
    var want = groups.reduce(function (a, g) { return a + g.size; }, 0);
    var blockCount = {};
    day.blocks.forEach(function (b) { blockCount[b.groupId] = (blockCount[b.groupId] || 0) + 1; });
    var split = 0;
    Object.keys(blockCount).forEach(function (gid) { if (blockCount[gid] > 1) split += blockCount[gid] - 1; });
    var mixed = day.shared.filter(function (sh) { return sh.mixedGender; }).length;
    var odd = day.warnings.filter(function (w) {
      return w.type === 'odd-shape' || w.type === 'deep-block';
    }).length;
    // 理想のかたちに収まらなかった組の数。かたちより「離れないこと」がずっと大事なので、軽い重み
    var offShape = nonIdealGroups(groups, day).length;
    return (want - seated) * 10000 + split * 100 + mixed * 5 + odd + offShape * 0.5;
  }

  /** 分かれてしまった組を先に置き直して、解けるかどうかもう一度試す */
  function repackSplits(layout, groups, opt, day) {
    var blockCount = {};
    day.blocks.forEach(function (b) { blockCount[b.groupId] = (blockCount[b.groupId] || 0) + 1; });
    var splitIds = Object.keys(blockCount).filter(function (gid) { return blockCount[gid] > 1; });
    if (splitIds.length === 0) return day;

    var order = splitIds.concat(day.groupOrder.filter(function (id) {
      return splitIds.indexOf(id) < 0;
    }));
    var retry = assignDay(layout, groups, {
      startIndex: day.startIndex,
      frontStartIndex: day.frontStartIndex,
      reversed: day.reversed,
      sharing: opt.sharing,
      orderOverride: order
    });
    return dayScore(groups, retry) < dayScore(groups, day) ? retry : day;
  }

  /**
   * その日の座席表を作る。
   * 巡回シフトの開始位置は「だいたい1/日数ずつ回る」ことが目的なので、
   * 目標の前後も試して、いちばん分かれにくい開始位置を選びます。
   * （公平さの厳密さより、グループが離れ離れにならないことを優先）
   */
  /** その日、どの席にどのグループが座ったか（前の日との比べもの用） */
  function daySeatMap(day) {
    var map = {};
    Object.keys(day.placements).forEach(function (sid) {
      map[sid] = day.placements[sid].groupId;
    });
    return map;
  }

  /**
   * 2つの日の「似ぐあい」（0〜1）。
   * 同じ席に同じグループが残っている割合です。
   * 1人だけ動かして「別の並びです」と言えないよう、完全一致ではなく割合で見ます。
   */
  function daySimilarity(mapA, mapB) {
    var keys = Object.keys(mapA);
    if (keys.length === 0) return 0;
    var same = 0;
    keys.forEach(function (sid) { if (mapA[sid] === mapB[sid]) same++; });
    return same / keys.length;
  }

  /** その日、相席になったグループの一覧 */
  function sharedGroupIds(day) {
    var out = {};
    (day.shared || []).forEach(function (sh) {
      sh.groupIds.forEach(function (id) { out[id] = true; });
    });
    return Object.keys(out);
  }

  /**
   * 相席の当番が、特定の組にかたよっていないか。小さいほど公平。
   * 前の日までに相席になった回数を持ちまわして、同じ組が続けて相席にならないようにします
   * （1日目に相席なしだった組から先に、2日目の相席をお願いする）。
   */
  var SHARE_FAIRNESS = 3; // 泣き別れ（100点）より軽く、男女の並び（5点）と同じくらいの重み

  function shareFairnessPenalty(day, history) {
    if (!history) return 0;
    var penalty = 0;
    sharedGroupIds(day).forEach(function (id) {
      penalty += (history[id] || 0) * SHARE_FAIRNESS;
    });
    return penalty;
  }

  var REAR_STAY_PENALTY = 8; // 2日つづけて後方に座ってしまったグループ1組ぶんの減点
  var REVERSE_MISS = 4;      // 前後反転をあきらめることへの減点
  var REAR_ROWS = 2;         // うしろから何列ぶんを「後方」とみなすか

  /** そのグループが座っている、いちばん前の列 */
  function frontRowOf(day, groupId) {
    var seats = (day.seatsOfGroup && day.seatsOfGroup[groupId]) || [];
    var min = 0;
    seats.forEach(function (id) {
      var r = Number(id.slice(1).split('-')[0]);
      if (!min || r < min) min = r;
    });
    return min;
  }

  /** 日ごとの、グループ→いちばん前の列 */
  function dayRowMap(groups, day) {
    var out = {};
    groups.forEach(function (g) { out[g.id] = frontRowOf(day, g.id); });
    return out;
  }

  /**
   * 2日つづけて後方に座ってしまったグループの数。
   *
   * まん中のグループがあまり動かないのは、前後を入れかえるやり方の性質上あたりまえで、
   * 現場の運用でもそう説明されています。困るのは
   * <strong>同じお客様が毎日いちばん後ろ</strong>になることなので、そこだけを数えます。
   * 前のお席をご希望の組は、どの日も前3列にいるので対象外です。
   */
  function rearStayCount(layout, groups, day, previousRows) {
    if (!previousRows) return 0;
    var rearFrom = layout.lastRow - REAR_ROWS + 1;
    var now = dayRowMap(groups, day);
    var n = 0;
    groups.forEach(function (g) {
      if (g.frontOption) return;
      if (!previousRows[g.id] || !now[g.id]) return;
      if (previousRows[g.id] >= rearFrom && now[g.id] >= rearFrom) n++;
    });
    return n;
  }

  /**
   * 「2日つづけて後方」のお知らせ文。該当なしなら null。
   * day.previousRows（前の日の、グループごとのいちばん前の列）が入っているときだけ働きます。
   */
  function rearStayNotice(layout, groups, day) {
    var previousRows = day.previousRows;
    if (!previousRows) return null;
    var rearFrom = layout.lastRow - REAR_ROWS + 1;
    var now = dayRowMap(groups, day);
    var stuck = groups.filter(function (g) {
      if (g.frontOption) return false;
      if (!previousRows[g.id] || !now[g.id]) return false;
      return previousRows[g.id] >= rearFrom && now[g.id] >= rearFrom;
    });
    if (stuck.length === 0) return null;

    var names = stuck.map(function (g) {
      return 'お客様' + alpha(g.order + 1) + '（' + g.size + '名）';
    });
    return {
      type: 'rear-stay', level: 'warn',
      message: names.join('、') + 'が、前の日につづけてバスの後方（うしろ' + REAR_ROWS +
        '列）になっています。席がほぼ埋まっていて、前のほうに移す並べ方が見つかりませんでした。' +
        '後方の当番は日ごとに回すようにしていますので、気になる場合は手で入れ替えてください。'
    };
  }

  function buildBestDay(layout, groups, opt, target, rotatingCount) {
    function make(startIndex, reversed) {
      var day = assignDay(layout, groups, {
        startIndex: startIndex,
        frontStartIndex: opt.frontStartIndex,
        reversed: reversed,
        sharing: opt.sharing
      });
      return repackSplits(layout, groups, opt, day);
    }

    // 前の日と似すぎた並びは避けたい（席替えの意味がなくなるため）。
    // ただし「分かれてしまう（分割＝100点）」ほうがずっと重い問題なので、それよりは軽い扱いです。
    var seenMaps = opt.previousSeatMaps || [];
    function evaluate(day, startIndex, reversed) {
      var sc = dayScore(groups, day);
      var mine = daySeatMap(day);
      var sim = 0;
      seenMaps.forEach(function (m) { sim = Math.max(sim, daySimilarity(mine, m)); });
      // 半分より多くの席がそのままなら、似ぐあいに応じて減点していく
      if (sim > 0.5) sc += (sim - 0.5) * 160;
      sc += shareFairnessPenalty(day, opt.shareHistory);
      // 2日つづけて後方になってしまった組があれば、その数だけ減点
      sc += rearStayCount(layout, groups, day, opt.previousRows) * REAR_STAY_PENALTY;
      // 前後反転をあきらめた場合の減点（反転が席替えにならないときだけ、これを払って乗り換える）
      if (reversed !== !!opt.reversed) sc += REVERSE_MISS;
      var dist = Math.min(
        Math.abs(startIndex - target),
        rotatingCount - Math.abs(startIndex - target)
      );
      return sc + dist * 0.01; // 同じ出来ばえなら、目標に近い開始位置を選ぶ
    }

    var best = make(target, !!opt.reversed);
    var bestScore = evaluate(best, target, !!opt.reversed);
    if (bestScore === 0 || rotatingCount <= 1) return best;

    // 試す順番：目標のすぐ近く（±3組）→ それでもだめなら全部の開始位置
    // 「だいたい均等に回る」ことより、グループが離れ離れにならないことを優先します
    var order = [];
    var seen = {};
    seen[target] = true;
    [1, -1, 2, -2, 3, -3].forEach(function (o) {
      var idx = ((target + o) % rotatingCount + rotatingCount) % rotatingCount;
      if (!seen[idx]) { seen[idx] = true; order.push(idx); }
    });
    for (var k = 0; k < rotatingCount; k++) {
      if (!seen[k]) { seen[k] = true; order.push(k); }
    }

    // まずは決められたやり方（反転する日は反転）のなかで、いちばんよい開始位置を探す
    for (var i = 0; i < order.length; i++) {
      var cand = make(order[i], !!opt.reversed);
      var sc = evaluate(cand, order[i], !!opt.reversed);
      if (sc < bestScore) {
        best = cand;
        bestScore = sc;
        if (bestScore === 0) return best; // 文句なしの並びが見つかった
      }
    }

    // それでも「2日つづけて後方」の組が残るなら、反転をあきらめる手も試す。
    // 席が窮屈で、反転したままでは後ろの人を前に出せないときの逃げ道です。
    if (opt.previousRows && rearStayCount(layout, groups, best, opt.previousRows) > 0) {
      var alt = !opt.reversed;
      for (var j = 0; j < order.length; j++) {
        var c2 = make(order[j], alt);
        var s2 = evaluate(c2, order[j], alt);
        if (s2 < bestScore) { best = c2; bestScore = s2; }
      }
      var c3 = make(target, alt);
      var s3 = evaluate(c3, target, alt);
      if (s3 < bestScore) { best = c3; bestScore = s3; }
    }
    return best;
  }

  function rotate(list, k) {
    if (list.length === 0) return list;
    var n = k % list.length;
    return list.slice(n).concat(list.slice(0, n));
  }

  /* ---------------------------------------------------------
   * 席をひとつずつ入れ替えるための道具
   * ------------------------------------------------------- */

  function seatById(layout, seatId) {
    for (var i = 0; i < layout.seats.length; i++) {
      if (layout.seats[i].id === seatId) return layout.seats[i];
    }
    return null;
  }

  /* ---------------------------------------------------------
   * 手動で直したあとの見直し
   * 自動割り当ては決まりを守るので、ふつうは何も出ません。
   * 手で動かして決まりから外れたときだけ、注意として拾い上げます。
   * ------------------------------------------------------- */

  /** 注意を見分けるための鍵（同じ内容かどうかの判定に使う） */
  function issueKey(i) {
    return i.type + '|' + (i.groupId || i.seatId || i.row || '');
  }

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
          type: 'front-out', level: 'warn', groupId: g.id,
          message: nameOf(g) + '（前席オプション）が' + (FRONT_ROWS + 1) + '列目以降にいます。'
        });
      }
    });

    // 2. 男女の相席が起きていないか
    (day.shared || []).forEach(function (sh) {
      if (!sh.mixedGender) return;
      issues.push({
        type: 'mixed-gender', level: 'warn', row: sh.row,
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
          type: 'split', level: 'error', groupId: gid,
          message: '【要確認】' + nameOf(byId[gid]) + 'の席が' + blockCount[gid] + 'か所に分かれています。'
        });
      }
    });

    // 3の2. かたまりが前後に長くなっていないか
    (day.blocks || []).forEach(function (b) {
      var depth = b.row1 - b.row0 + 1;
      var width = b.col1 - b.col0 + 1;
      if (byId[b.groupId] && depth > depthLimitFor(byId[b.groupId].size)) {
        issues.push({
          type: 'deep-block', level: 'warn', groupId: b.groupId,
          message: nameOf(byId[b.groupId]) + 'の席が前後' + depth + '列に伸びています。'
        });
      } else if (depth >= 2 && width < 2 && byId[b.groupId]) {
        issues.push({
          type: 'vertical-pair', level: 'warn', groupId: b.groupId,
          message: nameOf(byId[b.groupId]) + 'の席が縦に並んでいます（横並びが基本です）。'
        });
      }
    });

    // 4. 人数ぶんの席があるか
    groups.forEach(function (g) {
      var seats = (day.seatsOfGroup && day.seatsOfGroup[g.id]) || [];
      if (seats.length !== g.size) {
        issues.push({
          type: 'seat-count', level: 'error', groupId: g.id,
          message: nameOf(g) + '（' + g.size + '名）の席が' + seats.length + '席しかありません。'
        });
      }
    });

    // 5. 業務席にお客様が座っていないか
    layout.seats.forEach(function (s) {
      if (s.isCrew && day.placements[s.id]) {
        issues.push({
          type: 'crew-seat', level: 'error', seatId: s.id,
          message: s.row + '列目の業務席にお客様が座っています。'
        });
      }
    });

    // 6. 理想のかたちに収まっているか（まとめて1件）
    var shapeNote = shapeNotice(groups, day);
    if (shapeNote) issues.push(shapeNote);

    // 7. 前の日につづけて後方になっていないか
    var rearNote = rearStayNotice(layout, groups, day);
    if (rearNote) issues.push(rearNote);

    // 同じ内容の注意は1件にまとめる
    var seen = {};
    issues = issues.filter(function (i) {
      var key = i.type + '|' + i.message;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });

    // 重いもの（泣き別れ等）を先に並べる
    var weight = { error: 0, warn: 1 };
    function rank(x) { return weight[x.level] === undefined ? 1 : weight[x.level]; }
    issues.sort(function (a, b) { return rank(a) - rank(b); });

    // 自動で割り当てた時点から出ていた注意には印を付ける
    // （手で直したせいで出たものと区別するため）
    var base = {};
    (day.baselineIssues || []).forEach(function (k) { base[k] = true; });
    issues.forEach(function (i) { i.preexisting = !!base[issueKey(i)]; });

    return issues;
  }

  /* ---------------------------------------------------------
   * 男女の並びを整える（配置が決まったあとの仕上げ）
   *
   * 席の割り当て（どのグループがどこに座るか）は変えません。
   * 変えるのは「グループの中で、誰がどの席に座るか」だけです。
   * 座席表には名前を出さないので、グループ内の並べ替えは自由に効かせられます。
   * ------------------------------------------------------- */

  function resolveGenders(layout, groups, day) {
    var lastRow = layout.lastRow;
    var byPos = {};
    layout.seats.forEach(function (x) { byPos[x.row + ',' + x.col] = x; });
    var byId = {};
    groups.forEach(function (g) { byId[g.id] = g; });

    // グループごとの席と、手持ちの男女の内訳
    var cellsOf = {};
    Object.keys(day.placements).forEach(function (sid) {
      var gid = day.placements[sid].groupId;
      (cellsOf[gid] = cellsOf[gid] || []).push(sid);
    });
    var pool = {};
    Object.keys(cellsOf).forEach(function (gid) {
      cellsOf[gid].sort();
      pool[gid] = { male: 0, female: 0, unknown: 0 };
      var g = byId[gid];
      var n = cellsOf[gid].length;
      var mem = (g ? g.members : []).slice(0, n);
      mem.forEach(function (m) { pool[gid][m.gender]++; });
      // 席の数と人数が合わないとき（分割等）は、足りないぶんを未入力として扱う
      for (var k = mem.length; k < n; k++) pool[gid].unknown++;
    });

    // 通路をはさまずに隣り合う席（＝男女を合わせたい組み合わせ）
    function partnersOf(seat) {
      if (seat.row === lastRow) {
        return [byPos[seat.row + ',' + (seat.col - 1)], byPos[seat.row + ',' + (seat.col + 1)]];
      }
      return [byPos[seat.row + ',' + (seat.col % 2 === 1 ? seat.col + 1 : seat.col - 1)]];
    }

    var pairs = [];
    var seenPair = {};
    layout.seats.forEach(function (seat) {
      var a = day.placements[seat.id];
      if (!a) return;
      partnersOf(seat).forEach(function (n) {
        if (!n) return;
        var b = day.placements[n.id];
        if (!b || b.groupId === a.groupId) return;
        var key = [seat.id, n.id].sort().join('|');
        if (seenPair[key]) return;
        seenPair[key] = true;
        pairs.push({ a: seat.id, ag: a.groupId, b: n.id, bg: b.groupId });
      });
    });

    var assign = {};   // seatId -> gender
    var left = {};     // グループごとの残り
    Object.keys(pool).forEach(function (gid) {
      left[gid] = { male: pool[gid].male, female: pool[gid].female, unknown: pool[gid].unknown };
    });

    function options(gid) {
      var l = left[gid];
      var out = [];
      ['unknown', 'male', 'female'].forEach(function (k) { if (l[k] > 0) out.push(k); });
      // 残りが多い方を先に試す（あとの自由度を残すため）
      out.sort(function (x, y) { return l[y] - l[x]; });
      return out;
    }
    function fits(x, y) { return x === 'unknown' || y === 'unknown' || x === y; }

    var nodes = 0;
    function solve(i) {
      if (nodes++ > 20000) return false; // 念のための打ち切り
      if (i >= pairs.length) return true;
      var p = pairs[i];
      var ga = assign[p.a], gb = assign[p.b];

      if (ga && gb) return fits(ga, gb) ? solve(i + 1) : false;

      var optsA = ga ? [ga] : options(p.ag);
      for (var x = 0; x < optsA.length; x++) {
        var oa = optsA[x];
        if (!ga) { left[p.ag][oa]--; assign[p.a] = oa; }
        var optsB = gb ? [gb] : options(p.bg);
        for (var y = 0; y < optsB.length; y++) {
          var ob = optsB[y];
          if (!fits(oa, ob)) continue;
          if (!gb) { left[p.bg][ob]--; assign[p.b] = ob; }
          if (solve(i + 1)) return true;
          if (!gb) { left[p.bg][ob]++; delete assign[p.b]; }
        }
        if (!ga) { left[p.ag][oa]++; delete assign[p.a]; }
      }
      return false;
    }

    var solved = solve(0);

    // 解けなかった場合は、合わせられるところだけ合わせる（貪欲）
    if (!solved) {
      assign = {};
      Object.keys(pool).forEach(function (gid) {
        left[gid] = { male: pool[gid].male, female: pool[gid].female, unknown: pool[gid].unknown };
      });
      pairs.forEach(function (p) {
        var ga = assign[p.a], gb = assign[p.b];
        if (ga && gb) return;
        var optsA = ga ? [ga] : options(p.ag);
        for (var x = 0; x < optsA.length; x++) {
          var oa = optsA[x];
          var optsB = gb ? [gb] : options(p.bg);
          var ob = null;
          for (var y = 0; y < optsB.length; y++) {
            if (fits(oa, optsB[y])) { ob = optsB[y]; break; }
          }
          if (ob === null) continue;
          if (!ga) { left[p.ag][oa]--; assign[p.a] = oa; }
          if (!gb) { left[p.bg][ob]--; assign[p.b] = ob; }
          return;
        }
        // どうしても合わないので、そのまま置く
        if (!ga) { var fa = options(p.ag)[0]; if (fa) { left[p.ag][fa]--; assign[p.a] = fa; } }
        if (!gb) { var fb = options(p.bg)[0]; if (fb) { left[p.bg][fb]--; assign[p.b] = fb; } }
      });
    }

    // 残りの席に、残りの人を前から順に入れる
    Object.keys(cellsOf).forEach(function (gid) {
      var rest = [];
      ['male', 'female', 'unknown'].forEach(function (k) {
        for (var i = 0; i < left[gid][k]; i++) rest.push(k);
      });
      var ri = 0;
      cellsOf[gid].forEach(function (sid) {
        if (assign[sid]) return;
        assign[sid] = ri < rest.length ? rest[ri++] : 'unknown';
      });
    });

    // 決めた並びを座席に反映する
    Object.keys(assign).forEach(function (sid) {
      if (day.placements[sid]) day.placements[sid].gender = assign[sid];
    });

    return { solved: solved, pairs: pairs.length };
  }

  /**
   * 男女の並びが残ってしまったときの手直し。
   * 「同じ形・同じ人数のかたまり」どうしで、グループの入れ替えを試します。
   * 形も席の場所も変わらないので、座席表の見た目は崩れません。
   */
  function relaxGenderConflicts(layout, groups, day) {
    function conflicts() {
      resolveGenders(layout, groups, day);
      return sharedPairs(layout, day).filter(function (sh) { return sh.mixedGender; }).length;
    }
    var best = conflicts();
    if (best === 0) return 0;

    var byId = {};
    groups.forEach(function (g) { byId[g.id] = g; });

    // 1グループ＝1かたまりのものだけを、入れ替えの対象にする
    function slots() {
      var count = {};
      day.blocks.forEach(function (b) { count[b.groupId] = (count[b.groupId] || 0) + 1; });
      return day.blocks.filter(function (b) { return count[b.groupId] === 1; }).map(function (b) {
        // 席はそのまま、座る人だけを入れ替えるので、
        // 「人数」と「席の数」が同じかたまりどうしなら形は崩れません（形が違っていても大丈夫）
        var people = b.seatIds.filter(function (id) { return !!day.placements[id]; }).length;
        return {
          groupId: b.groupId,
          sig: people + '#' + b.seatIds.length,
          seatIds: b.seatIds.slice(),
          people: people
        };
      });
    }

    // 2つのかたまりの中身（どのグループが座るか）を入れ替える
    function swapSlots(s1, s2) {
      var take = function (sl) {
        return sl.seatIds.filter(function (id) { return day.placements[id]; })
          .map(function (id) { return day.placements[id]; });
      };
      var p1 = take(s1), p2 = take(s2);
      if (p1.length !== p2.length) return false;

      var seats1 = s1.seatIds.filter(function (id) { return day.placements[id]; });
      var seats2 = s2.seatIds.filter(function (id) { return day.placements[id]; });
      seats1.forEach(function (id, i) { day.placements[id] = { groupId: p2[i].groupId, gender: p2[i].gender }; });
      seats2.forEach(function (id, i) { day.placements[id] = { groupId: p1[i].groupId, gender: p1[i].gender }; });

      // 取り置きの空席も一緒に付け替える
      var g1 = s1.groupId, g2 = s2.groupId;
      Object.keys(day.reserved).forEach(function (id) {
        if (day.reserved[id] === g1) day.reserved[id] = '__tmp__';
      });
      Object.keys(day.reserved).forEach(function (id) {
        if (day.reserved[id] === g2) day.reserved[id] = g1;
      });
      Object.keys(day.reserved).forEach(function (id) {
        if (day.reserved[id] === '__tmp__') day.reserved[id] = g2;
      });
      refreshDay(layout, day);
      return true;
    }

    var tries = 0;
    for (var round = 0; round < 30 && best > 0; round++) {
      var list = slots();
      var bySig = {};
      list.forEach(function (sl) { (bySig[sl.sig] = bySig[sl.sig] || []).push(sl); });

      var improved = false;
      var keys = Object.keys(bySig);
      for (var k = 0; k < keys.length && !improved; k++) {
        var arr = bySig[keys[k]];
        for (var i = 0; i < arr.length && !improved; i++) {
          for (var j = i + 1; j < arr.length && !improved; j++) {
            if (tries++ > 3000) return best; // 念のための打ち切り
            var g1 = byId[arr[i].groupId], g2 = byId[arr[j].groupId];
            if (!g1 || !g2) continue;
            // 男女の内訳が同じなら入れ替えても意味がない
            if (genderKey(g1) === genderKey(g2)) continue;

            if (!swapSlots(arr[i], arr[j])) continue;
            var now = conflicts();
            if (now < best) { best = now; improved = true; }
            else { swapSlots(arr[j], arr[i]); conflicts(); } // 元に戻す
          }
        }
      }
      if (!improved) break;
    }
    return best;

    function genderKey(g) {
      var c = { male: 0, female: 0, unknown: 0 };
      g.members.forEach(function (m) { c[m.gender]++; });
      return c.male + '/' + c.female + '/' + c.unknown;
    }
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

    // 同じグループが2か所以上に分かれている場合は、どの断片にも印を付ける
    var perGroup = {};
    blocks.forEach(function (b) { perGroup[b.groupId] = (perGroup[b.groupId] || 0) + 1; });
    blocks.forEach(function (b) {
      b.pieces = perGroup[b.groupId];
      b.isSplit = perGroup[b.groupId] > 1;
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

    // 前後左右のとなり（最後部列と、その前の列の対応も正しく見ます）
    function neighbors(seat) {
      return physicalNeighbors(layout, seat);
    }

    // かたまりの外周をなぞるための情報を作る
    function describe(gid, comp) {
      var inBlock = {};
      comp.forEach(function (s) { inBlock[s.row + ',' + s.col] = true; });
      function has(r, c) { return !!inBlock[r + ',' + c]; }

      // その方向のとなりが同じかたまりに入っているか
      function joined(seat, dir) {
        var n = physicalNeighbors(layout, seat).filter(function (x) {
          if (dir === 'top') return x.row === seat.row - 1;
          if (dir === 'bottom') return x.row === seat.row + 1;
          if (dir === 'left') return x.row === seat.row && x.col === seat.col - 1;
          return x.row === seat.row && x.col === seat.col + 1;
        })[0];
        return !!(n && inBlock[n.row + ',' + n.col]);
      }

      var cells = comp.map(function (s) {
        return {
          seatId: s.id,
          row: s.row,
          col: s.col,
          track: trackOf(layout, s.row, s.col),
          top: !joined(s, 'top'),
          bottom: !joined(s, 'bottom'),
          left: !joined(s, 'left'),
          right: !joined(s, 'right')
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

  var COLOR_COUNT = 10;

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

    // 隣り合うグループと同じ色を避けつつ、色数をできるだけ散らす
    // （同じ色ばかり続くと、満席のときに見分けづらくなるため）
    var colors = {};
    var usedCount = [];
    for (var ci = 0; ci < COLOR_COUNT; ci++) usedCount.push(0);

    groups.forEach(function (g) {
      var banned = {};
      Object.keys(adj[g.id]).forEach(function (other) {
        if (colors[other] != null) banned[colors[other]] = true;
      });
      var best = -1;
      for (var c = 0; c < COLOR_COUNT; c++) {
        if (banned[c]) continue;
        if (best < 0 || usedCount[c] < usedCount[best]) best = c;
      }
      if (best < 0) best = 0; // 色が足りないときは仕方なく重ねる
      colors[g.id] = best;
      usedCount[best]++;
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

    // 席替えのしかた。奇数日目（2日目・4日目…）は前後をひっくり返し、
    // 2日ごとに並べ始める位置もずらしていきます。
    //   2日ツアー … 1日目そのまま／2日目 前後反転
    //   3日ツアー … ＋3日目は開始位置をずらす
    //   4日ツアー … ＋4日目はずらしたうえで前後反転
    var days = [];
    var shareHistory = {}; // グループごとの、これまでに相席になった日数
    for (var d = 0; d < dayCount; d++) {
      var pairIndex = Math.floor(d / 2);
      var day = buildBestDay(layout, groups, {
        frontStartIndex: startIndexForDay(frontRotating, d, dayCount),
        reversed: d % 2 === 1,
        sharing: sharing,
        shareHistory: d > 0 ? shareHistory : null,
        previousRows: d > 0 ? dayRowMap(groups, days[d - 1]) : null,
        previousSeatMaps: days.map(daySeatMap)
      }, startIndexForDay(rotating, pairIndex, dayCount), rotating.length);
      day.dayIndex = d;
      // 前の日の並びを控えておく（手で直したあとの見直しでも使います）
      day.previousRows = d > 0 ? dayRowMap(groups, days[d - 1]) : null;
      var rearNote = rearStayNotice(layout, groups, day);
      if (rearNote) day.warnings.push(rearNote);
      sharedGroupIds(day).forEach(function (id) {
        shareHistory[id] = (shareHistory[id] || 0) + 1;
      });
      // 自動で割り当てた直後の状態を「もともとの注意」として控えておく
      day.baselineIssues = inspectDay(layout, groups, day).map(issueKey);
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
    MAX_DEPTH: MAX_DEPTH,
    idealShapeOf: idealShapeOf,
    depthLimitFor: depthLimitFor,
    buildLayout: buildLayout,
    trackOf: trackOf,
    physicalNeighbors: physicalNeighbors,
    normalizeGroups: normalizeGroups,
    shouldAvoidSharing: shouldAvoidSharing,
    IDEAL_SHAPES: IDEAL_SHAPES,
    nonIdealGroups: nonIdealGroups,
    startIndexForDay: startIndexForDay,
    dayScore: dayScore,
    daySeatMap: daySeatMap,
    daySimilarity: daySimilarity,
    assignDay: assignDay,
    assign: assign,
    resolveLabels: resolveLabels,
    alpha: alpha,
    buildColors: buildColors,
    computeBlocks: computeBlocks,
    freeAreaBlock: freeAreaBlock,
    sharedPairs: sharedPairs,
    resolveGenders: resolveGenders,
    relaxGenderConflicts: relaxGenderConflicts,
    inspectDay: inspectDay,
    issueKey: issueKey,
    swapSeats: swapSeats,
    maru: maru
  };
});
