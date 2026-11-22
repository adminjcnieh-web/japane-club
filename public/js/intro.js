// Animasi pembuka: tampil sekali per sesi browser/aplikasi (~2,3 detik), tidak menghalangi muat aplikasi.
(function () {
  try {
    if (sessionStorage.getItem('jc.intro')) return;
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    sessionStorage.setItem('jc.intro', '1');
  } catch (e) { /* penyimpanan diblokir: tetap tampilkan */ }
  var root = document.documentElement;
  root.classList.add('intro-on');
  function build() {
    var el = document.getElementById('intro');
    if (!el) return;
    var petals = '';
    for (var i = 0; i < 14; i++) {
      var left = Math.round(Math.random() * 100), dx = Math.round(Math.random() * 80 - 40), delay = (Math.random() * 1.1).toFixed(2), s = (0.7 + Math.random() * 0.8).toFixed(2);
      petals += '<i class="petal" style="left:' + left + '%;--dx:' + dx + 'px;animation-delay:' + delay + 's;transform:scale(' + s + ')"></i>';
    }
    el.insertAdjacentHTML('beforeend', petals);
    setTimeout(function () { el.remove(); root.classList.remove('intro-on'); }, 2500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
