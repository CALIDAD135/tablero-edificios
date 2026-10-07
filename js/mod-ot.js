/* ==========================================================================
   CONTROL DE EDIFICIOS · IES
   js/mod-ot.js — Módulo 5: Órdenes de trabajo y levantamientos en sitio
   Flujo: Levantada → En proceso → Culminada → Entregada (con firmas)
   SLA: tiempo exacto desde el levantamiento hasta la culminación.
   ========================================================================== */

const ORIGEN_TXT = { INCIDENCIA: 'Incidencia', SOLICITUD: 'Solicitud de usuario', MANTENIMIENTO: 'Mantenimiento programado', LEVANTAMIENTO: 'Levantamiento en sitio' };
const FOTOS_N = 3;

const OT = {
  costos(o) {
    const materiales = lista(o.materiales).reduce((s, x) => s + (Number(x.cant) || 0) * (Number(x.costo) || 0), 0);
    const manoObra = Number(o.manoObra) || 0;
    return { materiales, manoObra, total: materiales + manoObra };
  },
  porId(id) { return ST.ordenes.find(o => o.id === id); },
  origenTxt(o) { const t = (o.origen && o.origen.tipo) || 'LEVANTAMIENTO'; return ORIGEN_TXT[t] + (o.origen && o.origen.folio && t !== 'MANTENIMIENTO' ? ` ${o.origen.folio}` : ''); },

  /* ---------- Levantamiento en sitio (vista optimizada para tablet y celular) ---------- */
  levantamiento(pre = {}) {
    if (!can('capture')) return;
    const fotos = {};
    const general = pre.ubicacionGeneral || '';
    const m = UI.modal({
      titulo: 'Levantamiento en sitio', clase: 'm-campo m-fija', ancho: '860px',
      sub: pre.origen ? `Origen: ${esc(ORIGEN_TXT[pre.origen.tipo] || '')} ${esc(pre.origen.folio || '')}` : 'Al generar la orden inicia el conteo del SLA.',
      cuerpo: `
        <section class="campo-sec"><h3>Ubicación</h3>
          ${general ? `<label class="chk"><input type="checkbox" id="lGen" checked> Ubicación general: ${esc(general === 'TODAS LAS INSTALACIONES' ? 'todas las instalaciones' : tituloEdificio(general))}</label>` : ''}
          <div id="lAreaWrap">${AreaPicker.html('lp')}</div>
        </section>
        <section class="campo-sec"><h3>Trabajo requerido</h3>
          <div class="fg2">
            <label class="fl"><span>Categoría</span><select id="lCat">${opciones(CATEGORIAS, pre.categoria, 'Seleccione la categoría')}</select></label>
            <label class="fl"><span>Prioridad y meta de atención</span><select id="lPrio">${opciones(Object.keys(PRIORIDADES).map(k => ({ v: k, l: `${PRIORIDADES[k].l}: ${PRIORIDADES[k].h} h` })), pre.prioridad || 'MEDIA')}</select></label>
          </div>
          <label class="fl"><span>Hallazgo y descripción técnica</span><textarea id="lHall" rows="4" placeholder="Condición encontrada, causa probable y trabajo a realizar">${esc(pre.hallazgo || '')}</textarea></label>
        </section>
        <section class="campo-sec"><h3>Solicitante</h3>
          <label class="fl"><span>Nombre</span>${Personas.campo('lSol', pre.solicitanteNombre, pre.solicitanteId, 'Quien pide el trabajo')}</label>
          <div class="fg2">
            <label class="fl"><span>Correo</span><input id="lCor" type="email" inputmode="email" value="${esc(pre.solicitanteCorreo || '')}"></label>
            <label class="fl"><span>Teléfono</span><input id="lTel" inputmode="tel" value="${esc(pre.solicitanteTel || '')}"></label>
          </div>
        </section>
        <section class="campo-sec"><h3>Evidencia fotográfica inicial</h3>
          <div class="fotos" id="lFotos"></div>
        </section>`,
      acciones: [{ texto: 'Cancelar' }, {
        texto: 'Generar orden de trabajo', clase: 'btn-primary btn-grande', fn: async mm => {
          const usaGen = general && mm.q('#lGen') && mm.q('#lGen').checked;
          const areaId = usaGen ? '' : AreaPicker.valor('lp');
          const cat = mm.q('#lCat').value, hall = mm.q('#lHall').value.trim();
          const f = [];
          if (!usaGen && !areaId) f.push('ubicación'); if (!CATEGORIAS.includes(cat)) f.push('categoría'); if (!hall) f.push('hallazgo');
          if (f.length) { UI.toast('Falta: ' + f.join(', ') + '.', 'err'); return false; }
          const correo = mm.q('#lCor').value.trim(), tel = mm.q('#lTel').value.trim();
          const sol = await Personas.resolver(mm.q('#lSol'), 'esSolicitante', { correo, telefono: tel });
          const ahora = nowISO();
          const ub = usaGen ? { areaId: '', edificio: general, nivel: 'GENERAL', oficina: 'ÁREAS GENERALES', departamento: 'ÁREAS COMUNES' } : ubicacion(areaId);
          const o = Object.assign(ub, {
            folio: await DB.reservarFolio('OT'),
            origen: pre.origen || { tipo: 'LEVANTAMIENTO', id: '', folio: '' },
            categoria: cat, prioridad: mm.q('#lPrio').value, slaHorasMeta: PRIORIDADES[mm.q('#lPrio').value].h,
            hallazgo: hall, solicitanteId: sol ? sol.id : '', solicitanteNombre: sol ? sol.nombre : '',
            solicitanteCorreo: correo || (sol && sol.correo) || '', solicitanteTel: tel || (sol && sol.telefono) || '',
            fechaSolicitud: pre.fechaSolicitud || ahora, fechaLevantamiento: ahora,
            estatus: 'LEVANTADA', ejecutor: pre.ejecutor || '', materiales: [], manoObra: 0,
            fotos: Object.keys(fotos).reduce((r, k) => (r[k] = true, r), {}), firmas: { entrega: false, recibe: false },
            creadoPor: SESION.rol
          });
          const id = await DB.guardar('ordenes', o);
          for (const k of Object.keys(fotos)) await DB.guardarMedia(id, k, fotos[k]);
          await this.propagar(Object.assign({ id }, o), 'LEVANTADA');
          DB.log('ALTA', 'ordenes', o.folio, `${cat}, ${o.oficina}. SLA ${o.slaHorasMeta} h`);
          UI.toast(`Orden ${o.folio} generada. El SLA inicia ahora.`, 'ok');
          setTimeout(() => this.abrir(id), 250);
        }
      }]
    });
    AreaPicker.init('lp', pre.areaId);
    if (general) { const s = () => { m.q('#lAreaWrap').hidden = m.q('#lGen').checked; }; m.q('#lGen').onchange = s; s(); }
    Personas.activar(m.q('#lSol'), {
      flag: 'esSolicitante', alElegir: p => { if (p.correo && !m.q('#lCor').value) m.q('#lCor').value = p.correo; if (p.telefono && !m.q('#lTel').value) m.q('#lTel').value = p.telefono; }
    });
    this.montarFotos(m.q('#lFotos'), 'antes', fotos, true, null);
  },

  /* Ranuras de fotos: si otId es null se guardan en memoria hasta generar la OT */
  montarFotos(cont, fase, fotos, editable, otId) {
    const etiqueta = i => `${fase === 'antes' ? 'Antes' : 'Después'} ${i + 1}`;
    const pintar = () => {
      cont.innerHTML = Array.from({ length: FOTOS_N }, (_, i) => ranuraFoto(`${fase}_${i}`, etiqueta(i), fotos[`${fase}_${i}`], editable)).join('');
    };
    pintar();
    cont.onchange = async e => {
      const inp = e.target.closest('[data-foto]'); if (!inp || !inp.files[0]) return;
      const k = inp.dataset.foto;
      try {
        const url = await comprimirImagen(inp.files[0]);
        fotos[k] = url;
        if (otId) { await DB.guardarMedia(otId, k, url); await DB.actualizar('ordenes', otId, { [`fotos/${k}`]: true }); }
        pintar();
      } catch (er) { UI.toast(er.message, 'err'); }
    };
    cont.onclick = async e => {
      const b = e.target.closest('[data-quitar-foto]'); if (!b) return;
      const k = b.dataset.quitarFoto;
      delete fotos[k];
      if (otId) { await DB.guardarMedia(otId, k, null); await DB.actualizar('ordenes', otId, { [`fotos/${k}`]: null }); }
      pintar();
    };
  },

  /* ---------- Ficha de la orden de trabajo ---------- */
  async abrir(id) {
    const o = this.porId(id); if (!o) { UI.toast('Orden no encontrada.', 'err'); return; }
    const media = await DB.media(id).catch(() => ({}));
    const abierta = OT_ABIERTAS.includes(o.estatus);
    const ed = can('capture') && abierta;
    const dis = ed ? '' : ' disabled';
    const pasos = [['LEVANTADA', 'Levantada', o.fechaLevantamiento], ['EN_PROCESO', 'En proceso', o.fechaInicio], ['CULMINADA', 'Culminada', o.fechaCulminacion], ['ENTREGADA', 'Entregada', o.fechaEntrega]];
    const idxAct = pasos.findIndex(p => p[0] === o.estatus);
    const s = slaInfo(o);
    const acciones = [];
    if (can('capture') && abierta) acciones.push({ texto: 'Cancelar OT', clase: 'btn-ghost txt-rojo', fn: () => this.cancelar(o) });
    if (can('capture')) acciones.push({ texto: 'Agregar tarea PHVA', clase: 'btn-ghost', fn: () => { ModTareas.editar(null, { vinculo: o.folio, areaId: o.areaId, categoria: o.categoria, titulo: '' }); return false; }, cierra: false });
    if (['CULMINADA', 'ENTREGADA'].includes(o.estatus)) acciones.push({ texto: 'Reporte de entrega', clase: '', fn: () => { Reporte.abrir(o.id); } });
    if (ed) acciones.push({ texto: 'Guardar cambios', clase: '', cierra: false, fn: async mm => { await this.guardarFicha(o, mm); UI.toast('Cambios guardados.', 'ok'); return false; } });
    if (ed && o.estatus === 'LEVANTADA') acciones.push({ texto: 'Iniciar trabajos', clase: 'btn-primary', fn: mm => this.iniciar(o, mm) });
    if (ed && o.estatus === 'EN_PROCESO') acciones.push({ texto: 'Registrar culminación', clase: 'btn-primary', fn: mm => this.culminar(o, mm) });
    if (ed && o.estatus === 'CULMINADA') acciones.push({ texto: 'Entregar y generar reporte', clase: 'btn-success', fn: mm => this.entregar(o, mm) });
    acciones.unshift({ texto: 'Cerrar', clase: 'btn-ghost' });

    const m = UI.modal({
      titulo: `Orden de trabajo ${o.folio}`, clase: 'm-ot', ancho: '1040px',
      sub: `${tag(OT_ESTATUS, o.estatus)} ${tagPrioridad(o.prioridad)} <span class="muted">${esc(this.origenTxt(o))}</span>`,
      cuerpo: `
        <ol class="stepper">${pasos.map((p, i) => `<li class="${i < idxAct || o.estatus === 'ENTREGADA' ? 'hecho' : i === idxAct ? 'actual' : ''}${o.estatus === 'CANCELADA' ? ' canc' : ''}"><b>${p[1]}</b><span>${p[2] ? fFechaHora(p[2]) : '—'}</span></li>`).join('')}</ol>
        ${o.estatus === 'CANCELADA' ? `<div class="aviso">Orden cancelada: ${esc(o.motivoCancelacion || '')}</div>` : ''}
        <div class="ot-sla">
          <div><span class="muted">Tiempo de atención (SLA)</span>${slaHTML(o)}</div>
          <div><span class="muted">Meta por prioridad</span><b>${s.metaH} h</b></div>
          <div><span class="muted">Solicitud del usuario</span><b>${fFechaHora(o.fechaSolicitud)}</b></div>
          <div><span class="muted">Costo total</span><b id="oTotal">${money(this.costos(o).total)}</b></div>
        </div>
        <div class="ot-grid">
          <section class="ot-sec"><h3>Ubicación y solicitud</h3>
            <dl class="dl2">
              <dt>Ubicación</dt><dd><b>${esc(o.oficina)}</b><br>${esc(tituloEdificio(o.edificio))}, ${esc(tituloNivel(o.nivel).toLowerCase())}</dd>
              <dt>Responsable del área</dt><dd>${esc(Areas.responsable(Areas.porId(o.areaId)) || '—')}</dd>
            </dl>
            <div class="fg2">
              <label class="fl"><span>Categoría</span><select id="oCat"${dis}>${opciones(CATEGORIAS, o.categoria)}</select></label>
              <label class="fl"><span>Departamento al que se carga</span><select id="oDep"${dis}>${opciones(DEPARTAMENTOS, o.departamento || 'SIN ASIGNAR')}</select></label>
            </div>
            <label class="fl"><span>Hallazgo</span><textarea id="oHall" rows="3"${dis}>${esc(o.hallazgo || '')}</textarea></label>
            <label class="fl"><span>Solicitante</span><input id="oSol" value="${esc(o.solicitanteNombre || '')}"${dis}></label>
            <div class="fg2">
              <label class="fl"><span>Correo</span><input id="oCor" value="${esc(o.solicitanteCorreo || '')}"${dis}></label>
              <label class="fl"><span>Teléfono</span><input id="oTel" value="${esc(o.solicitanteTel || '')}"${dis}></label>
            </div>
          </section>
          <section class="ot-sec"><h3>Ejecución</h3>
            <label class="fl"><span>Ejecutado por (cuadrilla o proveedor)</span><input id="oEje" value="${esc(o.ejecutor || '')}"${dis}></label>
            <label class="fl"><span>Trabajos realizados</span><textarea id="oTrab" rows="4" placeholder="Descripción de lo ejecutado; aparecerá en el reporte de entrega"${dis}>${esc(o.trabajos || '')}</textarea></label>
            <div class="mat-head"><span>Materiales y refacciones</span>${ed ? '<button type="button" class="btn btn-sm" id="oMatAdd">Agregar renglón</button>' : ''}</div>
            <div class="tblwrap"><table class="tbl mat"><thead><tr><th>Descripción</th><th>Cant.</th><th>Unidad</th><th>Costo unit.</th><th>Importe</th>${ed ? '<th></th>' : ''}</tr></thead><tbody id="oMat"></tbody></table></div>
            <div class="fg2">
              <label class="fl"><span>Mano de obra (MXN)</span><input type="number" id="oMO" min="0" step="0.01" value="${Number(o.manoObra) || ''}"${dis}></label>
              <label class="fl"><span>Observaciones internas</span><input id="oObs" value="${esc(o.observaciones || '')}"${dis}></label>
            </div>
          </section>
        </div>
        <section class="ot-sec"><h3>Evidencia fotográfica</h3>
          <div class="fotos-2"><div><h4>Antes</h4><div class="fotos" id="oFotA"></div></div><div><h4>Después</h4><div class="fotos" id="oFotD"></div></div></div>
        </section>
        <section class="ot-sec"><h3>Firmas de conformidad</h3>
          <p class="hint">Se habilitan al registrar la culminación. Ambas firmas se incrustan en el reporte de entrega.</p>
          <div class="firmas" id="oFirmas"></div>
        </section>`,
      acciones
    });

    // Materiales
    const mats = lista(o.materiales).map(x => Object.assign({}, x));
    const tb = m.q('#oMat');
    const pintarMat = () => {
      tb.innerHTML = mats.length ? mats.map((x, i) => `<tr>
        <td><input data-i="${i}" data-k="desc" value="${esc(x.desc || '')}"${dis}></td>
        <td><input data-i="${i}" data-k="cant" type="number" min="0" step="0.01" value="${x.cant ?? ''}"${dis} class="num"></td>
        <td><input data-i="${i}" data-k="unidad" value="${esc(x.unidad || 'PZA')}"${dis}></td>
        <td><input data-i="${i}" data-k="costo" type="number" min="0" step="0.01" value="${x.costo ?? ''}"${dis} class="num"></td>
        <td class="num" data-imp="${i}">${money((Number(x.cant) || 0) * (Number(x.costo) || 0))}</td>
        ${ed ? `<td><button type="button" class="btn-ico" data-del="${i}" aria-label="Quitar renglón">✕</button></td>` : ''}</tr>`).join('')
        : `<tr><td colspan="${ed ? 6 : 5}" class="muted">Sin materiales registrados.</td></tr>`;
      totalMat();
    };
    const totalMat = () => { m.q('#oTotal').textContent = money(this.costos({ materiales: mats, manoObra: m.q('#oMO').value }).total); };
    // Se actualiza solo el importe del renglón y el total, sin redibujar la tabla (conserva el foco al tabular)
    tb.addEventListener('input', e => {
      const t = e.target; if (t.dataset.i == null) return;
      const x = mats[t.dataset.i]; x[t.dataset.k] = t.type === 'number' ? Number(t.value) : t.value;
      const c = tb.querySelector(`[data-imp="${t.dataset.i}"]`); if (c) c.textContent = money((Number(x.cant) || 0) * (Number(x.costo) || 0));
      totalMat();
    });
    tb.addEventListener('click', e => { const b = e.target.closest('[data-del]'); if (b) { mats.splice(Number(b.dataset.del), 1); pintarMat(); } });
    if (m.q('#oMatAdd')) m.q('#oMatAdd').onclick = () => { mats.push({ desc: '', cant: 1, unidad: 'PZA', costo: 0 }); pintarMat(); };
    m.q('#oMO').addEventListener('input', totalMat);
    m.mats = mats;
    pintarMat();

    // Fotos
    const fotos = Object.assign({}, media);
    const fotEd = can('capture') && abierta;
    this.montarFotos(m.q('#oFotA'), 'antes', fotos, fotEd, o.id);
    this.montarFotos(m.q('#oFotD'), 'despues', fotos, fotEd && o.estatus !== 'LEVANTADA', o.id);

    // Firmas
    const pintarFirmas = () => {
      const oo = this.porId(id) || o;
      const habil = can('capture') && oo.estatus === 'CULMINADA';
      const caja = (k, titulo, nombre, ts) => `<div class="firma-caja">
        <div class="firma-img">${media[k] ? `<img src="${media[k]}" alt="Firma ${esc(titulo)}">` : '<span>Sin firma</span>'}</div>
        <div class="firma-pie"><b>${esc(titulo)}</b><span>${esc(nombre || '—')}</span>${ts ? `<small>${fFechaHora(ts)}</small>` : ''}</div>
        ${habil ? `<button type="button" class="btn btn-sm${media[k] ? ' btn-ghost' : ' btn-primary'}" data-firmar="${k}">${media[k] ? 'Volver a firmar' : 'Firmar'}</button>` : ''}
      </div>`;
      m.q('#oFirmas').innerHTML = caja('firmaEntrega', 'Quien entrega el trabajo', oo.entregaNombre, oo.fechaFirmaEntrega) +
        caja('firmaRecibe', 'Quien recibe de conformidad', oo.recibeNombre || oo.solicitanteNombre, oo.fechaFirmaRecibe);
    };
    pintarFirmas();
    m.q('#oFirmas').addEventListener('click', e => {
      const b = e.target.closest('[data-firmar]'); if (!b) return;
      this.firmar(id, b.dataset.firmar, async () => { Object.assign(media, await DB.media(id)); pintarFirmas(); });
    });
  },

  firmar(id, clave, despues) {
    const o = this.porId(id);
    const entrega = clave === 'firmaEntrega';
    Firma.capturar({
      titulo: entrega ? 'Firma de quien entrega el trabajo' : 'Firma de quien recibe de conformidad',
      etiquetaNombre: entrega ? 'Personal de Activos Fijos que entrega' : 'Nombre de quien recibe',
      nombres: entrega ? PERSONAL_AF : null,
      nombre: entrega ? o.entregaNombre : (o.recibeNombre || o.solicitanteNombre || Areas.responsable(Areas.porId(o.areaId))),
      alGuardar: async (dataUrl, nombre) => {
        await DB.guardarMedia(id, clave, dataUrl);
        const c = entrega ? { entregaNombre: nombre, fechaFirmaEntrega: nowISO(), 'firmas/entrega': true } : { recibeNombre: nombre, fechaFirmaRecibe: nowISO(), 'firmas/recibe': true };
        await DB.actualizar('ordenes', id, c);
        DB.log('FIRMA', 'ordenes', o.folio, `${entrega ? 'Entrega' : 'Recibe'}: ${nombre}`);
        UI.toast('Firma guardada.', 'ok');
        despues && despues();
      }
    });
  },

  leerFicha(o, m) {
    const mats = (m.mats || []).filter(x => String(x.desc || '').trim()).map(x => ({ desc: String(x.desc).trim(), cant: Number(x.cant) || 0, unidad: mayus(x.unidad || 'PZA'), costo: Number(x.costo) || 0 }));
    return {
      categoria: m.q('#oCat').value, departamento: m.q('#oDep').value, hallazgo: m.q('#oHall').value.trim(),
      solicitanteNombre: mayus(m.q('#oSol').value), solicitanteCorreo: m.q('#oCor').value.trim(), solicitanteTel: m.q('#oTel').value.trim(),
      ejecutor: mayus(m.q('#oEje').value), trabajos: m.q('#oTrab').value.trim(), materiales: mats,
      manoObra: Number(m.q('#oMO').value) || 0, observaciones: m.q('#oObs').value.trim()
    };
  },
  async guardarFicha(o, m) {
    const d = this.leerFicha(o, m);
    await DB.actualizar('ordenes', o.id, d);
    DB.log('EDICION', 'ordenes', o.folio, `Total ${money(this.costos(d).total)}`);
    return d;
  },

  async iniciar(o, m) {
    await this.guardarFicha(o, m);
    await DB.actualizar('ordenes', o.id, { estatus: 'EN_PROCESO', fechaInicio: nowISO() });
    DB.log('INICIO', 'ordenes', o.folio, '');
    UI.toast('Trabajos iniciados.', 'ok');
    setTimeout(() => this.abrir(o.id), 200);
  },

  async culminar(o, m) {
    const d = this.leerFicha(o, m);
    if (!d.trabajos) { UI.toast('Describa los trabajos realizados antes de registrar la culminación.', 'err'); m.q('#oTrab').classList.add('err'); return false; }
    let fecha = null;
    const defecto = localInput(nowISO());
    await new Promise(res => UI.modal({
      titulo: 'Registrar culminación', ancho: '480px', alCerrar: res,
      cuerpo: `<p class="m-msg">La culminación detiene el contador del SLA. Si registra después de terminar, ajuste la hora real.</p>
        <label class="fl"><span>Fecha y hora de culminación</span><input type="datetime-local" id="cFec" value="${defecto}" max="${defecto}"></label>`,
      acciones: [{ texto: 'Cancelar' }, { texto: 'Registrar culminación', clase: 'btn-primary', fn: mm => {
        const raw = mm.q('#cFec').value;
        // Sin cambios en el campo: se toma la hora exacta (con segundos)
        let v = raw === defecto ? nowISO() : desdeLocalInput(raw);
        const lev = new Date(o.fechaLevantamiento), levMin = new Date(lev); levMin.setSeconds(0, 0);
        if (!v || new Date(v) < levMin) { UI.toast('La culminación no puede ser anterior al levantamiento.', 'err'); return false; }
        if (new Date(v) > new Date(Date.now() + 60000)) { UI.toast('La culminación no puede ser una fecha futura.', 'err'); return false; }
        // El campo trabaja por minutos: si coincide con el minuto del levantamiento, se respeta el instante del levantamiento
        if (new Date(v) < lev) v = lev.toISOString();
        fecha = v;
      } }]
    }));
    if (!fecha) return false;
    d.estatus = 'CULMINADA'; d.fechaCulminacion = fecha;
    if (!o.fechaInicio) d.fechaInicio = o.fechaLevantamiento;
    await DB.actualizar('ordenes', o.id, d);
    const s = slaInfo(Object.assign({}, o, d));
    DB.log('CULMINACION', 'ordenes', o.folio, `Tiempo ${fDur(s.transc)} de ${s.metaH} h: ${s.cumple ? 'cumple' : 'excede'} SLA`);
    UI.toast(`Culminada en ${fDur(s.transc)}. ${s.cumple ? 'Dentro' : 'Fuera'} del SLA. Capture las firmas para entregar.`, s.cumple ? 'ok' : 'err', 6000);
    setTimeout(() => this.abrir(o.id), 200);
  },

  async entregar(o, m) {
    if (m) await this.guardarFicha(o, m);
    const oo = this.porId(o.id) || o;
    const media = await DB.media(o.id, true);
    const falta = [];
    if (!media.firmaEntrega) falta.push('quien entrega'); if (!media.firmaRecibe) falta.push('quien recibe');
    if (falta.length) { UI.toast('Falta la firma de ' + falta.join(' y ') + '.', 'err'); return false; }
    await DB.actualizar('ordenes', o.id, { estatus: 'ENTREGADA', fechaEntrega: nowISO() });
    const fin = Object.assign({}, oo, { estatus: 'ENTREGADA' });
    await this.propagar(fin, 'ENTREGADA');
    DB.log('ENTREGA', 'ordenes', o.folio, `Entrega ${oo.entregaNombre}, recibe ${oo.recibeNombre}`);
    UI.toast(`Orden ${o.folio} entregada. Generando reporte…`, 'ok');
    setTimeout(() => Reporte.abrir(o.id, { descargar: true }), 300);
  },

  async cancelar(o) {
    const motivo = await UI.pedirTexto(`Cancelar ${o.folio}`, 'Motivo de la cancelación (queda en la bitácora)');
    if (!motivo) return false;
    await DB.actualizar('ordenes', o.id, { estatus: 'CANCELADA', motivoCancelacion: motivo, fechaCancelacion: nowISO() });
    await this.propagar(Object.assign({}, o, { estatus: 'CANCELADA' }), 'CANCELADA');
    DB.log('CANCELACION', 'ordenes', o.folio, motivo);
    UI.toast('Orden cancelada.');
  },

  /* Sincroniza el registro de origen (incidencia, solicitud o plan de mantenimiento) */
  async propagar(o, evento) {
    const org = o.origen || {};
    try {
      if (org.tipo === 'INCIDENCIA' && org.id) {
        if (evento === 'LEVANTADA') await DB.actualizar('incidencias', org.id, { estatus: 'EN_ATENCION', otId: o.id, otFolio: o.folio });
        if (evento === 'ENTREGADA') await DB.actualizar('incidencias', org.id, { estatus: 'RESUELTA', fechaCierre: nowISO() });
        if (evento === 'CANCELADA') await DB.actualizar('incidencias', org.id, { estatus: 'ABIERTA', otId: null, otFolio: null });
      }
      if (org.tipo === 'SOLICITUD' && org.folio) {
        if (evento === 'LEVANTADA') await DB.gestionSolicitud(org.folio, { estado: 'EN_ATENCION', otId: o.id, otFolio: o.folio });
        if (evento === 'ENTREGADA') await DB.gestionSolicitud(org.folio, { estado: 'CULMINADA', fechaCulminacion: o.fechaCulminacion || nowISO() });
        if (evento === 'CANCELADA') await DB.gestionSolicitud(org.folio, { estado: 'EN_REVISION', otId: null, otFolio: null });
      }
      if (org.tipo === 'MANTENIMIENTO' && org.id && evento === 'ENTREGADA') {
        const p = ST.mantenimientos.find(x => x.id === org.id);
        if (p) await Mant.registrarEjecucion(p, { fecha: ymdLocal(o.fechaCulminacion || nowISO()), costo: this.costos(o).total, proveedor: o.ejecutor || '', otId: o.id, otFolio: o.folio, obs: 'Registrada al entregar la orden de trabajo' });
      }
    } catch (e) { console.warn('propagar', e); UI.toast('La orden se guardó, pero no se pudo actualizar su origen: ' + e.message, 'err'); }
  }
};

/* ---------- Vista de órdenes de trabajo ---------- */
const ModOT = {
  init() {
    ['otBuscar', 'otEstatus', 'otCat', 'otEdif'].forEach(id => $('#' + id).addEventListener(id === 'otBuscar' ? 'input' : 'change', () => this.render()));
    $('#otEstatus').innerHTML = opciones([{ v: 'ACTIVAS', l: 'Abiertas' }, ...Object.keys(OT_ESTATUS).map(k => ({ v: k, l: OT_ESTATUS[k].l }))], 'ACTIVAS', 'Todos los estatus');
    $('#otCat').innerHTML = opciones(CATEGORIAS, '', 'Todas las categorías');
    $('#otNueva').onclick = () => OT.levantamiento({});
    $('#otTabla').addEventListener('click', e => {
      const b = e.target.closest('[data-ot]'); if (!b) return;
      if (b.dataset.acc === 'pdf') Reporte.abrir(b.dataset.ot); else OT.abrir(b.dataset.ot);
    });
  },
  render() {
    const eds = $('#otEdif'), ev = eds.value;
    eds.innerHTML = opciones(Areas.edificios(), ev, 'Todos los edificios');
    $('#otNueva').hidden = !can('capture');
    const todas = ST.ordenes, ab = todas.filter(o => OT_ABIERTAS.includes(o.estatus));
    const fuera = ab.filter(o => !o.fechaCulminacion && slaInfo(o).estado === 'excedido').length;
    const porEnt = todas.filter(o => o.estatus === 'CULMINADA').length;
    const mes = ymdLocal().slice(0, 7);
    const entMes = todas.filter(o => o.estatus === 'ENTREGADA' && String(o.fechaEntrega || '').slice(0, 7) === mes).length;
    const cerr = todas.filter(o => o.fechaCulminacion && o.estatus !== 'CANCELADA');
    const cumpl = cerr.length ? Math.round(cerr.filter(o => slaInfo(o).cumple).length / cerr.length * 100) : null;
    const prom = cerr.length ? cerr.reduce((s, o) => s + slaInfo(o).transc, 0) / cerr.length : null;
    $('#otKpis').innerHTML = [
      kpi(ab.length, 'Órdenes abiertas', `${fuera} fuera de SLA`, fuera ? 'k-rojo' : 'k-morado'),
      kpi(porEnt, 'Por entregar', 'Culminadas sin firmas', porEnt ? 'k-ambar' : 'k-verde'),
      kpi(entMes, 'Entregadas este mes', MESES_L[new Date().getMonth()], 'k-verde'),
      kpi(cumpl == null ? '—' : cumpl + ' %', 'Cumplimiento de SLA', `${cerr.length} órdenes culminadas`, cumpl == null ? 'k-azul' : cumpl >= 90 ? 'k-verde' : cumpl >= 75 ? 'k-ambar' : 'k-rojo'),
      kpi(prom == null ? '—' : fDur(prom).replace(/ \d+ min$/, ''), 'Tiempo medio de atención', 'Levantamiento → culminación', 'k-azul')
    ].join('');

    const q = norm($('#otBuscar').value), es = $('#otEstatus').value, ca = $('#otCat').value, ed = $('#otEdif').value;
    const f = todas.filter(o => (!es || (es === 'ACTIVAS' ? OT_ABIERTAS.includes(o.estatus) : o.estatus === es)) && (!ca || o.categoria === ca) && (!ed || o.edificio === ed) &&
      (!q || norm([o.folio, o.oficina, o.hallazgo, o.solicitanteNombre, o.ejecutor, o.origen && o.origen.folio].join(' ')).includes(q)))
      .sort((a, b) => String(b.fechaLevantamiento).localeCompare(String(a.fechaLevantamiento)));
    $('#otConteo').textContent = `${f.length} de ${todas.length}`;
    $('#otTabla').innerHTML = f.length ? `<table class="tbl"><thead><tr><th>Folio</th><th>Origen</th><th>Ubicación</th><th>Categoría</th><th>Prioridad</th><th>Estatus</th><th>Tiempo de atención</th><th class="num">Costo</th><th></th></tr></thead><tbody>
      ${f.map(o => `<tr class="clic" data-ot="${esc(o.id)}">
        <td class="mono"><b>${esc(o.folio)}</b><br><span class="muted">${fFechaHora(o.fechaLevantamiento)}</span></td>
        <td>${esc(OT.origenTxt(o))}</td>
        <td><b>${esc(o.oficina)}</b><br><span class="muted">${esc(tituloEdificio(o.edificio))}</span></td>
        <td>${esc(o.categoria)}</td><td>${tagPrioridad(o.prioridad)}</td><td>${tag(OT_ESTATUS, o.estatus)}</td>
        <td style="min-width:170px">${slaHTML(o)}</td><td class="num">${money(OT.costos(o).total)}</td>
        <td class="acc"><button class="btn btn-sm" data-ot="${esc(o.id)}">Abrir</button>
        ${['CULMINADA', 'ENTREGADA'].includes(o.estatus) ? `<button class="btn btn-sm btn-ghost" data-ot="${esc(o.id)}" data-acc="pdf">Reporte</button>` : ''}</td></tr>`).join('')}</tbody></table>`
      : UI.vacio(todas.length ? 'Ninguna orden coincide con los filtros.' : 'Sin órdenes de trabajo. Inicie con un levantamiento en sitio.', can('capture') ? '<button class="btn btn-primary" onclick="OT.levantamiento({})">Nuevo levantamiento</button>' : '');
  }
};

UI.registrar('ordenes', ModOT);
