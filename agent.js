/* Asisten: obrolan yang membaca foto dan cerita, menyiapkan catatan, lalu menyimpannya setelah dicek.
   Juga daftar pengingat: apa yang sudah dan belum dikerjakan hari ini. */
(function () {
  'use strict';
  var CC = window.CC, esc = CC.esc, rp = CC.rp, nf0 = CC.nf0, nf2 = CC.nf2, NB = CC.NB, fmtDate = CC.fmtDate, today = CC.todayISO,
    addDays = CC.addDays, uid = CC.uid, toast = CC.toast, $ = CC.$, view = CC.view, leader = CC.leader, UNITS = CC.UNITS;
  function S() { return CC.state; }
  function rps(n) { return 'Rp' + NB + (n >= 100 ? nf0 : nf2).format(n); }
  function pct(n) { return (n > 0 ? '+' : '') + nf2.format(n) + '%'; }
  function fq(base, q) { return nf2.format(Math.round(q * 100) / 100) + ' ' + UNITS[base].label; }

  var st0 = document.createElement('style');
  st0.textContent =
    '.ck{list-style:none;margin:0;padding:0;background:var(--surface);border:1px solid var(--line);border-radius:var(--r)}' +
    '.ck li{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;justify-content:space-between;padding:10px 14px;border-top:1px solid var(--line)}' +
    '.ck li:first-child{border-top:0}.ck li.done .tx{color:var(--ink-2);text-decoration:line-through;text-decoration-color:var(--line-strong)}' +
    '.ck .tx{flex:1 1 200px;min-width:0}.ck .btns{display:flex;gap:6px;flex-wrap:wrap}.ck .btn{padding:0 12px}' +
    '.ck .meta{display:block}' +
    '.agw{display:grid;gap:16px}' +
    '.chat{list-style:none;margin:0;padding:0;display:grid;gap:14px}' +
    '.msg{display:grid;gap:6px;max-width:100%;scroll-margin-bottom:150px}.msg .who{font-size:.8125rem;color:var(--ink-2);font-weight:600}' +
    '.msg.me{justify-items:end}.msg.me .bub{background:var(--accent-soft);border-color:var(--accent)}' +
    '.bub{border:1px solid var(--line-strong);background:var(--surface);border-radius:var(--r);padding:10px 12px;max-width:min(100%,640px);white-space:pre-wrap;overflow-wrap:anywhere}' +
    '.msg .cards{display:grid;gap:10px;width:min(100%,640px)}' +
    '.acard{border:1px solid var(--line-strong);background:var(--surface);border-radius:var(--r);padding:12px 14px;display:grid;gap:10px}' +
    '.acard .ahead{display:flex;justify-content:space-between;align-items:center;gap:8px}.acard h3{font-size:1rem}' +
    '.acard.done{border-color:var(--ok)}.acard.rejected{opacity:.7;border-style:dashed}' +
    '.acard .sum{white-space:pre-wrap;font-size:.9375rem}' +
    '.acard details summary{cursor:pointer;min-height:44px;display:flex;align-items:center;font-weight:600}' +
    '.acard .grid2{grid-template-columns:repeat(auto-fit,minmax(130px,1fr))}' +
    '.acard .sub{color:var(--ink-2);font-size:.8125rem;margin-top:-4px}' +
    '.composer{position:sticky;bottom:calc(57px + env(safe-area-inset-bottom));background:var(--bg);padding:10px 0 8px;border-top:1px solid var(--line);display:grid;gap:8px;z-index:3}' +
    '@media(min-width:900px){.composer{bottom:0}}' +
    '.composer textarea{font-family:inherit;font-size:16px;min-height:44px;max-height:160px;resize:none}' +
    '.crow2{display:flex;gap:8px;align-items:flex-end}.crow2 .grow{flex:1 1 auto;min-width:0}' +
    '.thumbs{display:flex;gap:8px;flex-wrap:wrap}.thumbs .th{position:relative;border:1px solid var(--line-strong);border-radius:var(--r);background:var(--surface);padding:4px;display:flex;align-items:center;gap:6px}' +
    '.thumbs img{width:44px;height:44px;object-fit:cover;border-radius:4px;display:block}' +
    '.chips{display:flex;gap:8px;flex-wrap:wrap}.chips .btn{padding:0 12px;font-weight:500}' +
    '.badge{position:absolute;top:4px;left:calc(50% + 6px);min-width:18px;height:18px;border-radius:9px;background:var(--accent);color:var(--accent-ink);font-size:.6875rem;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 5px;line-height:1}' +
    '@media(min-width:900px){.badge{position:static;margin-left:auto}}' +
    '.typing{color:var(--ink-2);display:flex;gap:10px;align-items:center;flex-wrap:wrap}' +
    '.hello{display:grid;gap:8px}.hello ul{margin:0;padding-left:18px;display:grid;gap:4px}';
  document.head.appendChild(st0);

  /* ================= pengingat dan daftar tugas ================= */
  function entered(r) {
    return r.cash != null || r.qris != null || r.lines.some(function (l) { return l.turus != null || l.sisa != null || l.reject != null; });
  }
  function checklist() {
    var st = S(), t = today(), y = addDays(t, -1), items = [], multi = st.carts.length > 1;
    st.carts.forEach(function (c) {
      var nm = multi ? c.name : 'cart';
      var shT = st.shipments.filter(function (s) { return s.cartId === c.id && s.date === t; });
      var shY = st.shipments.filter(function (s) { return s.cartId === c.id && s.date === y; });
      items.push({ id: 'ship|' + c.id, text: 'Kirim stok awal ke ' + nm, done: shT.some(function (s) { return s.type === 'awal'; }), go: { route: 'kirim' }, skippable: true });
      if (shY.length) {
        var ry = st.recaps.filter(function (r) { return r.cartId === c.id && r.date === y; })[0];
        items.push({ id: 'rky|' + c.id, text: 'Isi rekap kemarin (' + fmtDate(y) + ')' + (multi ? ', ' + c.name : ''), done: !!(ry && entered(ry)), go: { route: 'rekap', date: y, cartId: c.id }, skippable: true });
      }
      if (shT.length) {
        var rt = st.recaps.filter(function (r) { return r.cartId === c.id && r.date === t; })[0];
        items.push({ id: 'rkt|' + c.id, text: 'Isi rekap hari ini dari kertas kasir' + (multi ? ', ' + c.name : ''), done: !!(rt && entered(rt)), go: { route: 'rekap', date: t, cartId: c.id }, skippable: true });
      }
    });
    items.push({ id: 'prod', text: 'Catat produksi RTD hari ini', done: st.batches.some(function (b) { return b.date === t; }), go: { route: 'produksi' }, skippable: true });
    if (CC.ledger && CC.stockStatus) {
      var L = CC.ledger(), low = Object.keys(L).filter(function (k) { var s = CC.stockStatus(L[k]); return s.k === 'warn' || s.t === 'Habis' || s.t === 'Minus'; });
      if (low.length) items.push({ id: 'low', text: low.length + ' bahan menipis atau habis, perlu belanja', done: false, go: { route: 'stok' }, skippable: true });
    }
    var active = st.trips.length || st.hmBatches.length || st.recaps.length;
    if (active) {
      var last = ''; st.stockAdj.forEach(function (a) { if (a.date > last) last = a.date; });
      var age = last ? Math.round((new Date(t + 'T00:00:00') - new Date(last + 'T00:00:00')) / 864e5) : null;
      if (age == null || age > 14) items.push({ id: 'opname', text: age == null ? 'Belum pernah stok opname bahan' : 'Stok opname terakhir ' + age + ' hari lalu', done: false, go: { route: 'stok' }, skippable: true });
    }
    st.reminders.forEach(function (r) {
      if (r.done) return;
      var late = r.due && r.due < t, soon = r.due && r.due >= t && r.due <= addDays(t, 3);
      if (r.due && !late && !soon) return;
      items.push({ id: 'rem|' + r.id, text: r.text, sub: r.due ? (late ? 'Lewat, ' : 'Tenggat ') + fmtDate(r.due) : 'Tanpa tenggat', done: false, rem: r.id });
    });
    return items.filter(function (it) { return !st.skips[t + '|' + it.id]; });
  }
  CC.checklist = checklist;
  function pendingCount() { return checklist().filter(function (i) { return !i.done; }).length; }

  function ckRow(it) {
    var btns = '';
    if (it.rem) {
      btns = '<button type="button" class="btn" data-act="rem-done" data-id="' + esc(it.rem) + '">Selesai</button><button type="button" class="btn quiet" data-act="rem-del" data-id="' + esc(it.rem) + '" aria-label="Hapus pengingat ' + esc(it.text) + '">Hapus</button>';
    } else {
      if (it.go && !it.done) btns += '<button type="button" class="btn" data-act="ck-go" data-id="' + esc(it.id) + '">Buka</button>';
      if (it.skippable && !it.done) btns += '<button type="button" class="btn quiet" data-act="ck-skip" data-id="' + esc(it.id) + '" aria-label="Lewati hari ini: ' + esc(it.text) + '">Lewati</button>';
    }
    return '<li class="' + (it.done ? 'done' : '') + '"><span class="tx">' + esc(it.text) + (it.sub ? '<span class="meta hint">' + esc(it.sub) + '</span>' : '') + '</span>' +
      '<span class="pill ' + (it.done ? 'good' : 'warn') + '">' + (it.done ? 'Sudah' : 'Belum') + '</span>' + (btns ? '<span class="btns">' + btns + '</span>' : '') + '</li>';
  }
  function ckListHTML() {
    var items = checklist(), p = items.filter(function (i) { return !i.done; }), d = items.filter(function (i) { return i.done; });
    if (!items.length) return '<div class="empty"><p>Belum ada yang perlu diingat. Katakan ke Asisten, misalnya "ingatkan beli susu Jumat", dan pengingatnya muncul di sini.</p></div>';
    return '<ul class="ck">' + p.concat(d).map(ckRow).join('') + '</ul>';
  }
  CC.checklistGroupHTML = function () {
    var items = checklist(); if (!items.length) return '';
    var n = items.filter(function (i) { return !i.done; }).length;
    return '<div class="group"><h2>Pengingat hari ini' + (n ? ' <span class="hint">' + n + ' belum</span>' : ' <span class="hint">semua beres</span>') + '</h2>' + ckListHTML() +
      '<div><a class="btn" href="#asisten">Tanya Asisten</a></div></div>';
  };

  function refreshBadge() {
    var a = document.querySelector('[data-nav="asisten"]'); if (!a) return;
    var n = pendingCount(), b = a.querySelector('.badge');
    if (n > 0) {
      if (!b) { b = document.createElement('span'); b.className = 'badge'; b.setAttribute('aria-hidden', 'true'); a.appendChild(b); }
      b.textContent = n > 9 ? '9+' : String(n);
      a.setAttribute('aria-label', 'Asisten, ' + n + ' pengingat belum dikerjakan');
    } else { if (b) b.remove(); a.removeAttribute('aria-label'); }
  }
  function rerender() {
    if (location.hash === '#asisten') paint(); else CC.render();
    refreshBadge();
  }

  /* ================= asisten ================= */
  var busy = false, ctl = null, sampleP = null, limits = null, avail = null;
  var pend = { text: '', files: [] };
  var impactCache = {};

  function getSample() {
    if (!sampleP) {
      try { sampleP = (window.claude && window.claude.use) ? Promise.resolve(window.claude.use('sample')).catch(function () { return null; }) : Promise.resolve(null); }
      catch (e) { sampleP = Promise.resolve(null); }
    }
    return sampleP;
  }

  function isoOr(d, fb) { return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(new Date(d + 'T00:00:00')) ? d : fb; }
  function numv(v) { if (v === null || v === undefined || v === '') return null; var n = typeof v === 'number' ? v : Number(v); return isFinite(n) ? n : null; }
  var FAM = { g: ['g', 'kg'], ml: ['ml', 'l'], pcs: ['pcs'] };

  function rawIngs() { return S().ingredients.filter(function (i) { return !i.homemadeId; }); }
  function findRawByName(n) {
    n = String(n || '').trim().toLowerCase(); if (!n) return null;
    return rawIngs().filter(function (i) { return i.name.toLowerCase() === n; })[0] || null;
  }

  /* periksa dan rapikan usulan dari model terhadap data yang ada. Tidak ada yang disimpan di sini. */
  function refs(id, lists) { return lists.some(function (l) { return JSON.stringify(l || []).indexOf('"' + id + '"') > -1; }); }
  function sanitize(a) {
    var st = S(), out = { type: a.type, errors: [], warns: [] };
    if (a.type === 'belanja') {
      out.date = isoOr(a.date, today()); out.store = a.store ? String(a.store).slice(0, 60) : '';
      out.lines = (Array.isArray(a.lines) ? a.lines : []).map(function (l) {
        var ing = CC.ingById(l.ingId); if (ing && ing.homemadeId) ing = null;
        if (!ing) ing = findRawByName(l.name);
        var o = { ingId: ing ? ing.id : null, name: ing ? ing.name : String(l.name || '').trim().slice(0, 60), qty: numv(l.qty), unit: l.unit, price: numv(l.price), newBase: ing ? ing.base : l.newBase, err: '' };
        if (!UNITS[o.unit]) o.err = 'satuan tidak dikenal';
        else if (!(o.qty > 0)) o.err = 'jumlah belum terbaca';
        else if (o.price == null || !(o.price >= 0)) o.err = 'harga belum terbaca';
        else if (ing) { if (CC.toBase(ing, o.qty, o.unit) == null) o.err = 'satuan ' + UNITS[o.unit].label + ' tidak cocok dengan ' + ing.name; }
        else if (!o.name) o.err = 'nama bahan kosong';
        else if (!FAM[o.newBase] || FAM[o.newBase].indexOf(o.unit) < 0) o.err = 'satuan dan jenis bahan baru tidak cocok';
        return o;
      });
      if (!out.lines.length) out.errors.push('Tidak ada baris belanja yang terbaca.');
      out.lines.forEach(function (l, i) { if (l.err) out.errors.push('Baris ' + (i + 1) + ' (' + (l.name || 'tanpa nama') + '): ' + l.err + '.'); });
    } else if (a.type === 'masak') {
      var hm = CC.homemadeById(a.hmId);
      out.date = isoOr(a.date, today()); out.note = a.note ? String(a.note).slice(0, 80) : ''; out.hmId = hm ? hm.id : null; out.qty = numv(a.qty);
      if (!hm) out.errors.push('Bahan homemade tidak ditemukan di Bahan homemade. Buat dulu resepnya di sana.');
      else if (!(hm.yieldQty > 0) || !hm.lines.length) out.errors.push('Resep ' + hm.name + ' belum lengkap (hasil jadi atau bahan masih kosong). Lengkapi di Bahan homemade.');
      if (!(out.qty > 0)) out.errors.push('Jumlah hasil jadi belum terbaca.');
    } else if (a.type === 'rekap') {
      var cart = st.carts.filter(function (c) { return c.id === a.cartId; })[0] || st.carts[0];
      out.date = isoOr(a.date, today()); out.cartId = cart.id;
      ['opening', 'cash', 'qris'].forEach(function (k) { var v = numv(a[k]); out[k] = v != null && v >= 0 ? v : null; });
      out.working = a.working ? String(a.working).slice(0, 300) : '';
      out.lines = (Array.isArray(a.lines) ? a.lines : []).map(function (l) {
        var m = CC.menuById(l.menuId); if (!m) return null;
        var o = { menuId: m.id };
        ['turus', 'sisa', 'reject'].forEach(function (k) { var v = numv(l[k]); o[k] = v != null && v >= 0 ? Math.round(v) : null; });
        return o;
      }).filter(Boolean);
      var any = out.opening != null || out.cash != null || out.qris != null || out.lines.some(function (l) { return l.turus != null || l.sisa != null || l.reject != null; });
      if (!any) out.errors.push('Tidak ada angka rekap yang terbaca.');
    } else if (a.type === 'pengingat') {
      out.text = String(a.text || '').trim().slice(0, 140); out.due = isoOr(a.due, null);
      if (!out.text) out.errors.push('Isi pengingat kosong.');
    } else if (a.type === 'pengingat_selesai') {
      out.id = a.id; if (!st.reminders.some(function (r) { return r.id === a.id && !r.done; })) out.errors.push('Pengingat tidak ditemukan.');
    } else if (a.type === 'hapus_contoh') {
      out.kind = a.kind; out.id = String(a.id || '');
      if (a.kind === 'bahan') {
        var ig = CC.ingById(out.id);
        if (!ig) out.errors.push('Bahan tidak ditemukan.');
        else {
          var used = CC.usedIn(ig.id);
          if (used.length) out.errors.push('Bahan ' + ig.name + ' masih dipakai di ' + used.map(function (m) { return m.name; }).join(', ') + '.');
          if (refs(ig.id, [st.trips, st.stockAdj, st.hmBatches])) out.errors.push('Bahan ' + ig.name + ' sudah punya catatan belanja, stok opname, atau masak.');
          out.label = ig.name;
        }
      } else if (a.kind === 'menu') {
        var mn = CC.menuById(out.id);
        if (!mn) out.errors.push('Menu tidak ditemukan.');
        else {
          if (refs(mn.id, [st.recaps, st.batches, st.shipments, st.writeoffs])) out.errors.push('Menu ' + mn.name + ' sudah punya catatan produksi, pengiriman, rekap, atau pembuangan.');
          if (st.menus.length < 2) out.errors.push('Menu terakhir tidak boleh dihapus.');
          out.label = mn.name;
        }
      } else out.errors.push('Yang boleh dihapus hanya bahan atau menu contoh.');
    } else { out.errors.push('Jenis catatan tidak dikenal.'); }
    return out;
  }

  /* ---------- kartu usulan ---------- */
  var LABEL = { belanja: 'Belanja', masak: 'Catat masak', rekap: 'Rekap harian', pengingat: 'Pengingat', pengingat_selesai: 'Pengingat selesai' };
  function pillFor(a) {
    if (a.status === 'done') return '<span class="pill good">Tersimpan</span>';
    if (a.status === 'rejected') return '<span class="pill">Ditolak</span>';
    return '<span class="pill warn">Menunggu dicek</span>';
  }
  function dateField(msgId, i, a) {
    return '<div class="field"><label for="agd-' + esc(msgId) + '-' + i + '">Tanggal</label><input id="agd-' + esc(msgId) + '-' + i + '" type="date" data-ag="date" data-m="' + esc(msgId) + '" data-i="' + i + '" value="' + esc(a.date) + '"></div>';
  }
  function bodyHTML(msgId, i, a, v) {
    var h = '', st = S();
    if (a.type === 'belanja') {
      h += '<div class="grid2">' + dateField(msgId, i, v) + '<div class="field"><label for="ags-' + esc(msgId) + '-' + i + '">Toko</label><input id="ags-' + esc(msgId) + '-' + i + '" type="text" data-ag="store" data-m="' + esc(msgId) + '" data-i="' + i + '" value="' + esc(v.store) + '" autocomplete="off"></div></div>';
      var total = 0;
      h += '<div class="mat">' + v.lines.map(function (l) {
        total += l.price > 0 ? l.price : 0;
        var ing = CC.ingById(l.ingId), info = '';
        if (l.err) info = '<span class="chk bad">Perlu diperbaiki: ' + esc(l.err) + '</span>';
        else if (ing) {
          var b = CC.toBase(ing, l.qty, l.unit), cur = CC.pricePerBase(ing), np = l.price / b;
          info = 'Masuk ke ' + esc(ing.name) + ', ' + rps(np) + ' per ' + UNITS[ing.base].label + (cur ? ' (' + pct((np - cur) / cur * 100) + ' dari harga di COGS)' : '');
        } else info = '<span class="chk">Bahan baru di Bank of Goods (' + UNITS[l.newBase].label + ')</span>';
        return leader(esc(l.name) + ' ' + nf2.format(l.qty || 0) + ' ' + (UNITS[l.unit] ? UNITS[l.unit].label : ''), l.price != null ? rp(l.price) : '-') + '<p class="sub">' + info + '</p>';
      }).join('') + leader('Total', rp(total), 'total') + '</div>';
    } else if (a.type === 'masak') {
      var hm = CC.homemadeById(v.hmId);
      h += '<div class="grid2">' + dateField(msgId, i, v) + '<div class="field"><span class="lbl">Hasil jadi</span><output class="ro" style="min-height:44px;line-height:44px;font-weight:600">' + (hm && v.qty > 0 ? fq(hm.base, v.qty) : '-') + '</output></div></div>';
      if (hm && v.qty > 0 && hm.yieldQty > 0) {
        h += '<div class="mat"><strong>' + esc(hm.name) + ' +' + fq(hm.base, v.qty) + '</strong>' + CC.usageForHm(hm, v.qty).map(function (u) {
          var ing = CC.ingById(u.ingId); return leader(esc(ing ? ing.name : 'bahan'), '-' + fq(ing.base, u.base));
        }).join('') + '</div>';
      }
      if (v.note) h += '<p class="sub">Catatan: ' + esc(v.note) + '</p>';
    } else if (a.type === 'rekap') {
      var cart = st.carts.filter(function (c) { return c.id === v.cartId; })[0];
      var b = CC.buildRecap(v), c = b.calc, ships = st.shipments.filter(function (s) { return s.cartId === v.cartId && s.date === v.date; }).length;
      h += '<div class="grid2">' + dateField(msgId, i, v) + '<div class="field"><span class="lbl">Cart</span><output class="ro" style="min-height:44px;line-height:44px;font-weight:600">' + esc(cart ? cart.name : '-') + '</output></div></div>';
      h += '<div class="mat">' +
        leader('Saldo awal', v.opening != null ? rp(v.opening) : '<span class="chk">belum terbaca</span>') +
        leader('Cash di laci (saldo akhir)', v.cash != null ? rp(v.cash) : '<span class="chk">belum terbaca</span>') +
        leader('QRIS', v.qris != null ? rp(v.qris) : '<span class="chk">belum terbaca</span>') +
        v.lines.map(function (l) {
          var m = CC.menuById(l.menuId);
          return leader(esc(m.name) + ', turus / sisa / reject', [l.turus, l.sisa, l.reject].map(function (x) { return x == null ? '-' : nf0.format(x); }).join(' / '));
        }).join('') + '</div>';
      h += '<div class="mat"><strong>Cek silang sebelum disimpan</strong>' + leader('Omzet bersih dari turus', rp(c.net)) +
        leader('Cash + QRIS ' + '−' + ' saldo awal', c.moneyEntered ? rp(c.inflow) : 'belum lengkap') +
        leader('Selisih uang', c.moneyEntered ? (c.moneyDiff === 0 ? '<span class="chk good">Cocok</span>' : '<span class="chk ' + (c.moneyFlag ? 'bad' : '') + '">' + (c.moneyDiff < 0 ? 'kurang ' : 'lebih ') + rp(Math.abs(c.moneyDiff)) + '</span>') : '-') + '</div>';
      if (c.flags.length) h += '<p class="note warn"><strong>Perlu dicek:</strong> ' + c.flags.map(esc).join('; ') + '.</p>';
      if (!ships) h += '<p class="note">Belum ada pengiriman tercatat di tanggal ini, jadi cek stok memakai stok keluar 0.</p>';
      if (b.existed) h += '<p class="note warn">Rekap tanggal ini sudah ada. Simpan akan memperbarui angka yang terbaca saja, angka lain tidak diubah.</p>';
      if (v.working) h += '<p class="sub">Cara hitung: ' + esc(v.working) + '</p>';
    } else if (a.type === 'pengingat') {
      h += '<p>' + esc(v.text) + '</p><p class="sub">' + (v.due ? 'Tenggat ' + esc(fmtDate(v.due)) : 'Tanpa tenggat') + '</p>';
    } else if (a.type === 'pengingat_selesai') {
      var r = st.reminders.filter(function (x) { return x.id === v.id; })[0]; h += '<p>' + esc(r ? r.text : 'Pengingat') + '</p>';
    }
    if (v.errors.length) h += '<p class="note warn"><strong>Belum bisa disimpan.</strong> ' + v.errors.map(esc).join(' ') + ' Koreksi lewat chat, atau isi manual lewat menu yang bersangkutan.</p>';
    return h;
  }
  function cardHTML(msg, a, i) {
    var v = sanitize(a);
    var h = '<div class="acard ' + (a.status || '') + '" data-card="' + esc(msg.id) + '-' + i + '"><div class="ahead"><h3>' + LABEL[a.type] + '</h3>' + pillFor(a) + '</div>';
    if (a.status === 'done' || a.status === 'rejected') {
      h += '<p class="sum">' + esc(a.summary || (a.status === 'rejected' ? 'Tidak disimpan.' : '')) + '</p>';
      if (a.status === 'done' && impactCache[msg.id + '-' + i]) h += '<details><summary>Dampak ke COGS dan food cost</summary>' + impactCache[msg.id + '-' + i] + '</details>';
      if (a.status === 'done') {
        if (a.type === 'belanja') h += '<div class="acts"><a class="btn" href="#belanja">Buka Belanja</a></div>';
        if (a.type === 'masak') h += '<div class="acts"><a class="btn" href="#stok">Buka Stok bahan</a></div>';
        if (a.type === 'rekap') h += '<div class="acts"><button type="button" class="btn" data-act="ag-open-recap" data-m="' + esc(msg.id) + '" data-i="' + i + '">Buka rekap</button></div>';
        if (a.type === 'pengingat' && a.remId) h += '<div class="acts"><button type="button" class="btn quiet" data-act="rem-del" data-id="' + esc(a.remId) + '">Hapus pengingat</button></div>';
      }
      return h + '</div>';
    }
    h += bodyHTML(msg.id, i, a, v);
    h += '<div class="acts"><button type="button" class="btn primary" data-act="ag-save" data-m="' + esc(msg.id) + '" data-i="' + i + '"' + (v.errors.length ? ' disabled' : '') + '>Simpan</button>' +
      '<button type="button" class="btn" data-act="ag-reject" data-m="' + esc(msg.id) + '" data-i="' + i + '">Tolak</button></div></div>';
    return h;
  }
  function msgHTML(m) {
    var me = m.role === 'user';
    var h = '<li class="msg ' + (me ? 'me' : 'bot') + '"><span class="who">' + (me ? 'Kamu' : 'Asisten') + '</span>';
    var txt = m.text || '';
    if (me && m.imgs) txt = (txt ? txt + '\n' : '') + '[' + m.imgs + ' foto dikirim]';
    if (txt) h += '<div class="bub">' + esc(txt) + '</div>';
    if (m.actions && m.actions.length) h += '<div class="cards">' + m.actions.map(function (a, i) { return cardHTML(m, a, i); }).join('') + '</div>';
    return h + '</li>';
  }

  /* ---------- halaman ---------- */
  var CHIPS = [
    { t: 'Foto struk belanja', act: 'photo', text: 'Ini struk belanja. Tolong catat ke inventory.' },
    { t: 'Catat masak', act: 'text', text: 'Sudah membuat sirup ' },
    { t: 'Foto turus dan QRIS', act: 'photo', text: 'Ini turus, laporan QRIS, dan kalkulator saldo hari ini. Tolong buat rekapnya.' },
    { t: 'Apa yang belum dikerjakan?', act: 'send', text: 'Apa yang belum saya kerjakan hari ini?' }
  ];
  function welcomeHTML() {
    return '<div class="hello"><p><strong>Halo.</strong> Kirim foto atau cerita, aku siapkan catatannya, kamu cek lalu Simpan.</p><ul>' +
      '<li>Foto struk belanja: masuk ke Belanja dan harga COGS ikut berubah.</li>' +
      '<li>"Sudah masak sirup caramel 500 gram": stok sirup bertambah, bahan mentah berkurang.</li>' +
      '<li>Foto turus, laporan QRIS, dan kalkulator saldo: jadi rekap harian lengkap dengan cek silang.</li>' +
      '<li>"Ingatkan beli susu hari Jumat": masuk daftar pengingat.</li></ul></div>';
  }
  function renderPage() {
    view.innerHTML = '<section aria-labelledby="h-as" class="agw"><div class="pagehead" style="margin:0"><div><h1 id="h-as" tabindex="-1">Asisten</h1>' +
      '<p class="lede">Bantu mencatat dari foto dan cerita. Apa pun yang menyentuh data baru disimpan setelah kamu menekan Simpan.</p></div></div>' +
      '<div id="ag-ck" class="group" style="margin:0"></div>' +
      '<div id="ag-na"></div><ul class="chat" id="ag-log" role="log" aria-live="polite" aria-label="Percakapan dengan Asisten"></ul>' +
      '<div class="composer"><div class="chips" id="ag-chips"></div><div class="thumbs" id="ag-thumbs"></div>' +
      '<div class="crow2"><button type="button" class="btn" data-act="ag-photo" id="ag-photo-btn">Foto</button>' +
      '<div class="field grow"><label for="ag-text" class="sr">Pesan untuk Asisten</label><textarea id="ag-text" rows="1" placeholder="Tulis, atau kirim foto" autocomplete="off"></textarea></div>' +
      '<button type="button" class="btn primary" data-act="ag-send" id="ag-send-btn">Kirim</button></div>' +
      '<input type="file" id="ag-file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden></div></section>';
    $('#ag-text').value = pend.text;
    paint();
    if (S().chat.length) setTimeout(function () { var l = $('#ag-log'); if (l && l.lastElementChild) l.lastElementChild.scrollIntoView({ block: 'nearest' }); }, 220);
    getSample().then(function (s) {
      if (!s) { avail = false; paint(); return; }
      avail = true;
      Promise.resolve(s.limits ? s.limits() : null).then(function (l) { limits = l; var f = $('#ag-file'); if (f && l && l.images && l.images.mediaTypes) f.accept = l.images.mediaTypes.join(','); paint(); }, function () { limits = null; paint(); });
    });
  }
  function paint(scroll) {
    if (!$('#ag-log')) return;
    var st = S(), box = $('#ag-ck');
    var n = pendingCount();
    var cur = box.querySelector('details'), open = cur ? cur.open : (n > 0 && !st.chat.length);
    box.innerHTML = '<details' + (open ? ' open' : '') + '><summary style="cursor:pointer;min-height:44px;display:flex;align-items:center;font-weight:700;font-family:var(--font-display);font-size:1.125rem">Pengingat hari ini' + (n ? ' <span class="hint" style="margin-left:8px;font-family:inherit">' + n + ' belum</span>' : '') + '</summary>' + ckListHTML() + '</details>';
    $('#ag-na').innerHTML = avail === false ? '<p class="note warn"><strong>Asisten belum aktif di sini.</strong> Halaman ini harus dibuka lewat Claude supaya foto dan cerita bisa dibaca. Form manual tetap jalan: <a href="#belanja">Belanja</a>, <a href="#homemade">Bahan homemade</a>, <a href="#rekap">Rekap harian</a>.</p>' : '';
    var log = $('#ag-log');
    log.innerHTML = (st.chat.length ? st.chat.map(msgHTML).join('') : '<li>' + welcomeHTML() + '</li>') +
      (busy ? '<li class="typing" role="status"><span>Asisten sedang membaca...</span><button type="button" class="btn" data-act="ag-stop">Batal</button></li>' : '');
    $('#ag-chips').innerHTML = (!st.chat.length || (!pend.text && !pend.files.length && !busy && st.chat.length < 2)) ?
      CHIPS.map(function (c, i) { return '<button type="button" class="btn" data-act="ag-chip" data-i="' + i + '"' + (avail === false ? ' disabled' : '') + '>' + esc(c.t) + '</button>'; }).join('') : '';
    var cap = limits && limits.images ? limits.images : null;
    $('#ag-thumbs').innerHTML = pend.files.map(function (f, i) {
      if (!f.url) f.url = URL.createObjectURL(f.blob);
      return '<span class="th"><img src="' + f.url + '" alt="Foto ' + (i + 1) + ' siap dikirim" width="44" height="44"><button type="button" class="btn quiet" data-act="ag-rm-photo" data-i="' + i + '" aria-label="Buang foto ' + (i + 1) + '">Buang</button></span>';
    }).join('');
    var off = avail === false || busy;
    $('#ag-send-btn').disabled = off; $('#ag-text').disabled = avail === false;
    $('#ag-photo-btn').disabled = avail === false || busy || (limits && !limits.images);
    if (scroll === 'end') { var last = log.lastElementChild; if (last) last.scrollIntoView({ block: 'nearest' }); }
  }

  /* ---------- kirim ke Claude ---------- */
  var INSTR = [
    'Kamu Asisten back office untuk coffee cart. Central kitchen mengirim RTD siap jual ke cart, kasir tetap manual di kertas. Tugasmu menyiapkan catatan dari foto dan cerita pengguna supaya pengguna tinggal mengecek lalu menekan Simpan.',
    'Gaya: bahasa Indonesia, hangat, ringkas, tanpa emoji, tanpa tanda pisah panjang.',
    '',
    'ATURAN',
    '- Jangan mengarang angka. Pakai hanya yang terbaca di foto atau disebut pengguna. Kalau ragu atau tidak terbaca, isi null dan ajukan SATU pertanyaan di "reply".',
    '- Pilih bahan, homemade, menu, dan cart dari DATA di bawah memakai id-nya. Jangan membuat id.',
    '- Kamu tidak menyimpan apa pun. Setiap aksi hanyalah usulan yang dicek pengguna di aplikasi, jadi katakan "sudah kusiapkan, tolong dicek" dan jangan bilang "sudah tersimpan". Pengingat adalah pengecualian: langsung dicatat.',
    '- Jawab dengan SATU objek JSON saja: {"reply": string, "actions": [...]}. "actions" boleh kosong.',
    '- Bila pengguna mengoreksi usulan sebelumnya, keluarkan aksi baru yang sudah dikoreksi. Aksi lama berstatus menunggu akan diganti.',
    '- Satu foto bisa memuat beberapa jenis (misalnya turus dan struk). Pisahkan menjadi beberapa aksi.',
    '',
    'JENIS AKSI',
    '1) Struk belanja: {"type":"belanja","date":"YYYY-MM-DD","store":string|null,"lines":[{"ingId":id|null,"name":string,"qty":number,"unit":"g"|"kg"|"ml"|"l"|"pcs","price":number,"newBase":"g"|"ml"|"pcs"|null}]}',
    '   price adalah total harga baris di struk (setelah diskon baris), rupiah penuh. qty dan unit sesuai tulisan struk; "2 x 1 kg" berarti qty 2 unit kg. Bahan yang belum ada di bahan_mentah: ingId null, name yang wajar, newBase g untuk padat, ml untuk cair, pcs untuk bijian. Lewati barang bukan bahan baku (plastik, ongkir, pajak) dan sebut di reply.',
    '2) Masak homemade: {"type":"masak","hmId":id,"qty":number,"date":"YYYY-MM-DD","note":string|null}. qty adalah hasil jadi aktual dalam satuan dasar bahan homemade itu (gram atau ml); konversi bila pengguna menyebut kg atau liter.',
    '3) Rekap harian: {"type":"rekap","date":"YYYY-MM-DD","cartId":id,"opening":number|null,"cash":number|null,"qris":number|null,"lines":[{"menuId":id,"turus":int|null,"sisa":int|null,"reject":int|null}],"working":string}',
    '   opening adalah saldo awal kasir. cash adalah uang tunai di laci pada akhir hari (saldo akhir), bukan selisihnya. Bila kalkulator hanya memperlihatkan selisih (saldo akhir dikurangi saldo awal), maka cash = opening + selisih, dan tulis hitungannya di "working". Bila opening tidak terlihat, pakai saldo_awal_default cart, atau tanyakan. qris adalah total QRIS hari itu dari tangkapan laporan. turus adalah cup terjual per menu dari kertas; hitung garis tally dengan teliti (kelompok lima) dan tulis null bila meragukan. Tanggal dari foto atau cerita, bila tidak ada pakai hari_ini.',
    '4) Pengingat: {"type":"pengingat","text":string,"due":"YYYY-MM-DD"|null}',
    '5) Pengingat selesai: {"type":"pengingat_selesai","id":id dari pengingat_aktif}',
    '',
    'Pertanyaan seperti "apa yang belum dikerjakan" dijawab dari daftar_tugas dan pengingat_aktif di DATA, mulai dari yang paling mendesak, tanpa aksi.'
  ].join('\n');

  function context() {
    var st = S(), t = today();
    function r2(x) { return x == null ? null : Math.round(x * 1000) / 1000; }
    var wd = new Date(t + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long' });
    return JSON.stringify({
      hari_ini: t, hari: wd,
      bahan_mentah: rawIngs().map(function (i) { return { id: i.id, nama: i.name, dasar: i.base, satuan_boleh: CC.unitOptions(i), harga_per_dasar: r2(CC.pricePerBase(i)) }; }),
      bahan_homemade: st.homemades.map(function (h) { return { id: h.id, nama: h.name, dasar: h.base, hasil_resep: h.yieldQty, resep_lengkap: h.yieldQty > 0 && h.lines.length > 0 }; }),
      menu: st.menus.map(function (m) { return { id: m.id, nama: m.name, harga_jual: m.price }; }),
      cart: st.carts.map(function (c) { return { id: c.id, nama: c.name, saldo_awal_default: c.openingCash }; }),
      daftar_tugas: checklist().map(function (i) { return { teks: i.text, sudah: i.done }; }),
      pengingat_aktif: st.reminders.filter(function (r) { return !r.done; }).map(function (r) { return { id: r.id, teks: r.text, tenggat: r.due }; })
    });
  }
  function histTurn(m) {
    if (m.role === 'user') return { role: 'user', content: (m.text || '(foto)') + (m.imgs ? '\n[' + m.imgs + ' foto dikirim di giliran ini]' : '') };
    var c = m.text || '';
    if (m.actions && m.actions.length) c += '\n[Usulan aksi: ' + JSON.stringify(m.actions.map(function (a) { var o = {}; Object.keys(a).forEach(function (k) { if (k !== 'summary' && k !== 'remId') o[k] = a[k]; }); return o; })) + ']';
    return { role: 'assistant', content: c || '(kosong)' };
  }
  function errCopy(e) {
    var c = e && e.code;
    return ({
      not_granted: 'Izin memakai Claude belum diberikan. Kirim lagi dan setujui permintaannya.',
      rate_limited: 'Terlalu sering, atau batas pemakaian Claude tercapai. Tunggu sebentar lalu kirim lagi.',
      session_expired: 'Sesi habis. Buka ulang halaman ini lewat Claude.',
      image_rejected: 'Fotonya tidak bisa dibaca (format atau ukuran). Coba foto lain.',
      images_unavailable: 'Pengiriman foto belum tersedia di sini. Ketik angkanya saja.',
      invalid_json: 'Jawaban Asisten tidak terbaca sebagai catatan. Kirim ulang, atau perjelas pesannya.',
      upstream_error: 'Koneksi ke Claude terputus. Kirim ulang.',
      prompt_too_large: 'Percakapan terlalu panjang untuk dikirim. Hapus beberapa foto atau mulai pesan baru.',
      refused: 'Asisten tidak bisa memproses pesan itu. Coba ubah isinya.',
      sampling_disabled: 'Claude tidak tersedia untuk akun ini.',
      empty_completion: 'Asisten tidak menjawab. Kirim ulang dengan pesan yang lebih jelas.'
    })[c] || ('Asisten belum bisa menjawab' + (c ? ' (kode ' + c + ')' : '') + '.');
  }
  function pushMsg(m) {
    var st = S(); m.id = uid('g'); m.ts = Date.now(); st.chat.push(m);
    if (st.chat.length > 40) st.chat = st.chat.slice(-40);
    CC.save(); return m;
  }
  function supersede() {
    S().chat.forEach(function (m) { (m.actions || []).forEach(function (a) { if (!a.status) { a.status = 'rejected'; a.summary = 'Diganti usulan yang lebih baru.'; } }); });
  }
  async function send(textOverride) {
    if (busy) return;
    var ta = $('#ag-text'), text = (textOverride != null ? textOverride : (ta ? ta.value : pend.text)).trim(), files = pend.files.slice();
    if (!text && !files.length) return;
    var sample = await getSample();
    if (!sample) { avail = false; paint(); return; }
    var hist = S().chat.slice(-10).map(histTurn);
    pushMsg({ role: 'user', text: text, imgs: files.length });
    pend.text = ''; if (ta) { ta.value = ''; ta.style.height = ''; }
    pend.files.forEach(function (f) { if (f.url) URL.revokeObjectURL(f.url); }); pend.files = [];
    busy = true; ctl = new AbortController(); paint('end');
    var turns = [{ role: 'user', content: INSTR + '\n\nDATA (JSON):\n' + context() }].concat(hist, [{ role: 'user', content: text || '(hanya foto, tidak ada teks)' }]);
    try {
      var opts = { cache: false, signal: ctl.signal, modelTier: 'default' };
      if (files.length) opts.images = files.map(function (f) { return f.blob; });
      var res = await sample.json(turns, opts);
      if (!res || typeof res !== 'object') throw { code: 'invalid_json' };
      var acts = Array.isArray(res.actions) ? res.actions.filter(function (a) { return a && LABEL[a.type]; }).slice(0, 6) : [];
      if (acts.length) supersede();
      var msg = pushMsg({ role: 'assistant', text: String(res.reply || (acts.length ? 'Sudah kusiapkan, tolong dicek.' : 'Oke.')).slice(0, 1500), actions: acts.map(function (a) { return JSON.parse(JSON.stringify(a)); }) });
      msg.actions.forEach(function (a, i) {
        if (a.type === 'pengingat' || a.type === 'pengingat_selesai') autoApply(msg, a, i);
      });
      CC.save();
    } catch (e) {
      if (e && e.code === 'cancelled') pushMsg({ role: 'assistant', text: 'Dibatalkan.' });
      else pushMsg({ role: 'assistant', text: errCopy(e) });
    } finally { busy = false; ctl = null; }
    rerender(); if (location.hash === '#asisten') paint('end');
  }

  /* ---------- menyimpan ---------- */
  function autoApply(msg, a, i) {
    var v = sanitize(a), st = S();
    if (v.errors.length) { a.status = 'rejected'; a.summary = v.errors.join(' '); return; }
    if (a.type === 'pengingat') {
      var r = { id: uid('rm'), text: v.text, due: v.due, done: false, created: today(), via: 'asisten' };
      st.reminders.push(r); a.status = 'done'; a.remId = r.id; a.summary = 'Pengingat dicatat' + (v.due ? ' untuk ' + fmtDate(v.due) : '') + '.';
    } else {
      st.reminders.forEach(function (r) { if (r.id === v.id) r.done = true; });
      a.status = 'done'; a.summary = 'Pengingat ditandai selesai.';
    }
  }
  /* inti penyimpanan, dipakai kartu Asisten dan antrean agen. Mengubah state, tidak memanggil save. */
  function applyCore(a, v, via, key) {
    var st = S(), lines, summary = '', impact = null;
    if (a.type === 'belanja') {
      var before = {}; st.ingredients.forEach(function (x) { before[x.id] = CC.pricePerBase(x); });
      var made = [];
      lines = v.lines.map(function (l) {
        var ing = CC.ingById(l.ingId);
        if (!ing) {
          ing = { id: uid('i'), name: l.name, base: l.newBase, density: null, purchases: [] };
          st.ingredients.push(ing); made.push(ing.name);
        }
        return { ingId: ing.id, qty: l.qty, unit: l.unit, price: l.price };
      });
      var rec = CC.recordTrip(v.date, v.store, lines, via);
      var ch = [];
      st.ingredients.forEach(function (x) {
        var b = before[x.id], n = CC.pricePerBase(x);
        if (n != null && b != null && Math.abs(n - b) > 1e-9) ch.push(x.name + ': ' + rps(b) + ' ke ' + rps(n) + ' per ' + UNITS[x.base].label + ' (' + pct((n - b) / b * 100) + ')');
      });
      var tot = lines.reduce(function (s2, l) { return s2 + l.price; }, 0);
      summary = 'Belanja ' + fmtDate(v.date) + ' tersimpan: ' + lines.length + ' bahan, total ' + rp(tot) + '.' + (made.length ? '\nBahan baru di Bank of Goods: ' + made.join(', ') + '.' : '') +
        (ch.length ? '\nHarga COGS berubah:\n' + ch.join('\n') : '\nHarga COGS tidak berubah.');
      impact = rec.impact;
    } else if (a.type === 'masak') {
      var hm = CC.homemadeById(v.hmId);
      var use = CC.usageForHm(hm, v.qty);
      CC.recordCook(hm.id, v.date, v.qty, v.note, via);
      summary = hm.name + ' +' + fq(hm.base, v.qty) + ' tersimpan (' + fmtDate(v.date) + ').\nBahan mentah berkurang: ' + use.map(function (u) { var ing = CC.ingById(u.ingId); return ing.name + ' ' + fq(ing.base, u.base); }).join(', ') + '.';
    } else if (a.type === 'rekap') {
      var b2 = CC.recordRecap(v, via), c = b2.calc;
      summary = 'Rekap ' + fmtDate(v.date) + ' tersimpan. Omzet bersih ' + rp(c.net) + ', ' + nf0.format(c.cups) + ' cup.\n' +
        (c.moneyEntered ? 'Cash + QRIS dikurangi saldo awal ' + rp(c.inflow) + (c.moneyDiff === 0 ? ', cocok.' : ', selisih ' + (c.moneyDiff < 0 ? 'kurang ' : 'lebih ') + rp(Math.abs(c.moneyDiff)) + '.') : 'Uang belum lengkap.') +
        (c.flags.length ? '\nPerlu dicek: ' + c.flags.join('; ') + '.' : (c.qtyEntered && c.moneyEntered ? '\nSemua cek cocok.' : ''));
    } else if (a.type === 'pengingat') {
      st.reminders.push({ id: uid('rm'), text: v.text, due: v.due, done: false, created: today(), via: via });
      summary = 'Pengingat dicatat' + (v.due ? ' untuk ' + fmtDate(v.due) : '') + '.';
    } else if (a.type === 'hapus_contoh') {
      if (v.kind === 'bahan') st.ingredients = st.ingredients.filter(function (x) { return x.id !== v.id; });
      else { st.menus = st.menus.filter(function (x) { return x.id !== v.id; }); if (st.activeMenu === v.id) st.activeMenu = st.menus[0] ? st.menus[0].id : null; }
      summary = (v.kind === 'bahan' ? 'Bahan ' : 'Menu ') + v.label + ' dihapus.';
    }
    return { summary: summary, impact: impact };
  }
  function commit(msgId, i) {
    var st = S(), msg = st.chat.filter(function (m) { return m.id === msgId; })[0]; if (!msg) return;
    var a = msg.actions[i]; if (!a || a.status) return;
    var v = sanitize(a);
    if (v.errors.length) { toast('Belum bisa disimpan: ' + v.errors[0]); return; }
    var res = applyCore(a, v, 'asisten', msgId + '-' + i);
    a.summary = res.summary; if (res.impact) impactCache[msgId + '-' + i] = res.impact;
    a.status = 'done'; CC.save(); rerender();
    toast('Tersimpan.');
  }

  /* jalur untuk antrean agen (inbox.js). Memeriksa lebih ketat dari kartu Asisten: tanggal tidak boleh asal atau janggal. */
  var KINDS = ['belanja', 'masak', 'rekap', 'pengingat', 'hapus_contoh'];
  CC.agentKinds = CC.agentKinds || {};
  CC.agentApply = function (kind, payload, opts) {
    opts = opts || {};
    var X = CC.agentKinds[kind];
    if (KINDS.indexOf(kind) < 0 && !X) return { ok: false, error: 'Jenis aksi tidak dikenal: ' + kind + '.' };
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false, error: 'Payload bukan objek.' };
    var a = {}; Object.keys(payload).forEach(function (k) { a[k] = payload[k]; }); if (!X) a.type = kind;
    var t = today(), lo = CC.addDays(t, -400), hi = CC.addDays(t, 1), bad = null;
    ['date', 'due'].forEach(function (k) {
      if (a[k] === undefined || a[k] === null || a[k] === '') return;
      var d = isoOr(a[k], null);
      if (!d) bad = 'Tanggal ' + k + ' tidak valid (harus YYYY-MM-DD).';
      else if (k === 'date' && (d > hi || d < lo)) bad = 'Tanggal ' + d + ' janggal (terlalu jauh dari hari ini).';
    });
    if (bad) return { ok: false, error: bad };
    if (X) {
      if (X.needDate && !a.date) return { ok: false, error: 'Tanggal wajib diisi.' };
      try { return X.run(a, opts); } catch (e) { return { ok: false, error: 'Gagal menerapkan: ' + (e && e.message ? e.message : 'galat') }; }
    }
    if (kind !== 'pengingat' && kind !== 'hapus_contoh' && !a.date) return { ok: false, error: 'Tanggal wajib diisi.' };
    var v = sanitize(a);
    if (v.errors.length) return { ok: false, error: v.errors.join(' ') };
    if (opts.dry) return { ok: true };
    try {
      var res = applyCore(a, v, opts.via || 'agen', 'inbox'); CC.save();
      return { ok: true, summary: res.summary };
    } catch (e) { return { ok: false, error: 'Gagal menerapkan: ' + (e && e.message ? e.message : 'galat') }; }
  };

  /* ---------- peristiwa ---------- */
  function findMsg(id) { return S().chat.filter(function (m) { return m.id === id; })[0]; }
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]'); if (!t || t.disabled) return;
    var act = t.getAttribute('data-act'), id = t.getAttribute('data-id'), m = t.getAttribute('data-m'), i = parseInt(t.getAttribute('data-i'), 10), st = S();
    if (act === 'ag-send') send();
    else if (act === 'ag-stop') { if (ctl) ctl.abort(); }
    else if (act === 'ag-photo') { var f = $('#ag-file'); if (f) f.click(); }
    else if (act === 'ag-rm-photo') { var x = pend.files.splice(i, 1)[0]; if (x && x.url) URL.revokeObjectURL(x.url); paint(); }
    else if (act === 'ag-chip') {
      var c = CHIPS[i]; if (!c) return;
      if (c.act === 'send') send(c.text);
      else { pend.text = c.text; var ta = $('#ag-text'); if (ta) { ta.value = c.text; ta.focus(); } if (c.act === 'photo') { var f2 = $('#ag-file'); if (f2) f2.click(); } paint(); }
    }
    else if (act === 'ag-save') commit(m, i);
    else if (act === 'ag-reject') { var mm = findMsg(m); if (mm && mm.actions[i] && !mm.actions[i].status) { mm.actions[i].status = 'rejected'; mm.actions[i].summary = 'Tidak disimpan.'; CC.save(); paint(); } }
    else if (act === 'ag-open-recap') {
      var m2 = findMsg(m), a2 = m2 && m2.actions[i]; if (!a2) return;
      CC.ui.recapDate = a2.date; CC.ui.recapCart = a2.cartId || st.carts[0].id; location.hash = '#rekap';
    }
    else if (act === 'ck-go') {
      var it = checklist().filter(function (x) { return x.id === id; })[0]; if (!it || !it.go) return;
      if (it.go.date) { CC.ui.recapDate = it.go.date; CC.ui.recapCart = it.go.cartId; }
      if (location.hash === '#' + it.go.route) CC.render(); else location.hash = '#' + it.go.route;
    }
    else if (act === 'ck-skip') { st.skips[today() + '|' + id] = true; Object.keys(st.skips).forEach(function (k) { if (k.slice(0, 10) !== today()) delete st.skips[k]; }); CC.save(); rerender(); }
    else if (act === 'rem-done') { st.reminders.forEach(function (r) { if (r.id === id) r.done = true; }); CC.save(); rerender(); toast('Pengingat selesai.'); }
    else if (act === 'rem-del') {
      st.reminders = st.reminders.filter(function (r) { return r.id !== id; });
      st.chat.forEach(function (mg) { (mg.actions || []).forEach(function (a) { if (a.remId === id) { a.remId = null; a.status = 'rejected'; a.summary = 'Pengingat dihapus.'; } }); });
      CC.save(); rerender();
    }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'ag-file') {
      var cap = limits && limits.images ? limits.images.maxCount : 5, list = Array.prototype.slice.call(t.files || []), over = false;
      list.forEach(function (f) { if (pend.files.length < cap) pend.files.push({ blob: f, url: null }); else over = true; });
      if (over) toast('Maksimal ' + cap + ' foto per pesan.');
      t.value = ''; paint();
    } else if (t.getAttribute && t.getAttribute('data-ag')) {
      var mm = findMsg(t.getAttribute('data-m')), a = mm && mm.actions[parseInt(t.getAttribute('data-i'), 10)]; if (!a || a.status) return;
      var k = t.getAttribute('data-ag'); a[k] = k === 'date' ? isoOr(t.value, a.date) : t.value.slice(0, 60);
      CC.save();
      if (k === 'date') { var card = document.querySelector('[data-card="' + t.getAttribute('data-m') + '-' + t.getAttribute('data-i') + '"]'); if (card) { var tmp = document.createElement('div'); tmp.innerHTML = cardHTML(mm, a, parseInt(t.getAttribute('data-i'), 10)); card.replaceWith(tmp.firstChild); } }
    }
  });
  document.addEventListener('input', function (e) {
    if (e.target.id !== 'ag-text') return;
    pend.text = e.target.value; e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
  });
  document.addEventListener('keydown', function (e) {
    if (e.target.id === 'ag-text' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); }
  });

  CC.addRoute('asisten', { label: 'Asisten', order: 15, primary: true, render: renderPage });
  CC.addRenderHook(function () { refreshBadge(); });
  CC.addSaveHook(refreshBadge);
})();
