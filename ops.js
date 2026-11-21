/* Modul operasional: ledger stok per batch (FEFO), produksi, pengiriman, dashboard. */
(function () {
  'use strict';
  var CC = window.CC, esc = CC.esc, rp = CC.rp, nf2 = CC.nf2, fmtDate = CC.fmtDate, today = CC.todayISO,
    addDays = CC.addDays, num = CC.numOrNull, uid = CC.uid, toast = CC.toast, openDlg = CC.openDlg,
    closeDlg = CC.closeDlg, dlgHead = CC.dlgHead, $ = CC.$, view = CC.view, dlg = CC.dlg, leader = CC.leader,
    openConfirm = CC.openConfirm;
  function S() { return CC.state; }

  var st0 = document.createElement('style');
  st0.textContent =
    '.rt{font-weight:600;font-size:1.0625rem}' +
    '.acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}' +
    '.acts .btn{padding:0 12px}' +
    '.pill{display:inline-block;font-size:.8125rem;font-weight:600;border:1.5px solid var(--line-strong);border-radius:999px;padding:2px 10px}' +
    '.pill.bad{color:var(--bad);border-color:var(--bad)}.pill.warn{color:var(--warn);border-color:var(--warn)}.pill.good{color:var(--ok);border-color:var(--ok)}' +
    '.tick{list-style:none;margin:0;padding:0;display:grid;gap:0;background:var(--surface);border:0;border-radius:var(--rc,18px);box-shadow:var(--shadow)}' +
    '.tick li{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;justify-content:space-between;padding:14px 16px;border-top:1px solid var(--line)}' +
    '.tick li:first-child{border-top:0}.tick .btn{padding:0 12px}' +
    '.mat{display:grid;gap:4px;background:var(--bg);border:1px solid var(--line);border-radius:14px;padding:10px 12px}';
  document.head.appendChild(st0);

  function cartName(id) {
    var c = S().carts.filter(function (x) { return x.id === id; })[0];
    return c ? c.name : 'Cart dihapus';
  }
  function menuName(id) { var m = CC.menuById(id); return m ? m.name : 'Menu dihapus'; }
  function pad(n) { return String(n).padStart(2, '0'); }

  /* ---------- ledger: stok per batch dengan FEFO ---------- */
  function simulate(st) {
    var stock = {}, orphan = {}, shipAlloc = {}, shortages = [], recapInfo = {}, hold = {};
    var bById = {};
    st.batches.forEach(function (b) { bById[b.id] = b; });
    var ev = [];
    st.batches.forEach(function (b) { ev.push({ d: b.date, o: 0, k: 'b', x: b, i: 0 }); });
    st.writeoffs.forEach(function (w, i) { ev.push({ d: w.date, o: 1, k: 'w', x: w, i: i }); });
    st.shipments.forEach(function (s, i) { ev.push({ d: s.date, o: 2, k: 's', x: s, i: i }); });
    st.recaps.forEach(function (r, i) { ev.push({ d: r.date, o: 3, k: 'r', x: r, i: i }); });
    ev.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : (a.o - b.o) || (a.i - b.i); });

    function fefo(menuId, date) {
      return st.batches.filter(function (b) { return b.menuId === menuId && b.expiry >= date && (stock[b.id] || 0) > 0; })
        .sort(function (a, b) { return a.expiry < b.expiry ? -1 : a.expiry > b.expiry ? 1 : a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    }
    ev.forEach(function (e) {
      var x = e.x;
      if (e.k === 'b') { stock[x.id] = (stock[x.id] || 0) + (x.cups || 0); }
      else if (e.k === 'w') { if (bById[x.batchId]) stock[x.batchId] = Math.max(0, (stock[x.batchId] || 0) - (x.qty || 0)); }
      else if (e.k === 's') {
        var key = x.cartId + '|' + x.date; var h = hold[key] = hold[key] || {};
        x.lines.forEach(function (l) {
          var need = l.qty || 0, al = [];
          fefo(l.menuId, x.date).forEach(function (b) {
            if (need <= 0) return;
            var t = Math.min(stock[b.id], need);
            stock[b.id] -= t; need -= t; al.push({ batchId: b.id, qty: t });
          });
          if (need > 0) shortages.push({ shipId: x.id, menuId: l.menuId, qty: need, date: x.date });
          (shipAlloc[x.id] = shipAlloc[x.id] || {})[l.menuId] = al;
          (h[l.menuId] = h[l.menuId] || []).push.apply(h[l.menuId], al);
        });
      } else if (e.k === 'r') {
        var hk = (hold[x.cartId + '|' + x.date]) || {}, info = {};
        x.lines.forEach(function (l) {
          var map = {};
          (hk[l.menuId] || []).forEach(function (it) { map[it.batchId] = (map[it.batchId] || 0) + it.qty; });
          var merged = Object.keys(map).map(function (k) { return { batchId: k, qty: map[k] }; })
            .sort(function (a, b) {
              var A = bById[a.batchId], B = bById[b.batchId];
              return A.expiry < B.expiry ? -1 : A.expiry > B.expiry ? 1 : 0;
            });
          var consume = (l.turus || 0) + (l.reject || 0);
          merged.forEach(function (it) { var t = Math.min(it.qty, consume); it.qty -= t; consume -= t; });
          var sisa = l.sisa || 0, retur = [];
          merged.forEach(function (it) {
            if (sisa <= 0) return;
            var t = Math.min(it.qty, sisa);
            if (t > 0) { retur.push({ batchId: it.batchId, qty: t }); stock[it.batchId] = (stock[it.batchId] || 0) + t; sisa -= t; it.qty -= t; }
          });
          var orph = 0;
          if (sisa > 0) { orphan[l.menuId] = (orphan[l.menuId] || 0) + sisa; orph = sisa; }
          var lost = merged.reduce(function (a, it) { return a + it.qty; }, 0);
          info[l.menuId] = { retur: retur, orphan: orph, lost: lost };
        });
        recapInfo[x.id] = info;
      }
    });
    return { stock: stock, orphan: orphan, shipAlloc: shipAlloc, shortages: shortages, recapInfo: recapInfo };
  }
  function centralByMenu(sim, ref) {
    var st = S(), out = {};
    st.menus.forEach(function (m) { out[m.id] = { menu: m, ok: [], expired: [], okTotal: 0, expTotal: 0, orphan: sim.orphan[m.id] || 0 }; });
    st.batches.forEach(function (b) {
      var q = sim.stock[b.id] || 0, o = out[b.menuId];
      if (q <= 0 || !o) return;
      if (b.expiry < ref) { o.expired.push({ b: b, q: q }); o.expTotal += q; }
      else { o.ok.push({ b: b, q: q }); o.okTotal += q; }
    });
    Object.keys(out).forEach(function (k) {
      out[k].ok.sort(function (a, b) { return a.b.expiry < b.b.expiry ? -1 : 1; });
    });
    return out;
  }
  function batchCode(b) { var x = S().batches.filter(function (y) { return y.id === b; })[0]; return x ? x.code : '?'; }
  CC.simulate = simulate; CC.centralByMenu = centralByMenu; CC.cartName = cartName; CC.menuName = menuName;
  CC.batchCode = batchCode;
  CC.genCode = function (d, m) { return genCode(d, m); };
  CC.gotoRecap = function (date, cart) {
    CC.ui.recapDate = date; CC.ui.recapCart = cart;
    if (location.hash === '#rekap') CC.render(true); else location.hash = '#rekap';
  };

  /* ---------- Produksi ---------- */
  function batchRowHTML(b, sim, t) {
    var q = sim.stock[b.id] || 0, warn = S().settings.expWarnDays;
    var status;
    if (q <= 0) status = '<span class="pill">Habis</span>';
    else if (b.expiry < t) status = '<span class="pill bad">Expired, perlu dibuang</span>';
    else if (b.expiry <= addDays(t, warn)) status = '<span class="pill warn">Segera expired</span>';
    else status = '<span class="pill good">Layak kirim</span>';
    return '<li class="row"><div class="main"><span class="rt">' + esc(b.code) + ' ' + status + '</span>' +
      '<p class="meta">' + esc(menuName(b.menuId)) + ', produksi ' + esc(fmtDate(b.date)) + ', expired ' + esc(fmtDate(b.expiry)) + '</p>' +
      (b.note ? '<p class="meta">' + esc(b.note) + '</p>' : '') +
      '<div class="acts">' +
      (q > 0 ? '<button type="button" class="btn" data-act="writeoff" data-id="' + esc(b.id) + '">Buang stok</button>' : '') +
      '<button type="button" class="btn danger" data-act="del-batch" data-id="' + esc(b.id) + '" aria-label="Hapus batch ' + esc(b.code) + '">Hapus</button></div></div>' +
      '<div class="price"><b>' + nf2.format(q) + ' cup</b><span>sisa dari ' + nf2.format(b.cups) + ', ' + rp(b.costPerCup || 0) + ' per cup</span></div></li>';
  }
  function renderProd() {
    var st = S(), sim = simulate(st), t = today();
    var list = st.batches.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    var cb = centralByMenu(sim, t);
    var totals = st.menus.map(function (m) {
      var c = cb[m.id];
      return leader(esc(m.name), nf2.format(c.okTotal) + ' cup' + (c.expTotal ? ' (+' + nf2.format(c.expTotal) + ' expired)' : ''));
    }).join('');
    view.innerHTML = '<section aria-labelledby="h-prod"><div class="pagehead"><div><h1 id="h-prod" tabindex="-1">Produksi</h1>' +
      '<p class="lede">Catat batch RTD yang selesai dibuat di central. Stok bertambah per batch, lengkap dengan tanggal expired.</p></div>' +
      '<button type="button" class="btn primary" data-act="new-batch"' + (st.menus.length ? '' : ' disabled') + '>Catat batch</button></div>' +
      (st.menus.length ? '' : '<div class="strip warn"><span>Buat menu dulu di <a href="#menu">Menu dan COGS</a> sebelum mencatat produksi.</span></div>') +
      (st.menus.length ? '<div class="struk" style="margin-bottom:20px"><h2>Stok layak kirim di central</h2>' + totals + '</div>' : '') +
      (list.length ? '<ul class="rows">' + list.map(function (b) { return batchRowHTML(b, sim, t); }).join('') + '</ul>' :
        '<div class="empty"><p>Belum ada batch produksi. Catat batch pertama setelah RTD selesai dibuat dan dikemas per cup.</p></div>') +
      '</section>';
  }

  function initials(name) {
    var w = String(name || '').trim().split(/\s+/).filter(Boolean);
    return (w.map(function (x) { return x[0]; }).join('').toUpperCase().slice(0, 3)) || 'X';
  }
  function genCode(date, menuId) {
    var m = CC.menuById(menuId); if (!m) return '';
    var n = S().batches.filter(function (b) { return b.date === date && b.menuId === menuId; }).length + 1;
    return 'B' + date.slice(2).replace(/-/g, '') + '-' + initials(m.name) + (n > 1 ? '-' + n : '');
  }
  function batchPreview(m, cups) {
    var c = CC.calcMenu(m), perCup = c.rtd + c.rtdLoss;
    var loss = c.lossPct, rows = '';
    if (cups > 0) {
      m.lines.filter(function (l) { return l.section === 'rtd' && l.qty > 0; }).forEach(function (l) {
        var ing = CC.ingById(l.ingId); if (!ing) return;
        var need = l.qty * cups / (1 - loss);
        rows += leader(esc(ing.name), nf2.format(Math.ceil(need * 100) / 100) + ' ' + CC.UNITS[l.unit].label);
      });
    }
    var h = '<div class="mat" aria-live="polite"><strong>Perkiraan bahan untuk ' + (cups > 0 ? nf2.format(cups) : '0') + ' cup</strong>' +
      (rows || '<span class="hint">Isi jumlah cup untuk melihat kebutuhan bahan.</span>') +
      leader('Biaya RTD per cup', rp(perCup)) + (cups > 0 ? leader('Total biaya batch', rp(perCup * cups)) : '') + '</div>';
    if (c.missing) h += '<p class="note warn"><strong>Resep RTD belum lengkap.</strong> ' + c.missing + ' baris tanpa jumlah, biaya per cup bisa lebih rendah dari aslinya.</p>';
    return { html: h, perCup: perCup };
  }
  function openBatch() {
    var st = S(), m0 = st.menus[0];
    openDlg(dlgHead('Catat batch produksi') +
      '<form id="f-batch" novalidate>' +
      '<div class="grid2"><div class="field"><label for="bt-date">Tanggal produksi</label><input id="bt-date" type="date" value="' + today() + '"></div>' +
      '<div class="field"><label for="bt-menu">Menu</label><select id="bt-menu">' + st.menus.map(function (m) { return '<option value="' + esc(m.id) + '">' + esc(m.name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="bt-cups">Jumlah cup jadi</label><input id="bt-cups" type="number" inputmode="numeric" min="0" step="1"></div>' +
      '<div class="field"><label for="bt-exp">Tanggal expired</label><input id="bt-exp" type="date"></div></div>' +
      '<div class="field"><label for="bt-code">Kode batch</label><input id="bt-code" type="text" autocomplete="off"></div>' +
      '<div class="field"><label for="bt-note">Catatan, opsional</label><input id="bt-note" type="text" autocomplete="off"></div>' +
      '<div id="bt-prev"></div><p class="err" id="bt-err" role="alert"></p>' +
      '<div class="actions"><button type="button" class="btn" data-act="close">Batal</button><button type="submit" class="btn primary">Simpan batch</button></div></form>', '#bt-cups');
    syncBatch(true, true);
  }
  function syncBatch(autoExp, autoCode) {
    var date = $('#bt-date', dlg).value, mid = $('#bt-menu', dlg).value, m = CC.menuById(mid);
    if (autoExp && m && date && m.shelfDays > 0) $('#bt-exp', dlg).value = addDays(date, m.shelfDays);
    else if (autoExp && date && !(m && m.shelfDays > 0)) $('#bt-exp', dlg).value = '';
    if (autoCode && date) $('#bt-code', dlg).value = genCode(date, mid);
    var cups = num($('#bt-cups', dlg).value);
    $('#bt-prev', dlg).innerHTML = m ? batchPreview(m, cups).html : '';
  }
  function submitBatch() {
    var date = $('#bt-date', dlg).value, mid = $('#bt-menu', dlg).value, cups = num($('#bt-cups', dlg).value),
      exp = $('#bt-exp', dlg).value, code = $('#bt-code', dlg).value.trim(), err = $('#bt-err', dlg), m = CC.menuById(mid);
    if (!date) { err.textContent = 'Pilih tanggal produksi.'; return; }
    if (!(cups > 0)) { err.textContent = 'Isi jumlah cup yang lebih dari 0.'; $('#bt-cups', dlg).focus(); return; }
    if (!exp) { err.textContent = 'Isi tanggal expired. Isi umur simpan di Menu dan COGS supaya terisi otomatis.'; $('#bt-exp', dlg).focus(); return; }
    if (exp < date) { err.textContent = 'Tanggal expired tidak boleh sebelum tanggal produksi.'; $('#bt-exp', dlg).focus(); return; }
    if (!code) { err.textContent = 'Isi kode batch.'; $('#bt-code', dlg).focus(); return; }
    if (S().batches.some(function (b) { return b.code === code; })) { err.textContent = 'Kode batch ini sudah dipakai. Ganti dengan kode lain.'; $('#bt-code', dlg).focus(); return; }
    S().batches.push({ id: uid('b'), date: date, menuId: mid, cups: cups, expiry: exp, code: code, note: $('#bt-note', dlg).value.trim(), costPerCup: batchPreview(m, cups).perCup, usage: CC.usageForBatch(m, cups) });
    CC.save(); closeDlg(); CC.render(); toast('Batch ' + code + ' disimpan.');
  }
  function openWriteoff(id) {
    var b = S().batches.filter(function (x) { return x.id === id; })[0]; if (!b) return;
    var q = simulate(S()).stock[id] || 0;
    openDlg(dlgHead('Buang stok batch ' + esc(b.code)) +
      '<form id="f-writeoff" data-id="' + esc(id) + '" novalidate><p class="hint">Stok tercatat ' + nf2.format(q) + ' cup.</p>' +
      '<div class="grid2"><div class="field"><label for="wo-date">Tanggal</label><input id="wo-date" type="date" value="' + today() + '"></div>' +
      '<div class="field"><label for="wo-qty">Jumlah cup dibuang</label><input id="wo-qty" type="number" inputmode="numeric" min="0" step="1" value="' + q + '"></div></div>' +
      '<div class="field"><label for="wo-why">Alasan</label><select id="wo-why"><option>Expired</option><option>Rusak</option><option>Tumpah</option><option>Lainnya</option></select></div>' +
      '<p class="err" id="wo-err" role="alert"></p><div class="actions"><button type="button" class="btn" data-act="close">Batal</button><button type="submit" class="btn danger">Buang stok</button></div></form>', '#wo-qty');
  }
  function submitWriteoff(f) {
    var id = f.getAttribute('data-id'), q = simulate(S()).stock[id] || 0, qty = num($('#wo-qty', dlg).value), err = $('#wo-err', dlg);
    if (!(qty > 0)) { err.textContent = 'Isi jumlah yang lebih dari 0.'; return; }
    if (qty > q) { err.textContent = 'Jumlah melebihi stok batch (' + nf2.format(q) + ' cup).'; return; }
    S().writeoffs.push({ id: uid('w'), date: $('#wo-date', dlg).value || today(), batchId: id, qty: qty, reason: $('#wo-why', dlg).value });
    CC.save(); closeDlg(); CC.render(); toast('Stok dibuang dan dicatat.');
  }
  function batchRefs(id) {
    var st = S(), sim = simulate(st), n = 0;
    Object.keys(sim.shipAlloc).forEach(function (sid) {
      Object.keys(sim.shipAlloc[sid]).forEach(function (mid) { sim.shipAlloc[sid][mid].forEach(function (a) { if (a.batchId === id && a.qty > 0) n++; }); });
    });
    return n + st.writeoffs.filter(function (w) { return w.batchId === id; }).length;
  }

  /* ---------- Pengiriman ---------- */
  var TYPE = { awal: 'Stok awal', tambahan: 'Tambahan' };
  function shipLinesText(s, sim) {
    return s.lines.filter(function (l) { return l.qty > 0; }).map(function (l) {
      var al = ((sim.shipAlloc[s.id] || {})[l.menuId] || []).filter(function (a) { return a.qty > 0; })
        .map(function (a) { return batchCode(a.batchId) + ': ' + nf2.format(a.qty); }).join(', ');
      return { name: menuName(l.menuId), qty: l.qty, batches: al };
    });
  }
  function renderShip() {
    var st = S(), sim = simulate(st), items = [];
    st.shipments.forEach(function (s) { items.push({ date: s.date, kind: 's', s: s }); });
    st.recaps.forEach(function (r) {
      var info = sim.recapInfo[r.id] || {}, tot = 0;
      Object.keys(info).forEach(function (k) { info[k].retur.forEach(function (a) { tot += a.qty; }); tot += info[k].orphan; });
      if (tot > 0) items.push({ date: r.date, kind: 'r', r: r, info: info, tot: tot });
    });
    items.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (a.kind < b.kind ? 1 : -1); });
    var byDate = {}, order = [];
    items.forEach(function (it) { if (!byDate[it.date]) { byDate[it.date] = []; order.push(it.date); } byDate[it.date].push(it); });
    var body = order.map(function (d) {
      return '<div class="group"><h2>' + esc(fmtDate(d)) + '</h2><ul class="tick">' + byDate[d].map(function (it) { return shipItemHTML(it, sim); }).join('') + '</ul></div>';
    }).join('');
    view.innerHTML = '<section aria-labelledby="h-ship"><div class="pagehead"><div><h1 id="h-ship" tabindex="-1">Pengiriman</h1>' +
      '<p class="lede">Surat jalan dari central ke cart: stok awal dan tambahan. Retur muncul otomatis dari sisa yang diisi di rekap harian.</p></div>' +
      '<button type="button" class="btn primary" data-act="new-ship"' + (st.menus.length ? '' : ' disabled') + '>Buat pengiriman</button></div>' +
      (st.menus.length ? '' : '<div class="strip warn"><span>Buat menu dulu di <a href="#menu">Menu dan COGS</a>.</span></div>') +
      (body || '<div class="empty"><p>Belum ada pengiriman. Buat pengiriman stok awal sebelum cart buka, lalu pengiriman tambahan bila stok menipis.</p></div>') + '</section>';
  }
  function shipItemHTML(it, sim) {
    if (it.kind === 'r') {
      var lines = Object.keys(it.info).map(function (mid) {
        var q = it.info[mid].retur.reduce(function (a, x) { return a + x.qty; }, 0) + it.info[mid].orphan;
        if (!q) return '';
        var bs = it.info[mid].retur.map(function (a) { return batchCode(a.batchId) + ': ' + nf2.format(a.qty); }).join(', ');
        return '<span>' + esc(menuName(mid)) + ' ' + nf2.format(q) + ' cup' + (bs ? ' <span class="hint">(' + esc(bs) + ')</span>' : '') +
          (it.info[mid].orphan ? ' <span class="pill warn">' + nf2.format(it.info[mid].orphan) + ' cup tanpa batch</span>' : '') + '</span>';
      }).join('');
      return '<li><div style="display:grid;gap:4px"><span class="rt">Retur dari rekap <span class="pill">' + esc(cartName(it.r.cartId)) + '</span></span>' + lines + '</div>' +
        '<button type="button" class="btn" data-act="goto-recap" data-date="' + esc(it.r.date) + '" data-cart="' + esc(it.r.cartId) + '">Buka rekap</button></li>';
    }
    var s = it.s, ls = shipLinesText(s, sim);
    var short = sim.shortages.filter(function (x) { return x.shipId === s.id; });
    return '<li><div style="display:grid;gap:4px"><span class="rt">' + esc(TYPE[s.type] || s.type) + ' <span class="pill">' + esc(cartName(s.cartId)) + '</span>' + (s.time ? ' <span class="hint">' + esc(s.time) + '</span>' : '') + '</span>' +
      ls.map(function (l) { return '<span>' + esc(l.name) + ' ' + nf2.format(l.qty) + ' cup' + (l.batches ? ' <span class="hint">(' + esc(l.batches) + ')</span>' : '') + '</span>'; }).join('') +
      (s.note ? '<span class="hint">' + esc(s.note) + '</span>' : '') +
      short.map(function (x) { return '<span class="chk bad">Stok kurang ' + nf2.format(x.qty) + ' cup untuk ' + esc(menuName(x.menuId)) + '</span>'; }).join('') + '</div>' +
      '<div class="acts"><button type="button" class="btn" data-act="copy-sj" data-id="' + esc(s.id) + '">Salin surat jalan</button>' +
      '<button type="button" class="btn danger" data-act="del-ship" data-id="' + esc(s.id) + '">Hapus</button></div></li>';
  }
  function availAt(date) {
    var sim = simulate(S()), cb = centralByMenu(sim, date), out = {};
    Object.keys(cb).forEach(function (k) { out[k] = cb[k].okTotal; });
    return out;
  }
  function openShip() {
    var st = S(), t = today();
    var firstCart = st.carts[0].id;
    var hasAwal = st.shipments.some(function (s) { return s.date === t && s.cartId === firstCart && s.type === 'awal'; });
    openDlg(dlgHead('Pengiriman ke cart') +
      '<form id="f-ship" novalidate>' +
      '<div class="grid2"><div class="field"><label for="sh-date">Tanggal</label><input id="sh-date" type="date" value="' + t + '"></div>' +
      '<div class="field"><label for="sh-cart">Cart</label><select id="sh-cart">' + st.carts.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="sh-time">Jam kirim, opsional</label><input id="sh-time" type="time"></div></div>' +
      '<fieldset class="seg"><legend>Jenis pengiriman</legend><label><input type="radio" name="sh-type" value="awal"' + (hasAwal ? '' : ' checked') + '>Stok awal</label>' +
      '<label><input type="radio" name="sh-type" value="tambahan"' + (hasAwal ? ' checked' : '') + '>Tambahan</label></fieldset>' +
      '<div class="grid2" id="sh-lines">' + st.menus.map(function (m) {
        return '<div class="field"><label for="sh-q-' + esc(m.id) + '">' + esc(m.name) + ' (cup)</label><input id="sh-q-' + esc(m.id) + '" data-menu="' + esc(m.id) + '" type="number" inputmode="numeric" min="0" step="1"><span class="hint" data-av="' + esc(m.id) + '"></span></div>';
      }).join('') + '</div>' +
      '<div class="field"><label for="sh-note">Catatan, opsional</label><input id="sh-note" type="text" autocomplete="off"></div>' +
      '<p class="err" id="sh-err" role="alert"></p>' +
      '<div class="actions"><button type="button" class="btn" data-act="close">Batal</button><button type="submit" class="btn primary">Simpan pengiriman</button></div></form>', '#sh-q-' + st.menus[0].id);
    syncShipAvail();
  }
  function syncShipAvail() {
    var date = $('#sh-date', dlg).value || today(), av = availAt(date);
    dlg.querySelectorAll('[data-av]').forEach(function (el) {
      var q = av[el.getAttribute('data-av')] || 0;
      el.textContent = 'Layak kirim di central: ' + nf2.format(q) + ' cup';
    });
  }
  function submitShip() {
    var st = S(), err = $('#sh-err', dlg), date = $('#sh-date', dlg).value;
    if (!date) { err.textContent = 'Pilih tanggal pengiriman.'; return; }
    var lines = [];
    dlg.querySelectorAll('#sh-lines input').forEach(function (i) {
      var q = num(i.value); if (q > 0) lines.push({ menuId: i.getAttribute('data-menu'), qty: q });
    });
    if (!lines.length) { err.textContent = 'Isi jumlah cup untuk minimal satu menu.'; $('#sh-lines input', dlg).focus(); return; }
    var cand = { id: uid('s'), date: date, cartId: $('#sh-cart', dlg).value, type: ($('input[name="sh-type"]:checked', dlg) || {}).value || 'awal', time: $('#sh-time', dlg).value || '', lines: lines, note: $('#sh-note', dlg).value.trim() };
    var sim = simulate({ batches: st.batches, writeoffs: st.writeoffs, recaps: st.recaps, shipments: st.shipments.concat([cand]) });
    var short = sim.shortages.filter(function (x) { return x.shipId === cand.id; });
    if (short.length) {
      err.textContent = 'Stok central tidak cukup: ' + short.map(function (x) { return menuName(x.menuId) + ' kurang ' + nf2.format(x.qty) + ' cup'; }).join(', ') + '. Cup yang sudah expired atau diproduksi setelah tanggal ini tidak dihitung.';
      return;
    }
    st.shipments.push(cand); CC.save(); closeDlg(); CC.render(); toast('Pengiriman disimpan.');
  }
  function sjText(s) {
    var sim = simulate(S()), ls = shipLinesText(s, sim);
    return ['SURAT JALAN', 'Tanggal: ' + fmtDate(s.date) + (s.time ? ' ' + s.time : ''), 'Cart: ' + cartName(s.cartId), 'Jenis: ' + (TYPE[s.type] || s.type), ''].concat(
      ls.map(function (l) { return '- ' + l.name + ': ' + nf2.format(l.qty) + ' cup' + (l.batches ? ' (batch ' + l.batches + ')' : ''); }),
      s.note ? ['', 'Catatan: ' + s.note] : []).join('\n');
  }
  function copy(text) {
    function fb() { toast('Salin otomatis diblokir browser. Pilih teks dan salin manual.'); }
    try { navigator.clipboard.writeText(text).then(function () { toast('Surat jalan tersalin.'); }, fb); } catch (e) { fb(); }
  }

  /* ---------- Dashboard ---------- */
  function actionRow(text, btn) { return '<li><span>' + text + '</span>' + (btn || '') + '</li>'; }
  function greetWord() {
    var h = new Date().getHours();
    return h < 4 ? 'Selamat malam' : h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam';
  }
  function renderDash() {
    var st = S(), sim = simulate(st), t = today(), warn = st.settings.expWarnDays, acts = [];
    // rekap belum diinput
    var seen = {};
    st.shipments.forEach(function (s) {
      var k = s.cartId + '|' + s.date;
      if (s.date >= t || seen[k]) return; seen[k] = 1;
      if (!st.recaps.some(function (r) { return r.cartId === s.cartId && r.date === s.date; })) {
        acts.push(actionRow('<span class="pill warn">Rekap belum diinput</span> ' + esc(cartName(s.cartId)) + ', ' + esc(fmtDate(s.date)),
          '<button type="button" class="btn" data-act="goto-recap" data-date="' + esc(s.date) + '" data-cart="' + esc(s.cartId) + '">Input rekap</button>'));
      }
    });
    // selisih pada rekap 14 hari terakhir
    st.recaps.filter(function (r) { return r.date >= addDays(t, -13); }).sort(function (a, b) { return a.date < b.date ? 1 : -1; }).forEach(function (r) {
      var c = CC.recapCalc(r);
      if (c.flags.length) acts.push(actionRow('<span class="pill bad">Ada selisih</span> ' + esc(cartName(r.cartId)) + ', ' + esc(fmtDate(r.date)) + ': ' + esc(c.flags.join('; ')),
        '<button type="button" class="btn" data-act="goto-recap" data-date="' + esc(r.date) + '" data-cart="' + esc(r.cartId) + '">Periksa</button>'));
    });
    // expired
    st.batches.forEach(function (b) {
      var q = sim.stock[b.id] || 0; if (q <= 0) return;
      if (b.expiry < t) acts.push(actionRow('<span class="pill bad">Expired</span> Batch ' + esc(b.code) + ' masih tercatat ' + nf2.format(q) + ' cup', '<a class="btn" href="#produksi">Buka produksi</a>'));
      else if (b.expiry <= addDays(t, warn)) acts.push(actionRow('<span class="pill warn">Segera expired</span> Batch ' + esc(b.code) + ', ' + nf2.format(q) + ' cup, expired ' + esc(fmtDate(b.expiry)), '<a class="btn" href="#kirim">Buka pengiriman</a>'));
    });
    sim.shortages.forEach(function (x) { acts.push(actionRow('<span class="pill bad">Stok kurang</span> Pengiriman ' + esc(fmtDate(x.date)) + ' kekurangan ' + nf2.format(x.qty) + ' cup ' + esc(menuName(x.menuId)), '<a class="btn" href="#kirim">Buka pengiriman</a>')); });
    st.menus.forEach(function (m) {
      var c = CC.calcMenu(m);
      if (!(m.price > 0)) acts.push(actionRow('<span class="pill warn">Harga jual kosong</span> Menu ' + esc(m.name), '<a class="btn" href="#menu" data-act="pick-menu" data-id="' + esc(m.id) + '">Isi harga</a>'));
      else if (c.missing) acts.push(actionRow('<span class="pill warn">COGS belum lengkap</span> Menu ' + esc(m.name) + ', ' + c.missing + ' baris tanpa jumlah', '<a class="btn" href="#menu" data-act="pick-menu" data-id="' + esc(m.id) + '">Lengkapi</a>'));
      if (c.foodCostPct != null && c.tm && c.foodCostPct > 100 - c.tm) {
        acts.push(actionRow('<span class="pill bad">Food cost tinggi</span> Menu ' + esc(m.name) + ': ' + nf2.format(c.foodCostPct) + '%, batas ' + nf2.format(100 - c.tm) + '% dari target margin', '<a class="btn" href="#menu" data-act="pick-menu" data-id="' + esc(m.id) + '">Periksa harga</a>'));
      }
    });
    if (CC.ledger) {
      var led = CC.ledger();
      st.ingredients.forEach(function (i) {
        var x = led[i.id], s = CC.stockStatus(x);
        if (s.t === 'Minus') acts.push(actionRow('<span class="pill bad">Stok minus</span> ' + esc(i.name) + ', saldo tercatat negatif', '<a class="btn" href="#stok">Buka stok</a>'));
        else if (s.t === 'Menipis') acts.push(actionRow('<span class="pill warn">Stok menipis</span> ' + esc(i.name) + ' sudah di bawah minimum', '<a class="btn" href="#stok">Buka stok</a>'));
      });
    }
    // hari ini
    var todayRows = st.carts.map(function (c) {
      var ships = st.shipments.filter(function (s) { return s.cartId === c.id && s.date === t; });
      var awal = 0, tam = 0;
      ships.forEach(function (s) { s.lines.forEach(function (l) { if (s.type === 'awal') awal += l.qty; else tam += l.qty; }); });
      var rec = st.recaps.filter(function (r) { return r.cartId === c.id && r.date === t; })[0];
      var pre = st.carts.length > 1 ? esc(c.name) + ': ' : '';
      return leader(pre + 'Stok awal dikirim', nf2.format(awal) + ' cup') + leader(pre + 'Tambahan dikirim', nf2.format(tam) + ' cup') +
        leader(pre + 'Rekap hari ini', rec ? 'Sudah dibuat' : 'Belum dibuat');
    }).join('');
    // stok central
    var cb = centralByMenu(sim, t);
    var stockHTML = st.menus.map(function (m) {
      var c = cb[m.id];
      var rows = c.ok.map(function (x) { return leader('Batch ' + esc(x.b.code) + ', expired ' + esc(fmtDate(x.b.expiry)), nf2.format(x.q) + ' cup'); }).join('');
      if (c.expTotal) rows += leader('Expired, belum dibuang', nf2.format(c.expTotal) + ' cup');
      if (c.orphan) rows += leader('Tanpa batch (retur melebihi catatan)', nf2.format(c.orphan) + ' cup');
      return '<div class="group" style="margin-bottom:12px"><h2>' + esc(m.name) + ' <span class="hint">' + nf2.format(c.okTotal) + ' cup layak kirim</span></h2>' + (rows || '<p class="hint">Belum ada stok.</p>') + '</div>';
    }).join('');
    // chart omzet
    var days = []; for (var i = 13; i >= 0; i--) days.push(addDays(t, -i));
    var vals = days.map(function (d) {
      var sum = 0; st.recaps.forEach(function (r) { if (r.date === d) sum += CC.recapCalc(r).net; });
      return sum;
    });
    var max = Math.max.apply(null, vals.concat([0]));
    var has = st.recaps.length > 0;
    var chart = has && max > 0 ?
      '<div class="bars" role="img" aria-label="Omzet bersih per hari, 14 hari terakhir. Tertinggi ' + rp(max) + '.">' +
      vals.map(function (v) { return '<span class="' + (v > 0 ? '' : 'zero') + '" style="height:' + Math.max(2, Math.round(v / max * 100)) + '%"></span>'; }).join('') + '</div>' +
      '<div class="barlabels"><span>' + esc(fmtDate(days[0])) + '</span><span>Tertinggi ' + rp(max) + '</span><span>' + esc(fmtDate(days[13])) + '</span></div>' +
      '<details style="margin-top:8px"><summary>Lihat angka per hari</summary><ul class="hist">' + days.map(function (d, k) { return '<li><span>' + esc(fmtDate(d)) + '</span><b>' + rp(vals[k]) + '</b></li>'; }).join('') + '</ul></details>' :
      '<div class="empty"><p>Belum ada omzet yang bisa digambar. Grafik muncul setelah rekap harian pertama diisi dengan harga jual dan turus.</p></div>';
    var dtxt = new Date(t + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    var cupsOk = st.menus.reduce(function (n, m) { return n + (cb[m.id] ? cb[m.id].okTotal : 0); }, 0);
    var hero = '<div class="hero"><img class="bird" src="brand/bird-run.png" width="420" height="340" alt="">' +
      '<div><span class="hi">' + esc(greetWord()) + '!</span><h1 id="h-dash" tabindex="-1">Dashboard</h1><p class="date">' + esc(dtxt) + '</p></div>' +
      '<div class="stats">' +
      '<div class="stat"><b>' + acts.length + '</b><span>perlu tindakan</span></div>' +
      '<div class="stat"><b>' + nf2.format(cupsOk) + '</b><span>cup layak kirim</span></div>' +
      '<div class="stat"><b>' + (vals[13] > 0 ? rp(vals[13]) : 'Rp0') + '</b><span>omzet hari ini</span></div></div></div>';
    view.innerHTML = '<section aria-labelledby="h-dash">' + hero + '<div class="dash"><div class="col">' +
      '<div class="group"><h2>Perlu tindakan</h2>' + (acts.length ? '<ul class="tick">' + acts.join('') + '</ul>' : '<div class="empty"><p>Tidak ada yang perlu ditindak saat ini.</p></div>') + '</div>' +
      (CC.checklistGroupHTML ? CC.checklistGroupHTML() : '') + '</div><div class="col">' +
      '<div class="group"><h2>Hari ini</h2><div class="struk">' + todayRows + '</div></div>' +
      '<div class="group"><h2>Stok RTD di central</h2>' + (stockHTML || '<div class="empty"><p>Belum ada menu.</p></div>') + '</div></div>' +
      '<div class="group full"><h2>Berapa omzet bersih per hari dalam 14 hari terakhir?</h2>' + chart + '</div></div></section>';
  }

  /* ---------- routes ---------- */
  CC.addRoute('dashboard', { label: 'Dashboard', order: 10, primary: true, render: renderDash });
  CC.addRoute('rekap', { label: 'Rekap harian', order: 20, primary: true, render: function () { CC.renderRecap(); } });
  CC.addRoute('kirim', { label: 'Pengiriman', order: 30, primary: true, render: renderShip });
  CC.addRoute('produksi', { label: 'Produksi', order: 40, primary: true, render: renderProd });

  /* ---------- events ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]'); if (!t || t.disabled) return;
    var a = t.getAttribute('data-act'), id = t.getAttribute('data-id');
    if (a === 'new-batch') openBatch();
    else if (a === 'writeoff') openWriteoff(id);
    else if (a === 'del-batch') {
      var b = S().batches.filter(function (x) { return x.id === id; })[0]; if (!b) return;
      if (batchRefs(id)) openConfirm('Batch tidak bisa dihapus', 'Batch ' + esc(b.code) + ' sudah dikirim ke cart atau dibuang. Hapus pengiriman atau catatan buang yang terkait dulu.', 'close', {}, 'Mengerti');
      else openConfirm('Hapus batch?', 'Batch ' + esc(b.code) + ' (' + nf2.format(b.cups) + ' cup) akan dihapus dari stok central.', 'del-batch-ok', { id: id }, 'Hapus batch');
    }
    else if (a === 'del-batch-ok') { S().batches = S().batches.filter(function (x) { return x.id !== id; }); CC.save(); closeDlg(); CC.render(); toast('Batch dihapus.'); }
    else if (a === 'new-ship') openShip();
    else if (a === 'copy-sj') { var s = S().shipments.filter(function (x) { return x.id === id; })[0]; if (s) copy(sjText(s)); }
    else if (a === 'del-ship') {
      var s2 = S().shipments.filter(function (x) { return x.id === id; })[0]; if (!s2) return;
      var rec = S().recaps.some(function (r) { return r.cartId === s2.cartId && r.date === s2.date; });
      openConfirm('Hapus pengiriman?', 'Pengiriman ' + esc(TYPE[s2.type]) + ' ' + esc(fmtDate(s2.date)) + ' ke ' + esc(cartName(s2.cartId)) + ' akan dihapus dan stoknya kembali ke central.' + (rec ? ' Rekap tanggal itu sudah ada, hitungan stok awal dan tambahannya ikut berubah.' : ''), 'del-ship-ok', { id: id }, 'Hapus pengiriman');
    }
    else if (a === 'del-ship-ok') { S().shipments = S().shipments.filter(function (x) { return x.id !== id; }); CC.save(); closeDlg(); CC.render(); toast('Pengiriman dihapus.'); }
    else if (a === 'goto-recap') CC.gotoRecap(t.getAttribute('data-date'), t.getAttribute('data-cart'));
    else if (a === 'pick-menu') { S().activeMenu = id; CC.save(); }
  });
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.id === 'bt-cups') syncBatch(false, false);
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'bt-date' || t.id === 'bt-menu') syncBatch(true, true);
    else if (t.id === 'sh-date') syncShipAvail();
  });
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f.id === 'f-batch') submitBatch();
    else if (f.id === 'f-writeoff') submitWriteoff(f);
    else if (f.id === 'f-ship') submitShip();
  });
})();
