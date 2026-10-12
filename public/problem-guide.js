
(function(){
(function(){
      var inp = document.getElementById('prob-filter'); if (!inp) return;
      var cards = Array.prototype.slice.call(document.querySelectorAll('#sec-problems .pv-card[data-find]'));
      var out = document.getElementById('prob-filter-n');
      inp.addEventListener('input', function(){
        var q = inp.value.replace(/\s+/g,'').toLowerCase(), n = 0;
        cards.forEach(function(cd){
          var hit = !q || cd.getAttribute('data-find').replace(/\s+/g,'').toLowerCase().indexOf(q) !== -1;
          cd.hidden = !hit; if (hit) n++;
        });
        out.textContent = q ? (n + '개 항목') : '';
        if (q && n === 1) { var only = cards.filter(function(cd){ return !cd.hidden; })[0]; only.scrollIntoView({behavior:'smooth', block:'start'}); }
      });
    })();
    document.querySelectorAll('.media-chip, .pv-jump').forEach(function(btn){
      btn.addEventListener('click', function(){
        var t = document.getElementById(btn.getAttribute('data-scroll'));
        if (t) t.scrollIntoView({behavior:'smooth', block:'start'});
      });
    });
})();
