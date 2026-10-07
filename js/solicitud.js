/* ==========================================================================
   CONTROL DE EDIFICIOS · IES
   js/solicitud.js — Formulario público de solicitudes (tickets)
   No requiere código de acceso. Escribe únicamente en
   tableros/edificios_publico/solicitudes/{folio} (solo creación).
   ========================================================================== */
(function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mayus = s => String(s || '').trim().replace(/\s+/g, ' ').toUpperCase();
  const ESTADOS = {
    NUEVA: ['Recibida', 'Su solicitud fue recibida y está en espera de revisión.'],
    EN_REVISION: ['En revisión', 'Activos Fijos está evaluando su solicitud.'],
    EN_ATENCION: ['En atención', 'Se generó una orden de trabajo y el equipo está atendiendo su solicitud.'],
    CULMINADA: ['Trabajo culminado', 'Los trabajos se concluyeron y se entregaron con reporte firmado.'],
    RECHAZADA: ['No procede', 'La solicitud no procede.']
  };
  const MEM = 'ies_solicitante';
  let catalogo = [], db = null;

  $('#solLogo').src = LOGO_IES;
  const params = new URLSearchParams(location.search);

  /* ---------- Conexión y catálogo ---------- */
  function catalogoBase() {
    return SEED_AREAS.map(([item, e, n, o]) => ({ id: areaIdDeItem(item), e, n, o, item }));
  }
  function ordenar(lista, ref) { return lista.sort((a, b) => { const ia = ref.indexOf(a), ib = ref.indexOf(b); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.localeCompare(b); }); }

  async function cargar() {
    try {
      firebase.apps.length || firebase.initializeApp(firebaseConfig);
      db = firebase.database();
      const snap = await Promise.race([db.ref(`${FB.publico}/catalogo`).get(), new Promise((_, r) => setTimeout(() => r(new Error('tiempo')), 8000))]);
      const v = snap.val();
      catalogo = v ? Object.keys(v).map(id => ({ id, e: v[id].e, n: v[id].n, o: v[id].o, item: Number(id.replace(/\D/g, '')) || 999 })) : catalogoBase();
    } catch (e) {
      console.warn('catálogo', e);
      catalogo = catalogoBase();
      if (!db) $('#estadoConexion').textContent = 'Sin conexión con el servidor. Podrá enviar cuando se restablezca.';
    }
    llenarEd();
    const pre = params.get('a') && catalogo.find(x => x.id === params.get('a'));
    if (pre) {
      $('#sEd').value = pre.e; llenarNiv(); $('#sNiv').value = pre.n; llenarOf(); $('#sOf').value = pre.id;
      $('#prellenado').hidden = false; $('#prellenado').textContent = `Ubicación precargada: ${pre.o} (${pre.e}, ${pre.n}). Puede cambiarla si lo requiere.`;
    }
    $('#btnEnviar').disabled = false;
  }

  function llenarEd() {
    const eds = ordenar([...new Set(catalogo.map(x => x.e))], EDIFICIOS_ORDEN);
    $('#sEd').innerHTML = '<option value="">Seleccione el edificio</option>' + eds.map(e => `<option>${esc(e)}</option>`).join('');
    llenarNiv();
  }
  function llenarNiv() {
    const ed = $('#sEd').value;
    const nv = ordenar([...new Set(catalogo.filter(x => x.e === ed).map(x => x.n))], NIVELES_ORDEN);
    $('#sNiv').innerHTML = `<option value="">${ed ? 'Seleccione el nivel' : 'Primero elija el edificio'}</option>` + nv.map(n => `<option>${esc(n)}</option>`).join('');
    $('#sNiv').disabled = !ed;
    llenarOf();
  }
  function llenarOf() {
    const ed = $('#sEd').value, nv = $('#sNiv').value;
    const of = catalogo.filter(x => x.e === ed && x.n === nv).sort((a, b) => a.item - b.item);
    $('#sOf').innerHTML = `<option value="">${nv ? 'Seleccione la oficina' : 'Primero elija el nivel'}</option>` + of.map(o => `<option value="${esc(o.id)}">${esc(o.o)}</option>`).join('');
    $('#sOf').disabled = !nv;
  }
  $('#sEd').onchange = llenarNiv;
  $('#sNiv').onchange = llenarOf;
  $('#sCat').innerHTML = '<option value="">No sé o no aplica</option>' + CATEGORIAS.map(c => `<option>${esc(c)}</option>`).join('');

  // Datos del solicitante recordados en este dispositivo
  try {
    const m = JSON.parse(localStorage.getItem(MEM) || 'null');
    if (m) { $('#sNom').value = m.n || ''; $('#sCor').value = m.c || ''; $('#sTel').value = m.t || ''; }
  } catch (e) {}

  /* ---------- Validación y envío ---------- */
  function validar() {
    const err = [];
    const marca = (id, ok) => { $(id).classList.toggle('err', !ok); if (!ok) err.push(id); };
    marca('#sNom', mayus($('#sNom').value).length >= 3);
    marca('#sCor', /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test($('#sCor').value.trim()));
    marca('#sTel', $('#sTel').value.replace(/\D/g, '').length >= 10);
    marca('#sEd', !!$('#sEd').value); marca('#sNiv', !!$('#sNiv').value); marca('#sOf', !!$('#sOf').value);
    marca('#sDesc', $('#sDesc').value.trim().length >= 10);
    return err;
  }

  async function reservarFolio() {
    const d = new Date(), dia = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    try {
      const r = await Promise.race([db.ref(`${FB.publico}/contadores/SOL/${dia}`).transaction(n => (Number(n) || 0) + 1), new Promise((_, rj) => setTimeout(() => rj(new Error('tiempo')), 9000))]);
      if (r.committed) return `SOL-${dia}-${String(r.snapshot.val()).padStart(3, '0')}`;
    } catch (e) { console.warn('folio', e); }
    return `SOL-${dia}-T${Date.now().toString(36).slice(-5).toUpperCase()}`;
  }

  $('#formSol').addEventListener('submit', async e => {
    e.preventDefault();
    const err = validar();
    if (err.length) {
      $('#formErr').textContent = 'Revise los campos marcados en rojo. La descripción debe tener al menos 10 caracteres y el teléfono 10 dígitos.';
      $(err[0]).focus(); return;
    }
    $('#formErr').textContent = '';
    if (!db) { $('#formErr').textContent = 'No hay conexión con el servidor. Intente de nuevo en unos momentos.'; return; }
    const btn = $('#btnEnviar'); btn.disabled = true; btn.textContent = 'Enviando…';
    const area = catalogo.find(x => x.id === $('#sOf').value);
    const datos = {
      solicitante: mayus($('#sNom').value).slice(0, 120), correo: $('#sCor').value.trim().toLowerCase().slice(0, 120),
      telefono: $('#sTel').value.trim().slice(0, 30), areaId: area.id, edificio: area.e, nivel: area.n, oficina: area.o,
      categoria: $('#sCat').value, descripcion: $('#sDesc').value.trim().slice(0, 1500),
      ts: firebase.database.ServerValue.TIMESTAMP, tsCliente: new Date().toISOString(), origen: 'formulario'
    };
    try {
      let folio = null;
      for (let i = 0; i < 4 && !folio; i++) {
        const f = await reservarFolio();
        const r = await db.ref(`${FB.publico}/solicitudes/${f}`).transaction(cur => cur === null ? Object.assign({ folio: f }, datos) : undefined);
        if (r.committed) folio = f;
      }
      if (!folio) throw new Error('No se pudo asignar un folio. Intente de nuevo.');
      try { localStorage.setItem(MEM, JSON.stringify({ n: datos.solicitante, c: datos.correo, t: datos.telefono })); } catch (er) {}
      mostrarExito(folio, datos);
    } catch (er) {
      console.error(er);
      $('#formErr').textContent = er.code === 'PERMISSION_DENIED' ? 'El servidor rechazó la solicitud (permisos). Avise a Activos Fijos.' : 'No se pudo enviar: ' + er.message;
    } finally { btn.disabled = false; btn.textContent = 'Enviar solicitud'; }
  });

  function mostrarExito(folio, d) {
    $('#vistaForm').hidden = true; $('#vistaOk').hidden = false;
    $('#okFolio').textContent = folio;
    $('#okResumen').innerHTML = `<dt>Solicitante</dt><dd>${esc(d.solicitante)}</dd><dt>Ubicación</dt><dd>${esc(d.oficina)}<br><span class="muted">${esc(d.edificio)}, ${esc(d.nivel)}</span></dd>
      <dt>Categoría</dt><dd>${esc(d.categoria || 'Sin especificar')}</dd><dt>Descripción</dt><dd>${esc(d.descripcion)}</dd>`;
    $('#cFolio').value = folio;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  $('#okCopiar').onclick = async () => { try { await navigator.clipboard.writeText($('#okFolio').textContent); $('#okCopiar').textContent = 'Folio copiado'; } catch (e) {} };
  $('#okOtra').onclick = () => {
    $('#vistaOk').hidden = true; $('#vistaForm').hidden = false;
    $('#sDesc').value = ''; $('#sCat').value = '';
    $('#okCopiar').textContent = 'Copiar folio';
  };

  /* ---------- Consulta de estatus ---------- */
  $('#formConsulta').addEventListener('submit', async e => {
    e.preventDefault();
    const f = $('#cFolio').value.trim().toUpperCase();
    const out = $('#cResultado');
    if (!/^SOL-\d{8}-[A-Z0-9]+$/.test(f)) { out.innerHTML = '<p class="txt-rojo">Escriba el folio completo, por ejemplo SOL-20261007-001.</p>'; return; }
    if (!db) { out.innerHTML = '<p class="txt-rojo">Sin conexión con el servidor.</p>'; return; }
    out.innerHTML = '<p class="muted">Consultando…</p>';
    try {
      const s = (await db.ref(`${FB.publico}/solicitudes/${f}`).get()).val();
      if (!s) { out.innerHTML = '<p class="txt-rojo">No existe una solicitud con ese folio.</p>'; return; }
      const g = s.gestion || {}, e2 = ESTADOS[g.estado || 'NUEVA'] || ESTADOS.NUEVA;
      const fh = v => v ? new Date(v).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
      out.innerHTML = `<div class="estado-card est-${(g.estado || 'NUEVA').toLowerCase()}">
        <div class="estado-t">${esc(e2[0])}</div><p>${esc(e2[1])}${g.estado === 'RECHAZADA' && g.motivo ? ' Motivo: ' + esc(g.motivo) : ''}</p>
        <dl><dt>Folio</dt><dd>${esc(f)}</dd><dt>Ubicación</dt><dd>${esc(s.oficina)}</dd><dt>Recibida</dt><dd>${fh(s.ts || s.tsCliente)}</dd>
        ${g.otFolio ? `<dt>Orden de trabajo</dt><dd>${esc(g.otFolio)}</dd>` : ''}${g.fechaCulminacion ? `<dt>Culminación</dt><dd>${fh(g.fechaCulminacion)}</dd>` : ''}
        ${g.actualizado ? `<dt>Última actualización</dt><dd>${fh(g.actualizado)}</dd>` : ''}</dl></div>`;
    } catch (er) { out.innerHTML = `<p class="txt-rojo">No se pudo consultar: ${esc(er.message)}</p>`; }
  });

  cargar();
})();
