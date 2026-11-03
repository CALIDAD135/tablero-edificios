/* ==========================================================================
   CONTROL DE EDIFICIOS · IES
   js/mod-activos.js — Módulo 7 (Fase 4): Inventario de activos de instalaciones
   · Alta individual o múltiple con folio permanente por clase (AF-CLI-0001).
   · Fotografías (vista general, placa de datos, ubicación) bajo demanda.
   · Etiqueta con código QR: al escanearla con la cámara del teléfono o desde
     «Identificar activo» se abre la ficha del activo en el tablero.
   · Movimientos trazables: alta, edición, traslado, cambio de resguardante,
     cambio de estado, verificación física, plan de mantenimiento, baja y
     reactivación (tableros/edificios/activos/{id}/movimientos/{movId}).
   · Plan de mantenimiento por activo (nodo mantenimientos con activoId) y
     órdenes de trabajo con origen «Activo».
   ========================================================================== */

ORIGEN_TXT.ACTIVO = 'Activo';   // origen de OT generadas desde la ficha del activo

const MOV_ACTIVO = {
  ALTA: 'Alta en inventario', EDICION: 'Edición de datos', TRASLADO: 'Traslado', RESGUARDO: 'Cambio de resguardante',
  ESTATUS: 'Cambio de estado', VERIFICACION: 'Verificación física', PLAN: 'Plan de mantenimiento', BAJA: 'Baja',
  REACTIVACION: 'Reactivación'
};
const MANT_ACTIVO = {
  vencido:   { l: 'Vencido',   c: 't-rojo' },
  proximo:   { l: 'Próximo',   c: 't-ambar' },
  aldia:     { l: 'Al día',    c: 't-verde' },
  concluido: { l: 'Concluido', c: 't-azul' },
  sin:       { l: 'Sin plan',  c: 't-gris' }
};

/* ==========================================================================
   Reglas del inventario
   ========================================================================== */
const Activos = {
  porId(id) { return ST.activos.find(a => a.id === id); },
  porFolio(f) { const n = norm(f); return n ? ST.activos.find(a => norm(a.folio) === n) : null; },
  vigentes() { return ST.activos.filter(a => a.estatus !== 'BAJA'); },
  clase(a) { return CLASES_ACTIVO[a && a.clase] || CLASES_ACTIVO.OTR; },
  tipos(clase) { return (CLASES_ACTIVO[clase] || CLASES_ACTIVO.OTR).tipos.map(t => typeof t === 'string' ? t : t.l); },
  /* Parámetros del subtipo: rubro, categoría de OT y periodicidad (el subtipo ajusta a la clase) */
  tipoDef(clase, tipo) {
    const c = CLASES_ACTIVO[clase] || CLASES_ACTIVO.OTR;
    const t = c.tipos.find(x => (typeof x === 'string' ? x : x.l) === tipo);
    return Object.assign({ rubro: c.rubro, cat: c.cat, per: c.per }, t && typeof t === 'object' ? t : {});
  },
  categoria(a) { const c = this.tipoDef(a.clase, a.tipo).cat; return CATEGORIAS.includes(c) ? c : ''; },
  nombre(a) { return [a.tipo, a.marca, a.modelo].filter(Boolean).join(' '); },
  ubicTxt(a) { return a.oficina ? `${a.oficina} (${tituloEdificio(a.edificio)}, ${tituloNivel(a.nivel).toLowerCase()})` : 'Sin ubicación'; },
  resguardante(a) { return (a.resguardanteId && Personas.nombre(a.resguardanteId)) || a.resguardanteNombre || ''; },
  quien() { return SESION.nombre || (ROLES[SESION.rol] || {}).label || ''; },

  /* Mantenimiento: planes vinculados por activoId */
  planes(a) { return ST.mantenimientos.filter(p => p.activoId === a.id); },
  planesActivos(a) { return this.planes(a).filter(p => p.activo !== false); },
  estadoMant(a) {
    const est = this.planesActivos(a).map(p => Mant.estado(p));
    return ['vencido', 'proximo', 'aldia', 'concluido'].find(e => est.includes(e)) || 'sin';
  },
  proxima(a) { return this.planesActivos(a).map(p => Mant.proxima(p)).filter(Boolean).sort()[0] || ''; },
  tagMant(a) { return tag(MANT_ACTIVO, this.estadoMant(a)); },

  /* Órdenes de trabajo del activo: origen directo o plan de mantenimiento vinculado */
  ots(a) {
    const planes = this.planes(a).map(p => p.id);
    return ST.ordenes.filter(o => o.origen && ((o.origen.tipo === 'ACTIVO' && o.origen.id === a.id) || (o.origen.tipo === 'MANTENIMIENTO' && planes.includes(o.origen.id))));
  },
  /* Costo de mantenimiento: OT no canceladas + ejecuciones registradas sin OT (evita duplicar) */
  costoMant(a) {
    const ot = this.ots(a).filter(o => o.estatus !== 'CANCELADA').reduce((s, o) => s + OT.costos(o).total, 0);
    const ej = this.planes(a).reduce((s, p) => s + Mant.ejecuciones(p).filter(e => !e.otId).reduce((t, e) => t + (Number(e.costo) || 0), 0), 0);
    return ot + ej;
  },

  /* Valores patrimoniales (referenciales, línea recta sin valor de rescate) */
  anios(a) { const d = aFecha(a.fechaAdquisicion); return d ? Math.max(0, (Date.now() - d.getTime()) / (365.25 * 86400000)) : null; },
  vida(a) { return Number(a.vidaUtil) || this.clase(a).vida || 0; },
  valorEstimado(a) {
    const c = Number(a.costo) || 0, n = this.anios(a), v = this.vida(a);
    if (!c || n == null || !v) return null;
    return Math.max(0, c * (1 - n / v));
  },

  /* Fotografías: un activo de alta múltiple puede compartir las fotos de la primera pieza */
  mediaId(a) { return a.fotosDe || a.id; },
  tieneFoto(a) {
    if (a.fotosDe) { const o = this.porId(a.fotosDe); return !!(o && o.fotos && Object.values(o.fotos).some(Boolean)); }
    return !!(a.fotos && Object.values(a.fotos).some(Boolean));
  },

  /* Liga del código QR: abre el tablero y la ficha del activo */
  urlQR(a) {
    const u = new URL('./', location.href.split('#')[0]);
    u.search = ''; u.hash = '';
    u.searchParams.set('activo', a.folio);
    return u.href;
  },

  movimientos(a) { return Object.keys(a.movimientos || {}).map(k => Object.assign({ id: k }, a.movimientos[k])).sort((x, y) => String(y.ts).localeCompare(String(x.ts))); },
  async mov(a, tipo, detalle, extra = {}) {
    const e = Object.assign({ ts: nowISO(), tipo, detalle: String(detalle || '').slice(0, 400), por: this.quien(), rol: SESION.rol || '' }, extra);
    await DB.db.ref(`${FB.root}/activos/${a.id}/movimientos/${uid()}`).set(limpiarUndefined(e));
  },

  /* Historial integrado: movimientos, órdenes de trabajo y ejecuciones de mantenimiento */
  historial(a) {
    const h = this.movimientos(a).map(m => ({ ts: m.ts, clase: m.tipo === 'BAJA' ? 'baja' : 'mov', titulo: MOV_ACTIVO[m.tipo] || m.tipo, detalle: m.detalle, por: m.por }));
    this.ots(a).forEach(o => h.push({
      ts: otGeneracion(o), clase: 'ot', ot: o.id, titulo: `Orden de trabajo ${o.folio}`, tags: OT.tag(o),
      detalle: `${o.categoria}: ${o.hallazgo || ''}${o.estatus === 'ENTREGADA' ? `. Costo ${money(OT.costos(o).total)}` : ''}`, por: OT.ejecutorTxt(o)
    }));
    this.planes(a).forEach(p => Mant.ejecuciones(p).forEach(e => h.push({
      ts: e.fecha, clase: 'mant', titulo: `Mantenimiento ejecutado${e.otFolio ? ` (${e.otFolio})` : ''}`,
      detalle: `${p.rubro}. ${money(e.costo)}${e.obs ? `. ${e.obs}` : ''}`, por: e.proveedor || ''
    })));
    return h.sort((x, y) => String(y.ts).localeCompare(String(x.ts)));
  }
};

/* Carga de imágenes para el lienzo de la etiqueta (el logotipo se guarda en caché) */
const _imgCache = {};
function cargarImagen(src) {
  if (_imgCache[src]) return _imgCache[src];
  _imgCache[src] = new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('No se pudo cargar la imagen.')); i.src = src; });
  return _imgCache[src];
}

/* ==========================================================================
   Vista de inventario
   ========================================================================== */
const ModActivos = {
  clase: '', areaFiltro: '', pendiente: '', limite: 300, _ficha: null,

  init() {
    try { this.pendiente = new URLSearchParams(location.search).get('activo') || ''; } catch (e) {}
    $('#afBuscar').addEventListener('input', () => this.render());
    ['afEdif', 'afEstatus', 'afMant'].forEach(id => $('#' + id).addEventListener('change', () => this.render()));
    $('#afClases').addEventListener('click', e => { const b = e.target.closest('[data-clase]'); if (!b) return; this.clase = b.dataset.clase; this.render(); });
    $('#afAreaFiltro').addEventListener('click', e => { if (e.target.closest('[data-quitar-area]')) { this.areaFiltro = ''; this.render(); } });
    $('#afNuevo').onclick = () => this.editar(null, this.areaFiltro ? { areaId: this.areaFiltro } : {});
    $('#afEscanear').onclick = () => this.escanear();
    $('#afEtiquetas').onclick = () => this.etiquetasLote();
    $('#afTabla').addEventListener('click', e => { const r = e.target.closest('[data-af]'); if (r) this.ficha(r.dataset.af); });
    $('#afTabla').addEventListener('keydown', e => { const r = e.target.closest('[data-af]'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this.ficha(r.dataset.af); } });
    $('#afEstatus').innerHTML = opciones([{ v: 'VIGENTES', l: 'Vigentes (sin bajas)' }, ...Object.keys(ESTATUS_ACTIVO).map(k => ({ v: k, l: ESTATUS_ACTIVO[k].l }))], 'VIGENTES', 'Todos, incluidas bajas');
    $('#afMant').innerHTML = opciones(['vencido', 'proximo', 'aldia', 'sin'].map(k => ({ v: k, l: k === 'sin' ? 'Sin plan de mantenimiento' : `Mantenimiento ${MANT_ACTIVO[k].l.toLowerCase()}` })), '', 'Cualquier estado de mantenimiento');
  },

  /* Desde el panel del área: muestra el inventario filtrado por esa área */
  verArea(areaId) {
    this.areaFiltro = areaId; this.clase = '';
    $('#afBuscar').value = ''; $('#afEdif').value = ''; $('#afMant').value = ''; $('#afEstatus').value = 'VIGENTES';
    UI.ir('activos');
  },

  filtrados() {
    const q = norm($('#afBuscar').value), ed = $('#afEdif').value, es = $('#afEstatus').value, mt = $('#afMant').value;
    return ST.activos.filter(a =>
      (!this.clase || a.clase === this.clase) && (!this.areaFiltro || a.areaId === this.areaFiltro) && (!ed || a.edificio === ed) &&
      (!es || (es === 'VIGENTES' ? a.estatus !== 'BAJA' : a.estatus === es)) && (!mt || Activos.estadoMant(a) === mt) &&
      (!q || norm([a.folio, a.codigoAnterior, a.tipo, a.descripcion, a.marca, a.modelo, a.serie, a.oficina, a.departamento, Activos.resguardante(a)].join(' ')).includes(q)))
      .sort((x, y) => ordenIdx(EDIFICIOS_ORDEN, x.edificio) - ordenIdx(EDIFICIOS_ORDEN, y.edificio) || String(x.edificio).localeCompare(String(y.edificio)) ||
        ordenIdx(NIVELES_ORDEN, x.nivel) - ordenIdx(NIVELES_ORDEN, y.nivel) || String(x.oficina).localeCompare(String(y.oficina)) || String(x.folio).localeCompare(String(y.folio)));
  },

  render() {
    const cap = can('capture');
    $('#afNuevo').hidden = !cap;
    const vig = Activos.vigentes(), anio = String(new Date().getFullYear());

    // Edificio (conserva la selección)
    const es = $('#afEdif'), ev = es.value;
    es.innerHTML = opciones(Areas.edificios().map(e => ({ v: e, l: tituloEdificio(e) })), ev, 'Todos los edificios');

    // Filtro por área activo
    const af = this.areaFiltro && Areas.porId(this.areaFiltro);
    $('#afAreaFiltro').innerHTML = af ? `<span class="af-filtro">Área: <b>${esc(af.oficina)}</b>, ${esc(tituloEdificio(af.edificio))}
      <button type="button" class="btn-ico" data-quitar-area aria-label="Quitar filtro de área">✕</button></span>` : '';

    // Chips por clase
    $('#afClases').innerHTML = [{ k: '', l: 'Todas' }, ...Object.keys(CLASES_ACTIVO).map(k => ({ k, l: CLASES_ACTIVO[k].l }))].map(x => {
      const lista = vig.filter(a => !x.k || a.clase === x.k);
      if (x.k && !lista.length && this.clase !== x.k) return '';
      const venc = lista.filter(a => Activos.estadoMant(a) === 'vencido').length;
      return `<button type="button" class="chip${this.clase === x.k ? ' on' : ''}" data-clase="${esc(x.k)}" aria-pressed="${this.clase === x.k}">
        ${esc(x.l)} <span class="chip-n">${lista.length}</span>${venc ? `<span class="chip-v" title="Mantenimiento vencido">${venc}</span>` : ''}</button>`;
    }).join('');

    // Indicadores
    const valor = vig.reduce((s, a) => s + (Number(a.costo) || 0), 0);
    const conPlan = vig.filter(a => Activos.planesActivos(a).length).length;
    const venc = vig.filter(a => Activos.estadoMant(a) === 'vencido').length;
    const atencion = vig.filter(a => ['EN_REPARACION', 'FUERA_SERVICIO'].includes(a.estatus) || a.condicion === 'MALO').length;
    const sinEtq = vig.filter(a => !a.etiquetaImpresa).length;
    const verif = vig.filter(a => a.ultimaVerificacion && String(a.ultimaVerificacion.ts).slice(0, 4) === anio).length;
    const bajas = ST.activos.filter(a => a.estatus === 'BAJA' && a.baja && String(a.baja.fecha).slice(0, 4) === anio).length;
    const cob = vig.length ? Math.round(conPlan / vig.length * 100) : null;
    const pv = vig.length ? Math.round(verif / vig.length * 100) : null;
    $('#afKpis').innerHTML = [
      kpi(nfmt(vig.length), 'Activos en inventario', `${new Set(vig.map(a => a.clase)).size} clases, ${new Set(vig.map(a => a.areaId)).size} áreas`, 'k-azul'),
      kpi(money(valor).replace(/\.\d\d$/, ''), 'Valor de adquisición', 'Activos vigentes', 'k-azul'),
      kpi(cob == null ? '—' : cob + ' %', 'Cobertura de mantenimiento', `${vig.length - conPlan} sin plan`, cob == null ? 'k-azul' : cob >= 90 ? 'k-verde' : cob >= 60 ? 'k-ambar' : 'k-rojo'),
      kpi(venc, 'Mantenimiento vencido', venc ? 'Programar atención' : 'Sin atrasos', venc ? 'k-rojo' : 'k-verde'),
      kpi(atencion, 'Requieren atención', 'En reparación, fuera de servicio o en mal estado', atencion ? 'k-ambar' : 'k-verde'),
      kpi(pv == null ? '—' : pv + ' %', `Verificación física ${anio}`, `${sinEtq} sin etiqueta QR`, pv == null ? 'k-azul' : pv >= 90 ? 'k-verde' : pv >= 50 ? 'k-ambar' : 'k-rojo'),
      kpi(bajas, `Bajas ${anio}`, 'Autorizadas por el Administrador', 'k-azul')
    ].join('');

    this.graficas(vig);

    // Tabla
    const f = this.filtrados(), ver = f.slice(0, this.limite);
    $('#afConteo').textContent = `${f.length} de ${ST.activos.length}`;
    $('#afTabla').innerHTML = f.length ? `<table class="tbl"><thead><tr><th>Folio</th><th>Activo</th><th>Ubicación</th><th>Resguardante</th><th>Estado</th><th>Mantenimiento</th><th class="num">Costo</th></tr></thead><tbody>
      ${ver.map(a => { const px = Activos.proxima(a); return `<tr class="clic" data-af="${esc(a.id)}" tabindex="0">
        <td class="mono"><b>${esc(a.folio)}</b>${a.codigoAnterior ? `<br><span class="muted">${esc(a.codigoAnterior)}</span>` : ''}
          ${!Activos.tieneFoto(a) || !a.etiquetaImpresa ? `<br><span class="af-pend">${[!Activos.tieneFoto(a) ? 'sin foto' : '', !a.etiquetaImpresa ? 'sin etiqueta' : ''].filter(Boolean).join(', ')}</span>` : ''}</td>
        <td class="desc"><b>${esc(a.tipo || '')}</b>${a.descripcion ? ` ${esc(a.descripcion)}` : ''}<br><span class="muted">${esc([a.marca, a.modelo].filter(Boolean).join(' ') || 'Sin marca')}${a.serie ? `, serie ${esc(a.serie)}` : ''}</span></td>
        <td><b>${esc(a.oficina || '—')}</b><br><span class="muted">${esc(tituloEdificio(a.edificio))}, ${esc(tituloNivel(a.nivel).toLowerCase())}</span></td>
        <td>${esc(Activos.resguardante(a) || '—')}</td>
        <td>${tag(ESTATUS_ACTIVO, a.estatus)}<br>${tag(CONDICION_ACTIVO, a.condicion)}</td>
        <td>${Activos.tagMant(a)}${px ? `<br><span class="muted">Próximo: ${fFecha(px)}</span>` : ''}</td>
        <td class="num">${a.costo ? money(a.costo) : '<span class="muted">—</span>'}</td></tr>`; }).join('')}</tbody></table>
      ${f.length > ver.length ? `<p class="hint af-mas">Se muestran ${ver.length} de ${f.length}. Use la búsqueda o los filtros para acotar; el Excel incluye todo el inventario.</p>` : ''}`
      : UI.vacio(ST.activos.length ? 'Ningún activo coincide con los filtros.' : 'Registre el primer activo: equipo de aire acondicionado, mobiliario, cocina, baño, bombeo o cualquier bien de las instalaciones.',
        cap ? `<button class="btn btn-primary" onclick="ModActivos.editar(null, ModActivos.areaFiltro ? { areaId: ModActivos.areaFiltro } : {})">Alta de activo</button>` : '');
  },

  graficas(vig) {
    const clases = Object.keys(CLASES_ACTIVO).filter(k => vig.some(a => a.clase === k));
    UI.chart('afChClase', clases.length ? {
      grid: { left: 8, right: 70, top: 8, bottom: 8, containLabel: true },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: p => `${p[0].name}<br>${p[0].value} activos<br>${money(vig.filter(a => CLASES_ACTIVO[a.clase] && CLASES_ACTIVO[a.clase].l === p[0].name).reduce((s, a) => s + (Number(a.costo) || 0), 0))}` },
      xAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#e2ecf8' } } },
      yAxis: { type: 'category', inverse: true, data: clases.map(k => CLASES_ACTIVO[k].l), axisTick: { show: false } },
      series: [{ type: 'bar', barMaxWidth: 22, data: clases.map(k => vig.filter(a => a.clase === k).length), itemStyle: { color: '#0b4f9e', borderRadius: [0, 4, 4, 0] }, label: { show: true, position: 'right' } }]
    } : { title: { text: 'Sin activos registrados', left: 'center', top: 'middle', textStyle: { fontSize: 13, color: '#6b7f96', fontWeight: 500 } } });

    const eds = Areas.edificios().filter(e => vig.some(a => a.edificio === e));
    const serie = (k, color) => ({ name: MANT_ACTIVO[k].l, type: 'bar', stack: 'm', barMaxWidth: 34, itemStyle: { color }, data: eds.map(e => vig.filter(a => a.edificio === e && (k === 'aldia' ? ['aldia', 'concluido'].includes(Activos.estadoMant(a)) : Activos.estadoMant(a) === k)).length) });
    UI.chart('afChEdif', eds.length ? {
      grid: { left: 8, right: 8, top: 34, bottom: 8, containLabel: true },
      legend: { top: 0, itemWidth: 12, itemHeight: 10 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: { type: 'category', data: eds.map(tituloEdificio), axisTick: { show: false } },
      yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#e2ecf8' } } },
      series: [serie('aldia', '#0f7a4e'), serie('proximo', '#c77700'), serie('vencido', '#b81f30'), serie('sin', '#a9b6c6')]
    } : { title: { text: 'Sin activos registrados', left: 'center', top: 'middle', textStyle: { fontSize: 13, color: '#6b7f96', fontWeight: 500 } } });
  },

  /* ==========================================================================
     Alta y edición
     ========================================================================== */
  specsHTML(clase, val = {}) {
    const c = CLASES_ACTIVO[clase] || CLASES_ACTIVO.OTR;
    if (!c.specs.length) return '<p class="hint">Esta clase no tiene especificaciones predefinidas; use la descripción y las notas.</p>';
    return `<div class="fg3">${c.specs.map(s => {
      const v = val[s.k] || '';
      if (s.op) return `<label class="fl"><span>${esc(s.l)}</span><select data-spec="${s.k}">${opciones(s.op.includes(v) || !v ? s.op : [...s.op, v], v, 'Sin dato')}</select></label>`;
      return `<label class="fl"><span>${esc(s.l)}</span><input data-spec="${s.k}"${s.t ? ` type="${s.t}"` : ''} value="${esc(v)}"${s.ph ? ` placeholder="${esc(s.ph)}"` : ''}></label>`;
    }).join('')}</div>`;
  },

  editar(id, pre = {}) {
    if (!can('capture')) return;
    const a = id ? Activos.porId(id) : null;
    if (a && a.estatus === 'BAJA') { UI.toast('El activo está dado de baja; para modificarlo primero debe reactivarse.', 'err'); return; }
    const clase0 = a ? a.clase : (pre.clase || this.clase || 'CLI');
    const c0 = CLASES_ACTIVO[clase0] || CLASES_ACTIVO.OTR;
    const fotos = {};
    const v = k => esc(a ? (a[k] == null ? '' : a[k]) : (pre[k] || ''));
    const m = UI.modal({
      titulo: a ? `Editar activo ${a.folio}` : 'Alta de activo', clase: 'm-campo m-fija', ancho: '900px',
      sub: a ? esc(Activos.ubicTxt(a)) : 'El folio de inventario se asigna al guardar y acompaña al activo durante toda su vida útil.',
      cuerpo: `
        <section class="campo-sec"><h3>Identificación</h3>
          <div class="fg3">
            <label class="fl"><span>Clase</span><select id="acClase"${a ? ' disabled' : ''}>${opciones(Object.keys(CLASES_ACTIVO).map(k => ({ v: k, l: CLASES_ACTIVO[k].l })), clase0)}</select></label>
            <label class="fl"><span>Tipo</span><select id="acTipo"></select></label>
            ${a ? `<label class="fl"><span>Folio de inventario</span><input value="${esc(a.folio)}" disabled></label>`
              : `<label class="fl"><span>Piezas idénticas</span><input id="acCant" type="number" min="1" max="${ALTA_MULTIPLE_MAX}" value="1" inputmode="numeric"><small class="ayuda">Un folio por pieza, máximo ${ALTA_MULTIPLE_MAX}</small></label>`}
          </div>
          <label class="fl"><span>Descripción</span><input id="acDesc" value="${v('descripcion')}" placeholder="Lo que lo distingue: color, uso o posición dentro del área"></label>
          <div class="fg3">
            <label class="fl"><span>Marca</span><input id="acMarca" value="${v('marca')}"></label>
            <label class="fl"><span>Modelo</span><input id="acModelo" value="${v('modelo')}"></label>
            <label class="fl"><span>Número de serie</span><input id="acSerie" value="${v('serie')}"></label>
          </div>
          <label class="fl"><span>Número de inventario anterior (opcional)</span><input id="acAnt" value="${v('codigoAnterior')}" placeholder="Etiqueta o código previo, si existe"></label>
        </section>
        <section class="campo-sec"><h3>Especificaciones técnicas</h3><div id="acSpecs"></div></section>
        ${a ? `<section class="campo-sec"><h3>Ubicación, resguardo y estado</h3>
            <dl class="dl2"><dt>Ubicación</dt><dd>${esc(Activos.ubicTxt(a))}</dd><dt>Resguardante</dt><dd>${esc(Activos.resguardante(a) || '—')}</dd>
            <dt>Estado</dt><dd>${tag(ESTATUS_ACTIVO, a.estatus)} ${tag(CONDICION_ACTIVO, a.condicion)}</dd></dl>
            <p class="hint">Para trasladar, cambiar el resguardante o el estado use las acciones de la ficha; así cada movimiento queda registrado con fecha y motivo.</p></section>`
          : `<section class="campo-sec"><h3>Ubicación y resguardo</h3>
            ${AreaPicker.html('ap')}
            <label class="fl"><span>Resguardante</span>${Personas.campo('acResg', '', '', 'Si lo deja vacío se asigna al responsable del área')}</label>
            <div class="fg2">
              <label class="fl"><span>Estado</span><select id="acEst">${opciones(Object.keys(ESTATUS_ACTIVO).filter(k => k !== 'BAJA').map(k => ({ v: k, l: ESTATUS_ACTIVO[k].l })), 'EN_USO')}</select></label>
              <label class="fl"><span>Condición física</span><select id="acCond">${opciones(Object.keys(CONDICION_ACTIVO).map(k => ({ v: k, l: CONDICION_ACTIVO[k].l })), 'BUENO')}</select></label>
            </div></section>`}
        <section class="campo-sec"><h3>Adquisición</h3>
          <div class="fg3">
            <label class="fl"><span>Fecha de adquisición</span><input id="acFAdq" type="date" value="${v('fechaAdquisicion')}"></label>
            <label class="fl"><span>Proveedor</span><input id="acProv" value="${v('proveedor')}"></label>
            <label class="fl"><span>Factura o documento</span><input id="acFact" value="${v('factura')}"></label>
            <label class="fl"><span>Costo de adquisición (IVA incluido)</span><input id="acCosto" type="number" min="0" step="0.01" value="${a && a.costo ? Number(a.costo) : ''}"></label>
            <label class="fl"><span>Garantía vigente hasta</span><input id="acGar" type="date" value="${v('garantiaHasta')}"></label>
            <label class="fl"><span>Vida útil (años)</span><input id="acVida" type="number" min="1" max="60" value="${a ? Activos.vida(a) : c0.vida}"></label>
          </div>
        </section>
        <section class="campo-sec"><h3>Fotografías</h3>
          <p class="hint">${a && a.fotosDe ? 'Este activo usa las fotografías de la primera pieza de su alta; si las cambia, quedan solo para este folio.' : 'Vista general, placa de datos y ubicación. Se comprimen antes de guardarse.'}</p>
          <div class="fotos" id="acFotos"></div>
        </section>
        <label class="fl"><span>Notas</span><textarea id="acNotas" rows="2">${v('notas')}</textarea></label>
        ${a ? '' : '<label class="chk" id="acPlanWrap"><input type="checkbox" id="acPlan" checked> Programar su mantenimiento preventivo al guardar</label>'}`,
      acciones: [{ texto: 'Cancelar' }, { texto: a ? 'Guardar cambios' : 'Registrar activo', clase: 'btn-primary', fn: mm => this.guardar(mm, a, fotos) }]
    });

    const llenarTipo = (clase, sel) => {
      const tipos = Activos.tipos(clase);
      m.q('#acTipo').innerHTML = opciones(tipos.includes(sel) || !sel ? tipos : [...tipos, sel], sel || (tipos.length === 1 ? tipos[0] : ''), 'Seleccione');
    };
    llenarTipo(clase0, a ? a.tipo : pre.tipo);
    m.q('#acSpecs').innerHTML = this.specsHTML(clase0, a ? a.specs || {} : {});
    m.q('#acClase').onchange = () => {
      const k = m.q('#acClase').value;
      llenarTipo(k, '');
      m.q('#acSpecs').innerHTML = this.specsHTML(k, {});
      m.q('#acVida').value = (CLASES_ACTIVO[k] || {}).vida || '';
    };
    if (!a) {
      AreaPicker.init('ap', pre.areaId || '');
      Personas.activar(m.q('#acResg'));
      const cant = m.q('#acCant');
      cant.oninput = () => {
        const n = Number(cant.value) || 1;
        m.q('#acSerie').disabled = n > 1;
        m.q('#acSerie').placeholder = n > 1 ? 'Capture la serie en la ficha de cada pieza' : '';
        m.q('#acPlanWrap').hidden = n > 1;
      };
    }

    // Fotografías: se guardan al registrar el activo
    const cont = m.q('#acFotos');
    const claves = FOTOS_ACTIVO.map((_, i) => `foto_${i}`);
    const pintar = () => { cont.innerHTML = claves.map((k, i) => ranuraFoto(k, FOTOS_ACTIVO[i], fotos[k], true)).join(''); };
    pintar();
    if (a && Activos.tieneFoto(a)) {
      cont.classList.add('cargando-fotos');
      DB.media(Activos.mediaId(a)).then(md => { claves.forEach(k => { if (md[k] && !(k in fotos)) fotos[k] = md[k]; }); })
        .catch(() => UI.toast('No se pudieron cargar las fotografías actuales.', 'err'))
        .finally(() => { cont.classList.remove('cargando-fotos'); pintar(); });
    }
    cont.onchange = async e => {
      const inp = e.target.closest('[data-foto]'); if (!inp || !inp.files.length) return;
      const archivos = [...inp.files];
      const libres = claves.filter(k => k !== inp.dataset.foto && !fotos[k]);
      const destino = [inp.dataset.foto, ...libres].slice(0, archivos.length);
      cont.classList.add('cargando-fotos');
      try { for (let i = 0; i < destino.length; i++) fotos[destino[i]] = await comprimirImagen(archivos[i]); m._fotosCambiaron = true; }
      catch (er) { UI.toast(er.message, 'err'); }
      finally { cont.classList.remove('cargando-fotos'); pintar(); }
    };
    cont.onclick = e => {
      const b = e.target.closest('[data-quitar-foto]'); if (!b) return;
      fotos[b.dataset.quitarFoto] = null; m._fotosCambiaron = true; pintar();
    };
  },

  async guardar(mm, a, fotos) {
    const fotosCambiaron = !!mm._fotosCambiaron;
    const clase = a ? a.clase : mm.q('#acClase').value;
    const c = CLASES_ACTIVO[clase] || CLASES_ACTIVO.OTR;
    const specs = {};
    c.specs.forEach(s => { const el = mm.q(`[data-spec="${s.k}"]`); const val = el ? el.value.trim() : ''; if (val) specs[s.k] = val; });
    const d = {
      tipo: mm.q('#acTipo').value, descripcion: mm.q('#acDesc').value.trim(),
      marca: mayus(mm.q('#acMarca').value), modelo: mayus(mm.q('#acModelo').value), serie: mayus(mm.q('#acSerie').value),
      codigoAnterior: mayus(mm.q('#acAnt').value), specs,
      fechaAdquisicion: mm.q('#acFAdq').value, proveedor: mm.q('#acProv').value.trim(), factura: mm.q('#acFact').value.trim(),
      costo: Number(mm.q('#acCosto').value) || 0, garantiaHasta: mm.q('#acGar').value,
      vidaUtil: Number(mm.q('#acVida').value) || c.vida, notas: mm.q('#acNotas').value.trim()
    };
    const faltan = [];
    if (!d.tipo) faltan.push('tipo');
    if (d.fechaAdquisicion && d.fechaAdquisicion > ymdLocal()) faltan.push('fecha de adquisición válida');
    const claves = FOTOS_ACTIVO.map((_, i) => `foto_${i}`);

    /* ---------- Edición ---------- */
    if (a) {
      if (faltan.length) { UI.toast('Falta: ' + faltan.join(', ') + '.', 'err'); return false; }
      if (d.serie && ST.activos.some(x => x.id !== a.id && x.serie && norm(x.serie) === norm(d.serie) && x.clase === a.clase && x.estatus !== 'BAJA')
        && !(await UI.confirmar(`Ya existe otro activo vigente con la serie ${esc(d.serie)}. ¿Guardar de todos modos?`, { texto: 'Guardar' }))) return false;
      const ETQ = { tipo: 'tipo', descripcion: 'descripción', marca: 'marca', modelo: 'modelo', serie: 'serie', codigoAnterior: 'inventario anterior', fechaAdquisicion: 'fecha de adquisición', proveedor: 'proveedor', factura: 'factura', costo: 'costo', garantiaHasta: 'garantía', vidaUtil: 'vida útil', notas: 'notas' };
      const nv = x => (x == null || x === 0) ? '' : String(x);
      const cambios = Object.keys(ETQ).filter(k => nv(a[k]) !== nv(d[k])).map(k => k === 'notas' ? 'notas' : `${ETQ[k]}: ${nv(a[k]) || '—'} → ${nv(d[k]) || '—'}`);
      if (JSON.stringify(a.specs || {}) !== JSON.stringify(specs)) cambios.push('especificaciones técnicas');
      if (fotosCambiaron) {
        // Al cambiar fotos, el activo deja de compartir las de su primera pieza
        for (const k of claves) await DB.guardarMedia(a.id, k, fotos[k] || null);
        d.fotos = claves.reduce((r, k) => (fotos[k] ? (r[k] = true) : 0, r), {});
        d.fotosDe = null;
        cambios.push('fotografías');
      }
      await DB.actualizar('activos', a.id, d);
      if (cambios.length) {
        await Activos.mov(a, 'EDICION', cambios.join('; '));
        DB.log('EDICION', 'activos', a.folio, cambios.join('; '));
      }
      UI.toast(cambios.length ? 'Activo actualizado.' : 'Sin cambios que guardar.', cambios.length ? 'ok' : '');
      this.reabrir(a.id);
      return;
    }

    /* ---------- Alta ---------- */
    const areaId = AreaPicker.valor('ap');
    if (!areaId) faltan.push('ubicación');
    if (faltan.length) { UI.toast('Falta: ' + faltan.join(', ') + '.', 'err'); return false; }
    const n = Math.min(ALTA_MULTIPLE_MAX, Math.max(1, Math.floor(Number(mm.q('#acCant').value) || 1)));
    if (n > 1) { d.serie = ''; if (!(await UI.confirmar(`Se registrarán <b>${n} piezas</b> de ${esc(d.tipo)} con los mismos datos y ${n} folios consecutivos. ¿Continuar?`, { texto: `Registrar ${n} piezas` }))) return false; }
    else if (d.serie && ST.activos.some(x => x.serie && norm(x.serie) === norm(d.serie) && x.clase === clase && x.estatus !== 'BAJA')
      && !(await UI.confirmar(`Ya existe un activo vigente con la serie ${esc(d.serie)}. ¿Registrar de todos modos?`, { texto: 'Registrar' }))) return false;
    const area = Areas.porId(areaId);
    let resg = await Personas.resolver(mm.q('#acResg'));
    if (!resg && area && area.responsableId) resg = Personas.porId(area.responsableId) || null;
    const ub = ubicacion(areaId);
    const folios = await DB.reservarFoliosActivo(clase, n);
    const ahora = nowISO(), flags = claves.reduce((r, k) => (fotos[k] ? (r[k] = true) : 0, r), {});
    const hayFotos = Object.keys(flags).length;
    const mapa = {}, ids = [];
    folios.forEach((folio, i) => {
      const id = uid() + (i ? String(i).padStart(2, '0') : '');
      ids.push(id);
      mapa[`${FB.root}/activos/${id}`] = limpiarUndefined(Object.assign({}, d, ub, {
        id, folio, clase, estatus: mm.q('#acEst').value, condicion: mm.q('#acCond').value,
        resguardanteId: resg ? resg.id : '', resguardanteNombre: resg ? resg.nombre : '',
        fotos: i === 0 ? flags : {}, fotosDe: i > 0 && hayFotos ? ids[0] : '',
        loteAlta: n > 1 ? `${folios[0]} a ${folios[n - 1]}` : '', creadoPor: SESION.rol, createdAt: ahora, updatedAt: ahora,
        movimientos: { [uid()]: { ts: ahora, tipo: 'ALTA', detalle: `${ub.oficina}, ${tituloEdificio(ub.edificio)}${n > 1 ? `. Pieza ${i + 1} de ${n}` : ''}${resg ? `. Resguardo: ${resg.nombre}` : ''}`, por: Activos.quien(), rol: SESION.rol } }
      }));
    });
    await DB.multi(mapa);
    for (const k of Object.keys(flags)) await DB.guardarMedia(ids[0], k, fotos[k]);
    DB.log('ALTA', 'activos', n > 1 ? `${folios[0]} a ${folios[n - 1]}` : folios[0], `${d.tipo}, ${ub.oficina}${n > 1 ? `, ${n} piezas` : ''}`);
    if (n > 1) {
      UI.toast(`${n} activos registrados: ${folios[0]} a ${folios[n - 1]}. Imprima sus etiquetas desde «Etiquetas QR».`, 'ok', 7000);
      $('#afBuscar').value = d.tipo; if (UI.vista === 'activos') this.render();
    } else {
      UI.toast(`Activo ${folios[0]} registrado.`, 'ok');
      const plan = mm.q('#acPlan') && mm.q('#acPlan').checked;
      setTimeout(() => plan ? this.planMant(ids[0], { tras: 'ficha' }) : this.ficha(ids[0]), 350);
    }
  },

  reabrir(id) {
    if (this._ficha) this._ficha.cerrar();
    setTimeout(() => this.ficha(id), 300);
  },

  /* ==========================================================================
     Ficha del activo
     ========================================================================== */
  ficha(id, opts = {}) {
    const a = Activos.porId(id);
    if (!a) { UI.toast('Activo no encontrado.', 'err'); return; }
    if (this._ficha) this._ficha.cerrar();
    const c = Activos.clase(a), cap = can('capture') && !esTecnico(), adm = can('baja_activo'), baja = a.estatus === 'BAJA';
    const planes = Activos.planes(a).sort((x, y) => (y.activo !== false) - (x.activo !== false));
    const hist = Activos.historial(a);
    const anios = Activos.anios(a), vida = Activos.vida(a), valor = Activos.valorEstimado(a);
    const gar = a.garantiaHasta ? diasEntre(ymdLocal(), a.garantiaHasta) : null;
    const specs = c.specs.filter(s => a.specs && a.specs[s.k]);
    const uv = a.ultimaVerificacion;
    const area = Areas.porId(a.areaId);
    const accion = (k, t, cls = '') => `<button type="button" class="btn btn-sm ${cls}" data-fa="${k}">${t}</button>`;
    const cuerpo = `
      ${opts.desdeQR && cap && !baja ? `<div class="aviso aviso-accion"><div><b>Activo identificado por su código QR.</b> Confirme que se encuentra en ${esc(a.oficina || 'su área')} y en la condición registrada.</div>
        ${accion('verificar', 'Confirmar verificación física', 'btn-primary')}</div>` : ''}
      ${baja ? `<div class="aviso"><b>Baja del ${fFecha(a.baja && a.baja.fecha)}</b> por ${esc((a.baja && a.baja.motivo) || '—')}.${a.baja && a.baja.documento ? ` Documento: ${esc(a.baja.documento)}.` : ''}${a.baja && a.baja.autorizo ? ` Autorizó: ${esc(a.baja.autorizo)}.` : ''}</div>` : ''}
      <div class="af-ficha">
        <div class="af-izq">
          <div class="fotos af-fotos" id="faFotos">${Activos.tieneFoto(a) ? '<div class="foto"><div class="foto-vista"><span>Cargando fotografías…</span></div></div>' : '<div class="foto"><div class="foto-vista"><span>Sin fotografías</span></div></div>'}</div>
          <div class="af-etq" id="faEtq"><span class="muted">Generando etiqueta…</span></div>
          <div class="af-etq-acc">${accion('png', 'Descargar etiqueta')}${accion('pdf', 'Etiqueta en PDF')}</div>
          <p class="hint">${a.etiquetaImpresa ? `Etiqueta generada el ${fFecha(a.etiquetaImpresa)}.` : 'Etiqueta pendiente de imprimir y colocar.'}</p>
        </div>
        <div class="af-der">
          <h3 class="af-nombre">${esc(a.tipo || '')}</h3>
          ${a.descripcion ? `<p class="af-desc">${esc(a.descripcion)}</p>` : ''}
          ${cap ? `<div class="dr-acc">${baja ? '' : accion('editar', 'Editar') + accion('traslado', 'Trasladar') + accion('resguardo', 'Cambiar resguardante') + accion('estado', 'Cambiar estado') + accion('ot', 'Generar OT') + (opts.desdeQR ? '' : accion('verificar', 'Verificar en sitio'))}
            ${adm ? (baja ? accion('reactivar', 'Reactivar') : accion('baja', 'Dar de baja', 'btn-ghost txt-rojo')) : ''}${can('delete') ? accion('eliminar', 'Eliminar registro', 'btn-ghost txt-rojo') : ''}</div>` : ''}
          <dl class="dl2">
            <dt>Clase</dt><dd>${esc(c.l)}</dd>
            <dt>Marca y modelo</dt><dd>${esc([a.marca, a.modelo].filter(Boolean).join(' ') || '—')}</dd>
            <dt>Número de serie</dt><dd>${esc(a.serie || '—')}</dd>
            ${a.codigoAnterior ? `<dt>Inventario anterior</dt><dd>${esc(a.codigoAnterior)}</dd>` : ''}
            <dt>Ubicación</dt><dd><b>${esc(a.oficina || '—')}</b><br><span class="muted">${esc(tituloEdificio(a.edificio))}, ${esc(tituloNivel(a.nivel).toLowerCase())}. ${esc(a.departamento || '')}</span></dd>
            <dt>Resguardante</dt><dd>${esc(Activos.resguardante(a) || '—')}${area && area.responsableId && area.responsableId !== a.resguardanteId ? `<br><span class="muted">Responsable del área: ${esc(Areas.responsable(area))}</span>` : ''}</dd>
            ${specs.map(s => `<dt>${esc(s.l)}</dt><dd>${esc(s.t === 'date' ? fFecha(a.specs[s.k]) : a.specs[s.k])}</dd>`).join('')}
            <dt>Adquisición</dt><dd>${a.fechaAdquisicion ? `${fFecha(a.fechaAdquisicion)} <span class="muted">(${nfmt(anios, 1)} años)</span>` : '—'}${a.proveedor ? `<br>${esc(a.proveedor)}` : ''}${a.factura ? `<br><span class="muted">Factura ${esc(a.factura)}</span>` : ''}</dd>
            <dt>Costo de adquisición</dt><dd>${a.costo ? money(a.costo) : '—'}</dd>
            ${valor != null ? `<dt>Valor estimado actual</dt><dd>${money(valor)} <span class="muted">(línea recta a ${vida} años, referencial)</span></dd>` : ''}
            <dt>Vida útil</dt><dd>${vida} años${anios != null ? `<span class="muted">, ${anios >= vida ? 'cumplida' : `restan ${nfmt(vida - anios, 1)}`}</span>` : ''}</dd>
            <dt>Garantía</dt><dd>${gar == null ? '—' : `${fFecha(a.garantiaHasta)} ${gar >= 0 ? `<span class="tag t-verde">Vigente, ${gar} días</span>` : '<span class="tag t-gris">Vencida</span>'}`}</dd>
            <dt>Costo de mantenimiento</dt><dd>${money(Activos.costoMant(a))} <span class="muted">acumulado</span></dd>
            <dt>Verificación física</dt><dd>${uv ? `${fFechaHora(uv.ts)}<br><span class="muted">${esc(uv.por || '')}${uv.enUbicacion === false ? ', no se encontró en su ubicación' : ''}</span>` : '<span class="muted">Sin verificar</span>'}</dd>
            ${a.loteAlta ? `<dt>Alta en lote</dt><dd>${esc(a.loteAlta)}</dd>` : ''}
            ${a.notas ? `<dt>Notas</dt><dd>${esc(a.notas)}</dd>` : ''}
          </dl>
          <h4 class="dr-sec">Mantenimiento <span>${planes.length}</span></h4>
          ${planes.length ? `<ul class="dr-lista">${planes.map(p => `<li><div><b>${esc(p.rubro)}</b> ${Mant.tagEstado(p)} <span class="muted">${esc(p.tipo || '')}, ${esc(Mant.periodicidadTxt(p.periodicidadDias).toLowerCase())}</span></div>
            <div>${esc(p.descripcion || '')}</div><div class="muted">Próximo: ${fFecha(Mant.proxima(p))}. Ejecuciones: ${Mant.ejecuciones(p).length}${p.proveedor ? `. ${esc(p.proveedor)}` : ''}</div>
            <div class="af-plan-acc">${cap && p.activo !== false && Mant.estado(p) !== 'concluido' ? `<button type="button" class="btn btn-sm btn-primary" data-plan="ejecutar" data-id="${esc(p.id)}">Registrar ejecución</button><button type="button" class="btn btn-sm" data-plan="ot" data-id="${esc(p.id)}">Generar OT</button>` : ''}
              <button type="button" class="btn btn-sm btn-ghost" data-plan="hist" data-id="${esc(p.id)}">Historial</button>${cap ? `<button type="button" class="btn btn-sm btn-ghost" data-plan="editar" data-id="${esc(p.id)}">Editar plan</button>` : ''}</div></li>`).join('')}</ul>`
            : `<p class="muted dr-v">Sin plan de mantenimiento.${c.rubro ? ` Sugerido: ${esc(Activos.tipoDef(a.clase, a.tipo).rubro || c.rubro)}, ${esc(Mant.periodicidadTxt(Activos.tipoDef(a.clase, a.tipo).per).toLowerCase())}.` : ''}</p>`}
          ${cap && !baja ? `<div class="dr-acc">${accion('plan', 'Programar mantenimiento', 'btn-primary')}</div>` : ''}
          <h4 class="dr-sec">Historial <span>${hist.length}</span></h4>
          ${hist.length ? `<ol class="af-tl">${hist.map(h => `<li class="af-tl-${h.clase}${h.ot ? ' dr-click' : ''}"${h.ot ? ` data-ot="${esc(h.ot)}" tabindex="0"` : ''}>
            <div class="af-tl-f">${/^\d{4}-\d{2}-\d{2}$/.test(h.ts) ? fFecha(h.ts) : fFechaHora(h.ts)}</div>
            <div><b>${esc(h.titulo)}</b> ${h.tags || ''}<div>${esc(h.detalle || '')}</div>${h.por ? `<div class="muted">${esc(h.por)}</div>` : ''}</div></li>`).join('')}</ol>` : '<p class="muted dr-v">Sin movimientos.</p>'}
        </div>
      </div>`;
    const m = UI.modal({
      titulo: `${a.folio}`, ancho: '1040px', clase: 'm-activo',
      sub: `${tag(ESTATUS_ACTIVO, a.estatus)} ${tag(CONDICION_ACTIVO, a.condicion)} <span>${esc(Activos.nombre(a))}</span>`,
      cuerpo, acciones: [{ texto: 'Cerrar' }],
      alCerrar: () => { if (this._ficha === m) this._ficha = null; }
    });
    this._ficha = m;

    // Fotografías bajo demanda
    if (Activos.tieneFoto(a)) {
      DB.media(Activos.mediaId(a)).then(md => {
        const k = FOTOS_ACTIVO.map((_, i) => `foto_${i}`).filter(x => md[x]);
        const cont = m.q('#faFotos'); if (!cont) return;
        cont.innerHTML = k.length ? k.map(x => ranuraFoto(x, `${a.folio}: ${FOTOS_ACTIVO[Number(x.split('_')[1])]}`, md[x], false)).join('') : '<div class="foto"><div class="foto-vista"><span>Sin fotografías</span></div></div>';
      }).catch(() => { const cont = m.q('#faFotos'); if (cont) cont.innerHTML = '<p class="muted">No se pudieron cargar las fotografías.</p>'; });
    }
    // Vista previa de la etiqueta
    this.etiquetaCanvas(a).then(cv => { const w = m.q('#faEtq'); if (w) { w.innerHTML = ''; cv.className = 'af-etq-cv'; cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', `Etiqueta QR del activo ${a.folio}`); w.appendChild(cv); } })
      .catch(e => { const w = m.q('#faEtq'); if (w) w.innerHTML = `<p class="muted">${esc(e.message)}</p>`; });

    m.el.addEventListener('click', e => {
      const b = e.target.closest('[data-fa]');
      if (b) {
        const k = b.dataset.fa, x = Activos.porId(id) || a;
        ({
          png: () => this.etiquetaPNG(x), pdf: () => this.etiquetasPDF([x]), editar: () => { m.cerrar(); this.editar(x.id); },
          traslado: () => this.trasladar(x), resguardo: () => this.resguardo(x), estado: () => this.cambiarEstado(x), verificar: () => this.verificar(x),
          ot: () => { m.cerrar(); this.generarOT(x); }, plan: () => this.planMant(x.id, { tras: 'ficha' }), baja: () => this.baja(x),
          reactivar: () => this.reactivar(x), eliminar: () => this.eliminar(x)
        })[k]();
        return;
      }
      const pb = e.target.closest('[data-plan]');
      if (pb) {
        const p = ST.mantenimientos.find(z => z.id === pb.dataset.id); if (!p) return;
        if (pb.dataset.plan === 'ejecutar') ModMant.ejecutar(p);
        if (pb.dataset.plan === 'ot') { m.cerrar(); ModMant.generarOT(p); }
        if (pb.dataset.plan === 'hist') ModMant.historial(p);
        if (pb.dataset.plan === 'editar') ModMant.editar(p.id);
        return;
      }
      const o = e.target.closest('[data-ot]');
      if (o && !esTecnico()) { m.cerrar(); OT.abrir(o.dataset.ot); }
    });
  },

  /* ==========================================================================
     Movimientos
     ========================================================================== */
  trasladar(a) {
    const origen = Activos.ubicTxt(a);
    const m = UI.modal({
      titulo: `Traslado de ${a.folio}`, sub: `Ubicación actual: ${esc(origen)}`, ancho: '700px',
      cuerpo: `${AreaPicker.html('at')}
        <div class="fg2">
          <label class="fl"><span>Fecha del traslado</span><input type="date" id="atFec" value="${ymdLocal()}"></label>
          <label class="fl"><span>Autorizó</span><input id="atAut" list="dlAfAut"></label>
        </div>
        <datalist id="dlAfAut">${PERSONAL_AF.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
        <label class="chk"><input type="checkbox" id="atResg" checked> Asignar como resguardante al responsable del área destino</label>
        <label class="fl"><span>Motivo del traslado</span><textarea id="atMot" rows="3" placeholder="Reubicación de personal, sustitución de equipo, préstamo…"></textarea></label>
        ${Activos.planesActivos(a).length ? '<p class="hint">Sus planes de mantenimiento se trasladan con el activo.</p>' : ''}`,
      acciones: [{ texto: 'Cancelar' }, {
        texto: 'Registrar traslado', clase: 'btn-primary', fn: async mm => {
          const dest = AreaPicker.valor('at'), mot = mm.q('#atMot').value.trim(), fecha = mm.q('#atFec').value;
          const f = [];
          if (!dest) f.push('área destino'); if (!mot) f.push('motivo'); if (!fecha) f.push('fecha');
          if (f.length) { UI.toast('Falta: ' + f.join(', ') + '.', 'err'); return false; }
          if (dest === a.areaId) { UI.toast('El área destino es la misma que la actual.', 'err'); return false; }
          const ub = ubicacion(dest), area = Areas.porId(dest);
          const d = Object.assign({}, ub);
          const resg = mm.q('#atResg').checked && area && area.responsableId ? Personas.porId(area.responsableId) : null;
          if (resg) { d.resguardanteId = resg.id; d.resguardanteNombre = resg.nombre; }
          await DB.actualizar('activos', a.id, d);
          for (const p of Activos.planes(a)) await DB.actualizar('mantenimientos', p.id, { alcance: 'AREA', areaId: dest, edificio: ub.edificio });
          const destino = `${ub.oficina} (${tituloEdificio(ub.edificio)})`;
          await Activos.mov(a, 'TRASLADO', `${origen} → ${destino}. ${mot}${resg ? `. Resguardo: ${resg.nombre}` : ''}`, { fecha, de: a.areaId || '', a: dest, autorizo: mayus(mm.q('#atAut').value) });
          DB.log('TRASLADO', 'activos', a.folio, `${a.oficina || '—'} → ${ub.oficina}. ${mot}`);
          UI.toast(`${a.folio} trasladado a ${ub.oficina}.`, 'ok');
          this.reabrir(a.id);
        }
      }]
    });
    AreaPicker.init('at', a.areaId);
  },

  resguardo(a) {
    const actual = Activos.resguardante(a);
    const m = UI.modal({
      titulo: `Resguardante de ${a.folio}`, sub: `Actual: ${esc(actual || 'sin resguardante')}`, ancho: '600px',
      cuerpo: `<label class="fl"><span>Nuevo resguardante</span>${Personas.campo('arResg', '', '', 'Escriba para buscar o agregar al directorio')}</label>
        <div class="fg2"><label class="fl"><span>Fecha</span><input type="date" id="arFec" value="${ymdLocal()}"></label></div>
        <label class="fl"><span>Observaciones</span><textarea id="arObs" rows="2" placeholder="Entrega de resguardo firmado, cambio de puesto…"></textarea></label>`,
      acciones: [{ texto: 'Cancelar' }, {
        texto: 'Registrar cambio', clase: 'btn-primary', fn: async mm => {
          const p = await Personas.resolver(mm.q('#arResg'));
          if (!p) { UI.toast('Indique el nuevo resguardante.', 'err'); return false; }
          if (p.id === a.resguardanteId) { UI.toast('Esa persona ya es el resguardante.', 'err'); return false; }
          await DB.actualizar('activos', a.id, { resguardanteId: p.id, resguardanteNombre: p.nombre });
          const obs = mm.q('#arObs').value.trim();
          await Activos.mov(a, 'RESGUARDO', `${actual || 'Sin resguardante'} → ${p.nombre}${obs ? `. ${obs}` : ''}`, { fecha: mm.q('#arFec').value });
          DB.log('RESGUARDO', 'activos', a.folio, `${actual || '—'} → ${p.nombre}`);
          UI.toast('Resguardante actualizado.', 'ok');
          this.reabrir(a.id);
        }
      }]
    });
    Personas.activar(m.q('#arResg'));
  },

  cambiarEstado(a) {
    UI.modal({
      titulo: `Estado de ${a.folio}`, ancho: '600px',
      cuerpo: `<div class="fg2">
          <label class="fl"><span>Estado</span><select id="aeEst">${opciones(Object.keys(ESTATUS_ACTIVO).filter(k => k !== 'BAJA').map(k => ({ v: k, l: ESTATUS_ACTIVO[k].l })), a.estatus)}</select></label>
          <label class="fl"><span>Condición física</span><select id="aeCond">${opciones(Object.keys(CONDICION_ACTIVO).map(k => ({ v: k, l: CONDICION_ACTIVO[k].l })), a.condicion)}</select></label>
        </div>
        <label class="fl"><span>Observaciones</span><textarea id="aeObs" rows="3" placeholder="Falla detectada, envío a taller, regreso de reparación…"></textarea></label>
        <p class="hint">La baja definitiva se registra con «Dar de baja» y la autoriza el Administrador.</p>`,
      acciones: [{ texto: 'Cancelar' }, {
        texto: 'Registrar estado', clase: 'btn-primary', fn: async mm => {
          const est = mm.q('#aeEst').value, cond = mm.q('#aeCond').value, obs = mm.q('#aeObs').value.trim();
          if (est === a.estatus && cond === a.condicion) { UI.toast('No hay cambios de estado ni de condición.', 'err'); return false; }
          if (!obs) { UI.toast('Describa el motivo del cambio.', 'err'); return false; }
          await DB.actualizar('activos', a.id, { estatus: est, condicion: cond });
          const det = [est !== a.estatus ? `Estado: ${(ESTATUS_ACTIVO[a.estatus] || {}).l || '—'} → ${ESTATUS_ACTIVO[est].l}` : '', cond !== a.condicion ? `Condición: ${(CONDICION_ACTIVO[a.condicion] || {}).l || '—'} → ${CONDICION_ACTIVO[cond].l}` : '', obs].filter(Boolean).join('. ');
          await Activos.mov(a, 'ESTATUS', det);
          DB.log('ESTATUS', 'activos', a.folio, det);
          UI.toast('Estado actualizado.', 'ok');
          this.reabrir(a.id);
        }
      }]
    });
  },

  /* Verificación física (auditoría de inventario por escaneo o recorrido) */
  verificar(a) {
    UI.modal({
      titulo: `Verificación física de ${a.folio}`, ancho: '600px', sub: esc(Activos.ubicTxt(a)),
      cuerpo: `<label class="chk"><input type="checkbox" id="avUbi" checked> Se encontró en la ubicación registrada</label>
        <label class="fl"><span>Condición observada</span><select id="avCond">${opciones(Object.keys(CONDICION_ACTIVO).map(k => ({ v: k, l: CONDICION_ACTIVO[k].l })), a.condicion)}</select></label>
        <label class="fl"><span>Observaciones (opcional)</span><textarea id="avObs" rows="2"></textarea></label>`,
      acciones: [{ texto: 'Cancelar' }, {
        texto: 'Registrar verificación', clase: 'btn-primary', fn: async mm => {
          const enUb = mm.q('#avUbi').checked, cond = mm.q('#avCond').value, obs = mm.q('#avObs').value.trim();
          const v = { ts: nowISO(), por: Activos.quien(), enUbicacion: enUb, condicion: cond };
          const d = { ultimaVerificacion: v };
          if (cond !== a.condicion) d.condicion = cond;
          await DB.actualizar('activos', a.id, d);
          const det = `${enUb ? `Encontrado en ${a.oficina || 'su área'}` : `No se encontró en ${a.oficina || 'su área'}`}. Condición: ${CONDICION_ACTIVO[cond].l}${obs ? `. ${obs}` : ''}`;
          await Activos.mov(a, 'VERIFICACION', det);
          DB.log('VERIFICACION', 'activos', a.folio, det);
          if (!enUb) { UI.toast('Verificación registrada. Registre el traslado a la ubicación donde se encontró.', 'ok', 6000); setTimeout(() => this.trasladar(Activos.porId(a.id) || a), 300); }
          else { UI.toast('Verificación registrada.', 'ok'); this.reabrir(a.id); }
        }
      }]
    });
  },

  baja(a) {
    if (!can('baja_activo')) return;
    const planes = Activos.planesActivos(a);
    UI.modal({
      titulo: `Baja de ${a.folio}`, ancho: '680px', sub: `${esc(Activos.nombre(a))}. ${esc(Activos.ubicTxt(a))}`,
      cuerpo: `<div class="fg2">
          <label class="fl"><span>Motivo</span><select id="abMot">${opciones(MOTIVOS_BAJA, '', 'Seleccione')}</select></label>
          <label class="fl"><span>Fecha de baja</span><input type="date" id="abFec" value="${ymdLocal()}"></label>
          <label class="fl"><span>Documento de soporte</span><input id="abDoc" placeholder="Acta, oficio o dictamen técnico"></label>
          <label class="fl"><span>Autorizó</span><input id="abAut"></label>
          <label class="fl"><span>Valor de recuperación</span><input type="number" id="abVal" min="0" step="0.01" placeholder="Venta, chatarra o reembolso"></label>
        </div>
        <label class="fl"><span>Observaciones</span><textarea id="abObs" rows="3" placeholder="Dictamen, destino final del bien, evidencia…"></textarea></label>
        ${planes.length ? `<label class="chk"><input type="checkbox" id="abPlanes" checked> Desactivar sus ${planes.length} plan${planes.length > 1 ? 'es' : ''} de mantenimiento</label>` : ''}
        <p class="hint">El folio y el historial se conservan. La baja puede revertirse con «Reactivar».</p>`,
      acciones: [{ texto: 'Cancelar' }, {
        texto: 'Registrar baja', clase: 'btn-danger', fn: async mm => {
          const b = { motivo: mm.q('#abMot').value, fecha: mm.q('#abFec').value, documento: mm.q('#abDoc').value.trim(), autorizo: mayus(mm.q('#abAut').value),
            valorRecuperacion: Number(mm.q('#abVal').value) || 0, obs: mm.q('#abObs').value.trim(), registro: nowISO(), por: Activos.quien(), estatusPrevio: a.estatus };
          const f = [];
          if (!b.motivo) f.push('motivo'); if (!b.fecha) f.push('fecha'); if (!b.autorizo) f.push('quién autorizó'); if (!b.obs) f.push('observaciones');
          if (f.length) { UI.toast('Falta: ' + f.join(', ') + '.', 'err'); return false; }
          await DB.actualizar('activos', a.id, { estatus: 'BAJA', baja: b });
          if (mm.q('#abPlanes') && mm.q('#abPlanes').checked) for (const p of planes) await DB.actualizar('mantenimientos', p.id, { activo: false });
          const det = `${b.motivo}. ${b.obs}${b.documento ? `. Documento: ${b.documento}` : ''}. Autorizó: ${b.autorizo}${b.valorRecuperacion ? `. Recuperación: ${money(b.valorRecuperacion)}` : ''}`;
          await Activos.mov(a, 'BAJA', det, { fecha: b.fecha });
          DB.log('BAJA', 'activos', a.folio, det);
          UI.toast(`${a.folio} dado de baja.`, 'ok');
          this.reabrir(a.id);
        }
      }]
    });
  },

  async reactivar(a) {
    if (!can('baja_activo')) return;
    const mot = await UI.pedirTexto(`Reactivar ${a.folio}`, 'Motivo de la reactivación (queda en el historial del activo)');
    if (!mot) return;
    await DB.actualizar('activos', a.id, { estatus: 'EN_ALMACEN', baja: null });
    await Activos.mov(a, 'REACTIVACION', `${mot}. Queda en almacén; trasládelo y reactive sus planes de mantenimiento si aplica.`);
    DB.log('REACTIVACION', 'activos', a.folio, mot);
    UI.toast(`${a.folio} reactivado en estado «En almacén».`, 'ok');
    this.reabrir(a.id);
  },

  async eliminar(a) {
    if (!can('delete')) return;
    const ok = await UI.confirmar(`¿Eliminar el registro <b>${esc(a.folio)}</b>? Use esta opción solo para corregir una captura errónea; para retirar un bien físico registre su baja. Se borran el registro, su historial y sus fotografías. El folio no se reutiliza.`, { texto: 'Eliminar registro', peligro: true });
    if (!ok) return;
    const comparte = ST.activos.some(x => x.id !== a.id && x.fotosDe === a.id);
    await DB.eliminar('activos', a.id);
    if (!a.fotosDe && !comparte) await DB.eliminarMedia(a.id).catch(() => {});
    for (const p of Activos.planes(a)) await DB.actualizar('mantenimientos', p.id, { activo: false, activoId: null, activoFolio: null });
    DB.log('ELIMINACION', 'activos', a.folio, `${a.tipo}, ${a.oficina || ''}. Captura errónea`);
    if (this._ficha) this._ficha.cerrar();
    UI.toast(`Registro ${a.folio} eliminado.`, 'ok');
  },

  /* ==========================================================================
     Mantenimiento y órdenes de trabajo
     ========================================================================== */
  planMant(id, opts = {}) {
    const a = Activos.porId(id); if (!a) return;
    if (!a.areaId) { UI.toast('El activo no tiene área asignada; trasládelo antes de programar su mantenimiento.', 'err'); return; }
    const def = Activos.tipoDef(a.clase, a.tipo);
    UI.modal({
      titulo: 'Programar mantenimiento', sub: `${esc(a.folio)}: ${esc(Activos.nombre(a))}. ${esc(Activos.ubicTxt(a))}`, ancho: '720px',
      cuerpo: `<div class="fg3">
          <label class="fl"><span>Rubro</span><select id="apRub">${opciones(RUBROS_MANT, def.rubro, 'Seleccione')}</select></label>
          <label class="fl"><span>Tipo</span><select id="apTipo">${opciones(['Preventivo', 'Correctivo'], 'Preventivo')}</select></label>
          <label class="fl"><span>Periodicidad</span><select id="apPer">${opciones(PERIODICIDADES.map(x => ({ v: x.d, l: x.l })), def.per || 180)}</select></label>
        </div>
        <label class="fl"><span>Actividad</span><input id="apDesc" value="${esc(`Mantenimiento preventivo de ${String(a.tipo || 'activo').toLowerCase()} ${a.folio}`)}"></label>
        <div class="fg3">
          <label class="fl"><span>Fecha del primer servicio</span><input type="date" id="apIni" value="${ymdLocal()}"></label>
          <label class="fl"><span>Proveedor</span><input id="apProv" value="${esc(a.proveedor || '')}"></label>
          <label class="fl"><span>Costo estimado por servicio</span><input type="number" id="apCosto" min="0" step="0.01"></label>
        </div>
        <label class="fl"><span>Responsable del seguimiento</span><input id="apResp" list="dlAfResp"></label>
        <datalist id="dlAfResp">${PERSONAL_AF.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
        <p class="hint">El plan aparece en Mantenimientos programados y en el Calendario, con alcance en ${esc(a.oficina)}. Si el activo se traslada, el plan lo acompaña.</p>`,
      acciones: [{ texto: opts.tras === 'ficha' ? 'Omitir' : 'Cancelar', fn: () => { if (opts.tras === 'ficha') setTimeout(() => this.ficha(a.id), 200); } }, {
        texto: 'Guardar plan', clase: 'btn-primary', fn: async mm => {
          const d = {
            rubro: mm.q('#apRub').value, tipo: mm.q('#apTipo').value, periodicidadDias: Number(mm.q('#apPer').value),
            descripcion: mm.q('#apDesc').value.trim(), alcance: 'AREA', areaId: a.areaId, edificio: a.edificio,
            fechaInicio: mm.q('#apIni').value, proveedor: mm.q('#apProv').value.trim(), costoEstimado: Number(mm.q('#apCosto').value) || 0,
            responsable: mayus(mm.q('#apResp').value), activo: true, activoId: a.id, activoFolio: a.folio
          };
          const f = [];
          if (!RUBROS_MANT.includes(d.rubro)) f.push('rubro'); if (!d.descripcion) f.push('actividad'); if (!d.fechaInicio) f.push('fecha del primer servicio');
          if (f.length) { UI.toast('Falta: ' + f.join(', ') + '.', 'err'); return false; }
          await DB.guardar('mantenimientos', d);
          await Activos.mov(a, 'PLAN', `${d.rubro}, ${d.tipo.toLowerCase()}, ${Mant.periodicidadTxt(d.periodicidadDias).toLowerCase()}. Primer servicio: ${fFecha(d.fechaInicio)}`);
          DB.log('ALTA', 'mantenimientos', `${d.rubro}: ${d.descripcion}`, `Activo ${a.folio}`);
          UI.toast('Plan de mantenimiento guardado.', 'ok');
          this.reabrir(a.id);
        }
      }]
    });
  },

  generarOT(a) {
    OT.levantamiento({
      areaId: a.areaId, categoria: Activos.categoria(a), prioridad: 'MEDIA',
      hallazgo: `Activo ${a.folio}, ${Activos.nombre(a)}${a.serie ? `, serie ${a.serie}` : ''}: `,
      origen: { tipo: 'ACTIVO', id: a.id, folio: a.folio }
    });
  },

  /* ==========================================================================
     Etiquetas con código QR
     ========================================================================== */
  async etiquetaCanvas(a) {
    if (typeof qrcode === 'undefined') throw new Error('La librería de QR no se cargó; revise su conexión.');
    try { await document.fonts.ready; } catch (e) {}
    const W = 1000, H = 500;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    const rr = (px, py, w, h, r) => { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); };
    const ajustar = (t, max) => { t = String(t || ''); if (x.measureText(t).width <= max) return t; while (t.length > 1 && x.measureText(t + '…').width > max) t = t.slice(0, -1); return t + '…'; };
    const ff = getComputedStyle(document.body).fontFamily || 'Arial, sans-serif';

    x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
    rr(4, 4, W - 8, H - 8, 26); x.lineWidth = 5; x.strokeStyle = '#0b4f9e'; x.stroke();

    // Código QR (zona de silencio incluida en el margen blanco)
    const qr = qrcode(0, 'M'); qr.addData(Activos.urlQR(a)); qr.make();
    const n = qr.getModuleCount(), cel = Math.floor(360 / n), lado = cel * n;
    const qx = 52 + (360 - lado) / 2, qy = (H - 66 - lado) / 2 + 4;
    x.fillStyle = '#0b2a52';
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) x.fillRect(qx + k * cel, qy + r * cel, cel, cel);

    // Columna de datos
    const X = 478, maxW = W - X - 40;
    let lw = 0;
    try { const logo = await cargarImagen(LOGO_IES); const lh = 78; lw = logo.width * lh / logo.height; x.drawImage(logo, X, 34, lw, lh); } catch (e) {}
    x.textAlign = 'left'; x.textBaseline = 'alphabetic';
    x.fillStyle = '#0b4f9e'; x.font = `700 24px ${ff}`; x.fillText(ajustar('Activo fijo', maxW - lw - 18), X + lw + 18, 66);
    x.fillStyle = '#42566f'; x.font = `500 21px ${ff}`; x.fillText(ajustar('Control de Edificios IES', maxW - lw - 18), X + lw + 18, 96);
    x.fillStyle = '#0b2a52'; x.font = `800 66px ${ff}`; x.fillText(ajustar(a.folio, maxW), X, 196);
    x.fillStyle = '#000'; x.font = `700 31px ${ff}`; x.fillText(ajustar(a.tipo, maxW), X, 246);
    x.fillStyle = '#42566f'; x.font = `500 25px ${ff}`; x.fillText(ajustar([a.marca, a.modelo].filter(Boolean).join(' ') || 'Sin marca', maxW), X, 284);
    // Solo datos permanentes: la ubicación cambia con los traslados y se consulta al escanear
    x.fillStyle = '#000'; x.font = `600 25px ${ff}`; x.fillText(ajustar(a.serie ? `Serie ${a.serie}` : (a.codigoAnterior ? `Inventario anterior ${a.codigoAnterior}` : 'Sin número de serie'), maxW), X, 336);
    x.fillStyle = '#42566f'; x.font = `500 22px ${ff}`; x.fillText(ajustar(Activos.clase(a).l, maxW), X, 366);

    // Franja inferior con la leyenda patrimonial
    x.save(); rr(4, 4, W - 8, H - 8, 26); x.clip();
    x.fillStyle = '#0b4f9e'; x.fillRect(0, H - 66, W, 66); x.restore();
    rr(4, 4, W - 8, H - 8, 26); x.lineWidth = 5; x.strokeStyle = '#0b4f9e'; x.stroke();
    x.fillStyle = '#fff'; x.font = `600 22px ${ff}`; x.textAlign = 'center';
    x.fillText(ajustar(ETIQUETA_ACTIVO.leyenda, W - 80), W / 2, H - 26);
    return c;
  },

  async marcarEtiquetas(lista) {
    if (!can('capture')) return;
    const ts = nowISO(), mapa = {};
    lista.forEach(a => { mapa[`${FB.root}/activos/${a.id}/etiquetaImpresa`] = ts; });
    await DB.multi(mapa).catch(e => console.warn('etiquetas', e));
  },

  async etiquetaPNG(a) {
    try {
      const c = await this.etiquetaCanvas(a);
      const l = document.createElement('a'); l.href = c.toDataURL('image/png'); l.download = `Etiqueta_${a.folio}.png`; l.click();
      await this.marcarEtiquetas([a]);
      DB.log('ETIQUETA', 'activos', a.folio, 'PNG');
    } catch (e) { UI.toast(e.message, 'err'); }
  },

  /* Hoja carta con 10 etiquetas de 100 × 50 mm (2 columnas × 5 filas) */
  async etiquetasPDF(lista) {
    if (!window.jspdf) { UI.toast('La librería jsPDF no se cargó; revise su conexión.', 'err'); return; }
    if (!lista.length) return;
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'letter', compress: true });
    const W = 100, H = 50, cols = 2, filas = 5, gx = 4, gy = 3, pag = cols * filas;
    const mx = (215.9 - cols * W - (cols - 1) * gx) / 2, my = (279.4 - filas * H - (filas - 1) * gy) / 2;
    if (lista.length > 20) UI.toast(`Generando ${lista.length} etiquetas…`, '', 4000);
    try {
      for (let i = 0; i < lista.length; i++) {
        if (i && i % pag === 0) doc.addPage();
        const p = i % pag, col = p % cols, fil = Math.floor(p / cols);
        const cv = await this.etiquetaCanvas(lista[i]);
        doc.addImage(cv.toDataURL('image/png'), 'PNG', mx + col * (W + gx), my + fil * (H + gy), W, H, undefined, 'FAST');
        if (i % 10 === 9) await new Promise(r => setTimeout(r, 0));
      }
      const nombre = lista.length === 1 ? `Etiqueta_${lista[0].folio}.pdf` : `Etiquetas_QR_Activos_${ymdLocal().replace(/-/g, '')}_${lista.length}.pdf`;
      doc.save(nombre);
      await this.marcarEtiquetas(lista);
      DB.log('ETIQUETA', 'activos', lista.length === 1 ? lista[0].folio : `${lista.length} etiquetas`, 'PDF hoja carta');
    } catch (e) { console.error(e); UI.toast('No se pudieron generar las etiquetas: ' + e.message, 'err'); }
  },

  etiquetasLote() {
    const todos = this.filtrados().filter(a => a.estatus !== 'BAJA');
    if (!todos.length) { UI.toast('No hay activos vigentes en la vista actual.', 'err'); return; }
    const pend = todos.filter(a => !a.etiquetaImpresa);
    UI.modal({
      titulo: 'Etiquetas QR', ancho: '560px',
      sub: 'Hoja carta con 10 etiquetas de 100 × 50 mm. Imprima a escala real (100 %) en papel adhesivo o en hoja para enmicar.',
      cuerpo: `<fieldset class="seg af-seg"><legend>Activos a imprimir</legend>
          <label><input type="radio" name="elSel" value="pend"${pend.length ? ' checked' : ' disabled'}> Pendientes de etiquetar en la vista actual (${pend.length})</label>
          <label><input type="radio" name="elSel" value="todos"${pend.length ? '' : ' checked'}> Todos los de la vista actual (${todos.length})</label>
        </fieldset>
        <p class="hint">Filtre antes por área, edificio o clase para imprimir por recorrido.${todos.length > 500 ? ' Se generan como máximo 500 etiquetas por archivo.' : ''}</p>`,
      acciones: [{ texto: 'Cancelar' }, {
        texto: 'Generar PDF', clase: 'btn-primary', fn: mm => {
          const sel = (mm.q('input[name=elSel]:checked') || {}).value === 'pend' ? pend : todos;
          setTimeout(() => this.etiquetasPDF(sel.slice(0, 500)), 50);
        }
      }]
    });
  },

  /* ==========================================================================
     Identificación por QR (foto de la etiqueta) o por folio
     ========================================================================== */
  folioDeTexto(t) {
    t = String(t || '').trim();
    try { const u = new URL(t); const f = u.searchParams.get('activo'); if (f) return f; } catch (e) {}
    return t;
  },
  async leerQR(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('No se pudo leer la imagen.')); i.src = url; });
      if ('BarcodeDetector' in window) {
        try { const r = await new window.BarcodeDetector({ formats: ['qr_code'] }).detect(img); if (r && r.length) return r[0].rawValue; } catch (e) {}
      }
      if (typeof jsQR === 'undefined') throw new Error('El lector de QR no se cargó; revise su conexión o escriba el folio.');
      for (const max of [1200, 800, 1700]) {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * k), h = Math.round(img.height * k);
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0, w, h);
        const r = jsQR(cx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' });
        if (r && r.data) return r.data;
      }
      return '';
    } finally { URL.revokeObjectURL(url); }
  },
  abrirPorTexto(texto, desdeQR) {
    const f = this.folioDeTexto(texto);
    let a = Activos.porFolio(f);
    if (!a) { const n = norm(f); const c = n ? ST.activos.filter(x => norm(x.folio).includes(n) || norm(x.codigoAnterior).includes(n)) : []; if (c.length === 1) a = c[0]; }
    if (!a) return false;
    this.ficha(a.id, { desdeQR });
    return true;
  },
  escanear() {
    const m = UI.modal({
      titulo: 'Identificar activo', ancho: '540px',
      sub: 'Tome una fotografía de la etiqueta QR o escriba el folio de inventario.',
      cuerpo: `<div class="af-scan">
          <label class="btn btn-primary btn-grande">Tomar fotografía del QR<input type="file" accept="image/*" capture="environment" id="esCam" hidden></label>
          <label class="btn btn-grande">Elegir imagen de la galería<input type="file" accept="image/*" id="esGal" hidden></label>
          <p class="hint" id="esEstado" role="status"></p>
          <label class="fl"><span>Folio de inventario o número anterior</span>
            <div class="liga"><input id="esFolio" placeholder="AF-CLI-0001" autocapitalize="characters" autocomplete="off"><button type="button" class="btn" id="esBuscar">Buscar</button></div></label>
        </div>`,
      acciones: [{ texto: 'Cerrar' }]
    });
    const estado = t => { m.q('#esEstado').textContent = t; };
    const procesar = async file => {
      estado('Leyendo el código QR…');
      try {
        const txt = await this.leerQR(file);
        if (!txt) { estado('No se detectó un código QR. Acérquese, evite reflejos y enfoque la etiqueta completa.'); return; }
        m.cerrar();
        if (!this.abrirPorTexto(txt, true)) UI.toast(`El código leído no corresponde a un activo registrado: ${this.folioDeTexto(txt)}`, 'err', 6000);
      } catch (e) { estado(e.message); }
    };
    ['#esCam', '#esGal'].forEach(s => { m.q(s).onchange = e => { const f = e.target.files[0]; e.target.value = ''; f && procesar(f); }; });
    const buscar = () => {
      const t = m.q('#esFolio').value.trim(); if (!t) return;
      if (this.abrirPorTexto(t, false)) m.cerrar(); else estado(`No se encontró un activo con «${t}».`);
    };
    m.q('#esBuscar').onclick = buscar;
    m.q('#esFolio').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); buscar(); } });
  },

  /* Liga del QR (?activo=FOLIO): abre la ficha en cuanto hay sesión y datos */
  revisarPendiente() {
    if (!this.pendiente || !SESION.rol || !DB.listo()) return;
    const f = this.pendiente; this.pendiente = '';
    try { const u = new URL(location.href); u.searchParams.delete('activo'); history.replaceState(null, '', u.pathname + u.search + u.hash); } catch (e) {}
    setTimeout(() => { if (!this.abrirPorTexto(f, true)) UI.toast(`No se encontró el activo ${f}.`, 'err', 6000); }, 200);
  },

  /* ==========================================================================
     Integración con el panel del área (mod-tablero.js)
     ========================================================================== */
  seccionArea(area) {
    const l = ST.activos.filter(a => a.areaId === area.id && a.estatus !== 'BAJA').sort((x, y) => String(x.folio).localeCompare(String(y.folio)));
    const venc = l.filter(a => Activos.estadoMant(a) === 'vencido').length;
    return `<h4 class="dr-sec">Activos del área <span>${l.length}</span>${venc ? ` <i class="tag t-rojo">${venc} con mant. vencido</i>` : ''}</h4>
      ${l.length ? `<ul class="dr-lista">${l.slice(0, 8).map(a => `<li class="dr-click" data-af-dr="${esc(a.id)}"><div><b>${esc(a.folio)}</b> ${tag(ESTATUS_ACTIVO, a.estatus)} ${Activos.tagMant(a)}</div>
        <div>${esc(Activos.nombre(a))}${a.descripcion ? `. ${esc(a.descripcion)}` : ''}</div></li>`).join('')}</ul>` : '<p class="muted dr-v">Sin activos registrados.</p>'}
      <div class="dr-acc af-dr-acc">${l.length ? '<button class="btn btn-sm" data-dr-af="ver">Ver inventario del área</button>' : ''}${can('capture') ? '<button class="btn btn-sm" data-dr-af="alta">Alta de activo</button>' : ''}</div>`;
  },
  enlazarArea(cont, area) {
    cont.querySelectorAll('[data-af-dr]').forEach(li => li.onclick = () => this.ficha(li.dataset.afDr));
    cont.querySelectorAll('[data-dr-af]').forEach(b => b.onclick = () => b.dataset.drAf === 'ver' ? this.verArea(area.id) : this.editar(null, { areaId: area.id }));
  }
};

/* Equivalencia de los rubros nuevos con la categoría de OT */
Object.assign(RUBRO_A_CATEGORIA, {
  'Ventilación': 'Electricidad', 'Equipos de Cocina': 'Electricidad', 'Muebles Sanitarios': 'Plomería', 'Equipos de Bombeo': 'Plomería',
  'Puertas y Accesos': 'Carpintería', 'Instalación Eléctrica': 'Electricidad', 'Equipo Electrónico': 'Redes'
});

UI.registrar('activos', ModActivos);
