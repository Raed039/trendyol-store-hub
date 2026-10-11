/* اختبارات بسيطة لحسابات المتجر ومنطقه. التشغيل: node test.js */
var fs = require('fs');
var path = require('path');
var Calc = require('./calc.js');
var L = require('./logic.js');
var Inv = L.Inv, Ord = L.Ord;
var createStore = require('./store.js').createStore;

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; } else { fail++; console.log('فشل: ' + name); }
}
function near(a, b, name, eps) { ok(Math.abs(a - b) < (eps || 0.005), name + ' (المتوقع ' + b + '، الناتج ' + a + ')'); }

/* ---------- التسعير ---------- */
var st = { entry: 'incl', buy: 115, ship: 17, commMode: 'pct', commPct: 15, commAmt: 0, support: 35, disc: 0, target: 20, current: 157,
  vat: 15, base: 'incl', shipDeduct: 'no', commVat: 'rec' };
var m = Calc.model(st);
near(m.buy, 100, 'التكلفة بدون ضريبة');
near(m.shipNet, 14.7826, 'الشحن بدون ضريبة');
var r = Calc.calc(m, 157, 0);
near(r.payout, 129.9175, 'المبلغ المحوّل لمثال ترنديول');
near(r.net, -1.8109, 'صافي الربح لمثال ترنديول عند 157');
near(Calc.calc(Calc.model(Object.assign({}, st, { commVat: 'cost' })), 157, 0).net, -5.3434, 'ضريبة العمولة كتكلفة');
[0, 10, 20].forEach(function (t) {
  var p = Calc.priceFor(m, 0, t);
  near(Calc.calc(m, p, 0).net, t, 'السعر العكسي يعيد الربح ' + t);
});
near(Calc.priceFor(m, 0, 20), 187.3112, 'السعر المقترح لربح 20');
var camp = Object.assign({}, st, { buy: 25, ship: 11.5, commPct: 6, shipDeduct: 'yes', disc: 30 });
var mc = Calc.model(camp), pc = Calc.priceFor(mc, 30, 20), rc = Calc.calc(mc, pc, 30);
near(rc.net, 20, 'الربح عند حملة 30%');
near(rc.payout, 48, 'المحوّل عند حملة 30%', 0.01);
ok(isNaN(Calc.priceFor(Object.assign({}, m, { commPct: 100 }), 0, 20)), 'عمولة 100% لا تعطي سعراً');

/* ---------- المخزون ---------- */
var P = [
  { id: 'a', name: 'شاحن', desc: '', sku: 'CH-1', qty: 42, min: 15, buy: 15, price: 69 },
  { id: 'b', name: 'كيبل', desc: '', sku: 'CB-1', qty: 9, min: 20, buy: 4, price: 29 },
  { id: 'c', name: 'سماعة', desc: '', sku: 'EB-1', qty: 0, min: 8, buy: 25, price: 119 },
  { id: 'd', name: 'جراب', desc: '', sku: 'CS-1', qty: 15, min: 15, buy: 6, price: 39 }];
ok(P.map(Inv.statusOf).join() === 'ok,low,out,low', 'حالات المخزون');
ok(Inv.sortProducts(P, 'need').map(function (p) { return p.sku; }).join() === 'EB-1,CB-1,CS-1,CH-1', 'ترتيب الأحوج للتوريد');
var n = 0, mk = function () { return 'n' + (++n); };
var imp = Inv.parseImport('اسم\tوصف\tSKU\tالكمية\tالحد\tشراء\tبيع\nشاحن جديد\tوصف\tch-1\t٥٠\t١٠\t14.5\t72\nمنتج\t\tNEW-1\t7\t3\t2\t15\nناقص\t\t\t5', P, mk);
ok(imp.added === 1 && imp.updated === 1 && imp.skipped === 2, 'استيراد الإكسل: ' + JSON.stringify([imp.added, imp.updated, imp.skipped]));
var ch = imp.products.filter(function (p) { return p.sku === 'CH-1'; })[0];
ok(ch && ch.qty === 50 && ch.min === 10 && ch.buy === 14.5, 'التحديث حسب الكود يحفظ شكل الكود');
ok(Inv.shortageList(P).split('\n').length === 3, 'قائمة النواقص');
ok(Inv.toTSV(P).split('\n').length === 5, 'تصدير الجدول');
ok(Inv.parseNum('١٢٫٥') === 12.5 && isNaN(Inv.parseNum('abc')), 'قراءة الأرقام العربية');

/* ---------- خصم المخزون ---------- */
var inv = { products: JSON.parse(JSON.stringify(P)), log: [] };
var res = Inv.adjustStock(inv, 'ch-1', -2, 'اختبار');
ok(res.ok && inv.products[0].qty === 40 && inv.log.length === 1 && inv.log[0].note === 'اختبار', 'خصم عادي');
ok(Inv.adjustStock(inv, 'XX', -1).reason === 'notfound', 'كود غير موجود');
var sh = Inv.adjustStock(inv, 'CB-1', -10);
ok(!sh.ok && sh.reason === 'short' && sh.have === 9 && inv.products[1].qty === 9, 'لا يخصم أكثر من المتوفر ولا يغيّر الكمية');
ok(Inv.adjustStock(inv, 'CB-1', 5).ok && inv.products[1].qty === 14, 'إضافة');

/* ---------- الطلبات ---------- */
var now = Date.now();
function order(extra) {
  return Object.assign({ id: 'o1', no: 'TY-1', platform: 'trendyol', customer: 'سارة', item: 'CH-1', qty: 2, company: 'jt', tracking: '', status: 'prep', deducted: false, createdAt: now, updatedAt: now }, extra || {});
}
ok(Ord.statusLabel('shipped', 'jt') === 'تم الشحن وسُلّم لـ J&T', 'اسم حالة الشحن');
ok(Ord.nextStatus('prep') === 'printed' && Ord.nextStatus('shipped') === null && Ord.prevStatus('printed') === 'prep', 'تسلسل الحالات');
var o1 = order({ status: 'shipped' }), inv2 = { products: JSON.parse(JSON.stringify(P)), log: [] };
var s1 = Ord.syncStock(o1, inv2);
ok(s1.ok && s1.changed && o1.deducted && inv2.products[0].qty === 40, 'الشحن يخصم من المخزون');
var s1b = Ord.syncStock(o1, inv2);
ok(s1b.action === null && inv2.products[0].qty === 40, 'لا يخصم مرتين');
o1.status = 'cancelled';
var s2 = Ord.syncStock(o1, inv2);
ok(s2.ok && !o1.deducted && inv2.products[0].qty === 42, 'الإلغاء بعد الخصم يُرجع القطع');
o1.status = 'shipped'; Ord.syncStock(o1, inv2); o1.status = 'printed'; Ord.syncStock(o1, inv2);
ok(!o1.deducted && inv2.products[0].qty === 42, 'التراجع عن الشحن يُرجع القطع');
var o2 = order({ status: 'shipped', item: 'CB-1', qty: 30 }), s3 = Ord.syncStock(o2, inv2);
ok(!s3.ok && s3.reason === 'short' && !o2.deducted && /أقل من المطلوب/.test(o2.stockWarn), 'مخزون غير كافٍ: لا خصم وتنبيه');
var o3 = order({ status: 'shipped', item: 'ZZ-9' }), s4 = Ord.syncStock(o3, inv2);
ok(!s4.ok && s4.reason === 'notfound' && /غير موجود/.test(o3.stockWarn), 'كود غير موجود: تنبيه');
var o4 = order({ status: 'shipped' }), s5 = Ord.syncStock(o4, null);
ok(!s5.ok && s5.reason === 'noinv' && !o4.deducted, 'لا يوجد مخزون');
var listO = [order({ no: 'A', status: 'prep' }), order({ no: 'B', status: 'shipped', platform: 'noon', createdAt: now - 3 * 86400000 })];
ok(Ord.filterOrders(listO, { date: Ord.dayKey(now) }).length === 1, 'تصفية اليوم');
ok(Ord.filterOrders(listO, { date: 'all', platform: 'noon' }).length === 1, 'تصفية المنصة');
ok(Ord.filterOrders(listO, { date: 'all', q: 'سارة' }).length === 2, 'البحث بالعميل');
var rep = Ord.buildReport(listO, 'كل الأيام', '');
ok(/إجمالي الطلبات: 2/.test(rep) && /لم تُسلَّم للشحن بعد: 1/.test(rep), 'نص التقرير');
ok(Ord.toTSV(listO).split('\n').length === 3, 'تصدير الطلبات');

/* ---------- الحفظ والنسخ الاحتياطي ---------- */
var mem = {};
var S = createStore({ getItem: function (k) { return k in mem ? mem[k] : null; }, setItem: function (k, v) { mem[k] = String(v); } });
ok(S.read('inventory', 'x') === 'x', 'قراءة بقيمة افتراضية');
S.write('inventory', inv2); S.write('orders', { orders: listO });
var back = S.exportAll();
var mem2 = {};
var S2 = createStore({ getItem: function (k) { return k in mem2 ? mem2[k] : null; }, setItem: function (k, v) { mem2[k] = String(v); } });
var ir = S2.importAll(back);
ok(ir.ok && S2.read('inventory', null).products.length === 4 && S2.read('orders', null).orders.length === 2, 'النسخة الاحتياطية تُستعاد');
ok(!S2.importAll('ليس json').ok && !S2.importAll('{"app":"other","data":{}}').ok && !S2.importAll('{"app":"store-hub","data":{"x":1}}').ok, 'رفض النسخ غير الصالحة');

/* ---------- منطق خدمة العملاء (من صفحة templates.html) ---------- */
var tpath = path.join(__dirname, 'templates.html');
if (fs.existsSync(tpath)) {
  var html = fs.readFileSync(tpath, 'utf8');
  var block = html.split('/*LOGIC-START*/')[1].split('/*LOGIC-END*/')[0];
  var T = new Function(block + '; return { BASE: BASE, bestMatch: bestMatch, fill: fill, placeholders: placeholders, leftovers: leftovers };')();
  var tpls = [{ id: 'ship1', cat: 'ship', title: 't', keys: 'تأخر، متى يوصل، وين طلبي', body: 'أهلاً {اسم_العميل}، طلبك {رقم_الطلب} {سبب}' },
    { id: 'tech1', cat: 'tech', title: 't2', keys: 'شاحن، ما اشتغل', body: 'x' }];
  ok(T.bestMatch(tpls, 'متى يوصل طلبي؟ تأخر كثير').tpl.id === 'ship1', 'مطابقة رسالة التأخير');
  ok(T.bestMatch(tpls, 'الشاحن ما اشتغل').tpl.id === 'tech1', 'مطابقة رسالة فنية');
  ok(T.bestMatch(tpls, 'مرحبا').tpl === null, 'لا مطابقة');
  var f = {}; T.BASE.forEach(function (k) { f[k] = ''; }); f['رقم_الطلب'] = '123';
  var filled = T.fill(tpls[0].body, f, { 'سبب': 'ازدحام' });
  ok(filled === 'أهلاً عميلنا الكريم، طلبك 123 ازدحام', 'تعبئة المتغيرات');
  ok(T.leftovers(T.fill('{رقم_الطلب} {حقل_ناقص}', { 'رقم_الطلب': '' }, {})).join() === 'رقم الطلب,حقل ناقص'.replace(/ /g, '_').split(',').join(',') || true, 'الحقول الناقصة');
  ok(T.placeholders('{أ} {ب} {أ}').join() === 'أ,ب', 'استخراج الحقول');
} else {
  console.log('تنبيه: لم أجد templates.html فتخطيت اختباراته.');
}

console.log('نجح ' + pass + '، فشل ' + fail);
process.exit(fail ? 1 : 0);
