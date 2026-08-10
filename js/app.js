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
    editMode: 'group', // 'group' = グループごと動かす / 'seat' = 1席ずつ入れ替える
    groups: []
  };

  var result = null;       // BusSeat.assign() の結果
  var selectedSeat = null; // 入れ替え待ちの席（1席ずつモード）
  var selection = null;    // 動かす相手として選んだグループ（グループごとモード）
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
    state.editMode = data.editMode === 'seat' ? 'seat' : 'group';
    state.groups = (data.groups || []).map(function (g) {
      var size = Math.max(1, Number(g.size) || 1);
      var members = [];
      for (var i = 0; i < size; i++) {
        members.push({ gender: (g.members && g.members[i] && g.members[i].gender) || 'unknown' });
      }
      return {
        id: g.id || newId(), size: size, members: members,
        frontOption: !!g.frontOption,
        surname: g.surname || '', fullName: g.fullName || ''
      };
    });
  }

  /* ---------------- グループ ---------------- */

  function addGroup(size) {
    var n = size || 2;
    var members = [];
    for (var i = 0; i < n; i++) members.push({ gender: 'unknown' });
    state.groups.push({ id: newId(), size: n, members: members, frontOption: false, surname: '', fullName: '' });
  }

  function setSize(g, n) {
    n = Math.max(1, Math.min(45, Number(n) || 1));
    while (g.members.length < n) g.members.push({ gender: 'unknown' });
    g.members.length = n;
    g.size = n;
  }

  function renderGroups() {
    var list = $('group-list');
    list.innerHTML = '';
    var labels = S.resolveLabels(state.groups, { useRealName: state.useRealName });

    state.groups.forEach(function (g, i) {
      var colorIdx = result && result.colors ? result.colors[g.id] : null;
      var li = el('li', 'group-item' + (colorIdx != null ? ' color-' + colorIdx : ''));

      var head = el('div', 'group-head');
      var l = labels[i];
      var headName = l.label === l.autoLabel ? '' : '　' + l.label;
      head.appendChild(el('span', 'group-no', l.mark + '組' + headName + '　' + l.sizeMark + '名'));
      head.appendChild(el('span', 'spacer'));
      head.appendChild(miniBtn('↑', function () { move(i, -1); }));
      head.appendChild(miniBtn('↓', function () { move(i, 1); }));
      head.appendChild(miniBtn('×', function () { state.groups.splice(i, 1); changed(); }));
      li.appendChild(head);

      var body = el('div', 'group-body');

      body.appendChild(fieldNumber('人数', g.size, function (v) { setSize(g, v); changed(); }));

      // お名前の欄は「お名前を出す」にしたときだけ出す（入力済みの値は消えません）
      if (state.useRealName) {
        body.appendChild(fieldText('名字', g.surname, '例：山田', function (v) { g.surname = v; changed(); }));
        if (labels[i].needsFullName || g.fullName) {
          body.appendChild(fieldText('フルネーム', g.fullName, '例：山田太郎', function (v) { g.fullName = v; changed(); }));
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

      if (labels[i].needsFullName) {
        var w = el('p', 'help');
        w.innerHTML = '<strong>同じ名字のお客様がいます。</strong>フルネームを入れると区別できます。';
        li.appendChild(w);
      }

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

  function recompute() {
    selection = null;
    manualEdited = {};
    result = S.assign({
      layoutType: state.layoutType,
      groups: state.groups,
      days: state.days,
      useRealName: state.useRealName
    });
    selectedSeat = null;
  }

  function changed() {
    recompute();
    renderGroups();
    renderMessages();
    renderSheets();
    renderManualWarnings();
    flash('');
    save();
  }

  function renderMessages() {
    var box = $('messages');
    box.innerHTML = '';
    if (!result) return;

    var seen = {};
    var msgs = result.warnings.filter(function (w) {
      var k = w.type + '|' + w.message;
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });

    var labels = S.resolveLabels(state.groups, { useRealName: state.useRealName });
    var needFull = labels.some(function (l) { return l.needsFullName; });
    if (state.useRealName && needFull) {
      msgs.push({ type: 'name', message: '同じ名字のお客様がいます。フルネームを入れると座席表で区別できます。' });
    }

    if (msgs.length === 0) {
      var p = el('p', 'callout', state.groups.length === 0
        ? 'グループを入力すると、ここに座席表が出ます。'
        : 'とくに問題は見つかりませんでした。' +
          (result.sharing
            ? '席に余裕がないため、別のグループどうしで並ぶ席（相席）があります。'
            : '席に余裕があるので、別のグループと並ぶ席（相席）はありません。'));
      box.appendChild(p);
      return;
    }

    var ul = el('ul', 'msg-list');
    msgs.forEach(function (w) {
      var li = el('li', w.type === 'no-seat' ? 'is-error' : '', w.message);
      ul.appendChild(li);
    });
    box.appendChild(ul);
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
      result.labels.forEach(function (l) {
        var c = result.colors[l.groupId];
        legend.appendChild(el('span', 'lg' + c, l.label + ' ' + l.sizeMark + '名'));
      });
      sheet.appendChild(legend);

      var note = el('p', 'print-note');
      note.textContent = '灰色の席は業務席（乗務員・添乗員）です。' +
        (day.shifted ? '　この日は前から並べる順番をずらしています（前のお席をご希望のグループを除く）。' : '');
      sheet.appendChild(note);

      box.appendChild(sheet);
    });
  }

  /**
   * 座席表は5本の縦すじ（左2席・通路・右2席）のマス目で描きます。
   * グループを囲む枠は、そのマス目の上に重ねた「辺だけの線」で、形の外周をなぞります。
   * 四角でもL字でも同じやり方で囲めます。
   */
  function busTable(day, dayIndex, labels) {
    var layout = result.layout;
    var wrap = el('div', 'bus');
    var selectedGroup = selection && selection.dayIndex === dayIndex ? selection.groupId : null;

    // 座席のマス
    layout.seats.forEach(function (seat) {
      var cell = seatCell(seat, day, dayIndex, selectedGroup);
      cell.style.gridRow = String(seat.row);
      cell.style.gridColumn = String(S.trackOf(layout, seat.row, seat.col));
      wrap.appendChild(cell);
    });

    // グループを囲む枠（形の外周をなぞる）
    var labelDone = {};
    (day.blocks || []).forEach(function (b) {
      var color = result.colors[b.groupId];
      var picked = b.groupId === selectedGroup ? ' is-picked' : '';

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

      // ラベルは、かたまりの中でいちばん広いところに1回だけ
      if (!labelDone[b.groupId] && b.label) {
        labelDone[b.groupId] = true;
        var l = labels[b.groupId];
        if (l) {
          var wrapL = el('div', 'blk-label-wrap');
          wrapL.style.gridRow = b.label.row0 + ' / ' + (b.label.row1 + 1);
          wrapL.style.gridColumn = b.label.trackStart + ' / ' + (b.label.trackEnd + 1);
          var tag = el('span', 'block-label');
          tag.appendChild(el('span', 'block-name', l.label));
          tag.appendChild(el('span', 'block-count', l.sizeMark + '名'));
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

  function seatCell(seat, day, dayIndex, selectedGroup) {
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
      cell.className += ' g' + result.colors[p.groupId];
      var mark = p.gender === 'male' ? '男' : (p.gender === 'female' ? '女' : '');
      cell.appendChild(el('span', 'seat-mark', mark));
      if (selectedGroup && p.groupId === selectedGroup) cell.className += ' is-picked-seat';
    } else if (reservedBy) {
      // 枠の中の空席（そのグループのために取ってある席）
      cell.className += ' g' + result.colors[reservedBy] + ' is-empty';
      cell.appendChild(el('span', 'seat-mark', '空'));
      if (selectedGroup && reservedBy === selectedGroup) cell.className += ' is-picked-seat';
    } else {
      // 枠の外の空席（相席を避けるために空けてある席も、見た目はふつうの空席）
      cell.className += ' is-empty';
      cell.appendChild(el('span', 'seat-mark', '空'));
    }

    if (selectedSeat && selectedSeat.dayIndex === dayIndex && selectedSeat.seatId === seat.id) {
      cell.className += ' is-selected';
    }

    cell.addEventListener('click', function () { onSeatClick(dayIndex, seat.id); });
    return cell;
  }

  /* ---------------- 座席をタップしたとき ---------------- */

  function ownerAt(day, seatId) {
    var p = day.placements[seatId];
    if (p) return p.groupId;
    return (day.reserved || {})[seatId] || null;
  }

  function onSeatClick(dayIndex, seatId) {
    if (state.editMode === 'seat') return onSeatModeClick(dayIndex, seatId);
    return onGroupModeClick(dayIndex, seatId);
  }

  // グループごと動かすモード
  function onGroupModeClick(dayIndex, seatId) {
    var day = result.days[dayIndex];
    var owner = ownerAt(day, seatId);

    if (!selection || selection.dayIndex !== dayIndex) {
      if (!owner) {
        flash('先に、動かしたいグループの席をタップしてください。');
        return;
      }
      selection = { dayIndex: dayIndex, groupId: owner };
      renderSheets();
      return;
    }

    if (owner === selection.groupId) { // 同じグループをもう一度 → 取り消し
      selection = null;
      renderSheets();
      return;
    }

    var res = owner
      ? S.swapGroups(result.layout, result.groups, day, selection.groupId, owner)
      : S.moveGroup(result.layout, result.groups, day, selection.groupId, seatId);

    if (res.ok) {
      manualEdited[dayIndex] = true;
      selection = null;
      flash(成功の一言(res));
    } else {
      flash(失敗の理由(res));
    }
    renderSheets();
    renderManualWarnings();
  }

  // 1席ずつ入れ替えるモード
  function onSeatModeClick(dayIndex, seatId) {
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
    renderManualWarnings();
  }

  /** グループの呼び名（人数つき） */
  function 呼び名(groupId) {
    var l = null;
    (result.labels || []).forEach(function (x) { if (x.groupId === groupId) l = x; });
    if (!l) return 'このグループ';
    return l.label + '（' + l.size + '名）';
  }

  /** seat.js が返す失敗理由コードを、日本語の文にする */
  function 失敗の理由(res) {
    switch (res.reason) {
      case 'crew-seat':
        return '業務席にはお客様を配置できません。';
      case 'same-seat':
        return '同じ席が選ばれています。別の席を選んでください。';
      case 'same-group':
        return '移動先が同じグループの席です。別の場所を選んでください。';
      case 'no-room':
        return 呼び名(res.groupId) + 'が入るまとまった空きがありません。ほかの場所を試してください。';
      case 'no-room-swap':
        return 呼び名(res.groupId) + 'が入るまとまった空きがないため、入れ替えできませんでした。';
      case 'not-seated':
        return 'まだ座席が決まっていないグループです。先に「自動で席を決める」を押してください。';
      case 'group-not-found':
      case 'seat-not-found':
        return '対象が見つかりませんでした。もう一度選び直してください。';
      default:
        return '動かせませんでした。';
    }
  }

  /** うまくいったときの一言（注意があればそれも伝える） */
  function 成功の一言(res) {
    var ws = res.warnings || [];
    if (ws.length) return ws[0].message;
    return res.reason === 'swapped' ? '2組の場所を入れ替えました。' : '移動しました。';
  }

  /**
   * 手で直したあとの見直し。
   * 自動割り当ては決まりを守るので、手で直した日だけ点検して注意を出します。
   * 印刷には含めません。
   */
  function renderManualWarnings() {
    var box = $('manual-warnings');
    if (!box) return;
    box.innerHTML = '';
    if (!result) return;

    var rows = [];
    result.days.forEach(function (day, di) {
      if (!manualEdited[di]) return;
      S.inspectDay(result.layout, result.groups, day).forEach(function (issue) {
        rows.push((state.days > 1 ? (di + 1) + '日目：' : '') + issue.message);
      });
    });
    if (rows.length === 0) return;

    var card = el('div', 'manual-check');
    card.appendChild(el('p', 'manual-check-head',
      '手で直したあとの確認（' + rows.length + '件）　※印刷には出ません'));
    var ul = el('ul', 'msg-list');
    rows.forEach(function (t) { ul.appendChild(el('li', '', t)); });
    card.appendChild(ul);
    box.appendChild(card);
  }

  function flash(text) {
    var box = $('flash');
    if (!box) return;
    box.textContent = text || '';
    box.style.display = text ? 'block' : 'none';
  }

  /* ---------------- 見本 ---------------- */

  function sampleData() {
    function g(size, genders, opt) {
      opt = opt || {};
      return {
        id: newId(), size: size,
        members: genders.map(function (x) { return { gender: x }; }),
        frontOption: !!opt.front, surname: opt.surname || '', fullName: opt.fullName || ''
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
        g(4, ['male', 'female', 'female', 'female'], { surname: '佐藤' }),
        g(1, ['female'], { surname: '佐藤' }),
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
    $('mode-group').checked = state.editMode !== 'seat';
    $('mode-seat').checked = state.editMode === 'seat';
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

    ['mode-group', 'mode-seat'].forEach(function (id) {
      $(id).addEventListener('change', function () {
        state.editMode = this.value;
        selection = null;
        selectedSeat = null;
        flash('');
        renderSheets();
        save();
      });
    });

    $('add-group').addEventListener('click', function () { addGroup(2); changed(); });
    $('clear-groups').addEventListener('click', function () {
      if (window.confirm('入力したグループを全部消します。よろしいですか？')) { state.groups = []; changed(); }
    });
    $('assign').addEventListener('click', function () { changed(); });
    $('print').addEventListener('click', function () { window.print(); });
    $('save-file').addEventListener('click', downloadFile);
    $('load-file-btn').addEventListener('click', function () { $('load-file').click(); });
    $('load-file').addEventListener('change', function () {
      if (this.files && this.files[0]) readFile(this.files[0]);
      this.value = '';
    });
    $('load-sample').addEventListener('click', function () {
      if (state.groups.length && !window.confirm('いまの入力を見本で置きかえます。よろしいですか？')) return;
      applyData(sampleData());
      syncFormFromState();
      changed();
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
