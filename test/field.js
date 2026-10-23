/* 添乗員さんの入力（2026-10-23）で、座席表と決まりの違反を表示する
 *   実行: node test/field.js */
'use strict';
var path = require('path');
var S = require(path.join(__dirname, '..', 'js', 'seat.js'));
var C = require(path.join(__dirname, '..', 'js', 'checks.js'));
var data = require('./fixtures/field-2026-10-23.json');

var total = 0;
data.cases.forEach(function (c) {
  var res = S.assign({ layoutType: c.layoutType, groups: c.groups, days: c.days });
  console.log('\n=== ' + c.id + ' … ' + c.note);
  console.log(res.groups.map(function (g, i) {
    return String.fromCharCode(65 + i) + '=' + (g.surname || '無名') + g.size + (g.frontOption ? '(前席)' : '');
  }).join(' '));
  res.days.forEach(function (day, d) {
    var bad = C.inspect(res.layout, res.groups, day);
    total += bad.length;
    console.log('\n' + (d + 1) + '日目' + (bad.length ? '  ✗ ' + bad.map(function (b) { return b.message; }).join(' / ') : '  ✓'));
    console.log(C.draw(res.layout, res.groups, day));
  });
});
console.log('\n違反 ' + total + '件');
process.exitCode = total ? 1 : 0;
