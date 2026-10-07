/* ==========================================================================
   CONTROL DE EDIFICIOS · IES
   js/mod-mantenimientos.js — Módulo 3: Mantenimientos programados
   Rubros: Aires Acondicionados, Fumigación, Extintores, Pintura,
   Cisternas y Tinacos, Mobiliario, Impermeabilizado y EPP.
   ========================================================================== */

/* Equivalencia rubro → categoría de OT (para prellenar órdenes de trabajo) */
const RUBRO_A_CATEGORIA = {
  'Aires Acondicionados': 'Aire Acondicionado', 'Fumigación': 'Fumigación', 'Pintura': 'Pintura',
  'Impermeabilizado': 'Impermeabilizado', 'Cisternas y Tinacos': 'Plomería', 'Mobiliario': 'Carpintería'
};

/* ---------- Reglas de cálculo del programa ---------- */
const Mant = {
  ejecuciones(p) { return Object.keys(p.ejecuciones || {}).map(k => Object.assign({ id: k }, p.ejecuciones[k])).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))); },
  ultima(p) { return this.ejecuciones(p)[0] || null; },
  /* Próxima fecha: última ejecución + periodicidad; si no hay ejecuciones, la fecha de inicio.
     Un plan de periodicidad única queda concluido al registrar su ejecución. */
  proxima(p) {
    const u = this.ultima(p), per = Number(p.periodicidadDias) || 0;
    if (!per) return u ? '' : (p.fechaInicio || '');
    return u ? sumarDias(u.fecha, per) : (p.fechaInicio || '');
  },
  estado(p) {
    if (p.activo === false) return 'inactivo';
    const px = this.proxima(p), hoy = ymdLocal();
    if (!px) return 'concluido';
    if (px < hoy) return 'vencido';
    if (px <= sumarDias(hoy, 15)) return 'proximo';
    return 'aldia';
  },
  tagEstado(p) {
    const e = this.estado(p);
    const m = { vencido: ['t-rojo', 'Vencido'], proximo: ['t-ambar', 'Próximo'], aldia: ['t-verde', 'Al día'], concluido: ['t-azul', 'Concluido'], inactivo: ['t-gris', 'Inactivo'] }[e];
    return `<span class="tag ${m[0]}">${m[1]}</span>`;
  },
  alcanceTxt(p) {
    if (p.alcance === 'AREA') { const a = Areas.porId(p.areaId); return a ? `${a.oficina} (${tituloEdificio(a.edificio)})` : 'Área no encontrada'; }
    if (p.alcance === 'EDIFICIO') return tituloEdificio(p.edificio) || 'Edificio';
    return 'Todas las instalaciones';
  },
  periodicidadTxt(d) { const x = PERIODICIDADES.find(z => z.d === Number(d)); return x ? x.l : `Cada ${d} días`; },
  /* Fechas programadas dentro de un año calendario */
  programadas(p, anio) {
    const r = [], per = Number(p.periodicidadDias) || 0;
    if (!p.fechaInicio) return r;
    if (!per) { if (p.fechaInicio.slice(0, 4) === String(anio)) r.push(p.fechaInicio); return r; }
    let f = p.fechaInicio, n = 0;
    while (f.slice(0, 4) < String(anio) && n < 2000) { f = sumarDias(f, per); n++; }
    while (f.slice(0, 4) === String(anio) && n < 4000) { r.push(f); f = sumarDias(f, per); n++; }
    return r;
  },
  /* Registra una ejecución (también se invoca al entregar una OT originada por el plan) */
  async registrarEjecucion(p, e) {
    const id = uid();
    await DB.db.ref(`${FB.root}/mantenimientos/${p.id}/ejecuciones/${id}`).set(limpiarUndefined(Object.assign({ registrado: nowISO(), por: SESION.rol }, e)));
    await DB.actualizar('mantenimientos', p.id, {});
    DB.log('EJECUCION', 'mantenimientos', `${p.rubro}: ${p.descripcion}`, `${fFecha(e.fecha)}, ${money(e.costo)}${e.otFolio ? ', ' + e.otFolio : ''}`);
  }
};

const ModMant = {
  rubro: '',
  init() {
    $('#mtRubros').addEventListener('click', e => { const b = e.target.closest('[data-rubro]'); if (!b) return; this.rubro = b.dataset.rubro; this.render(); });
    ['mtTipo', 'mtAnio', 'mtEstado'].forEach(id => $('#' + id).addEventListener('change', () => this.render()));
    $('#mtNuevo').onclick = () => this.editar(null);
    $('#mtTabla').addEventListener('click', e => {
      const b = e.target.closest('[data-mt]'); if (!b) return;
      const p = ST.mantenimientos.find(x => x.id === b.dataset.id); if (!p) return;
      ({ ejecutar: () => this.ejecutar(p), ot: () => this.generarOT(p), editar: () => this.editar(p.id), hist: () => this.historial(p) })[b.dataset.mt]();
    });
    const y = new Date().getFullYear();
    $('#mtAnio').innerHTML = opciones([y - 1, y, y + 1], y);
    $('#mtEstado').innerHTML = opciones([{ v: 'vencido', l: 'Vencidos' }, { v: 'proximo', l: 'Próximos 15 días' }, { v: 'aldia', l: 'Al día' }, { v: 'concluido', l: 'Concluidos' }, { v: 'inactivo', l: 'Inactivos' }], '', 'Todos los estados');
  },

  render() {
    $('#mtNuevo').hidden = !can('capture');
    const todos = ST.mantenimientos, act = todos.filter(p => p.activo !== false);
    const hoy = ymdLocal(), anio = Number($('#mtAnio').value), mes = hoy.slice(0, 7);

    // Chips de rubro
    $('#mtRubros').innerHTML = [{ r: '', l: 'Todos' }, ...RUBROS_MANT.map(r => ({ r, l: r }))].map(x => {
      const lista = act.filter(p => !x.r || p.rubro === x.r);
      const venc = lista.filter(p => Mant.estado(p) === 'vencido').length;
      return `<button type="button" class="chip${this.rubro === x.r ? ' on' : ''}" data-rubro="${esc(x.r)}" aria-pressed="${this.rubro === x.r}">
        ${esc(x.l)} <span class="chip-n">${lista.length}</span>${venc ? `<span class="chip-v" title="Vencidos">${venc}</span>` : ''}</button>`;
    }).join('');

    // Indicadores
    const venc = act.filter(p => Mant.estado(p) === 'vencido').length;
    const prox = act.filter(p => Mant.estado(p) === 'proximo').length;
    const ejecMes = todos.reduce((s, p) => s + Mant.ejecuciones(p).filter(e => String(e.fecha).slice(0, 7) === mes).length, 0);
    let progHoy = 0, ejecAnio = 0, invAnio = 0;
    act.forEach(p => {
      progHoy += Mant.programadas(p, anio).filter(f => f <= hoy).length;
      const ea = Mant.ejecuciones(p).filter(e => String(e.fecha).slice(0, 4) === String(anio));
      ejecAnio += ea.filter(e => e.fecha <= hoy).length;
      invAnio += ea.reduce((s, e) => s + (Number(e.costo) || 0), 0);
    });
    const cumpl = progHoy ? Math.min(100, Math.round(ejecAnio / progHoy * 100)) : null;
    $('#mtKpis').innerHTML = [
      kpi(act.length, 'Planes activos', `${RUBROS_MANT.filter(r => act.some(p => p.rubro === r)).length} de ${RUBROS_MANT.length} rubros cubiertos`, 'k-azul'),
      kpi(venc, 'Vencidos', venc ? 'Atención inmediata' : 'Sin atrasos', venc ? 'k-rojo' : 'k-verde'),
      kpi(prox, 'Próximos 15 días', 'Programar proveedor', prox ? 'k-ambar' : 'k-azul'),
      kpi(ejecMes, 'Ejecutados este mes', MESES_L[new Date().getMonth()], 'k-verde'),
      kpi(cumpl == null ? '—' : cumpl + ' %', `Cumplimiento ${anio}`, `${ejecAnio} de ${progHoy} programados a la fecha`, cumpl == null ? 'k-azul' : cumpl >= 90 ? 'k-verde' : cumpl >= 70 ? 'k-ambar' : 'k-rojo'),
      kpi(money(invAnio).replace(/\.\d\d$/, ''), `Inversión ${anio}`, 'Ejecuciones registradas', 'k-azul')
    ].join('');

    // Tabla
    const tp = $('#mtTipo').value, es = $('#mtEstado').value;
    const lista = todos.filter(p => (!this.rubro || p.rubro === this.rubro) && (!tp || p.tipo === tp) && (!es || Mant.estado(p) === es))
      .sort((a, b) => ordenIdx(['vencido', 'proximo', 'aldia', 'concluido', 'inactivo'], Mant.estado(a)) - ordenIdx(['vencido', 'proximo', 'aldia', 'concluido', 'inactivo'], Mant.estado(b)) || String(Mant.proxima(a)).localeCompare(String(Mant.proxima(b))));
    const c = can('capture');
    $('#mtTabla').innerHTML = lista.length ? `<table class="tbl"><thead><tr><th>Rubro</th><th>Actividad</th><th>Tipo</th><th>Alcance</th><th>Periodicidad</th><th>Última ejecución</th><th>Próxima</th><th>Estado</th><th>Proveedor</th><th></th></tr></thead><tbody>
      ${lista.map(p => { const u = Mant.ultima(p), px = Mant.proxima(p), dd = px ? diasEntre(hoy, px) : null; return `<tr>
        <td><b>${esc(p.rubro)}</b></td><td class="desc">${esc(p.descripcion || '')}</td><td>${esc(p.tipo || '')}</td><td>${esc(Mant.alcanceTxt(p))}</td>
        <td>${esc(Mant.periodicidadTxt(p.periodicidadDias))}</td><td>${u ? fFecha(u.fecha) : '<span class="muted">Sin registro</span>'}</td>
        <td>${px ? `${fFecha(px)}<br><span class="muted">${dd < 0 ? `hace ${-dd} días` : dd === 0 ? 'hoy' : `en ${dd} días`}</span>` : '—'}</td>
        <td>${Mant.tagEstado(p)}</td><td>${esc(p.proveedor || '—')}</td>
        <td class="acc">${c && p.activo !== false && Mant.estado(p) !== 'concluido' ? `<button class="btn btn-sm btn-primary" data-mt="ejecutar" data-id="${esc(p.id)}">Registrar ejecución</button>
          <button class="btn btn-sm" data-mt="ot" data-id="${esc(p.id)}">Generar OT</button>` : ''}
          <button class="btn btn-sm btn-ghost" data-mt="hist" data-id="${esc(p.id)}">Historial</button>
          ${c ? `<button class="btn btn-sm btn-ghost" data-mt="editar" data-id="${esc(p.id)}">Editar</button>` : ''}</td></tr>`; }).join('')}</tbody></table>`
      : UI.vacio(todos.length ? 'Ningún plan coincide con los filtros.' : 'Registre el primer plan de mantenimiento: rubro, alcance, periodicidad y fecha de inicio.');

    // Programa anual
    const planes = todos.filter(p => p.activo !== false && (!this.rubro || p.rubro === this.rubro) && (!tp || p.tipo === tp));
    const mesActual = anio === new Date().getFullYear() ? new Date().getMonth() : (anio < new Date().getFullYear() ? 12 : -1);
    $('#mtPrograma').innerHTML = planes.length ? `<table class="prog"><thead><tr><th>Plan</th>${MESES.map((m, i) => `<th class="${i === mesActual ? 'hoy' : ''}">${m}</th>`).join('')}</tr></thead><tbody>
      ${planes.map(p => {
        const prog = Mant.programadas(p, anio).map(f => Number(f.slice(5, 7)) - 1);
        const ejec = Mant.ejecuciones(p).filter(e => String(e.fecha).slice(0, 4) === String(anio)).map(e => Number(String(e.fecha).slice(5, 7)) - 1);
        return `<tr><td><b>${esc(p.rubro)}</b><br><span class="muted">${esc(p.descripcion || '')}</span></td>${MESES.map((m, i) => {
          const pl = prog.includes(i), ej = ejec.includes(i);
          const cls = ej ? 'c-ej' : pl ? (i < mesActual ? 'c-nc' : 'c-pl') : '';
          const t = ej ? 'Ejecutado' : pl ? (i < mesActual ? 'Programado sin ejecución en el mes' : 'Programado') : '';
          return `<td class="${i === mesActual ? 'hoy' : ''}">${cls ? `<i class="${cls}" title="${t}"></i>` : ''}</td>`;
        }).join('')}</tr>`;
      }).join('')}</tbody></table>` : UI.vacio('Sin planes activos para el programa anual.');
  },

  editar(id) {
    const p = id ? ST.mantenimientos.find(x => x.id === id) : null;
    const alc = p ? p.alcance : 'GENERAL';
    const m = UI.modal({
      titulo: p ? 'Editar plan de mantenimiento' : 'Nuevo plan de mantenimiento', ancho: '720px',
      cuerpo: `<div class="fg3">
          <label class="fl"><span>Rubro</span><select id="mRub">${opciones(RUBROS_MANT, p ? p.rubro : this.rubro, 'Seleccione')}</select></label>
          <label class="fl"><span>Tipo</span><select id="mTipo">${opciones(['Preventivo', 'Correctivo'], p ? p.tipo : 'Preventivo')}</select></label>
          <label class="fl"><span>Periodicidad</span><select id="mPer">${opciones(PERIODICIDADES.map(x => ({ v: x.d, l: x.l })), p ? p.periodicidadDias : 90)}</select></label>
        </div>
        <label class="fl"><span>Actividad</span><input id="mDesc" value="${esc(p ? p.descripcion || '' : '')}" placeholder="Por ejemplo: limpieza de filtros y revisión de gas en minisplits"></label>
        <fieldset class="seg"><legend>Alcance</legend>
          ${[['GENERAL', 'Todas las instalaciones'], ['EDIFICIO', 'Un edificio'], ['AREA', 'Un área']].map(([v, l]) => `<label><input type="radio" name="mAlc" value="${v}"${alc === v ? ' checked' : ''}> ${l}</label>`).join('')}
        </fieldset>
        <div id="mAlcEd" class="fg3"><label class="fl"><span>Edificio</span><select id="mEd">${opciones(Areas.edificios(), p ? p.edificio : '', 'Seleccione')}</select></label></div>
        <div id="mAlcAr">${AreaPicker.html('mp')}</div>
        <div class="fg3">
          <label class="fl"><span>Fecha de inicio del programa</span><input type="date" id="mIni" value="${esc(p ? p.fechaInicio || '' : ymdLocal())}"></label>
          <label class="fl"><span>Proveedor</span><input id="mProv" value="${esc(p ? p.proveedor || '' : '')}"></label>
          <label class="fl"><span>Costo estimado por servicio</span><input type="number" id="mCosto" min="0" step="0.01" value="${p ? Number(p.costoEstimado) || '' : ''}"></label>
        </div>
        <label class="fl"><span>Responsable del seguimiento</span><input id="mResp" value="${esc(p ? p.responsable || '' : '')}" list="dlPersAF"></label>
        <datalist id="dlPersAF">${PERSONAL_AF.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
        ${p ? `<label class="chk"><input type="checkbox" id="mAct"${p.activo !== false ? ' checked' : ''}> Plan activo</label>` : ''}`,
      acciones: [
        ...(p && can('delete') ? [{ texto: 'Eliminar', clase: 'btn-ghost txt-rojo', fn: async () => {
          if (!(await UI.confirmar(`¿Eliminar el plan y sus ${Mant.ejecuciones(p).length} ejecuciones registradas?`, { texto: 'Eliminar', peligro: true }))) return false;
          await DB.eliminar('mantenimientos', p.id); DB.log('BAJA', 'mantenimientos', `${p.rubro}: ${p.descripcion}`, '');
        } }] : []),
        { texto: 'Cancelar' },
        {
          texto: p ? 'Guardar plan' : 'Agregar plan', clase: 'btn-primary', fn: async mm => {
            const alcance = mm.q('input[name=mAlc]:checked').value;
            const d = {
              rubro: mm.q('#mRub').value, tipo: mm.q('#mTipo').value, periodicidadDias: Number(mm.q('#mPer').value),
              descripcion: mm.q('#mDesc').value.trim(), alcance,
              edificio: alcance === 'EDIFICIO' ? mm.q('#mEd').value : (alcance === 'AREA' ? (Areas.porId(AreaPicker.valor('mp')) || {}).edificio || '' : ''),
              areaId: alcance === 'AREA' ? AreaPicker.valor('mp') : '',
              fechaInicio: mm.q('#mIni').value, proveedor: mm.q('#mProv').value.trim(),
              costoEstimado: Number(mm.q('#mCosto').value) || 0, responsable: mayus(mm.q('#mResp').value)
            };
            const f = [];
            if (!RUBROS_MANT.includes(d.rubro)) f.push('rubro'); if (!d.descripcion) f.push('actividad'); if (!d.fechaInicio) f.push('fecha de inicio');
            if (alcance === 'EDIFICIO' && !d.edificio) f.push('edificio'); if (alcance === 'AREA' && !d.areaId) f.push('área');
            if (f.length) { UI.toast('Falta: ' + f.join(', ') + '.', 'err'); return false; }
            if (p) { if (mm.q('#mAct')) d.activo = mm.q('#mAct').checked; await DB.actualizar('mantenimientos', p.id, d); DB.log('EDICION', 'mantenimientos', `${d.rubro}: ${d.descripcion}`, ''); }
            else { d.activo = true; await DB.guardar('mantenimientos', d); DB.log('ALTA', 'mantenimientos', `${d.rubro}: ${d.descripcion}`, Mant.periodicidadTxt(d.periodicidadDias)); }
            UI.toast('Plan guardado.', 'ok');
          }
        }
      ]
    });
    AreaPicker.init('mp', p ? p.areaId : '');
    const vis = () => {
      const v = m.q('input[name=mAlc]:checked').value;
      m.q('#mAlcEd').hidden = v !== 'EDIFICIO'; m.q('#mAlcAr').hidden = v !== 'AREA';
    };
    $$('input[name=mAlc]', m.el).forEach(r => r.onchange = vis); vis();
  },

  ejecutar(p) {
    UI.modal({
      titulo: 'Registrar ejecución', sub: `${esc(p.rubro)}: ${esc(p.descripcion || '')}. Programada: ${fFecha(Mant.proxima(p))}`, ancho: '600px',
      cuerpo: `<div class="fg2">
        <label class="fl"><span>Fecha de ejecución</span><input type="date" id="eFec" value="${ymdLocal()}"></label>
        <label class="fl"><span>Costo real</span><input type="number" id="eCosto" min="0" step="0.01" value="${Number(p.costoEstimado) || ''}"></label>
        <label class="fl full"><span>Proveedor o ejecutor</span><input id="eProv" value="${esc(p.proveedor || '')}"></label>
        <label class="fl full"><span>Observaciones y hallazgos</span><textarea id="eObs" rows="3"></textarea></label></div>`,
      acciones: [{ texto: 'Cancelar' }, {
        texto: 'Registrar', clase: 'btn-primary', fn: async mm => {
          const fecha = mm.q('#eFec').value;
          if (!fecha) { UI.toast('Indique la fecha.', 'err'); return false; }
          await Mant.registrarEjecucion(p, { fecha, costo: Number(mm.q('#eCosto').value) || 0, proveedor: mm.q('#eProv').value.trim(), obs: mm.q('#eObs').value.trim() });
          UI.toast(`Ejecución registrada. Próxima: ${fFecha(Number(p.periodicidadDias) ? sumarDias(fecha, p.periodicidadDias) : '')}`, 'ok');
        }
      }]
    });
  },

  historial(p) {
    const ej = Mant.ejecuciones(p);
    UI.modal({
      titulo: 'Historial de ejecuciones', sub: `${esc(p.rubro)}: ${esc(p.descripcion || '')}`, ancho: '760px',
      cuerpo: ej.length ? `<div class="tblwrap"><table class="tbl"><thead><tr><th>Fecha</th><th>Costo</th><th>Proveedor</th><th>OT</th><th>Observaciones</th></tr></thead><tbody>
        ${ej.map(e => `<tr><td>${fFecha(e.fecha)}</td><td class="num">${money(e.costo)}</td><td>${esc(e.proveedor || '—')}</td><td class="mono">${esc(e.otFolio || '—')}</td><td class="desc">${esc(e.obs || '')}</td></tr>`).join('')}
        </tbody><tfoot><tr><td>Total</td><td class="num">${money(ej.reduce((s, e) => s + (Number(e.costo) || 0), 0))}</td><td colspan="3"></td></tr></tfoot></table></div>` : UI.vacio('Sin ejecuciones registradas.'),
      acciones: [{ texto: 'Cerrar' }]
    });
  },

  generarOT(p) {
    OT.levantamiento({
      areaId: p.alcance === 'AREA' ? p.areaId : '', categoria: RUBRO_A_CATEGORIA[p.rubro] || '', prioridad: 'MEDIA',
      hallazgo: `Mantenimiento ${String(p.tipo || '').toLowerCase()} programado de ${p.rubro}: ${p.descripcion || ''}`,
      ejecutor: p.proveedor || '', origen: { tipo: 'MANTENIMIENTO', id: p.id, folio: p.rubro },
      ubicacionGeneral: p.alcance !== 'AREA' ? (p.alcance === 'EDIFICIO' ? p.edificio : 'TODAS LAS INSTALACIONES') : ''
    });
  }
};

UI.registrar('mantenimientos', ModMant);
