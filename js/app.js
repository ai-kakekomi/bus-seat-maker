/* ============================================================
 * バス座席表メーカー 画面まわり
 * 席の決め方そのものは js/seat.js にあります（テストもそちら）。
 * ============================================================ */
(function () {
  'use strict';

  var S = window.BusSeat;
  var STORE_KEY = 'bus-seat-maker/v1';
  var 曜日 = ['日', '月', '火', '水', '木', '金', '土'];

  var state = {
    tourName: '',
    busNo: '',
    days: 1,
    startDate: '',
    layoutType: '11x45',
    useRealName: false,
    groups: []
  };

  var result = null;       // BusSeat.assign() の結果
  var selectedSeat = null; // 入れ替え待ちの席（1席ずつモード）
  var manualEdited = {};   // 手で直した日（その日だけ見直しの注意を出す）

  /* ---------------- ちいさな道具 ---------------- */

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function newId() {
    return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function 日付表記(base, offset) {
    if (!base) return '';
    var d = new Date(base + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + offset);
    return (d.getMonth() + 1) + '/' + d.getDate() + '(' + 曜日[d.getDay()] + ')';
  }

  /* ---------------- 保存・復元 ---------------- */

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* 保存できなくても動く */ }
  }
  function restore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      if (data && typeof data === 'object') { applyData(data); return true; }
    } catch (e) { /* 壊れていたら無視 */ }
    return false;
  }
  function applyData(data) {
    state.tourName = data.tourName || '';
    state.busNo = data.busNo || '';
    state.days = Math.max(1, Number(data.days) || 1);
    state.startDate = data.startDate || '';
    state.layoutType = S.LAYOUTS[data.layoutType] ? data.layoutType : '11x45';
    state.useRealName = !!data.useRealName;
    state.groups = (data.groups || []).map(function (g) {
      var size = Math.max(1, Number(g.size) || 1);
      var members = [];
      for (var i = 0; i < size; i++) {
        members.push({ gender: (g.members && g.members[i] && g.members[i].gender) || 'unknown' });
      }
      return {
        id: g.id || newId(), size: size, members: members,
        frontOption: !!g.frontOption,
        surname: g.surname || '', givenName: givenNameOf(g)
      };
    });
  }

  /**
   * 下のお名前を取り出す。
   * 以前は「フルネーム（山田太郎）」を入れる欄だったので、
   * 保存済みの古いデータからは名字を取り除いて下のお名前だけにする。
   */
  function givenNameOf(g) {
    if (g.givenName) return g.givenName;
    var full = (g.fullName || '').trim();
    var surname = (g.surname || '').trim();
    if (!full) return '';
    if (surname && full.indexOf(surname) === 0) return full.slice(surname.length).trim();
    return full;
  }

  /* ---------------- グループ ---------------- */

  function addGroup(size) {
    var n = size || 2;
    var members = [];
    for (var i = 0; i < n; i++) members.push({ gender: 'unknown' });
    state.groups.push({ id: newId(), size: n, members: members, frontOption: false, surname: '', givenName: '' });
  }

  function setSize(g, n) {
    n = Math.max(1, Math.min(45, Number(n) || 1));
    while (g.members.length < n) g.members.push({ gender: 'unknown' });
    g.members.length = n;
    g.size = n;
  }

  /**
   * 「同じ名字のお客様がいます」の案内。
   * 相手のグループへ飛べるボタンを付ける（どの組と紛らわしいのかを、その場で確かめられるように）。
   */
  function sameSurnameNote(labels, i) {
    var me = labels[i];
    var box = el('div', 'help is-warn');
    var p = el('p', null);
    p.innerHTML = '<strong>同じ名字のお客様がいます。</strong>' +
      '下のお名前を入れると、座席表では「' + me.label.replace(/様$/, '') +
      '＋下のお名前＋様」で区別できます。';
    box.appendChild(p);

    var others = me.sameSurnameGroupIds || [];
    if (others.length) {
      var row = el('p', 'same-surname-links');
      row.appendChild(el('span', null, '同じ名字の組：'));
      others.forEach(function (id) {
        var idx = -1;
        state.groups.forEach(function (g, k) { if (g.id === id) idx = k; });
        if (idx < 0) return;
        row.appendChild(miniBtn(labels[idx].mark + '組', function () { focusGroup(id); }));
      });
      box.appendChild(row);
    }
    return box;
  }

  /** 指定したグループの入力欄までスクロールして、下のお名前の欄にカーソルを置く */
  function focusGroup(groupId) {
    var li = document.getElementById('group-' + groupId);
    if (!li) return;
    li.scrollIntoView({ behavior: 'smooth', block: 'center' });
    li.classList.add('is-highlight');
    setTimeout(function () { li.classList.remove('is-highlight'); }, 1600);
    var inputs = li.querySelectorAll('input[type="text"]');
    // 下のお名前の欄（2つめのテキスト欄）があればそこ、なければ名字の欄
    var target = inputs.length > 1 ? inputs[1] : inputs[0];
    if (target) target.focus();
  }

  function renderGroups() {
    var list = $('group-list');
    list.innerHTML = '';
    var labels = S.resolveLabels(state.groups, { useRealName: state.useRealName });

    state.groups.forEach(function (g, i) {
      var colorIdx = result && result.colors ? result.colors[g.id] : null;
      var li = el('li', 'group-item' + (colorIdx != null ? ' color-' + colorIdx : ''));
      li.id = 'group-' + g.id; // 同じ名字のグループへ行き来するための目印

      var head = el('div', 'group-head');
      var l = labels[i];
      var headName = l.label === l.autoLabel ? '' : '　' + l.label;
      head.appendChild(el('span', 'group-no', l.mark + '組' + headName + '　' + l.sizeMark + '名'));
      head.appendChild(el('span', 'spacer'));
      head.appendChild(miniBtn('↑', function () { move(i, -1); }));
      head.appendChild(miniBtn('↓', function () { move(i, 1); }));
      var del = miniBtn('削除', function () { state.groups.splice(i, 1); changed(); });
      del.className += ' btn-delete';
      head.appendChild(del);
      li.appendChild(head);

      var body = el('div', 'group-body');

      body.appendChild(fieldNumber('人数', g.size, function (v) { setSize(g, v); changed(); }));

      // お名前の欄は「お名前を出す」にしたときだけ出す（入力済みの値は消えません）
      if (state.useRealName) {
        body.appendChild(fieldText('名字（座席表に出ます）', g.surname, '例：山田',
          function (v) { g.surname = v; changed(); }));
        if (labels[i].duplicatedSurname || g.givenName) {
          // 同じ名字のお客様がいるときだけ出る欄。
          // 何を入れる欄なのかが分かるよう、注意書きを欄のすぐ上に置く
          if (labels[i].needsGivenName) {
            body.appendChild(sameSurnameNote(labels, i));
          }
          body.appendChild(fieldText('下のお名前', g.givenName, '例：太郎',
            function (v) { g.givenName = v; changed(); }));
        }
      }

      var frontWrap = el('label', 'toggle-line');
      var cb = el('input');
      cb.type = 'checkbox';
      cb.checked = g.frontOption;
      cb.addEventListener('change', function () { g.frontOption = cb.checked; changed(); });
      frontWrap.appendChild(cb);
      frontWrap.appendChild(el('span', null, '前のお席をご希望（有料オプション）'));
      body.appendChild(frontWrap);

      li.appendChild(body);

      var mem = el('div', 'members');
      mem.appendChild(el('span', 'help', '男女：'));
      g.members.forEach(function (m, mi) {
        var chip = el('span', 'member-chip');
        chip.appendChild(el('span', null, (mi + 1) + '人目'));
        var sel = el('select');
        [['unknown', '未入力'], ['male', '男'], ['female', '女']].forEach(function (o) {
          var op = el('option', null, o[1]);
          op.value = o[0];
          if (m.gender === o[0]) op.selected = true;
          sel.appendChild(op);
        });
        sel.addEventListener('change', function () { m.gender = sel.value; changed(); });
        chip.appendChild(sel);
        mem.appendChild(chip);
      });
      li.appendChild(mem);

      list.appendChild(li);
    });

    if (state.groups.length === 0) {
      list.appendChild(el('li', 'help', 'まだグループがありません。「＋ グループを追加」を押してください。'));
    }

    var total = state.groups.reduce(function (s, g) { return s + g.size; }, 0);
    var layout = S.buildLayout(state.layoutType);
    $('people-info').textContent =
      'いま ' + state.groups.length + '組 ／ 合計 ' + total + '名。お客様が座れる席は ' + layout.usableSeatCount + '席です。';
  }

  function move(i, dir) {
    var j = i + dir;
    if (j < 0 || j >= state.groups.length) return;
    var t = state.groups[i];
    state.groups[i] = state.groups[j];
    state.groups[j] = t;
    changed();
  }
  function miniBtn(text, fn) {
    var b = el('button', 'btn btn-mini', text);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  }
  function fieldText(label, value, ph, fn) {
    var f = el('div', 'field');
    f.appendChild(el('label', null, label));
    var inp = el('input');
    inp.type = 'text'; inp.value = value || ''; inp.placeholder = ph || '';
    inp.addEventListener('change', function () { fn(inp.value); });
    f.appendChild(inp);
    return f;
  }
  function fieldNumber(label, value, fn) {
    var f = el('div', 'field');
    f.appendChild(el('label', null, label));
    var inp = el('input');
    inp.type = 'number'; inp.min = '1'; inp.max = '45'; inp.value = value;
    inp.style.width = '5rem';
    inp.addEventListener('change', function () { fn(inp.value); });
    f.appendChild(inp);
    return f;
  }

  /* ---------------- 割り当てと描画 ---------------- */

  /**
   * 座席をゼロから割り当て直す。
   * 手で直した内容・選択中の状態・見直しの注意は、すべて捨てます。
   * state.groups をコピーしてから渡すので、前回の結果が混ざることはありません。
   */
  function recompute() {
    selectedSeat = null;
    manualEdited = {};
    result = S.assign({
      layoutType: state.layoutType,
      groups: JSON.parse(JSON.stringify(state.groups)),
      days: state.days,
      useRealName: state.useRealName
    });
  }

  function changed() {
    recompute();
    renderGroups();
    renderMessages();
    renderSheets();
    flash('');
    save();
  }

  /**
   * 座席表の上に出す説明。
   * ここに出すのは「バス全体の話」だけ。
   * 日ごとの注意（前席の溢れ・分かれてしまった等）は、その日の座席表の直下に出します。
   */
  function renderMessages() {
    var box = $('messages');
    box.innerHTML = '';
    if (!result) return;

    if (state.groups.length === 0) {
      box.appendChild(el('p', 'callout', 'グループを入力すると、ここに座席表が出ます。'));
      return;
    }

    // 混み具合の説明（どの日にも共通する話）
    var seats = result.layout.usableSeatCount;
    var 混み = 'お客様' + result.totalPeople + '名／お客様が座れる席' + seats + '席' +
      (result.spareSeats >= 0 ? '（空席' + result.spareSeats + '席）。' : '（' + (-result.spareSeats) + '席不足）。') +
      (result.sharing
        ? '席に余裕がないため、別のグループどうしが並ぶ席（相席）が出ます。相席になるときは男女が並ばないようにしています。'
        : '席に余裕があるので、別のグループと並ぶ席（相席）はありません。');
    box.appendChild(el('p', 'callout', 混み));

    // 日ごとの注意が何件あるかだけ、ここでも知らせる（詳しくは各座席表の下）
    var total = 0;
    result.days.forEach(function (day, di) { total += dayNotes(day, di).items.length; });
    if (total > 0) {
      box.appendChild(el('p', 'help',
        '気をつけたい点が' + total + '件あります。くわしくは、それぞれの座席表のすぐ下をご覧ください。'));
    }

    // 同姓のお知らせ（全体の話）
    var labels = S.resolveLabels(state.groups, { useRealName: state.useRealName });
    if (state.useRealName && labels.some(function (l) { return l.needsGivenName; })) {
      var ul = el('ul', 'msg-list');
      ul.appendChild(el('li', '', '同じ名字のお客様がいます。フルネームを入れると座席表で区別できます。'));
      box.appendChild(ul);
    }
  }

  function renderSheets() {
    var box = $('sheets');
    box.innerHTML = '';
    if (!result || state.groups.length === 0) return;

    var labels = {};
    result.labels.forEach(function (l) { labels[l.groupId] = l; });

    result.days.forEach(function (day, di) {
      var sheet = el('section', 'sheet');

      var head = el('div', 'sheet-head');
      var title = el('p', 'sheet-title', (state.tourName || 'ツアー座席表'));
      head.appendChild(title);
      var meta = [];
      if (state.days > 1) meta.push((di + 1) + '日目');
      var d = 日付表記(state.startDate, di);
      if (d) meta.push(d);
      if (state.busNo) meta.push(state.busNo);
      head.appendChild(el('p', 'sheet-meta', meta.join('　')));
      sheet.appendChild(head);

      sheet.appendChild(el('div', 'front-mark', '前（運転席・乗降口）'));
      sheet.appendChild(busTable(day, di, labels));
      sheet.appendChild(el('p', 'rear-mark', '後ろ'));

      var legend = el('div', 'legend');
      var hasFront = false;
      result.labels.forEach(function (l) {
        var c = result.colors[l.groupId];
        if (l.frontOption) hasFront = true;
        legend.appendChild(el('span', 'lg' + c + (l.frontOption ? ' is-front-opt' : ''),
          l.label + ' ' + l.sizeMark + '名' + (l.frontOption ? '（前席）' : '')));
      });
      if (hasFront) {
        legend.appendChild(el('span', 'legend-note is-front-opt lg-plain', '斜めストライプ＝前席オプション'));
      }
      sheet.appendChild(legend);

      var note = el('p', 'print-note');
      note.textContent = '灰色の席は業務席（乗務員・添乗員）です。' +
        (day.shifted ? '　この日は前から並べる順番をずらしています（前のお席をご希望のグループを除く）。' : '');
      sheet.appendChild(note);

      box.appendChild(sheet);

      // 手で直した日だけ、その座席表のすぐ下に見直しの注意を出す（印刷には出ません）
      var check = dayNotesBox(day, di);
      if (check) box.appendChild(check);
    });
  }

  /**
   * その日の座席表につく注意を組み立てる。
   *  ・手で直していない日 … 自動で割り当てたときに出た注意（理由つきの文言）
   *  ・手で直した日 … いまの座席を 点検し直した結果（古い注意が残らないように）
   * @returns {object} { items: [{text, level}], edited: boolean }
   */
  function dayNotes(day, dayIndex) {
    var items = [];
    var edited = !!manualEdited[dayIndex];

    if (!edited) {
      var seen = {};
      (day.warnings || []).forEach(function (w) {
        var key = w.type + '|' + w.message;
        if (seen[key]) return;
        seen[key] = true;
        items.push({ text: w.message, level: w.level === 'error' ? 'error' : 'warn' });
      });
      // 重いもの（泣き別れ・席不足）を先に見せる
      items.sort(function (a, b) {
        return (a.level === 'error' ? 0 : 1) - (b.level === 'error' ? 0 : 1);
      });
    } else {
      var issues = S.inspectDay(result.layout, result.groups, day);
      issues.filter(function (i) { return !i.preexisting; }).forEach(function (i) {
        items.push({ text: i.message, level: i.level === 'error' ? 'error' : 'warn' });
      });
      issues.filter(function (i) { return i.preexisting; }).forEach(function (i) {
        items.push({ text: '（はじめの割り当てのときから）' + i.message, level: 'old' });
      });
    }
    return { items: items, edited: edited };
  }

  /**
   * その日の座席表のすぐ下に置く、注意の枠。
   * どの日の話かが位置で分かるので、日番号は付けません。印刷には出しません。
   */
  function dayNotesBox(day, dayIndex) {
    var notes = dayNotes(day, dayIndex);
    var fresh = notes.items.filter(function (i) { return i.level !== 'old'; });
    if (notes.items.length === 0 && !notes.edited) return null;

    var ok = fresh.length === 0;
    var card = el('div', 'manual-check no-print' + (ok ? ' is-ok' : ''));

    var head;
    if (!notes.edited) {
      head = 'この座席表について気をつけたい点（' + fresh.length + '件）';
    } else if (ok && notes.items.length === 0) {
      head = 'この座席表を確認しました：問題は見つかりませんでした。';
    } else if (ok) {
      head = 'この座席表を確認しました：手で直したことで増えた問題はありません。';
    } else {
      head = 'この座席表を手で直したあとの確認（' + fresh.length + '件）';
    }
    card.appendChild(el('p', 'manual-check-head', head + '　※印刷には出ません'));

    if (notes.items.length) {
      var ul = el('ul', 'msg-list');
      notes.items.forEach(function (i) {
        ul.appendChild(el('li', i.level === 'error' ? 'is-error' : (i.level === 'old' ? 'is-preexisting' : ''), i.text));
      });
      card.appendChild(ul);
    }
    return card;
  }

  /**
   * 座席表は5本の縦すじ（左2席・通路・右2席）のマス目で描きます。
   * グループを囲む枠は、そのマス目の上に重ねた「辺だけの線」で、形の外周をなぞります。
   * 四角でもL字でも同じやり方で囲めます。
   */
  function busTable(day, dayIndex, labels) {
    var layout = result.layout;
    var wrap = el('div', 'bus');

    // 別グループの男女がとなり合っている席（オレンジの枠で知らせる）
    var mixedSeats = {};
    (day.shared || []).forEach(function (sh) {
      if (!sh.mixedGender) return;
      sh.seatIds.forEach(function (sid) { mixedSeats[sid] = true; });
    });

    // 座席のマス
    layout.seats.forEach(function (seat) {
      var cell = seatCell(seat, day, dayIndex, mixedSeats);
      cell.style.gridRow = String(seat.row);
      cell.style.gridColumn = String(S.trackOf(layout, seat.row, seat.col));
      wrap.appendChild(cell);
    });

    // グループを囲む枠（形の外周をなぞる）
    var labelDone = {};
    (day.blocks || []).forEach(function (b) {
      var color = result.colors[b.groupId];
      // 席が2か所以上に分かれてしまったグループは、赤い太枠ですぐ分かるようにする
      var picked = b.isSplit ? ' is-split' : '';

      b.cells.forEach(function (c) {
        var line = el('div', 'blk c' + color + picked +
          (c.top ? ' bt' : '') + (c.right ? ' br' : '') +
          (c.bottom ? ' bb' : '') + (c.left ? ' bl' : ''));
        line.style.gridRow = String(c.row);
        line.style.gridColumn = String(c.track);
        wrap.appendChild(line);
      });

      // 通路をまたいでつながっている行は、通路のすじにも線を渡す
      (b.bridges || []).forEach(function (br) {
        var bridge = el('div', 'blk c' + color + picked + ' bt bb');
        bridge.style.gridRow = String(br.row);
        bridge.style.gridColumn = String(br.track);
        wrap.appendChild(bridge);
      });

      // 分かれた2つ目以降の断片には、そこにも印を出す
      if (b.isSplit && labelDone[b.groupId] && b.label) {
        var mark = el('div', 'blk-label-wrap is-split');
        mark.style.gridRow = b.label.row0 + ' / ' + (b.label.row1 + 1);
        mark.style.gridColumn = b.label.trackStart + ' / ' + (b.label.trackEnd + 1);
        var l2 = labels[b.groupId];
        var tag2 = el('span', 'block-label is-split');
        tag2.appendChild(el('span', 'block-name', l2 ? l2.label : ''));
        tag2.appendChild(el('span', 'block-split-mark', '分かれた席'));
        mark.appendChild(tag2);
        wrap.appendChild(mark);
      }

      // ラベルは、かたまりの中でいちばん広いところに1回だけ
      if (!labelDone[b.groupId] && b.label) {
        labelDone[b.groupId] = true;
        var l = labels[b.groupId];
        if (l) {
          // 1席ぶんしか幅がないブロックは、文字が欠けないように整える
          //   ① 文字を小さくする ② 1名のグループは人数表記を省く（1席＝1名で自明）
          //   ③ 3行まで折り返す ④ それでも入らないときだけ末尾を省略
          var narrow = (b.label.trackEnd - b.label.trackStart) === 0;
          var hideCount = narrow && l.size === 1 && !b.isSplit;
          var longName = narrow && l.label.length > 12;

          var wrapL = el('div', 'blk-label-wrap' + (b.isSplit ? ' is-split' : '') +
            (narrow ? ' is-narrow' : ''));
          wrapL.style.gridRow = b.label.row0 + ' / ' + (b.label.row1 + 1);
          wrapL.style.gridColumn = b.label.trackStart + ' / ' + (b.label.trackEnd + 1);

          var tag = el('span', 'block-label' + (b.isSplit ? ' is-split' : '') +
            (narrow ? ' is-narrow' : '') + (longName ? ' is-long' : '') +
            (hideCount ? '' : ' has-count'));
          tag.appendChild(el('span', 'block-name', l.label));
          if (!hideCount) tag.appendChild(el('span', 'block-count', l.sizeMark + '名'));
          if (b.isSplit) tag.appendChild(el('span', 'block-split-mark', '席が' + b.pieces + 'か所に分かれています'));
          wrapL.appendChild(tag);
          wrap.appendChild(wrapL);
        }
      }
    });

    // 使われていない後方は、まとめて「自由席」
    if (day.freeArea) {
      var free = el('div', 'blk-free');
      free.style.gridRow = day.freeArea.row0 + ' / ' + (day.freeArea.row1 + 1);
      free.style.gridColumn = '1 / 6';
      free.appendChild(el('span', 'block-label', '自由席'));
      wrap.appendChild(free);
    }

    return wrap;
  }

  /** 前席オプションのグループなら、席を斜めストライプにするための印 */
  function frontClass(groupId) {
    var g = null;
    (result.groups || []).forEach(function (x) { if (x.id === groupId) g = x; });
    return g && g.frontOption ? ' is-front-opt' : '';
  }

  function seatCell(seat, day, dayIndex, mixedSeats) {
    var cell = el('div', 'seat');
    cell.appendChild(el('span', 'row-no', seat.row + '-' + seat.col));

    if (seat.isCrew) {
      cell.className += ' is-crew';
      cell.appendChild(el('span', 'seat-label', '業務席'));
      return cell;
    }

    var p = day.placements[seat.id];
    var reservedBy = (day.reserved || {})[seat.id];

    if (p) {
      cell.className += ' g' + result.colors[p.groupId] + frontClass(p.groupId);
      var mark = p.gender === 'male' ? '男' : (p.gender === 'female' ? '女' : '');
      cell.appendChild(el('span', 'seat-mark', mark));
    } else if (reservedBy) {
      // 枠の中の空席（そのグループのために取ってある席）
      cell.className += ' g' + result.colors[reservedBy] + frontClass(reservedBy) + ' is-empty';
      cell.appendChild(el('span', 'seat-mark', '空'));
    } else {
      // 枠の外の空席（相席を避けるために空けてある席も、見た目はふつうの空席）
      cell.className += ' is-empty';
      cell.appendChild(el('span', 'seat-mark', '空'));
    }

    // 別グループの男女がとなり合っている席は、オレンジの枠と「男女」の印で知らせる
    if (mixedSeats && mixedSeats[seat.id]) {
      cell.className += ' is-mixed';
      cell.appendChild(el('span', 'seat-warn', '男女'));
    }

    if (selectedSeat && selectedSeat.dayIndex === dayIndex && selectedSeat.seatId === seat.id) {
      cell.className += ' is-selected';
    }

    cell.addEventListener('click', function () { onSeatClick(dayIndex, seat.id); });
    return cell;
  }

  /* ---------------- 座席をタップしたとき ---------------- */

  /**
   * 席を1つタップ → 入れ替え先の席をタップ、で2つの席を入れ替えます。
   * 同じ席をもう一度タップすると選び直せます。
   */
  function onSeatClick(dayIndex, seatId) {
    if (!selectedSeat || selectedSeat.dayIndex !== dayIndex) {
      selectedSeat = { dayIndex: dayIndex, seatId: seatId };
    } else if (selectedSeat.seatId === seatId) {
      selectedSeat = null;
    } else {
      var res = S.swapSeats(result.layout, result.days[dayIndex], selectedSeat.seatId, seatId);
      if (res.ok) {
        manualEdited[dayIndex] = true;
        selectedSeat = null;
        flash('2つの席を入れ替えました。');
      } else {
        flash(失敗の理由(res));
      }
    }
    renderSheets();
  }

  /** seat.js が返す失敗理由コードを、日本語の文にする */
  function 失敗の理由(res) {
    switch (res.reason) {
      case 'crew-seat':
        return '業務席にはお客様を配置できません。';
      case 'same-seat':
        return '同じ席が選ばれています。別の席を選んでください。';
      case 'seat-not-found':
        return '対象が見つかりませんでした。もう一度選び直してください。';
      default:
        return '入れ替えできませんでした。';
    }
  }

  function flash(text) {
    var box = $('flash');
    if (!box) return;
    box.textContent = text || '';
    box.style.display = text ? 'block' : 'none';
  }

  /* ---------------- 見本 ---------------- */

  function sampleGroup(size, genders, opt) {
    opt = opt || {};
    return {
      id: newId(), size: size,
      members: genders.map(function (x) { return { gender: x }; }),
      frontOption: !!opt.front, surname: opt.surname || '', givenName: opt.givenName || ''
    };
  }

  /**
   * 見本データ。
   *  spacious … 空席が多いとき（相席なし・ゆったり配置）
   *  full     … ほぼ満席のとき（相席あり・注意も出る、現場で起きやすい込み具合）
   */
  function sampleData(kind) {
    var g = sampleGroup;
    if (kind === 'full') {
      return {
        tourName: '信州そば街道めぐり3日間',
        busNo: '1号車',
        days: 3,
        startDate: '',
        layoutType: '11x45',
        useRealName: false,
        groups: [
          // 前のお席をご希望（有料オプション）が4組11名。前3列は10席なので溢れます
          g(2, ['male', 'female'], { surname: '山田', front: true }),
          g(2, ['female', 'female'], { surname: '小林', front: true }),
          g(3, ['male', 'male', 'female'], { surname: '加藤', front: true }),
          g(4, ['male', 'female', 'female', 'male'], { surname: '吉田', front: true }),
          // 以下は通常の申し込み
          g(4, ['male', 'female', 'female', 'female'], { surname: '佐藤' }),
          g(3, ['male', 'male', 'female'], { surname: '鈴木' }),
          g(5, ['male', 'male', 'male', 'female', 'female'], { surname: '田中' }),
          g(1, ['male'], { surname: '伊藤' }),
          g(2, ['male', 'female'], { surname: '高橋' }),
          // 同姓だが下のお名前が未入力（実名表示にすると注意と行き来ボタンが出ます）
          g(3, ['female', 'female', 'female'], { surname: '鈴木' }),
          g(1, ['female'], { surname: '斎藤' }),
          g(6, ['male', 'male', 'female', 'female', 'female', 'male'], { surname: '松本' }),
          g(1, ['male'], { surname: '井上' }),
          g(5, ['female', 'female', 'male', 'male', 'female'], { surname: '木村' })
        ]
      };
    }
    return {
      tourName: '信州紅葉めぐり2日間',
      busNo: '1号車',
      days: 2,
      startDate: '',
      layoutType: '11x45',
      useRealName: false,
      groups: [
        g(2, ['male', 'female'], { surname: '山田', front: true }),
        // 同姓のお客様（下のお名前が入っているので、実名表示にすると自動で区別されます）
        g(4, ['male', 'female', 'female', 'female'], { surname: '佐藤', givenName: '太郎' }),
        g(1, ['female'], { surname: '佐藤', givenName: '花子' }),
        g(3, ['male', 'male', 'female'], { surname: '鈴木' }),
        g(2, ['female', 'female'], { surname: '高橋' }),
        g(5, ['male', 'male', 'male', 'female', 'female'], { surname: '田中' }),
        g(1, ['male'], { surname: '伊藤' }),
        g(2, ['male', 'female'], { surname: '渡辺', front: true })
      ]
    };
  }

  /* ---------------- 保存ファイル ---------------- */

  function downloadFile() {
    var name = (state.tourName || '座席表').replace(/[\\\/:*?"<>|]/g, '_');
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = el('a');
    a.href = url;
    a.download = name + '_座席表データ.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function readFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        applyData(JSON.parse(reader.result));
        syncFormFromState();
        changed();
      } catch (e) {
        window.alert('この保存ファイルは読み込めませんでした。別のファイルをお試しください。');
      }
    };
    reader.readAsText(file);
  }

  /* ---------------- 画面と状態の同期 ---------------- */

  function syncFormFromState() {
    $('tour-name').value = state.tourName;
    $('bus-no').value = state.busNo;
    $('tour-days').value = state.days;
    $('start-date').value = state.startDate;
    $('layout-type').value = state.layoutType;
    $('use-real-name').checked = state.useRealName;
    updateLayoutInfo();
  }

  function updateLayoutInfo() {
    var L = S.buildLayout(state.layoutType);
    $('layout-info').textContent =
      L.name + '：全' + L.seatCount + '席のうち、業務席' + L.crewSeatCount + '席を除いた ' +
      L.usableSeatCount + '席にお客様を配置します。最後部の' + L.lastRow + '列目だけ5席並びです。';
  }

  function bind() {
    $('tour-name').addEventListener('input', function () { state.tourName = this.value; changed(); });
    $('bus-no').addEventListener('input', function () { state.busNo = this.value; changed(); });
    $('tour-days').addEventListener('change', function () {
      state.days = Math.max(1, Math.min(10, Number(this.value) || 1));
      this.value = state.days;
      changed();
    });
    $('start-date').addEventListener('change', function () { state.startDate = this.value; changed(); });
    $('layout-type').addEventListener('change', function () {
      state.layoutType = this.value; updateLayoutInfo(); changed();
    });
    $('use-real-name').addEventListener('change', function () { state.useRealName = this.checked; changed(); });

    $('add-group').addEventListener('click', function () { addGroup(2); changed(); });
    $('clear-groups').addEventListener('click', function () {
      if (window.confirm('入力したグループを全部消します。よろしいですか？')) { state.groups = []; changed(); }
    });
    $('assign').addEventListener('click', function () {
      // 手で直した内容を全部捨てて、申し込み順から割り当て直す
      changed();
      flash('申し込み順に割り当て直しました。手で直した内容は消えています。');
    });
    $('print').addEventListener('click', function () { window.print(); });
    $('save-file').addEventListener('click', downloadFile);
    $('load-file-btn').addEventListener('click', function () { $('load-file').click(); });
    $('load-file').addEventListener('change', function () {
      if (this.files && this.files[0]) readFile(this.files[0]);
      this.value = '';
    });
    [['load-sample', 'spacious'], ['load-sample-full', 'full']].forEach(function (pair) {
      $(pair[0]).addEventListener('click', function () {
        if (state.groups.length && !window.confirm('いまの入力を見本で置きかえます。よろしいですか？')) return;
        applyData(sampleData(pair[1]));
        syncFormFromState();
        changed();
      });
    });
  }

  /* ---------------- 起動 ---------------- */

  function init() {
    var had = restore();
    if (!had) addGroup(2);
    syncFormFromState();
    bind();
    changed();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
