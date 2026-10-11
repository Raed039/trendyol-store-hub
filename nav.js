/* شريط التنقل بين أدوات المتجر. يوضع أول شيء داخل body. */
(function () {
  var links = [
    ['index.html', 'الرئيسية'],
    ['pricing.html', 'التسعير'],
    ['inventory.html', 'المخزون'],
    ['orders.html', 'الطلبات'],
    ['templates.html', 'خدمة العملاء']
  ];
  var here = location.pathname.split('/').pop() || 'index.html';
  var nav = document.createElement('nav');
  nav.className = 'hubnav';
  nav.setAttribute('aria-label', 'أدوات المتجر');
  nav.setAttribute('dir', 'rtl');
  nav.innerHTML = links.map(function (l) {
    return '<a href="' + l[0] + '"' + (l[0] === here ? ' aria-current="page"' : '') + '>' + l[1] + '</a>';
  }).join('');
  document.body.insertBefore(nav, document.body.firstChild);
})();
