/* منطق المخزون (Inv) والطلبات (Ord) المشترك بين الصفحات.
   دوال نقية قدر الإمكان حتى يمكن اختبارها في test.js. */

var Inv = (function () {
  function toLatin(s) {
    return String(s == null ? '' : s)
      .replace(/[٠-٩]/g, function (c) { return String(c.charCodeAt(0) - 0x0660); })
      .replace(/[۰-۹]/g, function (c) { return String(c.charCodeAt(0) - 0x06F0); })
      .replace(/٫/g, '.').replace(/٬/g, ',');
  }
  function parseNum(v) {
    var n = parseFloat(toLatin(v).replace(/,/g, '').trim());
    return isFinite(n) ? n : NaN;
  }
  /* نفد: صفر أو أقل. يقترب من النفاد: عند حد إعادة الطلب أو أقل. وإلا متوفر */
  function statusOf(p) {
    if (p.qty <= 0) return 'out';
    if (p.qty <= p.min) return 'low';
    return 'ok';
  }
  var STATUS_RANK = { out: 0, low: 1, ok: 2 };
  function sortProducts(list, mode) {
    var a = list.slice();
    var byName = function (x, y) { return x.name.localeCompare(y.name, 'ar'); };
    if (mode === 'name') a.sort(byName);
    else if (mode === 'qtyAsc') a.sort(function (x, y) { return x.qty - y.qty || byName(x, y); });
    else if (mode === 'qtyDesc') a.sort(function (x, y) { return y.qty - x.qty || byName(x, y); });
    else if (mode === 'val') a.sort(function (x, y) { return y.qty * y.buy - x.qty * x.buy || byName(x, y); });
    else a.sort(function (x, y) {
      var r = STATUS_RANK[statusOf(x)] - STATUS_RANK[statusOf(y)];
      if (r) return r;
      var rx = x.min > 0 ? x.qty / x.min : x.qty, ry = y.min > 0 ? y.qty / y.min : y.qty;
      return rx - ry || byName(x, y);
    });
    return a;
  }
  /* استيراد أسطر من الإكسل: الاسم، الوصف، الكود، الكمية، الحد، سعر الشراء، سعر البيع. يُحدَّث الموجود حسب الكود */
  function parseImport(text, existing, makeId) {
    var lines = String(text || '').split(/\r?\n/);
    var out = existing.map(function (p) { return Object.assign({}, p); });
    var bySku = {};
    out.forEach(function (p) { bySku[p.sku.toLowerCase()] = p; });
    var added = 0, updated = 0, skipped = 0;
    lines.forEach(function (line) {
      if (!line.trim()) return;
      var c = line.indexOf('\t') >= 0 ? line.split('\t') : line.split(/\s*[,؛;]\s*/);
      var name = (c[0] || '').trim(), desc = (c[1] || '').trim(), sku = (c[2] || '').trim();
      var qty = parseNum(c[3]), min = parseNum(c[4]), buy = parseNum(c[5]), price = parseNum(c[6]);
      if (!name || !sku || !isFinite(qty)) { skipped++; return; }
      var rec = { name: name, desc: desc, sku: sku, qty: Math.max(0, Math.round(qty)),
        min: isFinite(min) ? Math.max(0, Math.round(min)) : 0, buy: isFinite(buy) ? Math.max(0, buy) : 0, price: isFinite(price) ? Math.max(0, price) : 0 };
      var hit = bySku[sku.toLowerCase()];
      if (hit) { rec.sku = hit.sku; Object.assign(hit, rec); updated++; }
      else { rec.id = makeId(); out.push(rec); bySku[sku.toLowerCase()] = rec; added++; }
    });
    return { products: out, added: added, updated: updated, skipped: skipped };
  }
  function toTSV(list) {
    var head = ['الاسم', 'الوصف', 'الكود SKU', 'الكمية', 'حد إعادة الطلب', 'سعر الشراء بدون ضريبة', 'سعر البيع المستهدف شامل الضريبة', 'الحالة', 'قيمة المخزون بسعر الشراء'];
    var label = { out: 'نفد', low: 'يقترب من النفاد', ok: 'متوفر' };
    var clean = function (s) { return String(s).replace(/[\t\r\n]+/g, ' '); };
    var rows = list.map(function (p) {
      return [clean(p.name), clean(p.desc), clean(p.sku), p.qty, p.min, p.buy.toFixed(2), p.price.toFixed(2), label[statusOf(p)], (p.qty * p.buy).toFixed(2)].join('\t');
    });
    return [head.join('\t')].concat(rows).join('\n');
  }
  function shortageList(list) {
    var need = sortProducts(list.filter(function (p) { return statusOf(p) !== 'ok'; }), 'need');
    return need.map(function (p) {
      var st = statusOf(p) === 'out' ? 'نفد' : 'يقترب من النفاد';
      return p.sku + ' | ' + p.name + ' | المتوفر ' + p.qty + ' | حد إعادة الطلب ' + p.min + ' | ' + st;
    }).join('\n');
  }
  /* يغيّر كمية منتج حسب الكود ويسجّل الحركة. يعدّل inv مباشرة ولا يحفظه، والمستدعي يحفظه إن نجح.
     delta سالبة = خصم، موجبة = إضافة. الفشل: notfound (الكود غير موجود) أو short (المتوفر أقل من المطلوب) */
  function adjustStock(inv, sku, delta, note) {
    var key = String(sku || '').trim().toLowerCase();
    var p = (inv.products || []).filter(function (x) { return x.sku.toLowerCase() === key; })[0];
    if (!key || !p) return { ok: false, reason: 'notfound' };
    if (delta < 0 && p.qty + delta < 0) return { ok: false, reason: 'short', have: p.qty, name: p.name };
    p.qty += delta;
    if (!Array.isArray(inv.log)) inv.log = [];
    inv.log.unshift({ t: Date.now(), name: p.name, sku: p.sku, delta: delta, after: p.qty, note: note || '' });
    inv.log = inv.log.slice(0, 100);
    return { ok: true, name: p.name, after: p.qty };
  }
  return { toLatin: toLatin, parseNum: parseNum, statusOf: statusOf, sortProducts: sortProducts, parseImport: parseImport,
    toTSV: toTSV, shortageList: shortageList, adjustStock: adjustStock };
})();

var Ord = (function () {
  var PLAT = { noon: 'نون', trendyol: 'ترنديول', other: 'أخرى' };
  function coName(c) { return c === 'jt' ? 'J&T' : 'شركة الشحن'; }
  function statusLabel(s, co) {
    if (s === 'prep') return 'قيد التجهيز';
    if (s === 'printed') return 'تم الطباعة';
    if (s === 'shipped') return 'تم الشحن وسُلّم لـ ' + coName(co);
    return 'ملغي';
  }
  function nextStatus(s) { return s === 'prep' ? 'printed' : s === 'printed' ? 'shipped' : null; }
  function prevStatus(s) { return s === 'shipped' ? 'printed' : s === 'printed' ? 'prep' : null; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function dayKey(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function dayLabel(key) { var p = String(key).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : key; }
  function timeLabel(ts) { var d = new Date(ts); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function filterOrders(orders, f) {
    var q = String(f.q || '').trim().toLowerCase();
    return orders.filter(function (o) {
      if (f.date && f.date !== 'all' && dayKey(o.createdAt) !== f.date) return false;
      if (f.platform && f.platform !== 'all' && o.platform !== f.platform) return false;
      if (f.status && f.status !== 'all' && o.status !== f.status) return false;
      if (!q) return true;
      return (o.no + ' ' + o.customer + ' ' + o.item + ' ' + o.tracking).toLowerCase().indexOf(q) >= 0;
    });
  }
  function buildReport(orders, scopeLabel, platLabel) {
    var c = { prep: 0, printed: 0, shipped: 0, cancelled: 0 }, p = {};
    orders.forEach(function (o) { c[o.status]++; p[o.platform] = (p[o.platform] || 0) + 1; });
    var pl = Object.keys(PLAT).filter(function (k) { return p[k]; }).map(function (k) { return PLAT[k] + ' ' + p[k]; }).join('، ') || 'لا يوجد';
    var lines = [
      'تقرير الطلبات: ' + scopeLabel + (platLabel ? ' (' + platLabel + ')' : ''),
      'إجمالي الطلبات: ' + orders.length,
      'حسب المنصة: ' + pl,
      'قيد التجهيز: ' + c.prep + ' | تم الطباعة: ' + c.printed + ' | سُلّمت للشحن: ' + c.shipped + ' | ملغية: ' + c.cancelled,
      'لم تُسلَّم للشحن بعد: ' + (c.prep + c.printed)
    ];
    if (orders.length) {
      lines.push('');
      orders.slice().sort(function (a, b) { return a.createdAt - b.createdAt; }).forEach(function (o) {
        lines.push(o.no + ' | ' + o.item + ' ×' + o.qty + ' | ' + (o.customer || 'بدون اسم') + ' | ' + PLAT[o.platform] + ' | ' + statusLabel(o.status, o.company) + (o.tracking ? ' | تتبع ' + o.tracking : ''));
      });
    }
    return lines.join('\n');
  }
  function toTSV(orders) {
    var head = ['التاريخ', 'الوقت', 'رقم الطلب', 'المنصة', 'العميل', 'الكود أو المنتج', 'الكمية', 'شركة الشحن', 'رقم التتبع', 'الحالة', 'خُصم من المخزون'];
    var cl = function (s) { return String(s == null ? '' : s).replace(/[\t\r\n]+/g, ' '); };
    var rows = orders.slice().sort(function (a, b) { return a.createdAt - b.createdAt; }).map(function (o) {
      return [dayLabel(dayKey(o.createdAt)), timeLabel(o.createdAt), cl(o.no), PLAT[o.platform], cl(o.customer), cl(o.item), o.qty,
        coName(o.company), cl(o.tracking), statusLabel(o.status, o.company), o.deducted ? 'نعم' : 'لا'].join('\t');
    });
    return [head.join('\t')].concat(rows).join('\n');
  }

  /* ربط الطلبات بالمخزون: الطلب المشحون يجب أن يكون مخصوماً، وغير ذلك يجب ألا يكون مخصوماً */
  function stockAction(o) {
    if (o.status === 'shipped' && !o.deducted) return 'deduct';
    if (o.status !== 'shipped' && o.deducted) return 'restock';
    return null;
  }
  function reasonText(reason, have, need) {
    if (reason === 'noinv') return 'لا توجد بيانات مخزون بعد. أضف منتجاتك من صفحة المخزون.';
    if (reason === 'notfound') return 'الكود غير موجود في المخزون.';
    if (reason === 'short') return 'المتوفر ' + have + ' أقل من المطلوب ' + need + '.';
    return '';
  }
  /* ينفّذ الخصم أو الإرجاع على المخزون inv ويحدّث علامات الطلب. يعدّل o و inv ولا يحفظ، والمستدعي يحفظ inv إن كانت النتيجة changed */
  function syncStock(o, inv) {
    var act = stockAction(o);
    if (!act) { return { action: null, ok: true, changed: false }; }
    if (!inv || !Array.isArray(inv.products)) {
      o.stockWarn = act === 'deduct' ? reasonText('noinv') : '';
      if (act === 'restock') o.deducted = false;
      return { action: act, ok: false, changed: false, reason: 'noinv' };
    }
    var delta = act === 'deduct' ? -o.qty : o.qty;
    var r = Inv.adjustStock(inv, o.item, delta, (act === 'deduct' ? 'شحن الطلب ' : 'إرجاع الطلب ') + o.no);
    if (r.ok) {
      o.deducted = act === 'deduct'; o.stockWarn = '';
      return { action: act, ok: true, changed: true, name: r.name, after: r.after };
    }
    o.stockWarn = reasonText(r.reason, r.have, o.qty);
    /* إن تعذّر الإرجاع لا نكرر المحاولة للأبد */
    if (act === 'restock') o.deducted = false;
    return { action: act, ok: false, changed: false, reason: r.reason, have: r.have };
  }
  return { PLAT: PLAT, coName: coName, statusLabel: statusLabel, nextStatus: nextStatus, prevStatus: prevStatus, dayKey: dayKey,
    dayLabel: dayLabel, timeLabel: timeLabel, filterOrders: filterOrders, buildReport: buildReport, toTSV: toTSV,
    stockAction: stockAction, reasonText: reasonText, syncStock: syncStock };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { Inv: Inv, Ord: Ord };
