/* ==========================================================================
   CONTROL DE EDIFICIOS · IES
   js/mod-incidencias.js — Módulo 2: Dashboards operativos
     · Incidencias (selector estricto de 14 categorías)
     · Gestor de tareas Kanban PHVA (Planear, Hacer, Verificar, Actuar)
   ========================================================================== */

const ModIncidencias = {
  init() {
    ['incBuscar', 'incEstatus', 'incCat', 'incEdif', 'incPrio'].forEach(id => $('#' + id).addEventListener(id === 'incBuscar' ? 'input' : 'change', () => this.render()));
    $('#incEstatus').innerHTML = opciones([{ v: 'ACTIVAS', l: 'Abiertas y en atención' }, ...Object.keys(INC_ESTATUS).map(k => ({ v: k, l: INC_ESTATUS[k].l }))], 'ACTIVAS', 'Todos los estatus');
    $('#incCat').innerHTML = opciones(CATEGORIAS, '', 'Todas las categorías');
    $('#incPrio').innerHTML = opciones(Object.keys(PRIORIDADES).map(k => ({ v: k, l: PRIORIDADES[k].l })), '', 'Todas las prioridades');
    $('#incNueva').onclick = () => this.editar(null);
    $('#incTabla').addEventListener('click', e => {
      const b = e.target.closest('[data-acc]'); if (!b) return;
      const id = b.dataset.id, acc = b.dataset.acc;
      if (acc === 'ver') this.editar(id);
      if (acc === 'ot') this.generarOT(id);
      if (acc === 'cancelar') this.cancelar(id);
      if (acc === 'abrir-ot') OT.abrir(b.dataset.ot);
    });
  },

  filtradas() {
    const q = norm($('#incBuscar').value), es = $('#incEstatus').value, ca = $('#incCat').value, ed = $('#incEdif').value, pr = $('#incPrio').value;
    return ST.incidencias.filter(i =>
      (!es || (es === 'ACTIVAS' ? ['ABIERTA', 'EN_ATENCION'].includes(i.estatus) : i.estatus === es)) &&
      (!ca || i.categoria === ca) && (!ed || i.edificio === ed) && (!pr || i.prioridad === pr) &&
      (!q || norm([i.folio, i.oficina, i.descripcion, i.solicitanteNombre, i.categoria].join(' ')).includes(q))
    ).sort((a, b) => String(b.fechaReporte).localeCompare(String(a.fechaReporte)));
  },

  render() {
    const eds = $('#incEdif'), ev = eds.value;
    eds.innerHTML = opciones(Areas.edificios(), ev, 'Todos los edificios');
    $('#incNueva').hidden = !can('capture');

    const todas = ST.incidencias;
    const ab = todas.filter(i => i.estatus === 'ABIERTA').length;
    const at = todas.filter(i => i.estatus === 'EN_ATENCION').length;
    const mes = ymdLocal().slice(0, 7);
    const resMes = todas.filter(i => i.estatus === 'RESUELTA' && String(i.fechaCierre || '').slice(0, 7) === mes);
    const res = todas.filter(i => i.estatus === 'RESUELTA' && i.fechaCierre && i.fechaReporte);
    const prom = res.length ? res.reduce((s, i) => s + (new Date(i.fechaCierre) - new Date(i.fechaReporte)), 0) / res.length : null;
    const porCat = {};
    todas.filter(i => i.estatus !== 'CANCELADA').forEach(i => porCat[i.categoria] = (porCat[i.categoria] || 0) + 1);
    const top = Object.entries(porCat).sort((a, b) => b[1] - a[1])[0];
    $('#incKpis').innerHTML = [
      kpi(ab, 'Abiertas', 'Sin orden de trabajo', ab ? 'k-ambar' : 'k-verde'),
      kpi(at, 'En atención', 'Con orden de trabajo', 'k-morado'),
      kpi(resMes.length, 'Resueltas este mes', MESES_L[new Date().getMonth()], 'k-verde'),
      kpi(prom == null ? '—' : fDur(prom).replace(/ \d+ min$/, ''), 'Tiempo medio de resolución', 'Reporte → cierre', 'k-azul'),
      kpi(top ? top[1] : 0, 'Categoría más frecuente', top ? top[0] : 'Sin registros', 'k-azul')
    ].join('');

    // Gráficas
    const cats = CATEGORIAS.map(c => ({
      c, ab: todas.filter(i => i.categoria === c && ['ABIERTA', 'EN_ATENCION'].includes(i.estatus)).length,
      re: todas.filter(i => i.categoria === c && i.estatus === 'RESUELTA').length
    })).filter(x => x.ab + x.re > 0).sort((a, b) => (a.ab + a.re) - (b.ab + b.re));
    UI.chart('incChCat', cats.length ? {
      grid: { left: 130, right: 24, top: 30, bottom: 24 }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 0, data: ['Activas', 'Resueltas'] },
      xAxis: { type: 'value', minInterval: 1 }, yAxis: { type: 'category', data: cats.map(x => x.c) },
      series: [
        { name: 'Activas', type: 'bar', stack: 't', barMaxWidth: 26, data: cats.map(x => x.ab), itemStyle: { color: '#c77700' } },
        { name: 'Resueltas', type: 'bar', stack: 't', barMaxWidth: 26, data: cats.map(x => x.re), itemStyle: { color: '#0f7a4e' } }
      ]
    } : sinDatos());
    const eds2 = Areas.edificios().map(e => ({
      e, ab: todas.filter(i => i.edificio === e && ['ABIERTA', 'EN_ATENCION'].includes(i.estatus)).length,
      re: todas.filter(i => i.edificio === e && i.estatus === 'RESUELTA').length
    }));
    UI.chart('incChEdif', todas.length ? {
      grid: { left: 40, right: 16, top: 30, bottom: 30 }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 0, data: ['Activas', 'Resueltas'] },
      xAxis: { type: 'category', data: eds2.map(x => tituloEdificio(x.e)) }, yAxis: { type: 'value', minInterval: 1 },
      series: [
        { name: 'Activas', type: 'bar', stack: 't', data: eds2.map(x => x.ab), itemStyle: { color: '#c77700' }, barMaxWidth: 46 },
        { name: 'Resueltas', type: 'bar', stack: 't', data: eds2.map(x => x.re), itemStyle: { color: '#0f7a4e' }, barMaxWidth: 46 }
      ]
    } : sinDatos());

    // Tabla
    const f = this.filtradas();
    $('#incConteo').textContent = `${f.length} de ${todas.length}`;
    $('#incTabla').innerHTML = f.length ? `<table class="tbl"><thead><tr>
      <th>Folio</th><th>Fecha</th><th>Ubicación</th><th>Categoría</th><th>Prioridad</th><th>Solicitante</th><th>Descripción</th><th>Estatus</th><th>OT</th><th></th></tr></thead><tbody>
      ${f.map(i => `<tr>
        <td class="mono">${esc(i.folio)}</td><td>${fFechaHora(i.fechaReporte)}</td>
        <td><b>${esc(i.oficina)}</b><br><span class="muted">${esc(tituloEdificio(i.edificio))}, ${esc(tituloNivel(i.nivel).toLowerCase())}</span></td>
        <td>${esc(i.categoria)}</td><td>${tagPrioridad(i.prioridad)}</td><td>${esc(i.solicitanteNombre || '—')}</td>
        <td class="desc">${esc(i.descripcion)}</td><td>${tag(INC_ESTATUS, i.estatus)}</td>
        <td>${i.otId ? `<button class="lnk mono" data-acc="abrir-ot" data-ot="${esc(i.otId)}" data-id="${esc(i.id)}">${esc(i.otFolio || 'Ver')}</button>` : '—'}</td>
        <td class="acc">
          <button class="btn btn-sm" data-acc="ver" data-id="${esc(i.id)}">${can('capture') && ['ABIERTA', 'EN_ATENCION'].includes(i.estatus) ? 'Editar' : 'Ver'}</button>
          ${can('capture') && i.estatus === 'ABIERTA' ? `<button class="btn btn-sm btn-primary" data-acc="ot" data-id="${esc(i.id)}">Generar OT</button>
          <button class="btn btn-sm btn-ghost" data-acc="cancelar" data-id="${esc(i.id)}">Cancelar</button>` : ''}
        </td></tr>`).join('')}</tbody></table>`
      : UI.vacio(todas.length ? 'Ninguna incidencia coincide con los filtros.' : 'Aún no hay incidencias. Registre la primera con «Reportar incidencia».');
  },

  editar(id, pre = {}) {
    const i = id ? ST.incidencias.find(x => x.id === id) : null;
    const editable = can('capture') && (!i || ['ABIERTA', 'EN_ATENCION'].includes(i.estatus));
    const dis = editable ? '' : ' disabled';
    const m = UI.modal({
      titulo: i ? `Incidencia ${i.folio}` : 'Reportar incidencia', ancho: '720px',
      sub: i ? `${tag(INC_ESTATUS, i.estatus)} Registrada ${fFechaHora(i.fechaReporte)}${i.otFolio ? `, atendida con ${esc(i.otFolio)}` : ''}` : 'Registro de la falla o necesidad detectada en un área.',
      cuerpo: `${AreaPicker.html('ip')}
        <div class="fg3">
          <label class="fl"><span>Categoría</span><select id="iCat"${dis}>${opciones(CATEGORIAS, i ? i.categoria : '', 'Seleccione la categoría')}</select></label>
          <label class="fl"><span>Prioridad</span><select id="iPrio"${dis}>${opciones(Object.keys(PRIORIDADES).map(k => ({ v: k, l: `${PRIORIDADES[k].l} (SLA ${PRIORIDADES[k].h} h)` })), i ? i.prioridad : 'MEDIA')}</select></label>
          <label class="fl"><span>Fecha y hora del reporte</span><input type="datetime-local" id="iFecha" value="${localInput(i ? i.fechaReporte : null)}"${dis}></label>
        </div>
        <label class="fl"><span>Solicitante (quien pide el trabajo)</span>${Personas.campo('iSol', i ? i.solicitanteNombre : '', i ? i.solicitanteId : '', 'Puede ser distinto al responsable del área')}</label>
        <label class="fl"><span>Descripción de la incidencia</span><textarea id="iDesc" rows="4" placeholder="Qué ocurre, dónde exactamente y desde cuándo"${dis}>${esc(i ? i.descripcion : '')}</textarea></label>
        <div class="campo-sub"><b>Evidencia del reporte</b><span class="hint"> Hasta ${FOTOS.rep} fotografías. El técnico las verá en su orden de trabajo.</span>
          ${i && i.evidenciaDepurada ? `<div class="aviso">Evidencia depurada el ${fFecha(i.evidenciaDepurada)}; consulte el respaldo ZIP.</div>` : ''}
          <div class="fotos fotos-4" id="iFotos"></div></div>
        ${i && i.motivoCancelacion ? `<div class="aviso">Motivo de cancelación: ${esc(i.motivoCancelacion)}</div>` : ''}`,
      acciones: editable ? [{ texto: 'Cancelar' }, {
        texto: i ? 'Guardar cambios' : 'Registrar incidencia', clase: 'btn-primary', fn: async mm => {
          const areaId = AreaPicker.valor('ip'), cat = mm.q('#iCat').value, desc = mm.q('#iDesc').value.trim();
          const faltan = [];
          if (!areaId) faltan.push('área'); if (!CATEGORIAS.includes(cat)) faltan.push('categoría'); if (!desc) faltan.push('descripción');
          if (faltan.length) { UI.toast('Falta: ' + faltan.join(', ') + '.', 'err'); return false; }
          const sol = await Personas.resolver(mm.q('#iSol'), 'esSolicitante');
          const datos = Object.assign(ubicacion(areaId), {
            categoria: cat, prioridad: mm.q('#iPrio').value, descripcion: desc,
            fechaReporte: desdeLocalInput(mm.q('#iFecha').value) || nowISO(),
            solicitanteId: sol ? sol.id : '', solicitanteNombre: sol ? sol.nombre : ''
          });
          if (i) {
            await DB.actualizar('incidencias', i.id, datos);
            DB.log('EDICION', 'incidencias', i.folio, `${cat}, ${datos.oficina}`);
            UI.toast('Incidencia actualizada.', 'ok');
          } else {
            datos.folio = await DB.reservarFolio('INC');
            datos.estatus = 'ABIERTA'; datos.creadoPor = SESION.rol;
            Object.assign(datos, pre.extra || {});
            const nid = await DB.guardar('incidencias', datos);
            // Fotografías capturadas antes de existir la incidencia: se guardan en edificios_media/{incidenciaId}
            const claves = Object.keys(fotos).filter(k => fotos[k]);
            for (const k of claves) await DB.guardarMedia(nid, k, fotos[k]);
            if (claves.length) await DB.actualizar('incidencias', nid, { fotos: claves.reduce((r, k) => (r[k] = true, r), {}) });
            DB.log('ALTA', 'incidencias', datos.folio, `${cat}, ${datos.oficina}: ${desc}`);
            UI.toast(`Incidencia ${datos.folio} registrada.`, 'ok');
          }
        }
      }] : [{ texto: 'Cerrar' }]
    });
    AreaPicker.init('ip', i ? i.areaId : pre.areaId);
    const fotos = {};
    if (i) DB.media(i.id).then(md => { Object.assign(fotos, md); OT.montarFotos(m.q('#iFotos'), 'rep', fotos, editable, i.id, { nodo: 'incidencias' }); }).catch(() => {});
    else OT.montarFotos(m.q('#iFotos'), 'rep', fotos, editable, null);
    if (!editable) $$('.area-picker select', m.el).forEach(s => s.disabled = true);
    Personas.activar(m.q('#iSol'), { flag: 'esSolicitante' });
    if (!editable) m.q('#iSol').disabled = true;
  },

  generarOT(id) {
    const i = ST.incidencias.find(x => x.id === id); if (!i) return;
    OT.levantamiento({
      areaId: i.areaId, categoria: i.categoria, prioridad: i.prioridad, hallazgo: i.descripcion,
      solicitanteNombre: i.solicitanteNombre, solicitanteId: i.solicitanteId, fechaSolicitud: i.fechaReporte,
      origen: { tipo: 'INCIDENCIA', id: i.id, folio: i.folio }
    });
  },

  async cancelar(id) {
    const i = ST.incidencias.find(x => x.id === id); if (!i) return;
    const motivo = await UI.pedirTexto(`Cancelar ${i.folio}`, 'Motivo de la cancelación (queda en la bitácora)');
    if (!motivo) return;
    await DB.actualizar('incidencias', id, { estatus: 'CANCELADA', motivoCancelacion: motivo, fechaCierre: nowISO() });
    DB.log('CANCELACION', 'incidencias', i.folio, motivo);
    UI.toast('Incidencia cancelada.');
  }
};

function sinDatos() {
  return { title: { text: 'Sin datos para graficar', left: 'center', top: 'middle', textStyle: { color: '#6b7f96', fontSize: 13, fontWeight: 'normal' } }, xAxis: { show: false }, yAxis: { show: false }, series: [] };
}

/* ==========================================================================
   Kanban PHVA para el seguimiento diario de cuadrillas
   ========================================================================== */
const ModTareas = {
  init() {
    ['tkCuadrilla', 'tkPeriodo'].forEach(id => $('#' + id).addEventListener('change', () => this.render()));
    $('#tkArchivadas').addEventListener('change', () => this.render());
    $('#tkNueva').onclick = () => this.editar(null);
    const tab = $('#tkTablero');
    tab.addEventListener('click', e => {
      const b = e.target.closest('[data-tk]'); if (!b) return;
      const t = ST.tareas.find(x => x.id === b.dataset.id); if (!t) return;
      const k = b.dataset.tk;
      if (k === 'editar') this.editar(t.id);
      if (k === 'izq' || k === 'der') this.mover(t, k === 'izq' ? -1 : 1);
      if (k === 'cerrar') this.cerrar(t);
    });
    // Arrastrar y soltar (escritorio). En pantallas táctiles se usan los botones ◀ ▶
    tab.addEventListener('dragstart', e => { const c = e.target.closest('.tk-card'); if (c) { e.dataTransfer.setData('text/plain', c.dataset.id); c.classList.add('drag'); } });
    tab.addEventListener('dragend', e => { const c = e.target.closest('.tk-card'); c && c.classList.remove('drag'); $$('.tk-col.over').forEach(x => x.classList.remove('over')); });
    tab.addEventListener('dragover', e => { const col = e.target.closest('.tk-col'); if (col && can('capture')) { e.preventDefault(); $$('.tk-col.over').forEach(x => x !== col && x.classList.remove('over')); col.classList.add('over'); } });
    tab.addEventListener('drop', e => {
      const col = e.target.closest('.tk-col'); if (!col) return; e.preventDefault();
      const t = ST.tareas.find(x => x.id === e.dataTransfer.getData('text/plain'));
      col.classList.remove('over');
      if (t && t.fase !== col.dataset.fase) this.cambiarFase(t, col.dataset.fase);
    });
  },

  cuadrillas() { return [...new Set(ST.tareas.map(t => t.cuadrilla).filter(Boolean))].sort(); },

  render() {
    const cs = $('#tkCuadrilla'), cv = cs.value;
    cs.innerHTML = opciones(this.cuadrillas(), cv, 'Todas las cuadrillas');
    $('#tkNueva').hidden = !can('capture');
    const per = $('#tkPeriodo').value, hoy = ymdLocal();
    const finSem = sumarDias(hoy, 6);
    const verArch = $('#tkArchivadas').checked;
    const lista = ST.tareas.filter(t =>
      (verArch || !t.archivada) && (!cv || t.cuadrilla === cv) &&
      (per === 'todas' || (per === 'hoy' ? (t.fecha && t.fecha <= hoy) : (t.fecha && t.fecha <= finSem)))
    );
    const vencidas = ST.tareas.filter(t => !t.archivada && t.fecha && t.fecha < hoy).length;
    $('#tkResumen').innerHTML = `${ST.tareas.filter(t => !t.archivada).length} tareas activas${vencidas ? `, <b class="txt-rojo">${vencidas} con fecha compromiso vencida</b>` : ''}. ${ST.tareas.filter(t => t.archivada).length} cerradas.`;
    $('#tkTablero').innerHTML = FASES_PHVA.map((f, idx) => {
      const ts = lista.filter(t => (t.fase || 'P') === f.k).sort((a, b) => String(a.fecha || '9').localeCompare(String(b.fecha || '9')) || ordenIdx(['ALTA', 'MEDIA', 'BAJA'], a.prioridad) - ordenIdx(['ALTA', 'MEDIA', 'BAJA'], b.prioridad));
      return `<section class="tk-col" data-fase="${f.k}" aria-label="${f.l}">
        <header class="tk-head"><span class="tk-letra">${f.k}</span><div><h3>${f.l}</h3><p>${f.d}</p></div><span class="tk-n">${ts.length}</span></header>
        <div class="tk-cards">${ts.map(t => this.cardHTML(t, idx)).join('') || '<p class="tk-vacio">Sin tareas en esta fase.</p>'}</div>
      </section>`;
    }).join('');
  },

  cardHTML(t, idx) {
    const hoy = ymdLocal(), venc = !t.archivada && t.fecha && t.fecha < hoy, esHoy = t.fecha === hoy;
    const a = t.areaId ? Areas.porId(t.areaId) : null;
    const c = can('capture') && !t.archivada;
    return `<article class="tk-card prio-${(t.prioridad || 'MEDIA').toLowerCase()}${t.archivada ? ' arch' : ''}" draggable="${c}" data-id="${esc(t.id)}">
      <h4>${esc(t.titulo)}</h4>
      ${t.detalle ? `<p>${esc(t.detalle)}</p>` : ''}
      <div class="tk-meta">
        ${a ? `<span>${esc(a.oficina)}</span>` : ''}
        ${t.cuadrilla ? `<span>${esc(t.cuadrilla)}</span>` : ''}
        ${t.vinculo ? `<span class="mono">${esc(t.vinculo)}</span>` : ''}
        ${t.fecha ? `<span class="${venc ? 'txt-rojo' : esHoy ? 'txt-ambar' : ''}">${venc ? 'Vencida ' : esHoy ? 'Hoy ' : ''}${fFecha(t.fecha)}</span>` : ''}
        ${t.archivada ? `<span>Cerrada ${fFecha(t.fechaCierre)}</span>` : ''}
      </div>
      ${c ? `<div class="tk-acc">
        <button class="btn-ico" data-tk="izq" data-id="${esc(t.id)}" ${idx === 0 ? 'disabled' : ''} aria-label="Mover a la fase anterior">◀</button>
        <button class="btn btn-sm btn-ghost" data-tk="editar" data-id="${esc(t.id)}">Editar</button>
        ${idx === 3 ? `<button class="btn btn-sm btn-success" data-tk="cerrar" data-id="${esc(t.id)}">Cerrar tarea</button>` : ''}
        <button class="btn-ico" data-tk="der" data-id="${esc(t.id)}" ${idx === 3 ? 'disabled' : ''} aria-label="Mover a la fase siguiente">▶</button>
      </div>` : ''}
    </article>`;
  },

  mover(t, d) {
    const i = FASES_PHVA.findIndex(f => f.k === (t.fase || 'P')) + d;
    if (i < 0 || i > 3) return;
    this.cambiarFase(t, FASES_PHVA[i].k);
  },
  async cambiarFase(t, fase) {
    if (!can('capture')) return;
    const hist = Object.assign({}, t.historial || {});
    hist[uid()] = { ts: nowISO(), de: t.fase || 'P', a: fase, rol: SESION.rol };
    await DB.actualizar('tareas', t.id, { fase, historial: hist });
    DB.log('FASE', 'tareas', t.titulo, `${t.fase || 'P'} → ${fase}`);
  },
  async cerrar(t) {
    if (!(await UI.confirmar(`¿Cerrar la tarea «${esc(t.titulo)}»? Saldrá del tablero y quedará en el historial.`, { texto: 'Cerrar tarea' }))) return;
    await DB.actualizar('tareas', t.id, { archivada: true, fechaCierre: ymdLocal() });
    DB.log('CIERRE', 'tareas', t.titulo, '');
    UI.toast('Tarea cerrada.', 'ok');
  },

  editar(id, pre = {}) {
    const t = id ? ST.tareas.find(x => x.id === id) : null;
    const vinculos = [
      ...ST.ordenes.filter(o => OT_ABIERTAS.includes(o.estatus)).map(o => ({ v: o.folio, l: `${o.folio}, ${o.oficina}` })),
      ...ST.incidencias.filter(i => i.estatus === 'ABIERTA').map(i => ({ v: i.folio, l: `${i.folio}, ${i.oficina}` }))
    ];
    const vv = t ? t.vinculo : pre.vinculo;
    if (vv && !vinculos.some(x => x.v === vv)) vinculos.unshift({ v: vv, l: vv });
    const m = UI.modal({
      titulo: t ? 'Editar tarea' : 'Nueva tarea', ancho: '680px',
      cuerpo: `<label class="fl"><span>Tarea</span><input id="tTit" value="${esc(t ? t.titulo : pre.titulo || '')}" placeholder="Acción concreta, por ejemplo: cambiar flotador de cisterna"></label>
        <label class="fl"><span>Detalle</span><textarea id="tDet" rows="3">${esc(t ? t.detalle || '' : '')}</textarea></label>
        ${AreaPicker.html('tp', { opcional: true })}
        <div class="fg3">
          <label class="fl"><span>Fase PHVA</span><select id="tFase">${opciones(FASES_PHVA.map(f => ({ v: f.k, l: f.l })), t ? t.fase : 'P')}</select></label>
          <label class="fl"><span>Cuadrilla o ejecutor</span><input id="tCua" list="dlCua" value="${esc(t ? t.cuadrilla || '' : '')}"></label>
          <label class="fl"><span>Fecha compromiso</span><input type="date" id="tFec" value="${esc(t ? t.fecha || '' : ymdLocal())}"></label>
          <label class="fl"><span>Prioridad</span><select id="tPrio">${opciones(Object.keys(PRIORIDADES).map(k => ({ v: k, l: PRIORIDADES[k].l })), t ? t.prioridad : 'MEDIA')}</select></label>
          <label class="fl"><span>Categoría</span><select id="tCat">${opciones(CATEGORIAS, t ? t.categoria : pre.categoria, 'Sin categoría')}</select></label>
          <label class="fl"><span>Vínculo (OT o incidencia)</span><select id="tVin">${opciones(vinculos, vv, 'Sin vínculo')}</select></label>
        </div>
        <datalist id="dlCua">${this.cuadrillas().map(c => `<option value="${esc(c)}">`).join('')}</datalist>`,
      acciones: [
        ...(t && can('delete') ? [{ texto: 'Eliminar', clase: 'btn-ghost txt-rojo', fn: async () => {
          if (!(await UI.confirmar('¿Eliminar la tarea de forma definitiva?', { texto: 'Eliminar', peligro: true }))) return false;
          await DB.eliminar('tareas', t.id); DB.log('BAJA', 'tareas', t.titulo, '');
        } }] : []),
        { texto: 'Cancelar' },
        {
          texto: t ? 'Guardar' : 'Agregar al tablero', clase: 'btn-primary', fn: async mm => {
            const titulo = mm.q('#tTit').value.trim();
            if (!titulo) { UI.toast('Escriba la tarea.', 'err'); return false; }
            const datos = {
              titulo, detalle: mm.q('#tDet').value.trim(), areaId: AreaPicker.valor('tp'), fase: mm.q('#tFase').value,
              cuadrilla: mayus(mm.q('#tCua').value), fecha: mm.q('#tFec').value, prioridad: mm.q('#tPrio').value,
              categoria: mm.q('#tCat').value, vinculo: mm.q('#tVin').value
            };
            if (t) { await DB.actualizar('tareas', t.id, datos); DB.log('EDICION', 'tareas', titulo, ''); }
            else { datos.archivada = false; datos.creadoPor = SESION.rol; await DB.guardar('tareas', datos); DB.log('ALTA', 'tareas', titulo, datos.vinculo || ''); }
            UI.toast(t ? 'Tarea actualizada.' : 'Tarea agregada.', 'ok');
          }
        }
      ]
    });
    AreaPicker.init('tp', t ? t.areaId : pre.areaId, { opcional: true });
  }
};

UI.registrar('incidencias', ModIncidencias);
UI.registrar('tareas', ModTareas);
