/* ============================================================
 * バス座席表メーカー ／ テスト用の申し込みを作る（純粋関数）
 *
 * デバッグモード（debug.html）と test/stress.js の両方から使います。
 * 同じシードからは、いつも同じ申し込みができます（再現できるように）。
 *   ブラウザ: window.BusSeatGen
 *   Node    : require('./js/gen.js')
 * ============================================================ */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BusSeatGen = factory();
  }
})(this, function () {
  'use strict';

  /** シードつきの乱数（mulberry32） */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * 組の人数の出方。
   *   ふだん … 2名が大半、3名・1名・4名がちらほら、ときどき大人数（添乗員さん 10/23）
   *   意地悪 … いろいろな人数が同じくらい混ざる（添乗員さんが試した入力に近い）
   */
  var PROFILES = {
    'ふだん': [[2, 60], [1, 12], [3, 12], [4, 10], [5, 2], [6, 2], [7, 1], [8, 1]],
    '意地悪': [[1, 12], [2, 22], [3, 18], [4, 12], [5, 12], [6, 10], [7, 10], [8, 4]]
  };

  function pickSize(rand, profile) {
    var table = PROFILES[profile] || PROFILES['ふだん'];
    var sum = table.reduce(function (s, x) { return s + x[1]; }, 0);
    var r = rand() * sum;
    for (var i = 0; i < table.length; i++) {
      r -= table[i][1];
      if (r < 0) return table[i][0];
    }
    return 2;
  }

  /**
   * 1件ぶんの申し込みを作る。
   *   opt.seed, opt.profile（'ふだん'/'意地悪'）, opt.spare（空席の数）,
   *   opt.days, opt.layoutType, opt.usable（お客様が座れる席の数）
   */
  function makeCase(opt) {
    var rand = rng(opt.seed);
    var target = Math.max(1, opt.usable - opt.spare);
    var groups = [];
    var total = 0;
    var guard = 0;
    while (total < target && guard++ < 200) {
      var size = pickSize(rand, opt.profile);
      if (total + size > target) size = target - total;
      var members = [];
      for (var m = 0; m < size; m++) {
        var r = rand();
        members.push({ gender: r < 0.45 ? 'male' : r < 0.9 ? 'female' : 'unknown' });
      }
      groups.push({ size: size, members: members });
      total += size;
    }
    // 前席オプション: 4名までの組から 0〜3組（前3列に収まる範囲で）
    var want = Math.floor(rand() * 4);
    var frontSeats = 0;
    groups.forEach(function (g) {
      if (want > 0 && g.size <= 4 && frontSeats + g.size <= 10 && rand() < 0.3) {
        g.frontOption = true;
        frontSeats += g.size;
        want--;
      }
    });
    return {
      id: opt.profile + '-空' + opt.spare + '-' + opt.days + '日-' + opt.layoutType + '-#' + opt.seed,
      layoutType: opt.layoutType,
      days: opt.days,
      groups: groups
    };
  }

  return { rng: rng, makeCase: makeCase, PROFILES: PROFILES };
});
