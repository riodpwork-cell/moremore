/* Modul rekap harian, laporan, dan pengaturan. */
(function () {
  'use strict';
  var CC = window.CC, esc = CC.esc, rp = CC.rp, nf2 = CC.nf2, fmtDate = CC.fmtDate, today = CC.todayISO,
    addDays = CC.addDays, num = CC.numOrNull, uid = CC.uid, toast = CC.toast, openDlg = CC.openDlg,
    closeDlg = CC.closeDlg, dlgHead = CC.dlgHead, $ = CC.$, view = CC.view, dlg = CC.dlg, leader = CC.leader,
    openConfirm = CC.openConfirm;
  function S() { return CC.state; }
  var MINUS = '−';

  var st0 = document.createElement('style');
  st0.textContent =
    '.adj{display:grid;gap:8px 12px;grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:end;padding-top:12px;border-top:1px dotted var(--line-strong)}' +
    '.adj:first-child{padding-top:0;border-top:0}.adj .lab{grid-column:1/-1}.adj .rmw{justify-self:end}' +
    '@media(min-width:700px){.adj{grid-template-columns:minmax(0,1fr) 170px auto}.adj .lab{grid-column:auto}}' +
    '.presets{display:flex;flex-wrap:wrap;gap:8px}.presets .btn{padding:0 12px}' +
    '.crow{display:grid;gap:8px 12px;grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:end;padding:12px 0;border-top:1px dotted var(--line-strong)}' +
    '.crow:first-child{border-top:0}.crow .nmw{grid-column:1/-1}.crow .rmw{justify-self:end}' +
    '@media(min-width:700px){.crow{grid-template-columns:minmax(0,1fr) 200px auto}.crow .nmw{grid-column:auto}}';
  document.head.appendChild(st0);

  /* ---------- perhitungan rekap ---------- */
  function recapCalc(r) {
    var st = S(), tolQ = st.settings.tolQty || 0, tolM = st.settings.tolMoney || 0;
    var ships = st.shipments.filter(function (s) { return s.cartId === r.cartId && s.date === r.date; });
    var per = {}, cups = 0, gross = 0, cogs = 0, flags = [], noPrice = 0, qtyEntered = false;
    r.lines.forEach(function (l) {
      var start = 0, extra = 0;
      ships.forEach(function (s) { s.lines.forEach(function (x) { if (x.menuId === l.menuId) { if (s.type === 'awal') start += x.qty; else extra += x.qty; } }); });
      var turus = l.turus || 0, sisa = l.sisa || 0, rej = l.reject || 0;
      var entered = l.turus != null || l.sisa != null || l.reject != null;
      if (entered) qtyEntered = true;
      var expected = start + extra - sisa - rej, diff = turus - expected;
      var flag = entered && Math.abs(diff) > tolQ;
      per[l.menuId] = { start: start, extra: extra, turus: turus, sisa: sisa, rej: rej, expected: expected, diff: diff, entered: entered, flag: flag };
      if (flag) flags.push(CC.menuName(l.menuId) + ': turus ' + (diff < 0 ? 'kurang ' : 'lebih ') + nf2.format(Math.abs(diff)) + ' cup dari stok keluar');
      cups += turus; gross += turus * (l.price > 0 ? l.price : 0); cogs += turus * (l.cogs || 0);
      if (turus > 0 && !(l.price > 0)) noPrice++;
    });
    var adj = (r.adjs || []).reduce(function (a, x) { return a + (x.amount || 0); }, 0);
    var net = gross - adj, moneyEntered = r.cash != null || r.qris != null;
    var inflow = (r.cash || 0) + (r.qris || 0) - (r.opening || 0), moneyDiff = inflow - net;
    var moneyFlag = moneyEntered && Math.abs(moneyDiff) > tolM;
    if (moneyFlag) flags.push('uang ' + (moneyDiff < 0 ? 'kurang ' : 'lebih ') + rp(Math.abs(moneyDiff)));
    if (noPrice) flags.push('harga jual kosong pada ' + noPrice + ' menu yang terjual');
    return {
      per: per, cups: cups, gross: gross, adj: adj, net: net, cogs: cogs, gp: net - cogs, inflow: inflow, moneyDiff: moneyDiff,
      moneyEntered: moneyEntered, moneyFlag: moneyFlag, qtyEntered: qtyEntered, flags: flags, noPrice: noPrice
    };
  }
  CC.recapCalc = recapCalc;

  function findRecap() {
    var u = CC.ui;
    return S().recaps.filter(function (r) { return r.date === u.recapDate && r.cartId === u.recapCart; })[0] || null;
  }
  function ensureLines(r) {
    S().menus.forEach(function (m) {
      if (!r.lines.some(function (l) { return l.menuId === m.id; })) {
        r.lines.push({ menuId: m.id, turus: null, sisa: null, reject: null, price: m.price > 0 ? m.price : null, cogs: CC.calcMenu(m).cogs });
      }
    });
  }

  /* gabungkan angka dari Asisten ke rekap yang sudah ada (atau yang baru), tanpa menyimpan */
  CC.buildRecap = function (o) {
    var st = S();
    var ex = st.recaps.filter(function (r) { return r.date === o.date && r.cartId === o.cartId; })[0] || null;
    var cart = st.carts.filter(function (c) { return c.id === o.cartId; })[0];
    var r = ex ? JSON.parse(JSON.stringify(ex)) : { id: uid('r'), date: o.date, cartId: o.cartId, opening: cart ? cart.openingCash : null, cash: null, qris: null, adjs: [], note: '', lines: [] };
    ensureLines(r);
    ['opening', 'cash', 'qris'].forEach(function (k) { if (o[k] != null) r[k] = o[k]; });
    (o.lines || []).forEach(function (x) {
      var l = r.lines.filter(function (y) { return y.menuId === x.menuId; })[0]; if (!l) return;
      ['turus', 'sisa', 'reject'].forEach(function (k) { if (x[k] != null) l[k] = x[k]; });
    });
    return { recap: r, existed: !!ex, calc: recapCalc(r) };
  };
  CC.recordRecap = function (o, via) {
    var b = CC.buildRecap(o), st = S();
    if (via) b.recap.via = via;
    if (b.existed) st.recaps = st.recaps.map(function (r) { return r.id === b.recap.id ? b.recap : r; });
    else st.recaps.push(b.recap);
    CC.save();
    return b;
  };

  /* ---------- tampilan rekap ---------- */
  function chkHTML(p) {
    if (!p.entered) return '<span class="chk">Belum diisi</span>';
    var exp = ' (seharusnya ' + nf2.format(p.expected) + ')';
    if (p.diff === 0) return '<span class="chk good">Cocok' + exp + '</span>';
    if (p.flag) return '<span class="chk bad">Turus ' + (p.diff < 0 ? 'kurang ' : 'lebih ') + nf2.format(Math.abs(p.diff)) + ' dari stok keluar' + exp + '</span>';
    return '<span class="chk">Selisih ' + nf2.format(Math.abs(p.diff)) + ' dalam toleransi' + exp + '</span>';
  }
  function rlineHTML(r, l, c) {
    var m = CC.menuById(l.menuId), p = c.per[l.menuId], id = esc(l.menuId);
    var val = function (v) { return v == null ? '' : esc(v); };
    return '<li class="rline"><span class="nm">' + esc(m ? m.name : 'Menu dihapus') + '</span>' +
      '<div><span class="lbl">Awal</span><output class="ro">' + nf2.format(p.start) + '</output></div>' +
      '<div><span class="lbl">Tambahan</span><output class="ro">' + nf2.format(p.extra) + '</output></div>' +
      '<div class="field"><label for="tr-' + id + '">Turus</label><input id="tr-' + id + '" type="number" inputmode="numeric" min="0" step="1" data-mf="turus" data-menu="' + id + '" value="' + val(l.turus) + '"></div>' +
      '<div class="field"><label for="ss-' + id + '">Sisa</label><input id="ss-' + id + '" type="number" inputmode="numeric" min="0" step="1" data-mf="sisa" data-menu="' + id + '" value="' + val(l.sisa) + '"></div>' +
      '<div class="field"><label for="rj-' + id + '">Reject</label><input id="rj-' + id + '" type="number" inputmode="numeric" min="0" step="1" data-mf="reject" data-menu="' + id + '" value="' + val(l.reject) + '"></div>' +
      '<div class="field"><label for="pr-' + id + '">Harga (Rp)</label><input id="pr-' + id + '" type="number" inputmode="numeric" min="0" step="any" data-mf="price" data-menu="' + id + '" value="' + val(l.price) + '"></div>' +
      '<div class="wide"><span class="lbl">Cek stok</span><output class="ro" style="min-height:0;line-height:1.4" data-chk="' + id + '">' + chkHTML(p) + '</output></div></li>';
  }
  function adjHTML(a, types) {
    var id = esc(a.id);
    return '<li class="adj"><div class="field lab"><label for="al-' + id + '">Jenis</label><input id="al-' + id + '" type="text" list="adj-types" autocomplete="off" data-af="label" data-id="' + id + '" value="' + esc(a.label) + '"></div>' +
      '<div class="field"><label for="am-' + id + '">Nominal (Rp)</label><input id="am-' + id + '" type="number" inputmode="numeric" min="0" step="any" data-af="amount" data-id="' + id + '" value="' + (a.amount == null ? '' : esc(a.amount)) + '"></div>' +
      '<button type="button" class="btn rmw" data-act="rm-adj" data-id="' + id + '" aria-label="Hapus penyesuaian ' + esc(a.label || 'tanpa jenis') + '">Hapus</button></li>';
  }
  function outHTML(r, c) {
    var sim = CC.simulate(S()), info = sim.recapInfo[r.id] || {}, retur = 0, lost = 0, orph = 0;
    Object.keys(info).forEach(function (k) { info[k].retur.forEach(function (a) { retur += a.qty; }); lost += info[k].lost; orph += info[k].orphan; });
    var h = '<h2 id="h-rk-out">Hasil rekap</h2>';
    h += leader('Cup terjual (turus)', nf2.format(c.cups));
    h += leader('Omzet dari turus', rp(c.gross));
    if (c.adj) h += leader('Penyesuaian omzet', MINUS + rp(c.adj));
    h += leader('Omzet bersih', rp(c.net), 'total');
    h += leader('Cash + QRIS ' + MINUS + ' saldo awal', c.moneyEntered ? rp(c.inflow) : 'Belum diisi');
    var md = !c.moneyEntered ? 'Belum diisi' : c.moneyDiff === 0 ? 'Cocok' : (c.moneyDiff < 0 ? 'Uang kurang ' : 'Uang lebih ') + rp(Math.abs(c.moneyDiff));
    h += leader('Selisih uang', '<span class="' + (c.moneyFlag ? 'chk bad' : c.moneyEntered ? 'chk good' : '') + '">' + md + '</span>');
    h += leader('COGS terjual', rp(c.cogs));
    h += leader('Gross profit', rp(c.gp) + (c.net > 0 ? ' (' + nf2.format(c.gp / c.net * 100) + '%)' : ''));
    h += leader('Retur ke central', nf2.format(retur) + ' cup');
    if (lost > 0) h += '<p class="note warn"><strong>' + nf2.format(lost) + ' cup tidak terlacak.</strong> Stok keluar lebih banyak dari turus, reject, dan sisa. Cup ini tidak dikembalikan ke stok central.</p>';
    if (orph > 0) h += '<p class="note warn"><strong>' + nf2.format(orph) + ' cup sisa melebihi stok yang dikirim.</strong> Dicatat ke central sebagai stok tanpa batch.</p>';
    if (c.flags.length) h += '<p class="note warn"><strong>Perlu dicek:</strong> ' + c.flags.map(esc).join('; ') + '.</p>';
    else if (c.qtyEntered && c.moneyEntered) h += '<p class="note"><span class="chk good">Semua cek cocok.</span></p>';
    return h;
  }
  function refreshRecap() {
    var r = findRecap(); if (!r) return;
    var c = recapCalc(r);
    var out = $('#rk-out'); if (out) out.innerHTML = outHTML(r, c);
    r.lines.forEach(function (l) {
      var o = view.querySelector('[data-chk="' + l.menuId + '"]');
      if (o) o.innerHTML = chkHTML(c.per[l.menuId]);
    });
  }
  function shipSummary(date, cartId) {
    var awal = 0, tam = 0;
    S().shipments.filter(function (s) { return s.date === date && s.cartId === cartId; }).forEach(function (s) {
      s.lines.forEach(function (l) { if (s.type === 'awal') awal += l.qty; else tam += l.qty; });
    });
    return { awal: awal, tam: tam };
  }
  CC.renderRecap = function () {
    var st = S(), u = CC.ui;
    if (!u.recapDate) u.recapDate = today();
    if (!st.carts.some(function (c) { return c.id === u.recapCart; })) u.recapCart = st.carts[0].id;
    var picker = '<div class="picker"><div class="daynav"><button type="button" class="btn" data-act="rk-day" data-d="-1" aria-label="Hari sebelumnya">‹</button>' +
      '<div class="field sm"><label for="rk-date">Tanggal</label><input id="rk-date" type="date" value="' + esc(u.recapDate) + '"></div>' +
      '<button type="button" class="btn" data-act="rk-day" data-d="1" aria-label="Hari berikutnya">›</button></div>' +
      (st.carts.length > 1 ? '<div class="field sm"><label for="rk-cart">Cart</label><select id="rk-cart">' + st.carts.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === u.recapCart ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select></div>' : '') + '</div>';
    var head = '<div class="pagehead"><div><h1 id="h-rk" tabindex="-1">Rekap harian</h1><p class="lede">Input dari kertas kasir: turus, sisa, reject, lalu cash dan QRIS. Sistem mencocokkan stok keluar dengan turus, dan uang masuk dengan omzet.</p></div></div>';
    var r = findRecap();
    if (!r) {
      var ss = shipSummary(u.recapDate, u.recapCart);
      view.innerHTML = '<section aria-labelledby="h-rk">' + head + picker + '<div class="empty"><p>Belum ada rekap untuk ' + esc(CC.cartName(u.recapCart)) + ' pada ' + esc(fmtDate(u.recapDate)) + '.</p>' +
        '<p class="hint">' + (ss.awal + ss.tam > 0 ? 'Pengiriman tercatat: stok awal ' + nf2.format(ss.awal) + ' cup, tambahan ' + nf2.format(ss.tam) + ' cup.' : 'Belum ada pengiriman tercatat di tanggal ini. Catat dulu di Pengiriman supaya cek stok berjalan.') + '</p>' +
        (st.menus.length ? '<button type="button" class="btn primary" data-act="start-recap">Mulai rekap dari kertas</button>' : '<p>Buat menu dulu di <a href="#menu">Menu dan COGS</a>.</p>') + '</div></section>';
      return;
    }
    ensureLines(r);
    var c = recapCalc(r);
    var visible = r.lines.filter(function (l) { return CC.menuById(l.menuId) || c.per[l.menuId].entered; });
    var val = function (v) { return v == null ? '' : esc(v); };
    view.innerHTML = '<section aria-labelledby="h-rk">' + head + picker +
      '<div class="editor">' +
      '<div class="fields">' +
      '<div class="field"><label for="rk-open">Saldo awal kasir (Rp)</label><input id="rk-open" type="number" inputmode="numeric" min="0" step="any" data-rf="opening" value="' + val(r.opening) + '"></div>' +
      '<div class="field"><label for="rk-cash">Uang tunai di kasir (Rp)</label><input id="rk-cash" type="number" inputmode="numeric" min="0" step="any" data-rf="cash" value="' + val(r.cash) + '" aria-describedby="rk-cash-h"><span class="hint" id="rk-cash-h">Total uang di laci akhir hari, termasuk saldo awal.</span></div>' +
      '<div class="field"><label for="rk-qris">Total QRIS harian (Rp)</label><input id="rk-qris" type="number" inputmode="numeric" min="0" step="any" data-rf="qris" value="' + val(r.qris) + '"></div>' +
      '<div class="field wide"><label for="rk-note">Catatan, opsional</label><input id="rk-note" type="text" autocomplete="off" data-rf="note" value="' + esc(r.note || '') + '"></div></div>' +
      '<div class="struk" id="rk-out" aria-labelledby="h-rk-out">' + outHTML(r, c) + '</div>' +
      '<div class="sections">' +
      '<section class="sec" aria-labelledby="h-rk-lines"><header><h2 id="h-rk-lines">Turus per menu</h2><p class="hint">Awal dan Tambahan diambil dari pengiriman di tanggal ini. Isi sisanya dari kertas. Harga memakai harga jual saat rekap dibuat dan bisa diubah per baris.</p></header>' +
      '<ul class="lines">' + visible.map(function (l) { return rlineHTML(r, l, c); }).join('') + '</ul>' +
      '<div><button type="button" class="btn" data-act="refresh-prices">Ambil harga dan COGS terbaru dari menu</button></div></section>' +
      '<section class="sec" aria-labelledby="h-rk-adj"><header><h2 id="h-rk-adj">Penyesuaian omzet</h2><p class="hint">Diskon atau promo yang mengurangi omzet dari turus. Kosongkan bila tidak ada.</p></header>' +
      ((r.adjs || []).length ? '<ul class="lines">' + r.adjs.map(function (a) { return adjHTML(a); }).join('') + '</ul>' : '<p class="line-empty">Tidak ada penyesuaian.</p>') +
      '<datalist id="adj-types">' + st.settings.adjTypes.map(function (t) { return '<option value="' + esc(t) + '">'; }).join('') + '</datalist>' +
      '<div><button type="button" class="btn" data-act="add-adj">Tambah penyesuaian</button></div></section>' +
      '<div><button type="button" class="btn danger" data-act="del-recap">Hapus rekap ini</button></div>' +
      '</div></div></section>';
  };

  /* ---------- Laporan ---------- */
  function reportRange() {
    var u = CC.ui;
    if (!u.repFrom || !u.repTo) { u.repTo = today(); u.repFrom = addDays(u.repTo, -6); }
    return { from: u.repFrom, to: u.repTo };
  }
  function reportRows(from, to) {
    var st = S();
    return st.recaps.filter(function (r) { return r.date >= from && r.date <= to; })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; })
      .map(function (r) { return { r: r, c: recapCalc(r) }; });
  }
  function statusText(c) { return c.flags.length ? 'Ada selisih' : (c.qtyEntered && c.moneyEntered ? 'Cocok' : 'Belum lengkap'); }
  function renderReport() {
    var rg = reportRange(), rows = reportRows(rg.from, rg.to), st = S();
    var tot = { cups: 0, net: 0, cogs: 0, gp: 0 };
    rows.forEach(function (x) { tot.cups += x.c.cups; tot.net += x.c.net; tot.cogs += x.c.cogs; tot.gp += x.c.gp; });
    var menuAgg = {};
    rows.forEach(function (x) { x.r.lines.forEach(function (l) {
      var a = menuAgg[l.menuId] = menuAgg[l.menuId] || { cups: 0, gross: 0, cogs: 0 };
      a.cups += l.turus || 0; a.gross += (l.turus || 0) * (l.price > 0 ? l.price : 0); a.cogs += (l.turus || 0) * (l.cogs || 0);
    }); });
    var mkeys = Object.keys(menuAgg).filter(function (k) { return menuAgg[k].cups > 0; });
    var body = rows.length ?
      '<div class="group"><h2>Per hari</h2><div class="tbl-wrap" tabindex="0" role="region" aria-label="Tabel laporan per hari, bisa digeser"><table class="tbl"><thead><tr><th>Tanggal</th><th>Cart</th><th class="n">Cup</th><th class="n">Omzet bersih</th><th class="n">COGS</th><th class="n">Gross profit</th><th class="n">Margin</th><th class="n">Food cost</th><th>Status</th></tr></thead><tbody>' +
      rows.map(function (x) {
        return '<tr><td>' + esc(fmtDate(x.r.date)) + '</td><td>' + esc(CC.cartName(x.r.cartId)) + '</td><td class="n">' + nf2.format(x.c.cups) + '</td><td class="n">' + rp(x.c.net) + '</td><td class="n">' + rp(x.c.cogs) + '</td><td class="n">' + rp(x.c.gp) + '</td><td class="n">' + (x.c.net > 0 ? nf2.format(x.c.gp / x.c.net * 100) + '%' : '-') + '</td><td class="n">' + (x.c.net > 0 ? nf2.format(x.c.cogs / x.c.net * 100) + '%' : '-') + '</td><td>' + statusText(x.c) + '</td></tr>';
      }).join('') +
      '</tbody><tfoot><tr><td colspan="2">Total</td><td class="n">' + nf2.format(tot.cups) + '</td><td class="n">' + rp(tot.net) + '</td><td class="n">' + rp(tot.cogs) + '</td><td class="n">' + rp(tot.gp) + '</td><td class="n">' + (tot.net > 0 ? nf2.format(tot.gp / tot.net * 100) + '%' : '-') + '</td><td class="n">' + (tot.net > 0 ? nf2.format(tot.cogs / tot.net * 100) + '%' : '-') + '</td><td></td></tr></tfoot></table></div></div>' +
      '<div class="group"><h2>Per menu</h2><div class="tbl-wrap" tabindex="0" role="region" aria-label="Tabel laporan per menu, bisa digeser"><table class="tbl"><thead><tr><th>Menu</th><th class="n">Cup</th><th class="n">Omzet dari turus</th><th class="n">COGS</th><th class="n">Gross profit</th></tr></thead><tbody>' +
      mkeys.map(function (k) { var a = menuAgg[k]; return '<tr><td>' + esc(CC.menuName(k)) + '</td><td class="n">' + nf2.format(a.cups) + '</td><td class="n">' + rp(a.gross) + '</td><td class="n">' + rp(a.cogs) + '</td><td class="n">' + rp(a.gross - a.cogs) + '</td></tr>'; }).join('') +
      '</tbody></table></div><p class="hint">Omzet per menu dihitung dari turus kali harga, sebelum penyesuaian omzet.</p></div>' +
      '<div><button type="button" class="btn" data-act="copy-report">Salin sebagai tabel</button></div>' :
      '<div class="empty"><p>Tidak ada rekap pada rentang ' + esc(fmtDate(rg.from)) + ' sampai ' + esc(fmtDate(rg.to)) + '. Ubah rentang tanggal, atau isi rekap harian dulu.</p></div>';
    view.innerHTML = '<section aria-labelledby="h-rep"><div class="pagehead"><div><h1 id="h-rep" tabindex="-1">Laporan</h1><p class="lede">Omzet, COGS, dan gross profit dari rekap harian. Biaya operasional belum dihitung.</p></div></div>' +
      '<div class="picker"><div class="field sm"><label for="rp-from">Dari</label><input id="rp-from" type="date" value="' + esc(rg.from) + '"></div>' +
      '<div class="field sm"><label for="rp-to">Sampai</label><input id="rp-to" type="date" value="' + esc(rg.to) + '"></div>' +
      '<div class="presets"><button type="button" class="btn" data-act="rp-preset" data-days="7">7 hari</button><button type="button" class="btn" data-act="rp-preset" data-days="30">30 hari</button><button type="button" class="btn" data-act="rp-preset" data-days="0">Bulan ini</button></div></div>' +
      body + '</section>';
    void st;
  }
  function reportTSV() {
    var rg = reportRange(), rows = reportRows(rg.from, rg.to);
    var lines = [['Tanggal', 'Cart', 'Cup', 'Omzet bersih', 'COGS', 'Gross profit', 'Status'].join('\t')];
    rows.forEach(function (x) { lines.push([x.r.date, CC.cartName(x.r.cartId), x.c.cups, Math.round(x.c.net), Math.round(x.c.cogs), Math.round(x.c.gp), statusText(x.c)].join('\t')); });
    return lines.join('\n');
  }

  /* ---------- Pengaturan ---------- */
  function renderSettings() {
    var st = S(), s = st.settings;
    view.innerHTML = '<section aria-labelledby="h-set"><div class="pagehead"><div><h1 id="h-set" tabindex="-1">Pengaturan</h1><p class="lede">Cart, toleransi selisih, dan jenis penyesuaian omzet. Perubahan tersimpan otomatis.</p></div></div>' +
      '<div class="group"><h2>Cart</h2><div class="sec">' +
      st.carts.map(function (c) {
        var used = st.shipments.some(function (x) { return x.cartId === c.id; }) || st.recaps.some(function (x) { return x.cartId === c.id; });
        var dis = st.carts.length < 2 || used;
        return '<div class="crow"><div class="field nmw"><label for="cn-' + esc(c.id) + '">Nama cart</label><input id="cn-' + esc(c.id) + '" type="text" autocomplete="off" data-sf="cname" data-id="' + esc(c.id) + '" value="' + esc(c.name) + '"></div>' +
          '<div class="field"><label for="co-' + esc(c.id) + '">Saldo awal kasir standar (Rp)</label><input id="co-' + esc(c.id) + '" type="number" inputmode="numeric" min="0" step="any" data-sf="copen" data-id="' + esc(c.id) + '" value="' + (c.openingCash == null ? '' : esc(c.openingCash)) + '"></div>' +
          '<button type="button" class="btn danger rmw" data-act="del-cart" data-id="' + esc(c.id) + '"' + (dis ? ' disabled' : '') + ' aria-label="Hapus ' + esc(c.name) + '">Hapus</button></div>';
      }).join('') +
      '<p class="hint">Cart yang sudah punya pengiriman atau rekap tidak bisa dihapus. Harga jual dibuat per menu, jadi semua cart memakai harga yang sama.</p>' +
      '<div><button type="button" class="btn" data-act="add-cart">Tambah cart</button></div></div></div>' +
      '<div class="group"><h2>Toleransi selisih</h2><div class="sec"><div class="grid2">' +
      '<div class="field"><label for="st-q">Selisih cup yang masih diterima</label><input id="st-q" type="number" inputmode="numeric" min="0" step="1" data-sf="tolQty" value="' + esc(s.tolQty) + '" aria-describedby="st-q-h"><span class="hint" id="st-q-h">0 berarti selisih sekecil apa pun ditandai.</span></div>' +
      '<div class="field"><label for="st-m">Selisih uang yang masih diterima (Rp)</label><input id="st-m" type="number" inputmode="numeric" min="0" step="any" data-sf="tolMoney" value="' + esc(s.tolMoney) + '"></div>' +
      '<div class="field"><label for="st-e">Peringatan expired (hari sebelumnya)</label><input id="st-e" type="number" inputmode="numeric" min="0" step="1" data-sf="expWarnDays" value="' + esc(s.expWarnDays) + '"></div></div></div></div>' +
      '<div class="group"><h2>Penyesuaian omzet dan diskon</h2><div class="sec">' +
      '<div class="field"><label for="st-adj">Jenis penyesuaian, pisahkan dengan koma</label><input id="st-adj" type="text" autocomplete="off" data-sf="adjTypes" value="' + esc(s.adjTypes.join(', ')) + '" aria-describedby="st-adj-h"><span class="hint" id="st-adj-h">Jadi pilihan saat mengisi baris penyesuaian di rekap harian.</span></div>' +
      '<p class="note"><strong>Program diskon belum diatur.</strong> Untuk sementara, catat nominal diskon sebagai baris penyesuaian omzet di rekap harian. Aturan program diskon dibahas nanti.</p></div></div></section>';
  }

  /* ---------- rute ---------- */
  CC.addRoute('laporan', { label: 'Laporan', order: 70, primary: false, render: renderReport });
  CC.addRoute('pengaturan', { label: 'Pengaturan', order: 80, primary: false, render: renderSettings });

  /* ---------- events ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]'); if (!t || t.disabled) return;
    var a = t.getAttribute('data-act'), id = t.getAttribute('data-id'), st = S(), u = CC.ui;
    if (a === 'rk-day') {
      u.recapDate = CC.addDays(u.recapDate, parseInt(t.getAttribute('data-d'), 10)); CC.render();
      var nb = $('[data-act="rk-day"][data-d="' + t.getAttribute('data-d') + '"]'); if (nb) nb.focus(); return;
    }
    if (a === 'start-recap') {
      var cart = st.carts.filter(function (c) { return c.id === u.recapCart; })[0];
      var r = { id: uid('r'), date: u.recapDate, cartId: u.recapCart, opening: cart ? cart.openingCash : null, cash: null, qris: null, adjs: [], note: '', lines: [] };
      ensureLines(r); st.recaps.push(r); CC.save(); CC.render();
      var f = $('[data-mf="turus"]'); if (f) f.focus();
    }
    else if (a === 'del-recap') openConfirm('Hapus rekap?', 'Rekap ' + esc(CC.cartName(u.recapCart)) + ' pada ' + esc(fmtDate(u.recapDate)) + ' akan dihapus. Retur dari rekap ini juga hilang dari stok central.', 'del-recap-ok', {}, 'Hapus rekap');
    else if (a === 'del-recap-ok') { var rr = findRecap(); if (rr) st.recaps = st.recaps.filter(function (x) { return x.id !== rr.id; }); CC.save(); closeDlg(); CC.render(); toast('Rekap dihapus.'); }
    else if (a === 'refresh-prices') {
      var r2 = findRecap(); if (!r2) return;
      r2.lines.forEach(function (l) { var m = CC.menuById(l.menuId); if (m) { l.price = m.price > 0 ? m.price : null; l.cogs = CC.calcMenu(m).cogs; } });
      CC.save(); CC.render(); toast('Harga dan COGS diperbarui dari menu.');
    }
    else if (a === 'add-adj') {
      var r3 = findRecap(); if (!r3) return;
      var na = { id: uid('a'), label: '', amount: null }; (r3.adjs = r3.adjs || []).push(na); CC.save(); CC.render();
      var f2 = $('#al-' + na.id); if (f2) f2.focus();
    }
    else if (a === 'rm-adj') {
      var r4 = findRecap(); if (!r4) return;
      r4.adjs = r4.adjs.filter(function (x) { return x.id !== id; }); CC.save(); CC.render();
      var b = $('[data-act="add-adj"]'); if (b) b.focus();
    }
    else if (a === 'rp-preset') {
      var d = parseInt(t.getAttribute('data-days'), 10), to = today();
      u.repTo = to; u.repFrom = d > 0 ? addDays(to, -(d - 1)) : to.slice(0, 8) + '01'; CC.render();
    }
    else if (a === 'copy-report') {
      var txt = reportTSV();
      try { navigator.clipboard.writeText(txt).then(function () { toast('Tabel tersalin, siap ditempel ke spreadsheet.'); }, function () { toast('Salin otomatis diblokir browser.'); }); }
      catch (x) { toast('Salin otomatis diblokir browser.'); }
    }
    else if (a === 'add-cart') {
      var nc = { id: uid('c'), name: 'Cart ' + (st.carts.length + 1), openingCash: null }; st.carts.push(nc); CC.save(); CC.render();
      var f3 = $('#cn-' + nc.id); if (f3) { f3.focus(); f3.select(); }
    }
    else if (a === 'del-cart') { st.carts = st.carts.filter(function (c) { return c.id !== id; }); CC.save(); CC.render(); toast('Cart dihapus.'); }
  });

  document.addEventListener('change', function (e) {
    var t = e.target, u = CC.ui;
    if (t.id === 'rk-date') { if (t.value) { u.recapDate = t.value; CC.render(); var f = $('#rk-date'); if (f) f.focus(); } }
    else if (t.id === 'rk-cart') { u.recapCart = t.value; CC.render(); var f2 = $('#rk-cart'); if (f2) f2.focus(); }
    else if (t.id === 'rp-from' || t.id === 'rp-to') {
      var from = $('#rp-from').value, to = $('#rp-to').value;
      if (from && to && from <= to) { u.repFrom = from; u.repTo = to; CC.render(); var g = $('#' + t.id); if (g) g.focus(); }
      else toast('Tanggal "Dari" tidak boleh setelah "Sampai".');
    }
  });

  document.addEventListener('input', function (e) {
    var t = e.target, st = S();
    var mf = t.getAttribute('data-mf'), rf = t.getAttribute('data-rf'), af = t.getAttribute('data-af'), sf = t.getAttribute('data-sf');
    if (mf || rf || af) {
      var r = findRecap(); if (!r) return;
      if (mf) {
        var l = r.lines.filter(function (x) { return x.menuId === t.getAttribute('data-menu'); })[0];
        if (l) l[mf] = num(t.value);
      } else if (rf) {
        r[rf] = rf === 'note' ? t.value : num(t.value);
      } else {
        var a = (r.adjs || []).filter(function (x) { return x.id === t.getAttribute('data-id'); })[0];
        if (a) a[af] = af === 'amount' ? num(t.value) : t.value;
      }
      CC.save(); refreshRecap(); return;
    }
    if (sf) {
      var id = t.getAttribute('data-id'), s = st.settings;
      if (sf === 'cname') { var c = st.carts.filter(function (x) { return x.id === id; })[0]; if (c) c.name = t.value || c.name; }
      else if (sf === 'copen') { var c2 = st.carts.filter(function (x) { return x.id === id; })[0]; if (c2) c2.openingCash = num(t.value); }
      else if (sf === 'adjTypes') s.adjTypes = t.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      else { var v = num(t.value); s[sf] = v == null || v < 0 ? 0 : v; }
      CC.save();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.closest && e.target.closest('.editor') && e.target.tagName === 'INPUT') e.preventDefault();
  });
})();
