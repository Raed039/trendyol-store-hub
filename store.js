/* طبقة الحفظ المشتركة. كل أدوات المتجر تحفظ وتقرأ بياناتها من هنا.
   البيانات تُحفظ في متصفحك (localStorage) تحت مفاتيح تبدأ بـ hub:
   ولأن الصفحات على نفس العنوان فهي تتشارك البيانات (مثلاً الطلبات تخصم من المخزون).
   لاحقاً يمكن استبدال هذا الملف بقاعدة بيانات دون تغيير بقية الأدوات. */
var STORE_NAMES = ['pricing', 'inventory', 'orders', 'templates'];

function createStore(backend) {
  var P = 'hub:';
  function read(name, fallback) {
    try {
      var raw = backend.getItem(P + name);
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function write(name, value) {
    try { backend.setItem(P + name, JSON.stringify(value)); return true; } catch (e) { return false; }
  }
  function exportAll() {
    var out = { app: 'store-hub', version: 1, exportedAt: new Date().toISOString(), data: {} };
    STORE_NAMES.forEach(function (n) { var v = read(n, null); if (v !== null) out.data[n] = v; });
    return JSON.stringify(out);
  }
  function importAll(text) {
    var o;
    try { o = JSON.parse(String(text).trim()); } catch (e) { return { ok: false, error: 'النص ليس نسخة احتياطية صالحة.' }; }
    if (!o || o.app !== 'store-hub' || !o.data || typeof o.data !== 'object') return { ok: false, error: 'هذه ليست نسخة احتياطية لأدوات المتجر.' };
    var names = Object.keys(o.data).filter(function (n) { return STORE_NAMES.indexOf(n) >= 0; });
    if (!names.length) return { ok: false, error: 'النسخة الاحتياطية لا تحتوي بيانات.' };
    names.forEach(function (n) { write(n, o.data[n]); });
    return { ok: true, names: names };
  }
  return { read: read, write: write, exportAll: exportAll, importAll: importAll, NAMES: STORE_NAMES };
}

var Store = null;
if (typeof window !== 'undefined') {
  try {
    Store = createStore(window.localStorage);
    /* يستدعي الدالة عندما تتغير بيانات من صفحة أخرى مفتوحة */
    Store.onChange = function (fn) {
      window.addEventListener('storage', function (e) {
        if (e.key && e.key.indexOf('hub:') === 0) fn(e.key.slice(4));
      });
    };
  } catch (e) {
    /* إن كان الحفظ ممنوعاً في المتصفح تعمل الأدوات بدون حفظ */
    var memBackend = {};
    Store = createStore({
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(memBackend, k) ? memBackend[k] : null; },
      setItem: function (k, v) { memBackend[k] = String(v); }
    });
    Store.onChange = function () {};
  }
}
if (typeof module !== 'undefined' && module.exports) module.exports = { createStore: createStore, NAMES: STORE_NAMES };
