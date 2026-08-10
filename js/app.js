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

  var result = null;      // BusSeat.assign() の結果
  var selectedSeat = null; // 入れ替え待ちの席

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
      head.appendChild(el('span', 'group-no', (i + 1) + '組目　' + labels[i].label + '　' + labels[i].sizeMark + '名'));
      head.appendChild(el('span', 'spacer'));
      head.appendChild(miniBtn('↑', function () { move(i, -1); }));
      head.appendChild(miniBtn('↓', function () { move(i, 1); }));
      head.appendChild(miniBtn('×', function () { state.groups.splice(i, 1); changed(); }));
      li.appendChild(head);

      var body = el('div', 'group-body');

      body.appendChild(fieldNumber('人数', g.size, function (v) { setSize(g, v); changed(); }));

      var surname = fieldText('名字（任意）', g.surname, '例：山田', function (v) { g.surname = v; changed(); });
      body.appendChild(surname);

      if (labels[i].needsFullName) {
        body.appendChild(fieldText('フルネーム', g.fullName, '例：山田太郎', function (v) { g.fullName = v; changed(); }));
      } else if (g.fullName) {
        body.appendChild(fieldText('フルネーム', g.fullName, '', function (v) { g.fullName = v; changed(); }));
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
        (day.reversed ? '　この日は前後を入れ替えています（前のお席をご希望のグループを除く）。' : '');
      sheet.appendChild(note);

      box.appendChild(sheet);
    });
  }

  function busTable(day, dayIndex, labels) {
    var layout = result.layout;
    var wrap = el('div', 'bus');

    for (var r = 1; r <= layout.rows; r++) {
      var isBack = r === layout.lastRow;
      var row = el('div', 'bus-row' + (isBack ? ' back-row' : ''));
      var seats = layout.seats.filter(function (s) { return s.row === r; });

      seats.forEach(function (seat, idx) {
        if (!isBack && idx === 2) row.appendChild(el('div', 'aisle'));
        row.appendChild(seatCell(seat, day, dayIndex, labels, r));
      });
      wrap.appendChild(row);
    }
    return wrap;
  }

  function seatCell(seat, day, dayIndex, labels, rowNo) {
    var cell = el('div', 'seat');
    var no = el('span', 'row-no', rowNo + '-' + seat.col);
    cell.appendChild(no);

    if (seat.isCrew) {
      cell.className += ' is-crew';
      cell.appendChild(el('span', 'seat-label', '業務席'));
      return cell;
    }

    var p = day.placements[seat.id];
    if (!p) {
      cell.className += ' is-empty';
      cell.appendChild(el('span', 'seat-label', '空席'));
    } else {
      var l = labels[p.groupId];
      cell.className += ' g' + result.colors[p.groupId];
      cell.appendChild(el('span', 'seat-label', l ? l.label : ''));
      var sub = [];
      if (l) sub.push(l.sizeMark + '名');
      if (p.gender === 'male') sub.push('男');
      if (p.gender === 'female') sub.push('女');
      cell.appendChild(el('span', 'seat-sub', sub.join('・')));
    }

    if (selectedSeat && selectedSeat.dayIndex === dayIndex && selectedSeat.seatId === seat.id) {
      cell.className += ' is-selected';
    }

    cell.addEventListener('click', function () { onSeatClick(dayIndex, seat.id); });
    return cell;
  }

  function onSeatClick(dayIndex, seatId) {
    if (!selectedSeat) {
      selectedSeat = { dayIndex: dayIndex, seatId: seatId };
    } else if (selectedSeat.dayIndex === dayIndex && selectedSeat.seatId === seatId) {
      selectedSeat = null;
    } else if (selectedSeat.dayIndex !== dayIndex) {
      selectedSeat = { dayIndex: dayIndex, seatId: seatId };
    } else {
      S.swapSeats(result.days[dayIndex], selectedSeat.seatId, seatId);
      selectedSeat = null;
    }
    renderSheets();
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
