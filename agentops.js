/* Aksi tambahan untuk antrean agen: bahan, bahan homemade, menu, stok opname, produksi, pengiriman,
   pembuangan, cart, dan penghapusan. Semua lewat CC.agentKinds supaya dicek dulu (dry) lalu diterapkan. */
(function () {
  'use strict';
  var CC = window.CC, UNITS = CC.UNITS, uid = CC.uid, rp = CC.rp, fmtDate = CC.fmtDate, today = CC.todayISO;
  var FAM = { g: ['g', 'kg'], ml: ['ml', 'l'], pcs: ['pcs'] };
  CC.agentKinds = CC.agentKinds || {};

  function S() { return CC.state; }
  function numv(v) { if (v === null || v === undefined || v === '') return null; var n = typeof v === 'number' ? v : Number(v); return isFinite(n) ? n : null; }
  function isoOr(d, fb) { return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(new Date(d + 'T00:00:00')) ? d : fb; }
  function txt(s, n) { return String(s == null ? '' : s).trim().slice(0, n); }
  function byName(list, n) { n = txt(n, 80).toLowerCase(); if (!n) return null; return list.filter(function (x) { return String(x.name).toLowerCase() === n; })[0] || null; }
  function ingRef(r) { return (r.ingId && CC.ingById(String(r.ingId))) || byName(S().ingredients, r.name); }
  function menuRef(r) { return (r.menuId && CC.menuById(String(r.menuId))) || byName(S().menus, r.menu || r.name); }
  function hmRef(r) { var id = r.hmId && String(r.hmId); return (id && (S().homemades || []).filter(function (h) { return h.id === id; })[0]) || byName(S().homemades || [], r.name); }
  function nameTaken(n, exceptIng) { return S().ingredients.some(function (i) { return i.id !== exceptIng && i.name.toLowerCase() === n.toLowerCase(); }); }
  function famOf(base) { return base === 'g' ? 'm' : base === 'ml' ? 'v' : 'p'; }
  function reg(kind, needDate, fn) {
    CC.agentKinds[kind] = { needDate: needDate, run: function (a, opts) {
      var errors = [], res = fn(a, errors, !!opts.dry, opts.via || 'agen');
      if (errors.length) return { ok: false, error: errors.join(' ') };
      if (opts.dry) return { ok: true };
      CC.save(); return { ok: true, summary: res };
    } };
  }

  /* baris bahan untuk resep menu atau homemade. creates menampung bahan baru yang dibuat saat diterapkan. */
  function resolveLines(lines, errors, o) {
    var out = [], news = {}; o = o || {};
    if (!Array.isArray(lines) || !lines.length) { errors.push('Daftar bahan (lines) kosong.'); return { items: [], news: [] }; }
    var allowed = o.hm ? CC.hmCandidates(o.hm).map(function (i) { return i.id; }) : null;
    lines.forEach(function (l, k) {
      l = l || {}; var tag = 'Baris ' + (k + 1) + ': ', ing = ingRef(l), qty = numv(l.qty), unit = l.unit, it = { ing: ing, qty: qty, unit: unit };
      if (!UNITS[unit]) { errors.push(tag + 'satuan tidak dikenal.'); return; }
      if (!(qty > 0)) { errors.push(tag + 'jumlah belum terbaca.'); return; }
      if (ing) {
        if (allowed && allowed.indexOf(ing.id) < 0) { errors.push(tag + ing.name + ' tidak boleh dipakai di resep ini (bahan itu sendiri atau memakai resep ini).'); return; }
        if (CC.toBase(ing, qty, unit) == null) { errors.push(tag + 'satuan ' + UNITS[unit].label + ' tidak cocok dengan ' + ing.name + '.'); return; }
      } else {
        var nm = txt(l.name, 60), nb = l.newBase;
        if (!nm) { errors.push(tag + 'bahan tidak ditemukan dan nama kosong.'); return; }
        if (!FAM[nb]) { errors.push(tag + 'bahan "' + nm + '" belum ada. Kirim newBase (g, ml, atau pcs) untuk membuatnya, atau buat lebih dulu.'); return; }
        if (FAM[nb].indexOf(unit) < 0) { errors.push(tag + 'satuan dan newBase bahan baru tidak cocok.'); return; }
        var key = nm.toLowerCase();
        if (!news[key]) news[key] = { name: nm, base: nb };
        else if (news[key].base !== nb) { errors.push(tag + 'bahan baru "' + nm + '" dikirim dengan dua newBase berbeda.'); return; }
        it.newKey = key;
      }
      if (o.sections) { it.section = l.section || 'rtd'; if (o.sections.indexOf(it.section) < 0) errors.push(tag + 'section harus rtd atau cart.'); }
      out.push(it);
    });
    return { items: out, news: Object.keys(news).map(function (k) { return news[k]; }) };
  }
  function makeNews(news) {
    var made = {};
    news.forEach(function (n) {
      var ing = { id: uid('i'), name: n.name, base: n.base, density: null, purchases: [] };
      S().ingredients.push(ing); made[n.name.toLowerCase()] = ing;
    });
    return made;
  }
  function ingOf(it, made) { return it.ing || made[it.newKey]; }
  function noPrice(items, made) {
    var miss = [];
    items.forEach(function (it) { var g = ingOf(it, made); if (g && CC.pricePerBase(g) == null && miss.indexOf(g.name) < 0) miss.push(g.name); });
    return miss.length ? ' Harga belum ada untuk: ' + miss.join(', ') + '. Catat belanjanya supaya COGS terhitung.' : '';
  }

  /* ---------- bahan ---------- */
  reg('bahan_buat', false, function (a, errors, dry) {
    var kind = a.kind === 'perlengkapan' ? 'perlengkapan' : 'bahan';
    var name = txt(a.name, 60), base = kind === 'perlengkapan' ? 'pcs' : a.base, minStock = numv(a.minStock), density = numv(a.density), pack = numv(a.packSize);
    if (a.kind != null && a.kind !== 'bahan' && a.kind !== 'perlengkapan') errors.push('kind harus bahan atau perlengkapan.');
    if (pack != null && !(pack > 0)) errors.push('packSize harus lebih dari 0.');
    if (pack > 0 && base === 'pcs') errors.push('packSize hanya untuk bahan g atau ml.');
    if (!name) errors.push('Nama bahan kosong.');
    else if (nameTaken(name)) errors.push('Sudah ada bahan bernama ' + name + '.');
    if (!FAM[base]) errors.push('base harus g, ml, atau pcs.');
    if (minStock != null && minStock < 0) errors.push('minStock tidak boleh negatif.');
    if (density != null && !(density > 0)) errors.push('density harus lebih dari 0.');
    var ing = { id: uid('i'), name: name, kind: kind, base: base, density: density > 0 ? density : null, purchases: [], minStock: minStock > 0 ? minStock : 0, packSize: pack > 0 ? pack : null, refPrice: null };
    if (a.refPrice != null) {
      var r = a.refPrice || {}, rq = numv(r.qty), rpv = numv(r.price);
      if (!(rq > 0) || !(rpv >= 0) || !UNITS[r.unit]) errors.push('refPrice harus {qty, unit, price}.');
      else if (FAM[base] && CC.toBase(ing, rq, r.unit) == null) errors.push('refPrice: satuan tidak cocok dengan bahan.');
      else ing.refPrice = { qty: rq, unit: r.unit, price: rpv, date: today() };
    }
    if (errors.length || dry) return;
    S().ingredients.push(ing);
    return (kind === 'perlengkapan' ? 'Perlengkapan ' : 'Bahan ') + name + ' dibuat di Bank of Goods (satuan dasar ' + UNITS[base].label + '). ' + (ing.refPrice ? 'Harga acuan ' + rp(ing.refPrice.price) + ' per ' + ing.refPrice.qty + ' ' + CC.unitLabel(ing, ing.refPrice.unit) + ', belum menambah stok.' : 'Harga baru ada setelah belanja atau harga acuan diisi.');
  });
  reg('bahan_ubah', false, function (a, errors, dry) {
    var ing = ingRef(a); if (!ing) { errors.push('Bahan tidak ditemukan.'); return; }
    var nn = a.newName != null ? txt(a.newName, 60) : null, minStock = a.minStock !== undefined ? numv(a.minStock) : undefined, density = a.density !== undefined ? numv(a.density) : undefined, pack = a.packSize !== undefined ? numv(a.packSize) : undefined;
    if (pack != null && !(pack > 0)) errors.push('packSize harus lebih dari 0, atau null untuk menghapus.');
    if (pack > 0 && ing.base === 'pcs') errors.push('packSize hanya untuk bahan g atau ml.');
    if (pack === null && ing.purchases.some(function (p) { return p.unit === 'pcs'; }) && ing.base !== 'pcs') errors.push('Ada pembelian per pcs, packSize tidak bisa dihapus.');
    if (nn != null) { if (!nn) errors.push('newName kosong.'); else if (ing.homemadeId) errors.push('Nama bahan homemade diubah lewat homemade_ubah.'); else if (nameTaken(nn, ing.id)) errors.push('Sudah ada bahan bernama ' + nn + '.'); }
    if (minStock != null && minStock < 0) errors.push('minStock tidak boleh negatif.');
    if (density != null && !(density > 0)) errors.push('density harus lebih dari 0.');
    if (nn == null && minStock === undefined && density === undefined && pack === undefined) errors.push('Tidak ada yang diubah (newName, minStock, density, packSize).');
    if (errors.length || dry) return;
    var ch = [];
    if (nn != null) { ch.push('nama ' + ing.name + ' menjadi ' + nn); ing.name = nn; }
    if (minStock !== undefined) { ing.minStock = minStock > 0 ? minStock : 0; ch.push('stok minimum ' + (ing.minStock || 'dihapus')); }
    if (density !== undefined) { ing.density = density > 0 ? density : null; ch.push('densitas ' + (ing.density || 'dihapus')); }
    if (pack !== undefined) { ing.packSize = pack > 0 ? pack : null; ch.push(ing.packSize ? 'isi ' + CC.packText(ing) + ' per pcs' : 'isi kemasan dihapus'); }
    return 'Bahan diubah: ' + ch.join(', ') + '.';
  });

  /* ---------- homemade ---------- */
  /* ratios: {cair, kental, thick} dalam desimal (0,9 = 90%) atau persen (90). */
  function readRatios(r, errors) {
    if (r === undefined) return undefined;
    if (!r || typeof r !== 'object' || Array.isArray(r)) { errors.push('ratios harus objek {cair, kental, thick}.'); return undefined; }
    var out = {};
    ['cair', 'kental', 'thick'].forEach(function (k) {
      if (r[k] === undefined || r[k] === null || r[k] === '') return;
      var v = numv(r[k]); if (v > 1.5) v = v / 100;
      if (!(v > 0 && v <= 1.5)) errors.push('ratios.' + k + ' tidak wajar.'); else out[k] = Math.round(v * 1000) / 1000;
    });
    return out;
  }
  reg('homemade_buat', false, function (a, errors, dry) {
    var name = txt(a.name, 60), base = a.base, yq = numv(a.yieldQty), note = txt(a.note, 200), density = numv(a.density);
    if (!name) errors.push('Nama kosong.'); else if (nameTaken(name)) errors.push('Sudah ada bahan bernama ' + name + ' di Bank of Goods.');
    if (base !== 'g' && base !== 'ml') errors.push('base homemade harus g atau ml.');
    if (!(yq > 0)) errors.push('yieldQty (hasil jadi dalam satuan dasar) harus lebih dari 0.');
    var rl = resolveLines(a.lines, errors), ratios = readRatios(a.ratios, errors);
    if (errors.length || dry) return;
    var made = makeNews(rl.news), hid = uid('h'), iid = uid('i');
    var hm = { id: hid, name: name, base: base, yieldQty: yq, density: density > 0 ? density : null, note: note, ingId: iid, ratios: ratios || {}, lines: rl.items.map(function (it) { return { id: uid('hl'), ingId: ingOf(it, made).id, qty: it.qty, unit: it.unit }; }) };
    S().homemades.push(hm);
    S().ingredients.push({ id: iid, name: name, base: base, density: hm.density, purchases: [], homemadeId: hid });
    return 'Bahan homemade ' + name + ' dibuat: ' + rl.items.length + ' bahan, hasil jadi ' + yq + ' ' + UNITS[base].label + '.' + (rl.news.length ? ' Bahan baru: ' + rl.news.map(function (n) { return n.name; }).join(', ') + '.' : '') + noPrice(rl.items, made);
  });
  reg('homemade_ubah', false, function (a, errors, dry) {
    var hm = hmRef(a); if (!hm) { errors.push('Bahan homemade tidak ditemukan.'); return; }
    var nn = a.newName != null ? txt(a.newName, 60) : null, yq = a.yieldQty !== undefined ? numv(a.yieldQty) : undefined, density = a.density !== undefined ? numv(a.density) : undefined, rl = null;
    if (nn != null) { if (!nn) errors.push('newName kosong.'); else if (nameTaken(nn, hm.ingId)) errors.push('Sudah ada bahan bernama ' + nn + '.'); }
    if (yq !== undefined && !(yq > 0)) errors.push('yieldQty harus lebih dari 0.');
    if (density != null && !(density > 0)) errors.push('density harus lebih dari 0.');
    if (a.lines !== undefined) rl = resolveLines(a.lines, errors, { hm: hm });
    var ratios = readRatios(a.ratios, errors);
    if (nn == null && yq === undefined && density === undefined && a.note === undefined && !rl && !ratios) errors.push('Tidak ada yang diubah (newName, yieldQty, density, note, lines, ratios).');
    if (errors.length || dry) return;
    var ch = [], ing = CC.ingById(hm.ingId);
    if (nn != null) { ch.push('nama menjadi ' + nn); hm.name = nn; if (ing) ing.name = nn; }
    if (yq !== undefined) { hm.yieldQty = yq; ch.push('hasil jadi ' + yq + ' ' + UNITS[hm.base].label); }
    if (density !== undefined) { hm.density = density > 0 ? density : null; if (ing) ing.density = hm.density; ch.push('densitas'); }
    if (a.note !== undefined) { hm.note = txt(a.note, 200); ch.push('catatan'); }
    if (ratios) { hm.ratios = hm.ratios || {}; Object.keys(ratios).forEach(function (k) { hm.ratios[k] = ratios[k]; }); ch.push('rasio ' + Object.keys(ratios).map(function (k) { return k + ' ' + Math.round(ratios[k] * 1000) / 10 + '%'; }).join(', ')); }
    var made = {};
    if (rl) { made = makeNews(rl.news); hm.lines = rl.items.map(function (it) { return { id: uid('hl'), ingId: ingOf(it, made).id, qty: it.qty, unit: it.unit }; }); ch.push('resep diganti (' + hm.lines.length + ' bahan)'); }
    return 'Homemade ' + hm.name + ' diubah: ' + ch.join(', ') + '.' + (rl ? noPrice(rl.items, made) : '');
  });

  /* ---------- menu ---------- */
  function menuFields(a, errors, m) {
    var f = {};
    [['price', 'harga jual'], ['targetMargin', 'targetMargin'], ['loss', 'loss'], ['shelfDays', 'shelfDays']].forEach(function (p) {
      if (a[p[0]] === undefined) return;
      var v = numv(a[p[0]]);
      if (a[p[0]] !== null && v == null) { errors.push(p[1] + ' bukan angka.'); return; }
      if (v != null && v < 0) { errors.push(p[1] + ' tidak boleh negatif.'); return; }
      if ((p[0] === 'targetMargin' || p[0] === 'loss') && v != null && v > 100) { errors.push(p[0] + ' maksimal 100 (persen).'); return; }
      f[p[0]] = v == null ? null : (p[0] === 'shelfDays' ? Math.round(v) : v);
    });
    return f;
  }
  reg('menu_buat', false, function (a, errors, dry) {
    var name = txt(a.name, 60);
    if (!name) errors.push('Nama menu kosong.'); else if (byName(S().menus, name)) errors.push('Sudah ada menu bernama ' + name + '.');
    var f = menuFields(a, errors), rl = resolveLines(a.lines, errors, { sections: ['rtd', 'cart'] });
    if (errors.length || dry) return;
    var made = makeNews(rl.news);
    var m = { id: uid('m'), name: name, price: null, targetMargin: null, loss: 0, shelfDays: null, lines: [] };
    Object.keys(f).forEach(function (k) { m[k] = f[k]; });
    if (m.loss == null) m.loss = 0;
    m.lines = rl.items.map(function (it) { return { id: uid('l'), section: it.section, ingId: ingOf(it, made).id, qty: it.qty, unit: it.unit }; });
    S().menus.push(m); if (!S().activeMenu) S().activeMenu = m.id;
    var c = CC.calcMenu(m);
    return 'Menu ' + name + ' dibuat dengan ' + m.lines.length + ' bahan. COGS per cup ' + (c.cogs != null ? rp(c.cogs) : 'belum lengkap') + '.' + noPrice(rl.items, made);
  });
  reg('menu_ubah', false, function (a, errors, dry) {
    var m = menuRef(a); if (!m) { errors.push('Menu tidak ditemukan.'); return; }
    var nn = a.newName != null ? txt(a.newName, 60) : null, f = menuFields(a, errors, m), rl = null;
    if (nn != null) { if (!nn) errors.push('newName kosong.'); else if (S().menus.some(function (x) { return x.id !== m.id && x.name.toLowerCase() === nn.toLowerCase(); })) errors.push('Sudah ada menu bernama ' + nn + '.'); }
    if (a.lines !== undefined) rl = resolveLines(a.lines, errors, { sections: ['rtd', 'cart'] });
    if (nn == null && !Object.keys(f).length && !rl) errors.push('Tidak ada yang diubah (newName, price, targetMargin, loss, shelfDays, lines).');
    if (errors.length || dry) return;
    var ch = [], made = {};
    if (nn != null) { ch.push('nama menjadi ' + nn); m.name = nn; }
    Object.keys(f).forEach(function (k) { m[k] = f[k]; ch.push(k + ' ' + (f[k] == null ? 'dikosongkan' : f[k])); });
    if (rl) { made = makeNews(rl.news); m.lines = rl.items.map(function (it) { return { id: uid('l'), section: it.section, ingId: ingOf(it, made).id, qty: it.qty, unit: it.unit }; }); ch.push('resep diganti (' + m.lines.length + ' bahan)'); }
    var c = CC.calcMenu(m);
    return 'Menu ' + m.name + ' diubah: ' + ch.join(', ') + '. COGS per cup ' + (c.cogs != null ? rp(c.cogs) : 'belum lengkap') + '.' + (rl ? noPrice(rl.items, made) : '');
  });

  /* ---------- stok opname ---------- */
  reg('stok_opname', true, function (a, errors, dry) {
    var items = Array.isArray(a.items) ? a.items : [];
    if (!items.length) { errors.push('items kosong.'); return; }
    var L = CC.ledger(), plan = [];
    items.forEach(function (r, k) {
      r = r || {}; var tag = 'Item ' + (k + 1) + ': ', ing = ingRef(r), q = numv(r.counted), u = r.unit;
      if (!ing) { errors.push(tag + 'bahan tidak ditemukan.'); return; }
      if (!(q >= 0)) { errors.push(tag + 'hasil hitung (counted) belum terbaca.'); return; }
      var b = CC.toBase(ing, q, u); if (!UNITS[u] || b == null) { errors.push(tag + 'satuan tidak cocok dengan ' + ing.name + '.'); return; }
      plan.push({ ing: ing, counted: b, delta: b - L[ing.id].balance });
    });
    if (errors.length || dry) return;
    var n = 0, out = [];
    plan.forEach(function (p) {
      if (Math.abs(p.delta) < 1e-9) return;
      S().stockAdj.push({ id: uid('a'), date: a.date, ingId: p.ing.id, counted: p.counted, delta: p.delta }); n++;
      out.push(p.ing.name + ' ' + (p.delta > 0 ? '+' : '') + Math.round(p.delta * 100) / 100 + ' ' + UNITS[p.ing.base].label);
    });
    return n ? 'Stok opname ' + fmtDate(a.date) + ': ' + n + ' bahan dikoreksi (' + out.join(', ') + ').' : 'Stok opname ' + fmtDate(a.date) + ': semua hasil hitung cocok dengan saldo.';
  });

  /* ---------- produksi, pengiriman, pembuangan, cart ---------- */
  reg('produksi', true, function (a, errors, dry) {
    var m = menuRef(a), cups = numv(a.cups), exp = isoOr(a.expiry, null), code = txt(a.code, 40);
    if (!m) { errors.push('Menu tidak ditemukan.'); return; }
    if (!(cups > 0)) errors.push('cups harus lebih dari 0.');
    if (a.expiry != null && a.expiry !== '' && !exp) errors.push('expiry bukan tanggal YYYY-MM-DD.');
    if (!exp && m.shelfDays > 0) exp = CC.addDays(a.date, m.shelfDays);
    if (!exp) errors.push('Tanggal expired kosong dan menu belum punya umur simpan (shelfDays). Kirim expiry atau isi shelfDays di menu.');
    else if (exp < a.date) errors.push('expiry tidak boleh sebelum tanggal produksi.');
    if (!code) code = CC.genCode(a.date, m.id);
    if (S().batches.some(function (b) { return b.code === code; })) errors.push('Kode batch ' + code + ' sudah dipakai.');
    if (errors.length || dry) return;
    var c = CC.calcMenu(m);
    S().batches.push({ id: uid('b'), date: a.date, menuId: m.id, cups: cups, expiry: exp, code: code, note: txt(a.note, 200), costPerCup: c.rtd + c.rtdLoss, usage: CC.usageForBatch(m, cups) });
    return 'Batch ' + code + ' dicatat: ' + m.name + ' ' + cups + ' cup, expired ' + fmtDate(exp) + '. Bahan terpakai dikurangi dari stok.';
  });
  reg('pengiriman', true, function (a, errors, dry) {
    var st = S(), cart = a.cartId ? st.carts.filter(function (c) { return c.id === a.cartId; })[0] : st.carts[0], type = a.type || 'awal', lines = [];
    if (!cart) { errors.push('Cart tidak ditemukan.'); return; }
    if (type !== 'awal' && type !== 'tambahan') errors.push('type harus awal atau tambahan.');
    (Array.isArray(a.lines) ? a.lines : []).forEach(function (l, k) {
      l = l || {}; var m = menuRef(l), q = numv(l.qty);
      if (!m) { errors.push('Baris ' + (k + 1) + ': menu tidak ditemukan.'); return; }
      if (!(q > 0)) { errors.push('Baris ' + (k + 1) + ': qty harus lebih dari 0.'); return; }
      lines.push({ menuId: m.id, qty: q });
    });
    if (!lines.length && !errors.length) errors.push('lines kosong.');
    var time = a.time ? String(a.time) : ''; if (time && !/^\d{2}:\d{2}$/.test(time)) errors.push('time harus HH:MM.');
    if (errors.length) return;
    var cand = { id: uid('s'), date: a.date, cartId: cart.id, type: type, time: time, lines: lines, note: txt(a.note, 200) };
    var sim = CC.simulate({ batches: st.batches, writeoffs: st.writeoffs, recaps: st.recaps, shipments: st.shipments.concat([cand]) });
    var short = sim.shortages.filter(function (x) { return x.shipId === cand.id; });
    if (short.length) { errors.push('Stok central tidak cukup: ' + short.map(function (x) { return CC.menuName(x.menuId) + ' kurang ' + x.qty + ' cup'; }).join(', ') + '. Cup yang sudah expired atau diproduksi setelah tanggal ini tidak dihitung.'); return; }
    if (dry) return;
    st.shipments.push(cand);
    return 'Pengiriman ' + fmtDate(a.date) + ' ke ' + cart.name + ' (' + type + ') dicatat: ' + lines.map(function (l) { return CC.menuName(l.menuId) + ' ' + l.qty; }).join(', ') + ' cup.';
  });
  reg('pembuangan', true, function (a, errors, dry) {
    var st = S(), b = (a.batchId && st.batches.filter(function (x) { return x.id === a.batchId; })[0]) || (a.batchCode && st.batches.filter(function (x) { return x.code === a.batchCode; })[0]);
    var q = numv(a.qty), why = a.reason || 'Lainnya';
    if (!b) { errors.push('Batch tidak ditemukan (kirim batchId atau batchCode).'); return; }
    if (['Expired', 'Rusak', 'Tumpah', 'Lainnya'].indexOf(why) < 0) errors.push('reason harus Expired, Rusak, Tumpah, atau Lainnya.');
    var left = CC.simulate(st).stock[b.id] || 0;
    if (!(q > 0)) errors.push('qty harus lebih dari 0.'); else if (q > left) errors.push('qty melebihi stok batch ' + b.code + ' (' + left + ' cup).');
    if (errors.length || dry) return;
    st.writeoffs.push({ id: uid('w'), date: a.date, batchId: b.id, qty: q, reason: why });
    return 'Batch ' + b.code + ': ' + q + ' cup dibuang (' + why + ', ' + fmtDate(a.date) + ').';
  });
  reg('cart_buat', false, function (a, errors, dry) {
    var name = txt(a.name, 40), oc = a.openingCash === undefined ? null : numv(a.openingCash);
    if (!name) errors.push('Nama cart kosong.'); else if (byName(S().carts, name)) errors.push('Sudah ada cart bernama ' + name + '.');
    if (oc != null && oc < 0) errors.push('openingCash tidak boleh negatif.');
    if (errors.length || dry) return;
    S().carts.push({ id: uid('c'), name: name, openingCash: oc });
    return 'Cart ' + name + ' dibuat.';
  });
  reg('pengingat_selesai', false, function (a, errors, dry) {
    var r = S().reminders.filter(function (x) { return x.id === a.id; })[0];
    if (!r) { errors.push('Pengingat tidak ditemukan.'); return; }
    if (dry) return; r.done = true; return 'Pengingat "' + r.text + '" ditandai selesai.';
  });

  /* ---------- hapus ---------- */
  function has(list, key, id) { return (list || []).some(function (x) { return x[key] === id; }); }
  reg('hapus', false, function (a, errors, dry) {
    var st = S(), k = a.kind, id = String(a.id || ''), msg = '';
    if (!id && k !== 'bahan' && k !== 'menu' && k !== 'homemade') { errors.push('id kosong.'); return; }
    if (k === 'bahan') {
      var ing = ingRef({ ingId: id, name: a.name }); if (!ing) { errors.push('Bahan tidak ditemukan.'); return; }
      if (ing.homemadeId) { errors.push('Bahan ' + ing.name + ' hasil masak. Hapus dengan kind homemade.'); return; }
      var hu = (st.homemades || []).filter(function (h) { return h.lines.some(function (l) { return l.ingId === ing.id; }); });
      if (hu.length) { errors.push('Bahan ' + ing.name + ' dipakai resep homemade ' + hu.map(function (h) { return h.name; }).join(', ') + '. Ubah resepnya dulu (homemade_ubah).'); return; }
      if (dry) return;
      var mn = st.menus.filter(function (m) { return m.lines.some(function (l) { return l.ingId === ing.id; }); }).length, tn = st.trips.filter(function (t) { return t.lines.some(function (l) { return l.ingId === ing.id; }); }).length, an = st.stockAdj.filter(function (x) { return x.ingId === ing.id; }).length;
      st.menus.forEach(function (m) { m.lines = m.lines.filter(function (l) { return l.ingId !== ing.id; }); });
      st.trips.forEach(function (t) { t.lines = t.lines.filter(function (l) { return l.ingId !== ing.id; }); });
      st.trips = st.trips.filter(function (t) { return t.lines.length; });
      st.stockAdj = st.stockAdj.filter(function (x) { return x.ingId !== ing.id; });
      st.ingredients = st.ingredients.filter(function (i) { return i.id !== ing.id; });
      return 'Bahan ' + ing.name + ' dihapus. Ikut terhapus: baris di ' + mn + ' menu, ' + tn + ' belanja, ' + an + ' koreksi stok.';
    }
    if (k === 'menu') {
      var m = menuRef({ menuId: id, name: a.name }); if (!m) { errors.push('Menu tidak ditemukan.'); return; }
      if (st.menus.length < 2) { errors.push('Menu terakhir tidak boleh dihapus.'); return; }
      var rf = [['batches', 'produksi'], ['shipments', 'pengiriman'], ['writeoffs', 'pembuangan'], ['recaps', 'rekap']].filter(function (p) { return JSON.stringify(st[p[0]] || []).indexOf('"' + m.id + '"') > -1; }).map(function (p) { return p[1]; });
      if (rf.length) { errors.push('Menu ' + m.name + ' sudah punya catatan ' + rf.join(', ') + '. Hapus catatan itu dulu, atau biarkan menunya.'); return; }
      if (dry) return;
      st.menus = st.menus.filter(function (x) { return x.id !== m.id; }); if (st.activeMenu === m.id) st.activeMenu = st.menus[0].id;
      return 'Menu ' + m.name + ' dihapus.';
    }
    if (k === 'homemade') {
      var h = hmRef({ hmId: id, name: a.name }); if (!h) { errors.push('Bahan homemade tidak ditemukan.'); return; }
      var used = CC.usedIn(h.ingId); if (used.length) { errors.push('Homemade ' + h.name + ' dipakai di ' + used.map(function (x) { return x.name; }).join(', ') + '. Keluarkan dari resep itu dulu.'); return; }
      if (dry) return;
      st.ingredients = st.ingredients.filter(function (i) { return i.id !== h.ingId; }); st.homemades = st.homemades.filter(function (x) { return x.id !== h.id; }); st.hmBatches = st.hmBatches.filter(function (b) { return b.hmId !== h.id; });
      return 'Bahan homemade ' + h.name + ' dihapus beserta catatan masaknya.';
    }
    if (k === 'belanja') {
      var t = st.trips.filter(function (x) { return x.id === id; })[0]; if (!t) { errors.push('Belanja tidak ditemukan.'); return; }
      var stuck = [];
      t.lines.forEach(function (l) { var g = CC.ingById(l.ingId); if (g && !g.purchases.some(function (p) { return p.tripId !== id; }) && CC.refPerBase(g) == null && stuck.indexOf(g.name) < 0) stuck.push(g.name); });
      if (stuck.length) { errors.push('Bahan ' + stuck.join(', ') + ' hanya punya pembelian dari belanja ini. Catat belanja lain dulu supaya harganya tetap ada.'); return; }
      if (dry) return;
      st.ingredients.forEach(function (i) { i.purchases = i.purchases.filter(function (p) { return p.tripId !== id; }); });
      st.trips = st.trips.filter(function (x) { return x.id !== id; });
      return 'Belanja ' + fmtDate(t.date) + ' dihapus. Harga bahan kembali ke pembelian sebelumnya.';
    }
    if (k === 'koreksi') { if (!has(st.stockAdj, 'id', id)) { errors.push('Koreksi stok tidak ditemukan.'); return; } if (dry) return; st.stockAdj = st.stockAdj.filter(function (x) { return x.id !== id; }); return 'Koreksi stok dibatalkan.'; }
    if (k === 'pengingat') { if (!has(st.reminders, 'id', id)) { errors.push('Pengingat tidak ditemukan.'); return; } if (dry) return; st.reminders = st.reminders.filter(function (x) { return x.id !== id; }); return 'Pengingat dihapus.'; }
    if (k === 'rekap') { var r = st.recaps.filter(function (x) { return x.id === id; })[0]; if (!r) { errors.push('Rekap tidak ditemukan.'); return; } if (dry) return; st.recaps = st.recaps.filter(function (x) { return x.id !== id; }); return 'Rekap ' + fmtDate(r.date) + ' dihapus.'; }
    if (k === 'pengiriman') { var s = st.shipments.filter(function (x) { return x.id === id; })[0]; if (!s) { errors.push('Pengiriman tidak ditemukan.'); return; } if (dry) return; st.shipments = st.shipments.filter(function (x) { return x.id !== id; }); return 'Pengiriman ' + fmtDate(s.date) + ' dihapus.'; }
    if (k === 'pembuangan') { if (!has(st.writeoffs, 'id', id)) { errors.push('Pembuangan tidak ditemukan.'); return; } if (dry) return; st.writeoffs = st.writeoffs.filter(function (x) { return x.id !== id; }); return 'Catatan pembuangan dihapus.'; }
    if (k === 'cart') {
      var c = st.carts.filter(function (x) { return x.id === id; })[0]; if (!c) { errors.push('Cart tidak ditemukan.'); return; }
      if (st.carts.length < 2) { errors.push('Cart terakhir tidak boleh dihapus.'); return; }
      if (has(st.shipments, 'cartId', id) || has(st.recaps, 'cartId', id)) { errors.push('Cart ' + c.name + ' sudah punya pengiriman atau rekap.'); return; }
      if (dry) return; st.carts = st.carts.filter(function (x) { return x.id !== id; }); return 'Cart ' + c.name + ' dihapus.';
    }
    errors.push('kind hapus tidak dikenal: ' + k + '. Pilihan: bahan, menu, homemade, belanja, koreksi, pengingat, rekap, pengiriman, pembuangan, cart.');
  });
})();
