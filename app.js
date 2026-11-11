(() => {
  const API = window.NOPA_API;
  const SETIAP = 2 * 60 * 1000;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('id-ID') : n ?? '—');
  const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const tgl = (iso) => { if (!iso) return '—'; const [, m, d] = String(iso).slice(0, 10).split('-'); return (+d) + ' ' + BULAN[+m - 1]; };
  const hariIni = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const simpan = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
    del: (k) => { try { localStorage.removeItem(k); } catch {} },
  };
  const el = (tag, txt, cls) => { const e = document.createElement(tag); if (txt != null) e.textContent = txt; if (cls) e.className = cls; return e; };

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  let timer = null, terakhir = 0, sibuk = false;

  async function ambil(pin) {
    const res = await fetch(API, { headers: { 'x-pin': pin }, cache: 'no-store' });
    if (res.status === 401) { const e = new Error('PIN salah'); e.pin = true; throw e; }
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) throw new Error(body.error || ('Server menjawab ' + res.status));
    return body;
  }

  function status(teks, online) {
    $('status').textContent = teks;
    $('titik').classList.toggle('off', !online);
  }

  async function perbarui() {
    const pin = simpan.get('nopa_pin');
    if (!pin || sibuk) return;
    sibuk = true; $('tombol-perbarui').disabled = true; $('tombol-perbarui').textContent = 'Memuat…';
    try {
      const data = await ambil(pin);
      simpan.set('nopa_data', JSON.stringify(data));
      gambar(data);
      terakhir = Date.now();
      status('Diperbarui ' + new Date(Date.now() + 7 * 3600e3).toISOString().slice(11, 16) + ' WIB', true);
    } catch (e) {
      if (e.pin) { simpan.del('nopa_pin'); tampilPin('PIN sudah diganti. Masukkan PIN baru.'); return; }
      status(navigator.onLine ? 'Gagal memuat, coba lagi' : 'Tidak ada internet, menampilkan data terakhir', false);
    } finally {
      sibuk = false; $('tombol-perbarui').disabled = false; $('tombol-perbarui').textContent = 'Perbarui';
    }
  }

  function gambar(d) {
    const r = d.ringkasan || {};
    document.querySelectorAll('[data-k]').forEach((e) => { e.textContent = fmt(r[e.dataset.k]); });
    const g = $('kartu-gagal'); g.classList.toggle('bad', r.email_gagal_7h > 0); g.classList.toggle('good', r.email_gagal_7h === 0);
    grafik(d.email_harian || []);

    $('t-brevo').replaceChildren(...(d.brevo || []).map((b) => {
      const tr = el('tr'); const td = el('td', b.akun);
      const q = el('div', null, 'q'); const i = el('i'); const p = b.batas_harian ? Math.min(1, b.terkirim_hari_ini / b.batas_harian) : 0;
      i.style.width = p * 100 + '%'; if (p >= 0.9) i.style.background = 'var(--bad)'; q.append(i); td.append(q);
      tr.append(td, el('td', fmt(b.terkirim_hari_ini), 'r'), el('td', fmt(b.batas_harian), 'r')); return tr;
    }));

    $('t-kirim').replaceChildren(...(d.pengiriman || []).map((p) => {
      const [t, j] = String(p.waktu || '').split(' ');
      const tr = el('tr'); const tdM = el('td'); tdM.append(el('span', p.mode === 'asli' ? 'Pelanggan' : 'Uji', 'pill' + (p.mode === 'asli' ? ' ok' : '')));
      tr.append(el('td', tgl(t) + ' ' + (j || '')), tdM, el('td', fmt(p.tender), 'r'), el('td', fmt(p.terkirim), 'r'), el('td', fmt(p.gagal), 'r')); return tr;
    }));

    const hi = hariIni(), besok = new Date(Date.parse(hi + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10);
    $('t-tender').replaceChildren(...(d.tender || []).map((t) => {
      const tr = el('tr'); const tdJ = el('td');
      if (/^https?:\/\//i.test(t.link || '')) { const a = el('a', t.judul); a.href = t.link; a.target = '_blank'; a.rel = 'noopener noreferrer'; tdJ.append(a); } else tdJ.append(el('span', t.judul));
      tdJ.append(el('div', t.sumber, 'muted'));
      const tdB = el('td', null, 'r');
      if (t.batas) tdB.append(el('span', t.batas === hi ? 'Hari ini' : t.batas === besok ? 'Besok' : tgl(t.batas), t.batas <= besok ? 'pill warn' : ''));
      else tdB.textContent = '—';
      tr.append(tdJ, tdB); return tr;
    }));

    $('t-sumber').replaceChildren(...(d.per_sumber || []).map((s) => {
      const tr = el('tr'); tr.append(el('td', s.sumber), el('td', fmt(s.menunggu), 'r'), el('td', fmt(s.baru_7h), 'r'), el('td', fmt(s.total), 'r')); return tr;
    }));
  }

  function grafik(rows) {
    const box = $('grafik'); const NS = 'http://www.w3.org/2000/svg';
    const keys = ['tender', 'akuisisi', 'konfirmasi', 'kampanye']; const nama = ['Tender', 'Akuisisi', 'Konfirmasi', 'Kampanye'];
    const end = Date.parse(hariIni() + 'T00:00:00Z');
    const days = []; for (let i = 29; i >= 0; i--) days.push(new Date(end - i * 864e5).toISOString().slice(0, 10));
    const by = new Map(days.map((h) => [h, {hari: h, tender: 0, akuisisi: 0, konfirmasi: 0, kampanye: 0}]));
    rows.forEach((r) => { const o = by.get(r.hari); if (o && keys.includes(r.jenis)) o[r.jenis] += +r.terkirim || 0; });
    const data = [...by.values()]; const tot = (o) => keys.reduce((s, k) => s + o[k], 0);
    const W = Math.max(280, box.clientWidth || 600), H = 210, mt = 8, mb = 22;
    const mx = Math.max(1, ...data.map(tot));
    const kasar = Math.pow(10, Math.floor(Math.log10(mx))); const stepY = [1, 2, 5, 10].map((m) => m * kasar).find((s) => mx / s <= 5);
    const top = Math.ceil(mx / stepY) * stepY;
    const ml = String(top.toLocaleString('id-ID')).length * 6.5 + 8;
    const y = (v) => H - mb - (v / top) * (H - mb - mt);
    const bw = (W - ml - 4) / days.length;
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Grafik batang email terkirim per hari selama 30 hari terakhir');
    const add = (tag, at, txt) => { const n = document.createElementNS(NS, tag); for (const k in at) n.setAttribute(k, at[k]); if (txt != null) n.textContent = txt; svg.append(n); return n; };
    for (let v = 0; v <= top; v += stepY) {
      add('line', {x1: ml, x2: W - 4, y1: y(v), y2: y(v), stroke: 'var(--grid)'});
      add('text', {x: ml - 6, y: y(v) + 4, 'text-anchor': 'end'}, v.toLocaleString('id-ID'));
    }
    const step = W < 450 ? 10 : 5;
    data.forEach((o, i) => {
      const x = ml + i * bw; let acc = 0;
      keys.forEach((k, ki) => { if (!o[k]) return; add('rect', {x: x + bw * 0.15, width: bw * 0.7, y: y(acc + o[k]), height: Math.max(0.8, y(acc) - y(acc + o[k])), fill: `var(--c${ki})`, rx: 1.5}); acc += o[k]; });
      if ((days.length - 1 - i) % step === 0) add('text', i === days.length - 1 ? {x: W - 4, y: H - 6, 'text-anchor': 'end'} : {x: x + bw / 2, y: H - 6, 'text-anchor': 'middle'}, tgl(o.hari));
    });
    const tip = el('div', null, 'tip'); tip.hidden = true;
    data.forEach((o, i) => {
      const hit = add('rect', {x: ml + i * bw, y: mt, width: bw, height: H - mb - mt, fill: 'transparent'});
      const show = () => {
        tip.replaceChildren(el('div', tgl(o.hari) + ' · ' + fmt(tot(o)) + ' email', 't'), ...keys.map((k, ki) => o[k] ? (() => { const r = el('div'); r.append(el('span', nama[ki]), el('span', fmt(o[k]))); return r; })() : null).filter(Boolean));
        tip.hidden = false;
        const sc = box.clientWidth / W, cx = (ml + i * bw + bw / 2) * sc;
        tip.style.left = Math.min(Math.max(0, cx - tip.offsetWidth / 2), box.clientWidth - tip.offsetWidth) + 'px';
        tip.style.top = Math.max(0, y(tot(o)) * sc - tip.offsetHeight - 8) + 'px';
      };
      hit.addEventListener('pointerenter', show); hit.addEventListener('pointerdown', show);
      hit.addEventListener('pointerleave', () => { tip.hidden = true; });
    });
    box.replaceChildren(svg, tip);
  }

  function mulai() {
    $('layar-pin').hidden = true; $('aplikasi').hidden = false;
    const lama = simpan.get('nopa_data');
    if (lama) { try { gambar(JSON.parse(lama)); status('Menampilkan data terakhir…', true); } catch {} }
    perbarui();
    clearInterval(timer);
    timer = setInterval(() => { if (document.visibilityState === 'visible') perbarui(); }, SETIAP);
  }

  function tampilPin(pesan) {
    clearInterval(timer);
    $('aplikasi').hidden = true; $('layar-pin').hidden = false;
    $('pesan-pin').textContent = pesan || ''; $('input-pin').value = ''; $('input-pin').focus();
  }

  $('form-pin').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const pin = $('input-pin').value.trim(); if (!pin) return;
    $('tombol-pin').disabled = true; $('pesan-pin').textContent = '';
    try {
      const data = await ambil(pin);
      simpan.set('nopa_pin', pin); simpan.set('nopa_data', JSON.stringify(data)); mulai();
    } catch (e) {
      $('pesan-pin').textContent = e.pin ? 'PIN salah. Coba lagi.' : 'Tidak bisa terhubung. Periksa internet Anda.';
    } finally { $('tombol-pin').disabled = false; }
  });
  $('tombol-perbarui').addEventListener('click', perbarui);
  $('keluar').addEventListener('click', (ev) => { ev.preventDefault(); simpan.del('nopa_pin'); simpan.del('nopa_data'); tampilPin(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - terakhir > SETIAP) perbarui(); });
  let lebar = window.innerWidth;
  window.addEventListener('resize', () => { if (Math.abs(window.innerWidth - lebar) < 40) return; lebar = window.innerWidth; const l = simpan.get('nopa_data'); if (l) try { grafik(JSON.parse(l).email_harian || []); } catch {} });

  simpan.get('nopa_pin') ? mulai() : tampilPin();
})();
