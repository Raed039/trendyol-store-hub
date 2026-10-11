/* حسابات التسعير المشتركة: الحساب الأمامي (من السعر إلى الربح) والعكسي (من الربح إلى السعر).
   كل المبالغ بالريال. الضريبة تُمرَّر كنسبة مئوية (مثلاً 15). */
var Calc = (function () {
  /* i: بيانات المنتج. L: السعر قبل الخصم شامل الضريبة. discPct: خصم الحملة % */
  function calc(i, L, discPct) {
    var v = i.vat / 100;
    var d = discPct / 100;
    var sup = i.support / 100;
    var D = L * d;
    var F = L - D;                 /* سعر العميل بعد الخصم */
    var subsidy = D * sup;         /* ما تدفعه المنصة من الخصم */
    var E = F + subsidy;           /* ما تستلمه شامل الضريبة */
    var rev = E / (1 + v);
    var vatSales = E - rev;
    var base = i.base === 'ex' ? F / (1 + v) : F;
    var comm = i.commMode === 'amt' ? i.commAmt : i.commPct / 100 * base;
    var vatComm = comm * v;
    var shipNet = i.shipNet;
    var shipVat = shipNet * v;
    var shipGross = shipNet + shipVat;
    var deducted = i.shipDeduct !== 'no';
    var commVatRec = i.commVat !== 'cost';
    var payout = E - comm - vatComm - (deducted ? shipGross : 0);
    var stripped = payout / (1 + v);
    var vatExtracted = payout - stripped;
    var net = stripped - i.buy - (deducted ? 0 : shipNet) - (commVatRec ? 0 : vatComm);
    return { L: L, D: D, F: F, subsidy: subsidy, mine: D - subsidy, E: E, rev: rev, vatSales: vatSales, comm: comm, vatComm: vatComm,
      shipNet: shipNet, shipVat: shipVat, shipGross: shipGross, deducted: deducted, commVatRec: commVatRec,
      payout: payout, stripped: stripped, vatExtracted: vatExtracted, net: net };
  }

  /* السعر قبل الخصم الذي يعطي الربح المطلوب بالضبط (الربح خطي بالنسبة للسعر) */
  function priceFor(i, discPct, target) {
    var a = calc(i, 0, discPct).net - target;
    var b = calc(i, 1, discPct).net - target;
    var slope = b - a;
    if (!(slope > 0)) return NaN;
    var x = -a / slope;
    return x > 0 ? x : NaN;
  }

  /* يحوّل المدخلات إلى أرقام بدون ضريبة حسب طريقة الإدخال (شاملة أو بدون) */
  function model(st) {
    var k = st.entry === 'incl' ? 1 / (1 + st.vat / 100) : 1;
    var m = {};
    Object.keys(st).forEach(function (key) { m[key] = st[key]; });
    m.buy = st.buy * k;
    m.shipNet = st.ship * k;
    return m;
  }

  return { calc: calc, priceFor: priceFor, model: model };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Calc;
