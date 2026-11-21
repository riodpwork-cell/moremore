/* Belanja dan stok bahan: harga baru dari belanja masuk ke COGS, saldo stok dihitung dari semua pergerakan. */
(function () {
  'use strict';
  var CC = window.CC, esc = CC.esc, rp = CC.rp, nf0 = CC.nf0, nf2 = CC.nf2, NB = CC.NB, fmtDate = CC.fmtDate, today = CC.todayISO,
    num = CC.numOrNull, uid = CC.uid, toast = CC.toast, openDlg = CC.openDlg, closeDlg = CC.closeDlg, dlgHead = CC.dlgHead,
    $ = CC.$, view = CC.view, dlg = CC.dlg, leader = CC.leader, UNITS = CC.UNITS;
  function S() { return CC.state; }
  function rpS(n) { return 'Rp' + NB + (n >= 100 ? nf0 : nf2).format(n); }
  function baseLbl(b) { return UNITS[b].label; }
  function fmtQty(base, q) {
    var a = Math.abs(q);
    if (base === 'g' && a >= 1000) return nf2.format(q / 1000) + ' kg';
    if (base === 'ml' && a >= 1000) return nf2.format(q / 1000) + ' liter';
    return nf2.format(Math.round(q * 100) / 100) + ' ' + baseLbl(base);
  }
  function pct(n) { return (n > 0 ? '+' : '') + nf2.format(n) + '%'; }

  var st0 = document.createElement('style');
  st0.textContent =
    '.trow{display:grid;gap:8px 12px;grid-template-columns:repeat(2,minmax(0,1fr));align-items:end;padding:12px 0;border-top:1px dotted var(--line-strong)}' +
    '.trow:first-child{border-top:0}.trow .full{grid-column:1/-1}.trow .rmw{justify-self:start}' +
    '.orow{display:grid;gap:8px 12px;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1fr);align-items:end;padding:10px 0;border-top:1px dotted var(--line-strong)}' +
    '.orow:first-child{border-top:0}.orow .nm{grid-column:1/-1;font-weight:600}.orow .sys{grid-column:1/-1}' +
    '@media(min-width:700px){.orow{grid-template-columns:minmax(0,1.2fr) minmax(0,1fr) 110px 120px}.orow .nm{grid-column:auto}.orow .sys{grid-column:auto}}';
  document.head.appendChild(st0);

  /* ---------- pemakaian bahan ---------- */
  CC.usageForBatch = function (m, cups) {
    var c = CC.calcMenu(m), out = [];
    m.lines.forEach(function (l) {
      if (l.section !== 'rtd' || !(l.qty > 0)) return;
      var ing = CC.ingById(l.ingId); if (!ing) return;
      var b = CC.toBase(ing, l.qty, l.unit);
      if (b > 0) out.push({ ingId: ing.id, base: b * cups / (1 - c.lossPct) });
    });
    return out;
  };
  CC.usageForHm = function (hm, qty) {
    var out = [];
    if (!(hm.yieldQty > 0) || !(qty > 0)) return out;
    var f = qty / hm.yieldQty;
    hm.lines.forEach(function (l) {
      var ing = CC.ingById(l.ingId); if (!ing || !(l.qty > 0)) return;
      var b = CC.toBase(ing, l.qty, l.unit);
      if (b > 0) out.push({ ingId: ing.id, base: b * f });
    });
    return out;
  };

  /* ---------- ledger stok ---------- */
  CC.ledger = function () {
    var st = S(), L = {}, moves = {};
    st.ingredients.forEach(function (i) { L[i.id] = { ing: i, buy: 0, hmIn: 0, prod: 0, hm: 0, cart: 0, adj: 0 }; moves[i.id] = []; });
    function mv(id, d, t, q) { if (moves[id]) moves[id].push({ d: d, t: t, q: q }); }
    st.ingredients.forEach(function (i) {
      i.purchases.forEach(function (p) {
        var b = CC.toBase(i, p.qty, p.unit);
        if (b > 0) { L[i.id].buy += b; mv(i.id, p.date, 'Belanja', b); }
      });
    });
    (st.hmBatches || []).forEach(function (bt) {
      var hm = CC.homemadeById(bt.hmId); if (!hm || !L[hm.ingId]) return;
      L[hm.ingId].hmIn += bt.qty; mv(hm.ingId, bt.date, 'Hasil masak', bt.qty);
      (bt.usage || CC.usageForHm(hm, bt.qty)).forEach(function (u) {
        if (!L[u.ingId]) return; L[u.ingId].hm += u.base; mv(u.ingId, bt.date, 'Dipakai masak ' + hm.name, -u.base);
      });
    });
    st.batches.forEach(function (b) {
      var m = CC.menuById(b.menuId);
      var use = b.usage || (m ? CC.usageForBatch(m, b.cups) : []);
      use.forEach(function (u) {
        if (!L[u.ingId]) return; L[u.ingId].prod += u.base; mv(u.ingId, b.date, 'Dipakai produksi ' + b.code, -u.base);
      });
    });
    st.recaps.forEach(function (r) {
      r.lines.forEach(function (l) {
        var m = CC.menuById(l.menuId); if (!m || !(l.turus > 0)) return;
        m.lines.forEach(function (x) {
          if (x.section !== 'cart' || !(x.qty > 0)) return;
          var ing = CC.ingById(x.ingId); if (!ing || !L[ing.id]) return;
          var b = CC.toBase(ing, x.qty, x.unit);
          if (b > 0) { L[ing.id].cart += b * l.turus; mv(ing.id, r.date, 'Dipakai di cart (turus ' + m.name + ')', -b * l.turus); }
        });
      });
    });
    (st.stockAdj || []).forEach(function (a) {
      if (!L[a.ingId]) return; L[a.ingId].adj += a.delta; mv(a.ingId, a.date, 'Stok opname', a.delta);
    });
    Object.keys(L).forEach(function (k) {
      var x = L[k];
      x.balance = x.buy + x.hmIn - x.prod - x.hm - x.cart + x.adj;
      x.moves = moves[k].sort(function (a, b) { return a.d < b.d ? 1 : a.d > b.d ? -1 : 0; });
    });
    return L;
  };
  function statusOf(x) {
    var min = x.ing.minStock > 0 ? x.ing.minStock : 0;
    if (x.balance < -1e-9) return { k: 'bad', t: 'Minus' };
    if (x.balance <= 1e-9) return { k: x.buy + x.hmIn + x.adj > 0 ? 'bad' : '', t: x.buy + x.hmIn + x.adj > 0 ? 'Habis' : 'Belum ada stok' };
    if (min && x.balance <= min) return { k: 'warn', t: 'Menipis' };
    return { k: 'good', t: 'Cukup' };
  }
  CC.stockStatus = statusOf;

  /* ---------- peta harga untuk dampak belanja ---------- */
  function priceMap() { var m = {}; S().ingredients.forEach(function (i) { m[i.id] = CC.pricePerBase(i); }); return m; }
  function menuMap() {
    var m = {};
    S().menus.forEach(function (x) { var c = CC.calcMenu(x); m[x.id] = { name: x.name, cogs: c.cogs, fc: c.foodCostPct, tm: c.tm }; });
    return m;
  }
  function impactHTML(pb, pa, mb, ma) {
    var st = S(), rows = '', mrows = '';
    st.ingredients.forEach(function (i) {
      var b = pb[i.id], a = pa[i.id];
      if (a == null || (b != null && Math.abs(a - b) < 1e-9)) return;
      var d = b ? (a - b) / b * 100 : null;
      rows += leader(esc(i.name) + (i.homemadeId ? ' (homemade)' : ''), (b != null ? rpS(b) + ' &rarr; ' : 'baru ') + rpS(a) + ' per ' + baseLbl(i.base) + (d != null ? ' (' + pct(d) + ')' : ''));
    });
    st.menus.forEach(function (m) {
      var b = mb[m.id], a = ma[m.id]; if (!b || !a || Math.abs(a.cogs - b.cogs) < 0.5) return;
      var limit = a.tm ? 100 - a.tm : null, over = a.fc != null && limit != null && a.fc > limit;
      mrows += '<div class="group" style="margin-bottom:8px"><h3>' + esc(m.name) + '</h3>' +
        leader('COGS per cup', rp(b.cogs) + ' &rarr; ' + rp(a.cogs)) +
        (a.fc != null ? leader('Food cost', (b.fc != null ? nf2.format(b.fc) + '% &rarr; ' : '') + nf2.format(a.fc) + '%') : '<p class="hint">Isi harga jual untuk melihat food cost.</p>') +
        (over ? '<p class="note warn"><strong>Di atas batas.</strong> Food cost maksimal ' + nf2.format(limit) + '% sesuai target margin.</p>' : '') + '</div>';
    });
    return '<h3>Harga bahan yang berubah</h3>' + (rows ? '<div class="mat">' + rows + '</div>' : '<p class="hint">Tidak ada harga bahan yang berubah. Bila tanggal belanja lebih lama dari pembelian terakhir, harga COGS tetap memakai pembelian terakhir.</p>') +
      '<h3>Dampak ke menu</h3>' + (mrows || '<p class="hint">Tidak ada menu yang COGS-nya berubah.</p>');
  }

  /* ---------- Belanja ---------- */
  var draft = null;
  function rawIngs() { return S().ingredients.filter(function (i) { return !i.homemadeId; }); }
  function newLine() {
    var r = rawIngs()[0];
    return { ingId: r ? r.id : null, qty: null, unit: r ? CC.unitOptions(r)[CC.unitOptions(r).length > 1 ? 1 : 0] : 'g', price: null };
  }
  function lastDate(ing) {
    var d = '';
    ing.purchases.forEach(function (p) { if (p.date > d) d = p.date; });
    return d;
  }
  function prevText(l) {
    var ing = CC.ingById(l.ingId); if (!ing) return '';
    var b = CC.toBase(ing, l.qty, l.unit);
    if (!(b > 0) || l.price == null || !(l.price >= 0)) return 'Isi jumlah dan harga total untuk melihat harga per ' + baseLbl(ing.base) + '.';
    var np = l.price / b, cur = CC.pricePerBase(ing), t = 'Setara ' + rpS(np) + ' per ' + baseLbl(ing.base) + '.';
    if (cur != null) t += ' Harga di COGS saat ini ' + rpS(cur) + ' (' + pct((np - cur) / cur * 100) + ').';
    if (S().settings.priceMode === 'latest' && lastDate(ing) > draft.date) t += ' Tanggal lebih lama dari pembelian terakhir, jadi harga COGS tidak berubah.';
    return t;
  }
  function tripRowHTML(l, i) {
    var opts = rawIngs().map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === l.ingId ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('');
    var ing = CC.ingById(l.ingId), units = ing ? CC.unitOptions(ing) : [l.unit];
    var uo = units.map(function (u) { return '<option value="' + u + '"' + (u === l.unit ? ' selected' : '') + '>' + esc(CC.unitLabel(ing, u)) + '</option>'; }).join('');
    return '<div class="trow"><div class="field full"><label for="tp-ing-' + i + '">Bahan</label><select id="tp-ing-' + i + '" data-tl="ing" data-i="' + i + '">' + opts + '</select></div>' +
      '<div class="field"><label for="tp-qty-' + i + '">Jumlah</label><input id="tp-qty-' + i + '" type="number" inputmode="decimal" min="0" step="any" data-tl="qty" data-i="' + i + '" value="' + (l.qty > 0 ? esc(l.qty) : '') + '"></div>' +
      '<div class="field"><label for="tp-unit-' + i + '">Satuan</label><select id="tp-unit-' + i + '" data-tl="unit" data-i="' + i + '">' + uo + '</select></div>' +
      '<div class="field full"><label for="tp-price-' + i + '">Harga total di struk (Rp)</label><input id="tp-price-' + i + '" type="number" inputmode="numeric" min="0" step="any" data-tl="price" data-i="' + i + '" value="' + (l.price == null ? '' : esc(l.price)) + '"></div>' +
      '<p class="preview full" id="tp-prev-' + i + '" aria-live="polite">' + esc(prevText(l)) + '</p>' +
      '<button type="button" class="btn rmw" data-act="tp-rm" data-i="' + i + '"' + (draft.lines.length < 2 ? ' disabled' : '') + ' aria-label="Hapus baris belanja ' + (i + 1) + '">Hapus baris</button></div>';
  }
  function tripTotal() { return draft.lines.reduce(function (a, l) { return a + (l.price > 0 ? l.price : 0); }, 0); }
  function renderTripLines(focusId) {
    $('#tp-lines', dlg).innerHTML = draft.lines.map(tripRowHTML).join('');
    $('#tp-total', dlg).textContent = 'Total belanja ' + rp(tripTotal());
    if (focusId) { var f = $('#' + focusId, dlg); if (f) f.focus(); }
  }
  function openTrip() {
    if (!rawIngs().length) { toast('Isi bahan mentah di Bank of Goods dulu.'); return; }
    draft = { date: today(), store: '', lines: [newLine()] };
    var stores = {};
    S().trips.forEach(function (t) { if (t.store) stores[t.store] = 1; });
    openDlg(dlgHead('Catat belanja') + '<form id="f-trip" novalidate>' +
      '<div class="grid2"><div class="field"><label for="tp-date">Tanggal belanja</label><input id="tp-date" type="date" value="' + draft.date + '"></div>' +
      '<div class="field"><label for="tp-store">Toko atau supplier, opsional</label><input id="tp-store" type="text" list="tp-stores" autocomplete="off"></div></div>' +
      '<datalist id="tp-stores">' + Object.keys(stores).map(function (s) { return '<option value="' + esc(s) + '">'; }).join('') + '</datalist>' +
      '<div id="tp-lines"></div>' +
      '<div><button type="button" class="btn" data-act="tp-add">Tambah bahan</button></div>' +
      '<p class="hint" style="font-weight:600" id="tp-total"></p><p class="err" id="tp-err" role="alert"></p>' +
      '<div class="actions"><button type="button" class="btn" data-act="close">Batal</button><button type="submit" class="btn primary">Simpan belanja</button></div></form>');
    renderTripLines('tp-qty-0');
  }
  /* dipakai form belanja dan Asisten: baris sudah divalidasi pemanggil */
  CC.recordTrip = function (date, store, lines, via) {
    var pb = priceMap(), mb = menuMap();
    var trip = { id: uid('t'), date: date, store: store || '', lines: [] };
    if (via) trip.via = via;
    lines.forEach(function (l) {
      var ing = CC.ingById(l.ingId), pid = uid('p');
      ing.purchases.push({ id: pid, date: date, qty: l.qty, unit: l.unit, price: l.price, tripId: trip.id });
      trip.lines.push({ id: uid('tl'), ingId: l.ingId, qty: l.qty, unit: l.unit, price: l.price, purchaseId: pid });
    });
    S().trips.push(trip); CC.save();
    var pa = priceMap(), ma = menuMap();
    return { trip: trip, impact: impactHTML(pb, pa, mb, ma) };
  };
  CC.priceNow = function (ing) { return CC.pricePerBase(ing); };
  function submitTrip() {
    var err = $('#tp-err', dlg), st = S();
    if (!draft.date) { err.textContent = 'Pilih tanggal belanja.'; return; }
    for (var i = 0; i < draft.lines.length; i++) {
      var l = draft.lines[i], ing = CC.ingById(l.ingId);
      if (!ing) { err.textContent = 'Baris ' + (i + 1) + ': pilih bahan.'; return; }
      if (!(l.qty > 0)) { err.textContent = 'Baris ' + (i + 1) + ': isi jumlah yang lebih dari 0.'; $('#tp-qty-' + i, dlg).focus(); return; }
      if (l.price == null || !(l.price >= 0)) { err.textContent = 'Baris ' + (i + 1) + ': isi harga total.'; $('#tp-price-' + i, dlg).focus(); return; }
      if (CC.toBase(ing, l.qty, l.unit) == null) { err.textContent = 'Baris ' + (i + 1) + ': satuan tidak cocok dengan bahan.'; return; }
    }
    var rec = CC.recordTrip(draft.date, ($('#tp-store', dlg).value || '').trim(), draft.lines);
    CC.render();
    openDlg(dlgHead('Belanja tersimpan, harga diperbarui') + '<p>Harga terbaru sudah dipakai di COGS dan food cost.</p>' + rec.impact +
      '<div class="actions"><a class="btn" href="#menu" data-act="close">Buka Menu dan COGS</a><button type="button" class="btn primary" data-act="close">Selesai</button></div>');
  }

  function tripLineText(l) {
    var ing = CC.ingById(l.ingId), b = ing ? CC.toBase(ing, l.qty, l.unit) : null;
    return esc(ing ? ing.name : 'Bahan dihapus') + ' ' + nf2.format(l.qty) + ' ' + esc(CC.unitLabel(ing, l.unit)) + ', ' + rp(l.price) +
      (b > 0 ? ' <span class="hint">(' + rpS(l.price / b) + ' per ' + baseLbl(ing.base) + ')</span>' : '');
  }
  function changes() {
    var out = [];
    rawIngs().forEach(function (ing) {
      var a = ing.purchases.map(function (p, i) { return { p: p, i: i, b: CC.toBase(ing, p.qty, p.unit) }; }).filter(function (x) { return x.b > 0; })
        .sort(function (x, y) { return x.p.date < y.p.date ? -1 : x.p.date > y.p.date ? 1 : x.i - y.i; });
      if (a.length < 2) return;
      var last = a[a.length - 1], prev = a[a.length - 2], lp = last.p.price / last.b, pp = prev.p.price / prev.b;
      if (pp > 0) out.push({ ing: ing, prev: pp, last: lp, d: (lp - pp) / pp * 100 });
    });
    return out.sort(function (x, y) { return Math.abs(y.d) - Math.abs(x.d); });
  }
  function renderTrips() {
    var st = S();
    var byDate = {}, order = [];
    st.trips.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; }).forEach(function (t) {
      if (!byDate[t.date]) { byDate[t.date] = []; order.push(t.date); } byDate[t.date].push(t);
    });
    var hist = order.map(function (d) {
      return '<div class="group"><h2>' + esc(fmtDate(d)) + '</h2><ul class="tick">' + byDate[d].map(function (t) {
        var tot = t.lines.reduce(function (a, l) { return a + l.price; }, 0);
        return '<li><div style="display:grid;gap:4px"><span class="rt">' + (t.store ? esc(t.store) : 'Belanja') + ' <span class="pill">' + rp(tot) + '</span></span>' +
          t.lines.map(function (l) { return '<span>' + tripLineText(l) + '</span>'; }).join('') + '</div>' +
          '<div class="acts"><button type="button" class="btn danger" data-act="trip-del" data-id="' + esc(t.id) + '">Hapus</button></div></li>';
      }).join('') + '</ul></div>';
    }).join('');
    var ch = changes().slice(0, 8);
    var chHTML = ch.length ? '<div class="group"><h2>Perubahan harga terakhir</h2><div class="struk">' + ch.map(function (c) {
      return leader(esc(c.ing.name), rpS(c.prev) + ' &rarr; ' + rpS(c.last) + ' per ' + baseLbl(c.ing.base) + ' (' + pct(c.d) + ')');
    }).join('') + '</div></div>' : '';
    view.innerHTML = '<section aria-labelledby="h-trip"><div class="pagehead"><div><h1 id="h-trip" tabindex="-1">Belanja</h1>' +
      '<p class="lede">Catat belanja dari struk. Harga per satuan tiap bahan langsung diperbarui dan dipakai di COGS dan food cost semua menu.</p></div>' +
      '<button type="button" class="btn primary" data-act="trip-new">Catat belanja</button></div>' +
      (S().settings.priceMode === 'avg' ? '<div class="strip"><span>Harga COGS memakai rata-rata tertimbang. Ubah ke pembelian terakhir di <a href="#bank">Bank of Goods</a> bila ingin harga langsung mengikuti belanja terbaru.</span></div>' : '') +
      chHTML +
      (hist || '<div class="empty"><p>Belum ada belanja tercatat. Catat belanja pertama dari struk, lengkap dengan jumlah dan harga total tiap bahan.</p></div>') + '</section>';
  }
  function delTrip(id) {
    var st = S(), t = st.trips.filter(function (x) { return x.id === id; })[0]; if (!t) return;
    var stuck = [];
    t.lines.forEach(function (l) {
      var ing = CC.ingById(l.ingId); if (!ing) return;
      if (ing.purchases.filter(function (p) { return p.tripId !== id; }).length === 0 && stuck.indexOf(ing.name) < 0) stuck.push(ing.name);
    });
    if (stuck.length) { CC.openConfirm('Belanja tidak bisa dihapus', 'Bahan ' + esc(stuck.join(', ')) + ' hanya punya pembelian dari belanja ini. Tambahkan pembelian lain dulu supaya harganya tetap ada.', 'close', {}, 'Mengerti'); return; }
    CC.openConfirm('Hapus belanja?', 'Belanja ' + esc(fmtDate(t.date)) + ' dihapus. Harga bahan kembali ke pembelian sebelumnya dan stoknya berkurang.', 'trip-del-ok', { id: id }, 'Hapus belanja');
  }

  /* ---------- Stok bahan ---------- */
  function renderStock() {
    var st = S(), L = CC.ledger(), ids = st.ingredients.slice().sort(function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; });
    var value = 0, low = 0, minus = 0;
    ids.forEach(function (i) {
      var x = L[i.id], ppb = CC.pricePerBase(i), s = statusOf(x);
      if (ppb != null && x.balance > 0) value += x.balance * ppb;
      if (s.k === 'warn') low++; if (x.balance < -1e-9) minus++;
    });
    var rows = ids.map(function (i) {
      var x = L[i.id], ppb = CC.pricePerBase(i), s = statusOf(x);
      return '<li class="row"><div class="main"><button type="button" class="namebtn" data-act="stock-open" data-id="' + esc(i.id) + '">' + esc(i.name) + '</button>' +
        '<p class="meta"><span class="pill ' + s.k + '">' + s.t + '</span>' + (i.homemadeId ? ' <span class="pill">Homemade</span>' : '') + (i.minStock > 0 ? ' Minimum ' + fmtQty(i.base, i.minStock) : '') + '</p></div>' +
        '<div class="price"><b>' + fmtQty(i.base, x.balance) + '</b><span>' + (ppb != null && x.balance > 0 ? 'bernilai ' + rp(x.balance * ppb) : 'harga ' + (ppb != null ? rpS(ppb) + ' per ' + baseLbl(i.base) : 'belum ada')) + '</span></div></li>';
    }).join('');
    view.innerHTML = '<section aria-labelledby="h-stk"><div class="pagehead"><div><h1 id="h-stk" tabindex="-1">Stok bahan</h1>' +
      '<p class="lede">Saldo dihitung otomatis: belanja dan hasil masak, dikurangi pemakaian produksi, masak homemade, dan turus di cart. Koreksi dengan stok opname. Ketuk nama bahan untuk menyesuaikan stok satu bahan, mengatur minimum, atau menghapus bahan.</p></div>' +
      '<div class="acts" style="margin:0"><button type="button" class="btn" data-act="shop-copy">Salin daftar belanja</button><button type="button" class="btn primary" data-act="opname"' + (ids.length ? '' : ' disabled') + '>Stok opname</button></div></div>' +
      (ids.length ? '<div class="struk" style="margin-bottom:20px"><h2>Ringkasan</h2>' + leader('Nilai stok', rp(value)) + leader('Bahan menipis', nf2.format(low)) + leader('Bahan minus', nf2.format(minus)) +
        (minus ? '<p class="note warn"><strong>Ada saldo minus.</strong> Pemakaian tercatat lebih besar dari stok. Catat belanja yang belum diinput, atau koreksi lewat stok opname.</p>' : '') + '</div>' : '') +
      (rows ? '<ul class="rows">' + rows + '</ul>' : '<div class="empty"><p>Belum ada bahan. Isi Bank of Goods, lalu catat belanja supaya stok mulai terhitung.</p></div>') + '</section>';
  }
  function openStockDetail(id) {
    var i = CC.ingById(id), x = CC.ledger()[id]; if (!i || !x) return;
    var s = statusOf(x), uo = CC.unitOptions(i), adjs = S().stockAdj.filter(function (a) { return a.ingId === id; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var dispUnit = i.base === 'pcs' ? 'pcs' : (i.base === 'g' ? 'kg' : 'l');
    var minShown = i.minStock > 0 ? i.minStock / UNITS[dispUnit].f : '';
    var mv = x.moves.slice(0, 12).map(function (m) {
      return '<li><span>' + esc(fmtDate(m.d)) + ': ' + esc(m.t) + '</span><b>' + (m.q > 0 ? '+' : '') + fmtQty(i.base, m.q) + '</b></li>';
    }).join('');
    openDlg(dlgHead(esc(i.name)) +
      '<div class="struk" style="border:0;padding:0">' +
      leader('Belanja masuk', fmtQty(i.base, x.buy)) +
      (i.homemadeId ? leader('Hasil masak masuk', fmtQty(i.base, x.hmIn)) : '') +
      leader('Dipakai produksi RTD', fmtQty(i.base, x.prod)) +
      leader('Dipakai masak homemade', fmtQty(i.base, x.hm)) +
      leader('Dipakai di cart', fmtQty(i.base, x.cart)) +
      leader('Koreksi opname', fmtQty(i.base, x.adj)) +
      leader('Saldo', '<span class="' + (s.k === 'bad' ? 'chk bad' : '') + '">' + fmtQty(i.base, x.balance) + '</span>', 'total') + '</div>' +
      '<form id="f-min" data-id="' + esc(id) + '" novalidate><div class="grid2"><div class="field"><label for="mn-qty">Stok minimum</label><input id="mn-qty" type="number" inputmode="decimal" min="0" step="any" value="' + (minShown === '' ? '' : esc(Math.round(minShown * 1000) / 1000)) + '" aria-describedby="mn-h"></div>' +
      '<div class="field"><label for="mn-unit">Satuan</label><select id="mn-unit">' + uo.filter(function (u) { return UNITS[u].fam === (i.base === 'g' ? 'm' : i.base === 'ml' ? 'v' : 'p'); }).map(function (u) { return '<option value="' + u + '"' + (u === dispUnit ? ' selected' : '') + '>' + UNITS[u].label + '</option>'; }).join('') + '</select></div></div>' +
      '<span class="hint" id="mn-h">Bahan masuk daftar belanja saat saldo sama dengan atau di bawah minimum. Kosongkan untuk tanpa minimum.</span>' +
      '<div class="actions"><button type="submit" class="btn">Simpan minimum</button></div></form>' +
      '<hr class="sep"><h3>Sesuaikan stok</h3>' +
      '<form id="f-adj" data-id="' + esc(id) + '" novalidate><p class="hint" id="adj-h">Isi hasil hitung nyata. Saldo tercatat sekarang ' + fmtQty(i.base, x.balance) + '. Selisihnya dicatat sebagai koreksi, jadi catatan lain tidak berubah.</p>' +
      '<div class="grid2"><div class="field"><label for="adj-q">Hasil hitung</label><input id="adj-q" type="number" inputmode="decimal" min="0" step="any" aria-describedby="adj-h"></div>' +
      '<div class="field"><label for="adj-u">Satuan</label><select id="adj-u">' + uo.filter(function (u) { return UNITS[u].fam === (i.base === 'g' ? 'm' : i.base === 'ml' ? 'v' : 'p') || u === 'pcs'; }).map(function (u) { return '<option value="' + u + '"' + (u === dispUnit ? ' selected' : '') + '>' + esc(CC.unitLabel(i, u)) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="field" style="max-width:220px"><label for="adj-date">Tanggal hitung</label><input id="adj-date" type="date" value="' + today() + '"></div>' +
      '<p class="err" id="adj-err" role="alert"></p><div class="actions"><button type="submit" class="btn primary">Sesuaikan stok</button></div></form>' +
      (adjs.length ? '<h3>Koreksi stok bahan ini</h3><ul class="hist">' + adjs.map(function (a) {
        return '<li><span>' + esc(fmtDate(a.date)) + ': ' + (a.delta > 0 ? '+' : '') + fmtQty(i.base, a.delta) + ', hasil hitung ' + fmtQty(i.base, a.counted) + '</span>' +
          '<button type="button" class="btn quiet" data-act="adj-del" data-id="' + esc(a.id) + '" data-ing="' + esc(id) + '" aria-label="Batalkan koreksi ' + esc(fmtDate(a.date)) + '">Batalkan</button></li>';
      }).join('') + '</ul>' : '') +
      '<hr class="sep"><h3>Pergerakan terakhir</h3>' + (mv ? '<ul class="hist">' + mv + '</ul>' : '<p class="hint">Belum ada pergerakan.</p>') +
      '<hr class="sep"><div class="actions" style="justify-content:flex-start">' +
      (i.homemadeId ? '<p class="hint">Bahan ini hasil masak. Hapus lewat halaman Bahan homemade.</p>' : '<button type="button" class="btn danger quiet" data-act="ing-del-open" data-id="' + esc(id) + '">Hapus bahan ini</button>') + '</div>');
  }
  function submitAdj(f) {
    var id = f.getAttribute('data-id'), ing = CC.ingById(id), err = $('#adj-err', dlg), L = CC.ledger();
    if (!ing) return;
    var q = num($('#adj-q', dlg).value), u = $('#adj-u', dlg).value, date = $('#adj-date', dlg).value;
    if (!date) { err.textContent = 'Pilih tanggal hitung.'; return; }
    if (q == null || q < 0) { err.textContent = 'Isi hasil hitung, 0 atau lebih.'; $('#adj-q', dlg).focus(); return; }
    var b = q === 0 ? 0 : CC.toBase(ing, q, u); if (b == null) { err.textContent = 'Satuan tidak cocok dengan bahan.'; return; }
    var delta = b - L[id].balance;
    if (Math.abs(delta) < 1e-9) { err.textContent = 'Sudah sama dengan saldo tercatat, tidak ada yang disesuaikan.'; return; }
    S().stockAdj.push({ id: uid('a'), date: date, ingId: id, counted: b, delta: delta });
    CC.save(); CC.render(); openStockDetail(id); toast('Stok ' + ing.name + ' disesuaikan.');
  }

  /* hapus bahan beserta jejaknya: baris di resep menu, belanja, dan koreksi stok */
  function openDeleteIng(id) {
    var st = S(), ing = CC.ingById(id); if (!ing) return;
    if (ing.homemadeId) { CC.openConfirm('Bahan hasil masak', 'Hapus lewat halaman Bahan homemade, bukan dari sini.', 'close', {}, 'Mengerti'); return; }
    var hmUse = (st.homemades || []).filter(function (h) { return h.lines.some(function (l) { return l.ingId === id; }); });
    if (hmUse.length) { CC.openConfirm('Bahan masih dipakai homemade', 'Bahan ' + esc(ing.name) + ' ada di resep ' + hmUse.map(function (h) { return esc(h.name); }).join(', ') + '. Hapus barisnya dari resep homemade itu dulu.', 'close', {}, 'Mengerti'); return; }
    var menus = st.menus.filter(function (m) { return m.lines.some(function (l) { return l.ingId === id; }); });
    var trips = st.trips.filter(function (t) { return t.lines.some(function (l) { return l.ingId === id; }); });
    var adjs = st.stockAdj.filter(function (a) { return a.ingId === id; });
    var parts = [];
    if (menus.length) parts.push('baris bahan ini di resep menu ' + menus.map(function (m) { return esc(m.name); }).join(', '));
    if (trips.length) parts.push(trips.length + ' catatan belanja (baris bahan ini)');
    if (adjs.length) parts.push(adjs.length + ' koreksi stok');
    if (ing.purchases.length) parts.push(ing.purchases.length + ' riwayat harga beli');
    CC.openConfirm('Hapus bahan ' + esc(ing.name) + '?', 'Ikut terhapus: ' + (parts.length ? parts.join('; ') : 'tidak ada catatan lain') + '. Menu tetap ada tetapi COGS-nya dihitung ulang tanpa bahan ini. Ini tidak bisa dibatalkan.', 'ing-purge-ok', { id: id }, 'Hapus bahan');
  }
  function purgeIng(id) {
    var st = S(), ing = CC.ingById(id); if (!ing) return;
    st.menus.forEach(function (m) { m.lines = m.lines.filter(function (l) { return l.ingId !== id; }); });
    st.trips.forEach(function (t) { t.lines = t.lines.filter(function (l) { return l.ingId !== id; }); });
    st.trips = st.trips.filter(function (t) { return t.lines.length; });
    st.stockAdj = st.stockAdj.filter(function (a) { return a.ingId !== id; });
    st.ingredients = st.ingredients.filter(function (i) { return i.id !== id; });
    CC.save(); closeDlg(); CC.render(); toast('Bahan ' + ing.name + ' dihapus.');
  }
  CC.openDeleteIng = openDeleteIng;
  function submitMin(f) {
    var i = CC.ingById(f.getAttribute('data-id')), q = num($('#mn-qty', dlg).value), u = $('#mn-unit', dlg).value;
    i.minStock = q > 0 ? q * UNITS[u].f : 0; CC.save(); closeDlg(); CC.render(); toast('Stok minimum disimpan.');
  }
  function openOpname() {
    var st = S(), L = CC.ledger(), ids = st.ingredients.slice().sort(function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; });
    var rows = ids.map(function (i, k) {
      var x = L[i.id], uo = CC.unitOptions(i).filter(function (u) { return UNITS[u].fam === (i.base === 'g' ? 'm' : i.base === 'ml' ? 'v' : 'p') || u === 'pcs'; });
      var def = i.base === 'g' ? 'kg' : i.base === 'ml' ? 'l' : 'pcs';
      return '<div class="orow"><span class="nm">' + esc(i.name) + '</span><span class="sys hint">Tercatat ' + fmtQty(i.base, x.balance) + '</span>' +
        '<div class="field"><label for="op-q-' + k + '">Hasil hitung</label><input id="op-q-' + k + '" type="number" inputmode="decimal" min="0" step="any" data-ing="' + esc(i.id) + '"></div>' +
        '<div class="field"><label for="op-u-' + k + '">Satuan</label><select id="op-u-' + k + '">' + uo.map(function (u) { return '<option value="' + u + '"' + (u === def ? ' selected' : '') + '>' + esc(CC.unitLabel(i, u)) + '</option>'; }).join('') + '</select></div></div>';
    }).join('');
    openDlg(dlgHead('Stok opname') + '<form id="f-opname" novalidate><p class="hint">Isi hanya bahan yang kamu hitung. Selisih dengan saldo tercatat dicatat sebagai koreksi, bahan yang dikosongkan tidak diubah.</p>' +
      '<div class="field" style="max-width:220px"><label for="op-date">Tanggal hitung</label><input id="op-date" type="date" value="' + today() + '"></div>' + rows +
      '<p class="err" id="op-err" role="alert"></p><div class="actions"><button type="button" class="btn" data-act="close">Batal</button><button type="submit" class="btn primary">Simpan hasil hitung</button></div></form>');
  }
  function submitOpname() {
    var st = S(), L = CC.ledger(), date = $('#op-date', dlg).value, n = 0;
    if (!date) { $('#op-err', dlg).textContent = 'Pilih tanggal hitung.'; return; }
    dlg.querySelectorAll('input[data-ing]').forEach(function (inp, k) {
      var q = num(inp.value); if (q == null || q < 0) return;
      var ing = CC.ingById(inp.getAttribute('data-ing')), u = $('#op-u-' + k, dlg).value, b = q === 0 ? 0 : CC.toBase(ing, q, u);
      if (b == null) return;
      var delta = b - L[ing.id].balance;
      if (Math.abs(delta) < 1e-9) return;
      st.stockAdj.push({ id: uid('a'), date: date, ingId: ing.id, counted: b, delta: delta }); n++;
    });
    CC.save(); closeDlg(); CC.render(); toast(n ? n + ' bahan dikoreksi.' : 'Semua hasil hitung cocok dengan saldo.');
  }
  function shopListText() {
    var L = CC.ledger(), out = [];
    S().ingredients.forEach(function (i) {
      var x = L[i.id], min = i.minStock > 0 ? i.minStock : 0;
      if (min && x.balance <= min) out.push('- ' + i.name + ': stok ' + fmtQty(i.base, x.balance) + ', minimum ' + fmtQty(i.base, min));
    });
    return out.length ? ['DAFTAR BELANJA ' + fmtDate(today())].concat(out).join('\n') : '';
  }

  /* ---------- rute dan event ---------- */
  CC.addRoute('belanja', { label: 'Belanja', order: 57, primary: false, render: renderTrips });
  CC.addRoute('stok', { label: 'Stok bahan', order: 58, primary: false, render: renderStock });

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]'); if (!t || t.disabled) return;
    var a = t.getAttribute('data-act'), id = t.getAttribute('data-id');
    if (a === 'trip-new') openTrip();
    else if (a === 'tp-add') { draft.lines.push(newLine()); renderTripLines('tp-ing-' + (draft.lines.length - 1)); }
    else if (a === 'tp-rm') { draft.lines.splice(parseInt(t.getAttribute('data-i'), 10), 1); renderTripLines('tp-date'); }
    else if (a === 'trip-del') delTrip(id);
    else if (a === 'trip-del-ok') {
      var st = S(), tr = st.trips.filter(function (x) { return x.id === id; })[0];
      st.ingredients.forEach(function (i) { i.purchases = i.purchases.filter(function (p) { return p.tripId !== id; }); });
      st.trips = st.trips.filter(function (x) { return x.id !== id; });
      CC.save(); closeDlg(); CC.render(); toast('Belanja dihapus, harga kembali ke pembelian sebelumnya.'); void tr;
    }
    else if (a === 'stock-open') openStockDetail(id);
    else if (a === 'adj-del') {
      var ingId = t.getAttribute('data-ing'); S().stockAdj = S().stockAdj.filter(function (x) { return x.id !== id; });
      CC.save(); CC.render(); openStockDetail(ingId); toast('Koreksi dibatalkan.');
    }
    else if (a === 'ing-del-open') openDeleteIng(id);
    else if (a === 'ing-purge-ok') purgeIng(id);
    else if (a === 'opname') openOpname();
    else if (a === 'shop-copy') {
      var txt = shopListText();
      if (!txt) { toast('Belum ada bahan di bawah stok minimum. Atur minimum lewat detail bahan.'); return; }
      try { navigator.clipboard.writeText(txt).then(function () { toast('Daftar belanja tersalin.'); }, function () { toast('Salin otomatis diblokir browser.'); }); }
      catch (x) { toast('Salin otomatis diblokir browser.'); }
    }
  });

  document.addEventListener('input', function (e) {
    var t = e.target, k = t.getAttribute('data-tl'); if (!k || !draft) return;
    var i = parseInt(t.getAttribute('data-i'), 10), l = draft.lines[i]; if (!l) return;
    if (k === 'qty') l.qty = num(t.value);
    else if (k === 'price') l.price = num(t.value);
    else return;
    $('#tp-prev-' + i, dlg).textContent = prevText(l);
    $('#tp-total', dlg).textContent = 'Total belanja ' + rp(tripTotal());
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'tp-date' && draft) { draft.date = t.value; draft.lines.forEach(function (l, i) { var p = $('#tp-prev-' + i, dlg); if (p) p.textContent = prevText(l); }); return; }
    var k = t.getAttribute('data-tl'); if (!k || !draft) return;
    var i = parseInt(t.getAttribute('data-i'), 10), l = draft.lines[i]; if (!l) return;
    if (k === 'ing') {
      l.ingId = t.value; var ing = CC.ingById(l.ingId), uo = CC.unitOptions(ing);
      if (uo.indexOf(l.unit) < 0) l.unit = uo[uo.length > 1 ? 1 : 0];
      renderTripLines('tp-ing-' + i);
    } else if (k === 'unit') { l.unit = t.value; $('#tp-prev-' + i, dlg).textContent = prevText(l); }
  });
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f.id === 'f-trip') submitTrip();
    else if (f.id === 'f-min') submitMin(f);
    else if (f.id === 'f-adj') submitAdj(f);
    else if (f.id === 'f-opname') submitOpname();
  });
})();
