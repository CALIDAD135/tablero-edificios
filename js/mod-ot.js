/* ==========================================================================
   CONTROL DE EDIFICIOS · IES
   js/mod-ot.js — Módulo 5: Órdenes de trabajo (Fase 2)
   · Tipo de ejecución obligatorio: Personal interno (técnico asignado) o
     Proveedor externo (seguimiento corporativo de Administrador y Auxiliar).
   · Pipeline móvil del Operador técnico: Levantamiento → Confirmar recibido →
     Iniciar → Culminar → Firmas (genera el PDF de entrega).
   · SLA: en OT internas corre desde el recibido del técnico; en externas y
     anteriores, desde el levantamiento. Siempre se detiene en la culminación.
   Fase 3:
   · Levantamiento del técnico con mínimo 4 fotos y lista de materiales con
     autoguardado en ordenes/{id}/materialesLev/{materialId}.
   · «Evidencia del reporte» (fotos rep_* de la OT y de la incidencia de origen).
   · Bandeja del técnico agrupada por edificio y botón para calendarizar.
   ========================================================================== */

const ORIGEN_TXT = { INCIDENCIA: 'Incidencia', SOLICITUD: 'Solicitud de usuario', MANTENIMIENTO: 'Mantenimiento programado', LEVANTAMIENTO: 'Levantamiento en sitio' };
const ETQ_FOTO = { rep: 'Reporte', antes: 'Antes', despues: 'Después' };
const ICONO_CAL = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h3v3H8z" fill="currentColor" stroke="none"/></svg>';
const DIAS_C = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
function fechaCorta(iso) {
  const d = aFecha(iso); if (!d) return '';
  const p = x => String(x).padStart(2, '0');
  return `${DIAS_C[d.getDay()]} ${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
const PASOS_TEC = [
  { k: 'lev', l: 'Levantamiento',      d: 'Fotos del antes y diagnóstico inicial' },
  { k: 'rec', l: 'Confirmar recibido', d: 'Inicia el SLA de atención' },
  { k: 'ini', l: 'Iniciar trabajos',   d: 'La orden pasa a En proceso' },
  { k: 'cul', l: 'Culminar trabajos',  d: 'Fotos del después; la orden queda Finalizada' },
  { k: 'fir', l: 'Firmas',             d: 'Quien recibe y técnico; genera el PDF de entrega' }
];

const OT = {
  costos(o) {
    const materiales = lista(o.materiales).reduce((s, x) => s + (Number(x.cant) || 0) * (Number(x.costo) || 0), 0);
    const manoObra = Number(o.manoObra) || 0;
    return { materiales, manoObra, total: materiales + manoObra };
  },
  porId(id) { return ST.ordenes.find(o => o.id === id); },
  origenTxt(o) { const t = (o.origen && o.origen.tipo) || 'LEVANTAMIENTO'; return ORIGEN_TXT[t] + (o.origen && o.origen.folio && t !== 'MANTENIMIENTO' ? ` ${o.origen.folio}` : ''); },
  ejecutorTxt(o) {
    if (o.tipoEjecucion === 'INTERNO') return Tecnicos.nombre(o.tecnicoId) || o.ejecutor || 'Técnico sin asignar';
    return o.proveedor || o.ejecutor || '';
  },
  tipoTag(o) {
    const t = TIPOS_EJECUCION[o.tipoEjecucion];
    return t ? `<span class="tag ${t.c}">${esc(t.l)}</span>` : '<span class="tag t-gris">Sin definir</span>';
  },
  /* Estatus legible: distingue los pasos del técnico dentro de «Levantada» */
  tag(o) {
    const t = (c, l) => `<span class="tag ${c}">${l}</span>`;
    if (o.estatus === 'LEVANTADA' && o.tipoEjecucion === 'INTERNO' && o.tecnicoId) {
      if (!o.fechaLevantamiento) return t('t-azul', 'Asignada');
      if (!o.fechaRecibido) return t('t-azul', 'Por recibir');
      return t('t-azul', 'Recibida');
    }
    if (esTecnico() && o.estatus === 'CULMINADA') return t('t-ambar', 'Finalizado, por firmar');
    return tag(OT_ESTATUS, o.estatus);
  },
  /* Paso vigente del pipeline del técnico (0 a 4; 5 = entregada) */
  paso(o) {
    if (o.estatus === 'ENTREGADA') return 5;
    if (!o.fechaLevantamiento) return 0;
    if (!o.fechaRecibido) return 1;
    if (!o.fechaInicio) return 2;
    if (!o.fechaCulminacion) return 3;
    return 4;
  },
  /* Clave de color del calendario según el estatus vigente */
  estatusCal(o) {
    if (o.estatus === 'ENTREGADA') return 'ENTREGADA';
    if (o.estatus === 'CULMINADA') return 'FINALIZADO';
    if (o.estatus === 'EN_PROCESO') return 'EN_PROCESO';
    if (o.tipoEjecucion === 'INTERNO' && o.tecnicoId) {
      if (!o.fechaLevantamiento) return 'POR_LEVANTAR';
      if (!o.fechaRecibido) return 'POR_RECIBIR';
    }
    return 'POR_INICIAR';
  },
  /* Lista de materiales del levantamiento (objeto por id → arreglo ordenado) */
  matLev(o, incluirVacios) {
    const m = (o && o.materialesLev) || {};
    return Object.keys(m).map(k => Object.assign({ id: k }, m[k]))
      .filter(x => incluirVacios || String(x.desc || '').trim())
      .sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));
  },
  fotosDe(media, fase) { return Object.keys(media || {}).filter(k => k.startsWith(fase + '_') && media[k]).sort((a, b) => Number(a.split('_')[1]) - Number(b.split('_')[1])); },
  /* Evidencia del reporte: fotos rep_* de la OT y de la incidencia de origen */
  async evidenciaReporte(o, mediaOT) {
    const out = [];
    const m1 = mediaOT || await DB.media(o.id).catch(() => ({}));
    this.fotosDe(m1, 'rep').forEach(k => out.push({ src: m1[k], et: `Reporte ${Number(k.split('_')[1]) + 1}` }));
    if (o.origen && o.origen.tipo === 'INCIDENCIA' && o.origen.id) {
      const m2 = await DB.media(o.origen.id).catch(() => ({}));
      this.fotosDe(m2, 'rep').forEach(k => out.push({ src: m2[k], et: `${o.origen.folio || 'Incidencia'} (${Number(k.split('_')[1]) + 1})` }));
    }
    return out;
  },
  galeriaHTML(lista, vacio) {
    return lista.length
      ? `<div class="galeria">${lista.map(f => `<figure><img src="${f.src}" alt="${esc(f.et)}" data-zoom><figcaption>${esc(f.et)}</figcaption></figure>`).join('')}</div>`
      : `<p class="muted galeria-vacia">${esc(vacio)}</p>`;
  },
  avisoDepurada(o) {
    return o.evidenciaDepurada ? `<div class="aviso">La evidencia fotográfica se depuró el ${fFecha(o.evidenciaDepurada)}. Consulte el respaldo ZIP de esa fecha.</div>` : '';
  },
  proveedoresConocidos() {
    return [...new Set([...ST.ordenes.map(o => o.proveedor), ...ST.mantenimientos.map(p => p.proveedor)].filter(Boolean).map(mayus))].sort();
  },

  /* ---------- Campos de ejecución (generación y edición de la OT) ---------- */
  ejecucionHTML(pref, o = {}, editable = true) {
    const dis = editable ? '' : ' disabled';
    const tecs = Tecnicos.activos();
    const actual = o.tecnicoId && !tecs.some(t => t.id === o.tecnicoId) ? [{ v: o.tecnicoId, l: (Tecnicos.nombre(o.tecnicoId) || 'Técnico no disponible') + ' (inactivo)' }] : [];
    return `<fieldset class="seg seg-req"><legend>Tipo de ejecución (obligatorio)</legend>
        ${Object.keys(TIPOS_EJECUCION).map(k => `<label><input type="radio" name="${pref}TE" value="${k}"${o.tipoEjecucion === k ? ' checked' : ''}${dis}> ${TIPOS_EJECUCION[k].l}</label>`).join('')}
      </fieldset>
      <div id="${pref}Int" hidden>
        <label class="fl"><span>Operador técnico asignado</span><select id="${pref}Tec"${dis}>${opciones([...actual, ...tecs.map(t => ({ v: t.id, l: t.nombre }))], o.tecnicoId, 'Seleccione al técnico')}</select></label>
        ${tecs.length ? '' : `<p class="aviso">No hay técnicos registrados. ${can('config') ? 'Dé de alta al personal en Órdenes de trabajo, botón Técnicos.' : 'Solicite al Administrador que los registre.'}</p>`}
      </div>
      <div id="${pref}Ext" hidden>
        <label class="fl"><span>Proveedor externo</span><input id="${pref}Prov" list="${pref}DlProv" value="${esc(o.proveedor || (o.tipoEjecucion === 'EXTERNO' ? o.ejecutor || '' : ''))}" placeholder="Razón social o nombre comercial"${dis}></label>
        <datalist id="${pref}DlProv">${this.proveedoresConocidos().map(p => `<option value="${esc(p)}">`).join('')}</datalist>
        <p class="hint">La orden queda en la bandeja de seguimiento de proveedores del Administrador y el Auxiliar.</p>
      </div>
      <div class="fg2">
        <label class="fl"><span>Levantamiento agendado en sitio</span><input type="datetime-local" id="${pref}AgL" value="${o.agendaLevantamiento ? localInput(o.agendaLevantamiento) : ''}"${dis}></label>
        <label class="fl"><span>Ejecución agendada</span><input type="datetime-local" id="${pref}AgE" value="${o.agendaEjecucion ? localInput(o.agendaEjecucion) : ''}"${dis}></label>
        <label class="fl"><span>Duración estimada de la ejecución</span><select id="${pref}Dur"${dis}>${opciones(DURACIONES, o.agendaDuracionMin || CAL_DURACION.ejecucion)}</select></label>
      </div>`;
  },
  ejecucionInit(pref, m, alCambiar) {
    const vis = () => {
      const r = m.q(`input[name=${pref}TE]:checked`), v = r ? r.value : '';
      m.q('#' + pref + 'Int').hidden = v !== 'INTERNO';
      m.q('#' + pref + 'Ext').hidden = v !== 'EXTERNO';
      alCambiar && alCambiar(v);
    };
    $$(`input[name=${pref}TE]`, m.el).forEach(r => r.onchange = vis);
    vis();
  },
  ejecucionLeer(pref, m) {
    const r = m.q(`input[name=${pref}TE]:checked`), tipo = r ? r.value : '';
    const faltan = [], d = { tipoEjecucion: tipo };
    if (!tipo) faltan.push('tipo de ejecución');
    if (tipo === 'INTERNO') {
      d.tecnicoId = m.q('#' + pref + 'Tec').value; d.proveedor = '';
      if (!d.tecnicoId) faltan.push('técnico asignado');
      d.ejecutor = Tecnicos.nombre(d.tecnicoId);
    }
    if (tipo === 'EXTERNO') {
      d.proveedor = mayus(m.q('#' + pref + 'Prov').value); d.tecnicoId = '';
      if (!d.proveedor) faltan.push('proveedor externo');
      d.ejecutor = d.proveedor;
    }
    d.agendaLevantamiento = desdeLocalInput(m.q('#' + pref + 'AgL').value);
    d.agendaEjecucion = desdeLocalInput(m.q('#' + pref + 'AgE').value);
    d.agendaDuracionMin = Number(m.q('#' + pref + 'Dur').value) || CAL_DURACION.ejecucion;
    return { d, faltan };
  },

  /* ---------- Generación de la OT (desde levantamiento, incidencia, solicitud o mantenimiento) ---------- */
  levantamiento(pre = {}) {
    if (!can('capture')) return;
    const fotos = {};
    const general = pre.ubicacionGeneral || '';
    const preOT = { tipoEjecucion: pre.tipoEjecucion || (pre.ejecutor ? 'EXTERNO' : ''), proveedor: pre.ejecutor || '', tecnicoId: pre.tecnicoId || '' };
    const m = UI.modal({
      titulo: 'Nueva orden de trabajo', clase: 'm-campo m-fija', ancho: '860px',
      sub: pre.origen ? `Origen: ${esc(ORIGEN_TXT[pre.origen.tipo] || '')} ${esc(pre.origen.folio || '')}` : 'Levantamiento en sitio o asignación desde escritorio.',
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
          <label class="fl"><span>Hallazgo o trabajo solicitado</span><textarea id="lHall" rows="4" placeholder="Condición encontrada, causa probable y trabajo a realizar">${esc(pre.hallazgo || '')}</textarea></label>
        </section>
        <section class="campo-sec"><h3>Ejecución</h3>
          ${this.ejecucionHTML('le', preOT, true)}
          <label class="chk" id="lHechoWrap" hidden><input type="checkbox" id="lHecho"> El levantamiento en sitio ya se realizó (el técnico inicia en Confirmar recibido)</label>
        </section>
        <section class="campo-sec"><h3>Solicitante</h3>
          <label class="fl"><span>Nombre</span>${Personas.campo('lSol', pre.solicitanteNombre, pre.solicitanteId, 'Quien pide el trabajo')}</label>
          <div class="fg2">
            <label class="fl"><span>Correo</span><input id="lCor" type="email" inputmode="email" value="${esc(pre.solicitanteCorreo || '')}"></label>
            <label class="fl"><span>Teléfono</span><input id="lTel" inputmode="tel" value="${esc(pre.solicitanteTel || '')}"></label>
          </div>
        </section>
        <section class="campo-sec"><h3>Evidencia del reporte (opcional)</h3>
          <p class="hint">El técnico verá estas fotografías en su orden para comparar su levantamiento.${pre.origen && pre.origen.tipo === 'INCIDENCIA' ? ' También verá las fotografías de la incidencia de origen.' : ''}</p>
          <div class="fotos" id="lFotos"></div>
        </section>`,
      acciones: [{ texto: 'Cancelar' }, {
        texto: 'Generar orden de trabajo', clase: 'btn-primary btn-grande', fn: async mm => {
          const usaGen = general && mm.q('#lGen') && mm.q('#lGen').checked;
          const areaId = usaGen ? '' : AreaPicker.valor('lp');
          const cat = mm.q('#lCat').value, hall = mm.q('#lHall').value.trim();
          const ej = this.ejecucionLeer('le', mm);
          const f = [];
          if (!usaGen && !areaId) f.push('ubicación'); if (!CATEGORIAS.includes(cat)) f.push('categoría'); if (!hall) f.push('hallazgo');
          f.push(...ej.faltan);
          if (f.length) { UI.toast('Falta: ' + f.join(', ') + '.', 'err'); return false; }
          const correo = mm.q('#lCor').value.trim(), tel = mm.q('#lTel').value.trim();
          const sol = await Personas.resolver(mm.q('#lSol'), 'esSolicitante', { correo, telefono: tel });
          const ahora = nowISO();
          const interno = ej.d.tipoEjecucion === 'INTERNO';
          const levHecho = interno && mm.q('#lHecho').checked;
          const ub = usaGen ? { areaId: '', edificio: general, nivel: 'GENERAL', oficina: 'ÁREAS GENERALES', departamento: 'ÁREAS COMUNES' } : ubicacion(areaId);
          const o = Object.assign(ub, ej.d, {
            folio: await DB.reservarFolio('OT'),
            origen: pre.origen || { tipo: 'LEVANTAMIENTO', id: '', folio: '' },
            categoria: cat, prioridad: mm.q('#lPrio').value, slaHorasMeta: PRIORIDADES[mm.q('#lPrio').value].h,
            hallazgo: hall, solicitanteId: sol ? sol.id : '', solicitanteNombre: sol ? sol.nombre : '',
            solicitanteCorreo: correo || (sol && sol.correo) || '', solicitanteTel: tel || (sol && sol.telefono) || '',
            fechaSolicitud: pre.fechaSolicitud || ahora, fechaGeneracion: ahora,
            // Interno: el levantamiento lo registra el técnico (paso 1), salvo que ya se haya hecho en sitio
            fechaLevantamiento: !interno || levHecho ? ahora : '', diagnostico: levHecho ? hall : '',
            estatus: 'LEVANTADA', materiales: [], manoObra: 0,
            fotos: Object.keys(fotos).reduce((r, k) => (r[k] = true, r), {}), firmas: { entrega: false, recibe: false },
            creadoPor: SESION.rol
          });
          const id = await DB.guardar('ordenes', o);
          for (const k of Object.keys(fotos)) await DB.guardarMedia(id, k, fotos[k]);
          await this.propagar(Object.assign({ id }, o), 'LEVANTADA');
          DB.log('ALTA', 'ordenes', o.folio, `${cat}, ${o.oficina}. ${TIPOS_EJECUCION[o.tipoEjecucion].l}: ${o.ejecutor}`);
          UI.toast(interno ? `Orden ${o.folio} asignada a ${o.ejecutor}. El SLA inicia cuando confirme de recibido.` : `Orden ${o.folio} generada para ${o.ejecutor}. El SLA inicia ahora.`, 'ok', 6000);
          setTimeout(() => this.abrir(id), 250);
        }
      }]
    });
    AreaPicker.init('lp', pre.areaId);
    if (general) { const s = () => { m.q('#lAreaWrap').hidden = m.q('#lGen').checked; }; m.q('#lGen').onchange = s; s(); }
    this.ejecucionInit('le', m, v => { m.q('#lHechoWrap').hidden = v !== 'INTERNO'; });
    Personas.activar(m.q('#lSol'), {
      flag: 'esSolicitante', alElegir: p => { if (p.correo && !m.q('#lCor').value) m.q('#lCor').value = p.correo; if (p.telefono && !m.q('#lTel').value) m.q('#lTel').value = p.telefono; }
    });
    this.montarFotos(m.q('#lFotos'), 'rep', fotos, true, null);
  },

  /* Ranuras de fotos por tipo (rep, antes, despues). Sin ownerId se guardan en memoria
     hasta crear el registro. opts: { nodo: 'ordenes' | 'incidencias', n, alCambiar(conteo) } */
  montarFotos(cont, fase, fotos, editable, ownerId, opts = {}) {
    const n = opts.n || FOTOS[fase] || 3, nodo = opts.nodo || 'ordenes';
    const etiqueta = i => `${ETQ_FOTO[fase] || fase} ${i + 1}`;
    const contar = () => Array.from({ length: n }, (_, i) => fotos[`${fase}_${i}`]).filter(Boolean).length;
    const pintar = () => {
      cont.innerHTML = Array.from({ length: n }, (_, i) => ranuraFoto(`${fase}_${i}`, etiqueta(i), fotos[`${fase}_${i}`], editable)).join('');
      opts.alCambiar && opts.alCambiar(contar());
    };
    const guardar = async (k, url) => {
      if (url) fotos[k] = url; else delete fotos[k];
      if (ownerId) { await DB.guardarMedia(ownerId, k, url || null); await DB.actualizar(nodo, ownerId, { [`fotos/${k}`]: url ? true : null }); }
    };
    pintar();
    cont.onchange = async e => {
      const inp = e.target.closest('[data-foto]'); if (!inp || !inp.files.length) return;
      // La primera imagen ocupa la ranura elegida; las demás (selección múltiple) llenan las ranuras vacías siguientes
      const archivos = [...inp.files];
      const libres = Array.from({ length: n }, (_, i) => `${fase}_${i}`).filter(k => k !== inp.dataset.foto && !fotos[k]);
      const destino = [inp.dataset.foto, ...libres].slice(0, archivos.length);
      if (archivos.length > destino.length) UI.toast(`Solo hay ${destino.length} ranura(s) disponibles; se omitieron ${archivos.length - destino.length} imagen(es).`);
      cont.classList.add('cargando-fotos');
      try { for (let i = 0; i < destino.length; i++) await guardar(destino[i], await comprimirImagen(archivos[i])); }
      catch (er) { UI.toast(er.message, 'err'); }
      finally { cont.classList.remove('cargando-fotos'); pintar(); }
    };
    cont.onclick = async e => {
      const b = e.target.closest('[data-quitar-foto]'); if (!b) return;
      await guardar(b.dataset.quitarFoto, null);
      pintar();
    };
    return { contar };
  },

  /* ---------- Ficha de la OT (Administrador, Auxiliar y Gerencia) ---------- */
  async abrir(id) {
    if (esTecnico()) return this.pipeline(id);
    const o = this.porId(id); if (!o) { UI.toast('Orden no encontrada.', 'err'); return; }
    const media = await DB.media(id).catch(() => ({}));
    const abierta = OT_ABIERTAS.includes(o.estatus);
    const ed = can('capture') && abierta;
    const dis = ed ? '' : ' disabled';
    const interno = o.tipoEjecucion === 'INTERNO' && o.tecnicoId;
    const pasos = interno
      ? [['Asignada', otGeneracion(o)], ['Levantamiento', o.fechaLevantamiento], ['Recibida', o.fechaRecibido], ['En proceso', o.fechaInicio], ['Culminada', o.fechaCulminacion], ['Entregada', o.fechaEntrega]]
      : [['Levantada', o.fechaLevantamiento || otGeneracion(o)], ['En proceso', o.fechaInicio], ['Culminada', o.fechaCulminacion], ['Entregada', o.fechaEntrega]];
    const idxAct = pasos.findIndex(p => !p[1]);
    const s = slaInfo(o);
    const acciones = [{ texto: 'Cerrar', clase: 'btn-ghost' }];
    if (can('capture') && abierta) acciones.push({ texto: 'Cancelar OT', clase: 'btn-ghost txt-rojo', fn: () => this.cancelar(o) });
    if (can('capture')) acciones.push({ texto: 'Agregar tarea PHVA', clase: 'btn-ghost', fn: () => { ModTareas.editar(null, { vinculo: o.folio, areaId: o.areaId, categoria: o.categoria, titulo: '' }); return false; }, cierra: false });
    if (can('capture') && interno && abierta) acciones.push({ texto: 'Vista del técnico', clase: 'btn-ghost', fn: () => { setTimeout(() => this.pipeline(o.id), 120); } });
    if (['CULMINADA', 'ENTREGADA'].includes(o.estatus)) acciones.push({ texto: 'Reporte de entrega', clase: '', fn: () => { Reporte.abrir(o.id); } });
    if (ed) acciones.push({ texto: 'Guardar cambios', clase: '', cierra: false, fn: async mm => { await this.guardarFicha(o, mm); UI.toast('Cambios guardados.', 'ok'); return false; } });
    if (ed && o.estatus === 'LEVANTADA') acciones.push({ texto: 'Iniciar trabajos', clase: 'btn-primary', fn: mm => this.iniciar(o, mm) });
    if (ed && o.estatus === 'EN_PROCESO') acciones.push({ texto: 'Registrar culminación', clase: 'btn-primary', fn: mm => this.culminar(o, mm) });
    if (ed && o.estatus === 'CULMINADA') acciones.push({ texto: 'Entregar y generar reporte', clase: 'btn-success', fn: mm => this.entregar(o, mm) });

    const m = UI.modal({
      titulo: `Orden de trabajo ${o.folio}`, clase: 'm-ot', ancho: '1040px',
      sub: `${this.tag(o)} ${tagPrioridad(o.prioridad)} ${this.tipoTag(o)} <span class="muted">${esc(this.origenTxt(o))}</span>`,
      cuerpo: `
        <ol class="stepper" style="grid-template-columns:repeat(${pasos.length},1fr)">${pasos.map((p, i) => `<li class="${p[1] ? 'hecho' : i === idxAct ? 'actual' : ''}${o.estatus === 'CANCELADA' ? ' canc' : ''}"><b>${p[0]}</b><span>${p[1] ? fFechaHora(p[1]) : '—'}</span></li>`).join('')}</ol>
        ${o.estatus === 'CANCELADA' ? `<div class="aviso">Orden cancelada: ${esc(o.motivoCancelacion || '')}</div>` : ''}
        ${!o.tipoEjecucion && abierta ? '<div class="aviso">Orden anterior a la Fase 2: defina el tipo de ejecución y guarde los cambios.</div>' : ''}
        <div class="ot-sla">
          <div><span class="muted">${interno ? 'SLA de atención (desde el recibido)' : 'Tiempo de atención (SLA)'}</span>${slaHTML(o)}</div>
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
            <label class="fl"><span>Hallazgo o trabajo solicitado</span><textarea id="oHall" rows="3"${dis}>${esc(o.hallazgo || '')}</textarea></label>
            <label class="fl"><span>Solicitante</span><input id="oSol" value="${esc(o.solicitanteNombre || '')}"${dis}></label>
            <div class="fg2">
              <label class="fl"><span>Correo</span><input id="oCor" value="${esc(o.solicitanteCorreo || '')}"${dis}></label>
              <label class="fl"><span>Teléfono</span><input id="oTel" value="${esc(o.solicitanteTel || '')}"${dis}></label>
            </div>
          </section>
          <section class="ot-sec"><h3>Ejecución</h3>
            ${this.ejecucionHTML('oe', o, ed)}
            ${o.diagnostico ? `<div class="nota-tec"><b>Diagnóstico inicial del técnico</b><p>${esc(o.diagnostico)}</p></div>` : ''}
            ${this.matLev(o).length ? `<div class="nota-tec"><div class="mat-head"><b>Materiales del levantamiento (${this.matLev(o).length})</b>${ed ? '<button type="button" class="btn btn-sm" id="oMatLevPasar">Pasar a la tabla de costos</button>' : ''}</div>
              <div class="tblwrap"><table class="tbl"><thead><tr><th>Material</th><th class="num">Cant.</th><th>Unidad</th><th>Especificación</th><th>Capturó</th></tr></thead><tbody>
              ${this.matLev(o).map(x => `<tr><td>${esc(x.desc)}</td><td class="num">${nfmt(x.cant, 2).replace(/\.00$/, '')}</td><td>${esc(x.unidad || '')}</td><td>${esc(x.nota || '')}</td><td>${esc(x.por || '')}<br><span class="muted">${fFechaHora(x.actualizado)}</span></td></tr>`).join('')}
              </tbody></table></div></div>` : ''}
            ${o.materialesTecnico ? `<div class="nota-tec"><b>Materiales utilizados según el técnico</b><p>${esc(o.materialesTecnico)}</p></div>` : ''}
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
          ${this.avisoDepurada(o)}
          <h4>Evidencia del reporte</h4><div class="fotos fotos-4" id="oFotR"></div><div id="oRepInc"></div>
          <div class="fotos-2"><div><h4>Antes (levantamiento)</h4><div class="fotos" id="oFotA"></div></div><div><h4>Después</h4><div class="fotos" id="oFotD"></div></div></div>
        </section>
        <section class="ot-sec"><h3>Firmas de conformidad</h3>
          <p class="hint">Se habilitan al registrar la culminación. Ambas firmas se incrustan en el reporte de entrega.</p>
          <div class="firmas" id="oFirmas"></div>
        </section>`,
      acciones
    });
    this.ejecucionInit('oe', m);

    // Materiales
    const mats = lista(o.materiales).map(x => Object.assign({}, x));
    const tb = m.q('#oMat');
    const totalMat = () => { m.q('#oTotal').textContent = money(this.costos({ materiales: mats, manoObra: m.q('#oMO').value }).total); };
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
    // Solo se actualiza el importe del renglón y el total (conserva el foco al tabular)
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
    if (m.q('#oMatLevPasar')) m.q('#oMatLevPasar').onclick = () => {
      let n = 0;
      this.matLev(o).forEach(x => {
        if (mats.some(y => norm(y.desc) === norm(x.desc))) return;
        mats.push({ desc: x.desc + (x.nota ? ` (${x.nota})` : ''), cant: Number(x.cant) || 1, unidad: x.unidad || 'PZA', costo: 0 }); n++;
      });
      pintarMat();
      UI.toast(n ? `Se agregaron ${n} renglones. Capture los costos y guarde los cambios.` : 'Los materiales ya están en la tabla de costos.', n ? 'ok' : '');
    };

    // Fotos
    const fotos = Object.assign({}, media);
    const fotEd = can('capture') && abierta;
    this.montarFotos(m.q('#oFotR'), 'rep', fotos, fotEd, o.id);
    this.montarFotos(m.q('#oFotA'), 'antes', fotos, fotEd, o.id);
    this.montarFotos(m.q('#oFotD'), 'despues', fotos, fotEd && o.estatus !== 'LEVANTADA', o.id);
    if (o.origen && o.origen.tipo === 'INCIDENCIA' && o.origen.id) {
      DB.media(o.origen.id).then(mi => {
        const l = this.fotosDe(mi, 'rep').map(k => ({ src: mi[k], et: `${o.origen.folio} (${Number(k.split('_')[1]) + 1})` }));
        if (l.length && m.q('#oRepInc')) m.q('#oRepInc').innerHTML = `<p class="hint">Fotografías de la incidencia ${esc(o.origen.folio)}</p>` + this.galeriaHTML(l, '');
      }).catch(() => {});
    }

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
      this.firmar(id, b.dataset.firmar, async () => { Object.assign(media, await DB.media(id, true)); pintarFirmas(); });
    });
  },

  /* despues(clave, nombre, ts) se invoca al guardar la firma */
  firmar(id, clave, despues) {
    const o = this.porId(id);
    const entrega = clave === 'firmaEntrega';
    let nombres = null, nombre;
    if (entrega) {
      if (esTecnico()) nombre = SESION.nombre;   // el técnico firma con su propio nombre
      else {
        nombres = [...new Set([o.tipoEjecucion === 'INTERNO' ? Tecnicos.nombre(o.tecnicoId) : '', ...PERSONAL_AF].filter(Boolean))];
        nombre = o.entregaNombre || (o.tipoEjecucion === 'INTERNO' ? Tecnicos.nombre(o.tecnicoId) : '');
      }
    } else nombre = o.recibeNombre || o.solicitanteNombre || Areas.responsable(Areas.porId(o.areaId));
    Firma.capturar({
      titulo: entrega ? (esTecnico() ? 'Firma del técnico que entrega' : 'Firma de quien entrega el trabajo') : 'Firma de quien recibe de conformidad',
      etiquetaNombre: entrega ? (esTecnico() ? 'Técnico que entrega' : 'Personal que entrega') : 'Nombre de quien recibe',
      nombres, nombre,
      alGuardar: async (dataUrl, nom) => {
        if (entrega && esTecnico()) nom = SESION.nombre;
        await DB.guardarMedia(id, clave, dataUrl);
        const ts = nowISO();
        const c = entrega ? { entregaNombre: nom, fechaFirmaEntrega: ts, 'firmas/entrega': true } : { recibeNombre: nom, fechaFirmaRecibe: ts, 'firmas/recibe': true };
        await DB.actualizar('ordenes', id, c);
        DB.log('FIRMA', 'ordenes', o.folio, `${entrega ? 'Entrega' : 'Recibe'}: ${nom}`);
        UI.toast('Firma guardada.', 'ok');
        despues && despues(clave, nom, ts);
      }
    });
  },

  leerFicha(o, m) {
    const ej = this.ejecucionLeer('oe', m);
    if (ej.faltan.length) throw new Error('Falta: ' + ej.faltan.join(', ') + '.');
    const mats = (m.mats || []).filter(x => String(x.desc || '').trim()).map(x => ({ desc: String(x.desc).trim(), cant: Number(x.cant) || 0, unidad: mayus(x.unidad || 'PZA'), costo: Number(x.costo) || 0 }));
    return Object.assign(ej.d, {
      categoria: m.q('#oCat').value, departamento: m.q('#oDep').value, hallazgo: m.q('#oHall').value.trim(),
      solicitanteNombre: mayus(m.q('#oSol').value), solicitanteCorreo: m.q('#oCor').value.trim(), solicitanteTel: m.q('#oTel').value.trim(),
      trabajos: m.q('#oTrab').value.trim(), materiales: mats,
      manoObra: Number(m.q('#oMO').value) || 0, observaciones: m.q('#oObs').value.trim()
    });
  },
  async guardarFicha(o, m) {
    const d = this.leerFicha(o, m);
    // Cambio a personal interno: la OT sigue el pipeline del técnico desde el paso que corresponda
    if (d.tipoEjecucion === 'INTERNO' && !o.fechaGeneracion) {
      d.fechaGeneracion = otGeneracion(o);
      // OT anterior a la Fase 2 con levantamiento hecho: el SLA conserva su inicio original
      if (o.fechaLevantamiento && !o.fechaRecibido) d.fechaRecibido = o.fechaLevantamiento;
    }
    await DB.actualizar('ordenes', o.id, d);
    const reasig = (o.tecnicoId || '') !== (d.tecnicoId || '') || (o.tipoEjecucion || '') !== d.tipoEjecucion;
    DB.log('EDICION', 'ordenes', o.folio, `${reasig ? `Ejecución: ${TIPOS_EJECUCION[d.tipoEjecucion].l}, ${d.ejecutor}. ` : ''}Total ${money(this.costos(d).total)}`);
    return d;
  },

  async iniciar(o, m) {
    await this.guardarFicha(o, m);
    const ahora = nowISO();
    // Si el Administrador inicia por el técnico, se completan los pasos previos con la hora actual
    await DB.actualizar('ordenes', o.id, { estatus: 'EN_PROCESO', fechaInicio: ahora, fechaRecibido: o.fechaRecibido || ahora, fechaLevantamiento: o.fechaLevantamiento || otGeneracion(o) });
    DB.log('INICIO', 'ordenes', o.folio, '');
    UI.toast('Trabajos iniciados.', 'ok');
    setTimeout(() => this.abrir(o.id), 200);
  },

  async culminar(o, m) {
    const d = this.leerFicha(o, m);
    if (!d.trabajos) { UI.toast('Describa los trabajos realizados antes de registrar la culminación.', 'err'); m.q('#oTrab').classList.add('err'); return false; }
    let fecha = null;
    const defecto = localInput(nowISO());
    const base = slaInicio(o) || otGeneracion(o);
    await new Promise(res => UI.modal({
      titulo: 'Registrar culminación', ancho: '480px', alCerrar: res,
      cuerpo: `<p class="m-msg">La culminación detiene el contador del SLA. Si registra después de terminar, ajuste la hora real.</p>
        <label class="fl"><span>Fecha y hora de culminación</span><input type="datetime-local" id="cFec" value="${defecto}" max="${defecto}"></label>`,
      acciones: [{ texto: 'Cancelar' }, { texto: 'Registrar culminación', clase: 'btn-primary', fn: mm => {
        const raw = mm.q('#cFec').value;
        let v = raw === defecto ? nowISO() : desdeLocalInput(raw);   // sin cambios: hora exacta con segundos
        const lev = new Date(base), levMin = new Date(lev); levMin.setSeconds(0, 0);
        if (!v || new Date(v) < levMin) { UI.toast('La culminación no puede ser anterior al inicio del SLA.', 'err'); return false; }
        if (new Date(v) > new Date(Date.now() + 60000)) { UI.toast('La culminación no puede ser una fecha futura.', 'err'); return false; }
        if (new Date(v) < lev) v = lev.toISOString();
        fecha = v;
      } }]
    }));
    if (!fecha) return false;
    d.estatus = 'CULMINADA'; d.fechaCulminacion = fecha;
    if (!o.fechaInicio) d.fechaInicio = base;
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
    const fin = Object.assign({}, oo, o, { estatus: 'ENTREGADA' });
    await this.propagar(fin, 'ENTREGADA');
    DB.log('ENTREGA', 'ordenes', o.folio, `Entrega ${fin.entregaNombre || ''}, recibe ${fin.recibeNombre || ''}`);
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
        if (p) await Mant.registrarEjecucion(p, { fecha: ymdLocal(o.fechaCulminacion || nowISO()), costo: this.costos(o).total, proveedor: this.ejecutorTxt(o), otId: o.id, otFolio: o.folio, obs: 'Registrada al entregar la orden de trabajo' });
      }
    } catch (e) { console.warn('propagar', e); UI.toast('La orden se guardó, pero no se pudo actualizar su origen: ' + e.message, 'err'); }
  },

  /* ==========================================================================
     Pipeline de ejecución móvil (Operador técnico)
     ========================================================================== */
  async pipeline(id) {
    const o0 = this.porId(id);
    if (!o0) { UI.toast('Orden no encontrada.', 'err'); return; }
    if (esTecnico() && o0.tecnicoId !== SESION.tecnicoId) { UI.toast('Esta orden no está asignada a usted.', 'err'); return; }
    if (!esTecnico() && !can('capture')) return;
    const media = Object.assign({}, await DB.media(id, true).catch(() => ({})));
    const rep = await this.evidenciaReporte(o0, media);
    const local = Object.assign({}, o0);      // estado vigente de esta sesión
    let ocupado = false;
    const m = UI.modal({
      titulo: `Orden ${o0.folio}`, clase: 'm-campo m-pipe m-fija', ancho: '720px',
      sub: esTecnico() ? 'Avance paso a paso. Cada botón actualiza el estatus y el SLA en tiempo real.' : `Vista del técnico: ${esc(Tecnicos.nombre(o0.tecnicoId))}`,
      cuerpo: '<div id="ppBody"></div>',
      acciones: [{ texto: 'Cerrar', clase: 'btn-ghost' }]
    });
    const cuerpo = m.q('#ppBody');
    const cuenta = fase => this.fotosDe(media, fase).length;
    // Trae del servidor lo que se autoguarda fuera de este modal (materiales y diagnóstico)
    const sincronizar = () => {
      const st = this.porId(id); if (!st) return;
      local.materialesLev = st.materialesLev;
      if (!local.fechaLevantamiento) local.diagnostico = st.diagnostico;
      ['agendaEjecucion', 'agendaDuracionMin'].forEach(k => { local[k] = st[k]; });
    };

    const pintar = () => {
      sincronizar();
      const o = local, paso = this.paso(o), abierta = OT_ABIERTAS.includes(o.estatus) && !o.fechaCulminacion;
      const tel = String(o.solicitanteTel || '').replace(/\D/g, '');
      const hechoTxt = i => [fFechaHora(o.fechaLevantamiento), fFechaHora(o.fechaRecibido), fFechaHora(o.fechaInicio), fFechaHora(o.fechaCulminacion), fFechaHora(o.fechaEntrega)][i];
      const ctrl = i => {
        if (i === 0) {
          const nf = cuenta('antes'), nm = this.matLev(o).length, dg = String(o.diagnostico || '').trim();
          return `<ul class="pp-check">
              <li class="${nf >= LEV_FOTOS_MIN ? 'ok' : ''}">Fotografías del área: ${nf} de ${LEV_FOTOS_MIN} mínimas</li>
              <li class="${dg ? 'ok' : ''}">Diagnóstico inicial${dg ? '' : ' pendiente'}</li>
              <li class="${nm ? 'ok' : 'opc'}">Lista de materiales: ${nm} ${nm === 1 ? 'material' : 'materiales'}</li>
            </ul>
            <button type="button" class="btn btn-primary btn-grande" data-pp="lev">Generar levantamiento</button>`;
        }
        if (i === 1) return '<button type="button" class="btn btn-primary btn-grande" data-pp="rec">Confirmar recibido</button>';
        if (i === 2) return '<button type="button" class="btn btn-primary btn-grande" data-pp="ini">Iniciar trabajos</button>';
        if (i === 3) return `<div class="fotos" id="ppFotD"></div>
          <label class="fl"><span>Trabajos realizados</span><textarea id="ppTrab" rows="4" placeholder="Qué se hizo; aparecerá en el reporte de entrega">${esc(o.trabajos || '')}</textarea></label>
          <label class="fl"><span>Materiales utilizados (opcional)</span><textarea id="ppMat" rows="2" placeholder="Material y cantidad; Activos Fijos registra los costos">${esc(o.materialesTecnico || '')}</textarea></label>
          <button type="button" class="btn btn-primary btn-grande" data-pp="cul">Culminar trabajos</button>`;
        if (i === 4) {
          const caja = (k, t, n) => `<div class="pp-firma${media[k] ? ' ok' : ''}">
            <div class="pp-firma-img">${media[k] ? `<img src="${media[k]}" alt="Firma ${esc(t)}">` : '<span>Pendiente</span>'}</div>
            <div><b>${t}</b><span>${esc(n || '')}</span></div>
            <button type="button" class="btn ${media[k] ? 'btn-ghost' : 'btn-primary'}" data-pp-firma="${k}">${media[k] ? 'Volver a firmar' : 'Firmar'}</button></div>`;
          return caja('firmaRecibe', 'Quien recibe', o.recibeNombre || o.solicitanteNombre) + caja('firmaEntrega', 'Técnico', o.entregaNombre || Tecnicos.nombre(o.tecnicoId)) +
            '<p class="hint">Al guardar ambas firmas la orden se entrega y se genera el PDF de entrega.</p>';
        }
        return '';
      };
      cuerpo.innerHTML = `
        <div class="pp-head">
          <div class="pp-ubic"><b>${esc(o.oficina)}</b><span>${esc(tituloEdificio(o.edificio))}, ${esc(tituloNivel(o.nivel).toLowerCase())}</span></div>
          <div class="pp-tags">${this.tag(o)} ${tagPrioridad(o.prioridad)} <span class="tag t-gris">${esc(o.categoria)}</span></div>
          ${o.estatus !== 'ENTREGADA' ? slaHTML(o) : ''}
          <dl class="pp-datos">
            <dt>Trabajo solicitado</dt><dd>${esc(o.hallazgo || '')}</dd>
            <dt>Solicitante</dt><dd>${esc(o.solicitanteNombre || '—')}${tel ? ` <a class="btn btn-sm" href="tel:${tel}">Llamar</a>` : ''}</dd>
            ${o.agendaLevantamiento ? `<dt>Levantamiento</dt><dd>${fFechaHora(o.agendaLevantamiento)}</dd>` : ''}
          </dl>
          ${abierta ? `<button type="button" class="pp-agenda${o.agendaEjecucion ? ' on' : ''}" data-pp="agenda">${ICONO_CAL}
            <span><b>${o.agendaEjecucion ? 'Ejecución agendada' : 'Calendarizar ejecución'}</b><small>${o.agendaEjecucion ? esc(fechaCorta(o.agendaEjecucion) + ', ' + ((DURACIONES.find(x => x.v === Number(o.agendaDuracionMin)) || {}).l || '2 h')) : 'Asigne fecha y hora; se refleja en el calendario general'}</small></span></button>` : ''}
        </div>
        <section class="pp-rep"><h3>Evidencia del reporte</h3>${this.galeriaHTML(rep, 'El reporte no incluye fotografías.')}</section>
        ${this.avisoDepurada(o)}
        ${o.estatus === 'CANCELADA' ? `<div class="aviso">Orden cancelada: ${esc(o.motivoCancelacion || '')}</div>` : `
        <ol class="pp-pasos">${PASOS_TEC.map((p, i) => `
          <li class="pp-paso ${i < paso ? 'hecho' : i === paso ? 'actual' : 'bloq'}">
            <div class="pp-num" aria-hidden="true">${i < paso ? '✓' : i + 1}</div>
            <div class="pp-cont"><h4>${p.l}</h4><p>${i < paso ? 'Registrado ' + hechoTxt(i) : p.d}${i === 0 && i < paso ? ' <button type="button" class="lnk" data-pp="verlev">Ver levantamiento</button>' : ''}</p>${i === paso ? ctrl(i) : ''}</div>
          </li>`).join('')}</ol>
        ${paso === 5 ? `<div class="pp-fin"><b>Trabajo entregado</b><span>${fFechaHora(o.fechaEntrega)}</span><button type="button" class="btn btn-primary btn-grande" data-pp="pdf">Ver reporte de entrega</button></div>` : ''}`}`;
      if (paso === 3) this.montarFotos(cuerpo.querySelector('#ppFotD'), 'despues', media, true, id);
    };

    const paso = async (k, btn) => {
      if (ocupado) return;
      const o = local; let c = null, logTxt = '';
      if (k === 'lev' || k === 'verlev') {
        this.levantamientoTecnico(id, {
          alRegistrar: (cambios, md) => { Object.assign(local, cambios); Object.assign(media, md); pintar(); },
          alCerrar: md => { Object.assign(media, md); setTimeout(pintar, 120); }
        });
        return;
      }
      if (k === 'agenda') { this.calendarizar(id, cambios => { Object.assign(local, cambios); pintar(); }); return; }
      if (k === 'rec') { c = { fechaRecibido: nowISO() }; logTxt = 'Recibido: inicia el SLA de atención'; }
      if (k === 'ini') { c = { estatus: 'EN_PROCESO', fechaInicio: nowISO() }; logTxt = 'Inicio de trabajos'; }
      if (k === 'cul') {
        const trab = cuerpo.querySelector('#ppTrab').value.trim();
        if (!cuenta('despues')) { UI.toast('Tome al menos una foto del después.', 'err'); return; }
        if (!trab) { UI.toast('Describa los trabajos realizados.', 'err'); cuerpo.querySelector('#ppTrab').classList.add('err'); return; }
        c = { estatus: 'CULMINADA', fechaCulminacion: nowISO(), trabajos: trab, materialesTecnico: cuerpo.querySelector('#ppMat').value.trim() };
        logTxt = 'Culminación del técnico';
      }
      if (k === 'pdf') { Reporte.abrir(id); return; }
      if (!c) return;
      ocupado = true; if (btn) btn.disabled = true;
      try {
        await DB.actualizar('ordenes', id, c);
        Object.assign(local, c);
        DB.log('PASO', 'ordenes', o.folio, logTxt);
        if (k === 'cul') { const s = slaInfo(local); UI.toast(`Trabajo finalizado en ${fDur(s.transc)}: ${s.cumple ? 'dentro' : 'fuera'} del SLA. Recabe las firmas.`, s.cumple ? 'ok' : 'err', 6000); }
        else UI.toast(PASOS_TEC.find(p => p.k === k).l + ' registrado.', 'ok');
        pintar();
      } catch (e) { UI.toast('No se pudo guardar: ' + e.message, 'err'); if (btn) btn.disabled = false; }
      finally { ocupado = false; }
    };

    cuerpo.addEventListener('click', e => {
      const b = e.target.closest('[data-pp]');
      if (b) { paso(b.dataset.pp, b); return; }
      const f = e.target.closest('[data-pp-firma]');
      if (f) this.firmar(id, f.dataset.ppFirma, async (clave, nom, ts) => {
        Object.assign(media, await DB.media(id, true));
        Object.assign(local, clave === 'firmaEntrega' ? { entregaNombre: nom, fechaFirmaEntrega: ts } : { recibeNombre: nom, fechaFirmaRecibe: ts });
        pintar();
        // Ambas firmas capturadas: se entrega la orden y se genera el PDF
        if (media.firmaEntrega && media.firmaRecibe) await this.entregar(Object.assign({}, local), null);
      });
    });
    pintar();
  },

  /* ==========================================================================
     Levantamiento del técnico: mínimo 4 fotografías, diagnóstico y lista de
     materiales con autoguardado en ordenes/{id}/materialesLev/{materialId}
     ========================================================================== */
  async levantamientoTecnico(id, { alRegistrar, alCerrar } = {}) {
    const o = this.porId(id); if (!o) return;
    if (esTecnico() && o.tecnicoId !== SESION.tecnicoId) { UI.toast('Esta orden no está asignada a usted.', 'err'); return; }
    if (!esTecnico() && !can('capture')) return;
    const media = Object.assign({}, await DB.media(id, true).catch(() => ({})));
    const rep = await this.evidenciaReporte(o, media);
    const registrado = !!o.fechaLevantamiento;
    const editable = !o.fechaCulminacion && OT_ABIERTAS.includes(o.estatus);
    const fotosEd = editable && !registrado;                 // la evidencia se congela al registrar
    const quien = SESION.nombre || (ROLES[SESION.rol] || {}).label || '';
    const filas = this.matLev(o, true).map(x => ({ mid: x.id, desc: x.desc || '', cant: x.cant ?? 1, unidad: x.unidad || 'PZA', nota: x.nota || '', orden: x.orden || Date.now(), guardado: true }));
    const timers = {};
    let tDiag = null;

    const m = UI.modal({
      titulo: `Levantamiento ${o.folio}`, clase: 'm-campo m-pipe m-fija', ancho: '760px',
      sub: `${esc(o.oficina)}, ${esc(tituloEdificio(o.edificio))}. ${registrado ? 'Registrado ' + fFechaHora(o.fechaLevantamiento) + '.' : 'Los cambios se guardan automáticamente.'}`,
      cuerpo: `
        <section class="campo-sec"><h3>Evidencia del reporte</h3>
          ${this.galeriaHTML(rep, 'El reporte no incluye fotografías.')}
          <p class="hint">Tome sus fotografías desde ángulos comparables para documentar el antes y el después.</p>
        </section>
        <section class="campo-sec"><div class="sec-head"><h3>Fotografías del área a intervenir</h3><span class="conteo-fotos" id="lvCont"></span></div>
          <p class="hint">Mínimo ${LEV_FOTOS_MIN}. Con Galería puede elegir varias a la vez.</p>
          <div class="fotos" id="lvFotos"></div>
        </section>
        <section class="campo-sec"><h3>Diagnóstico inicial</h3>
          <label class="fl"><textarea id="lvDiag" rows="4" placeholder="Condición encontrada, causa probable y trabajo a realizar"${editable ? '' : ' disabled'}>${esc(o.diagnostico || '')}</textarea></label>
        </section>
        <section class="campo-sec"><div class="sec-head"><h3>Lista de materiales necesarios</h3><span class="autosave" id="lvEstado">Autoguardado activo</span></div>
          <div class="mlev" id="lvMats"></div>
          ${editable ? '<button type="button" class="btn" id="lvAdd">Agregar material</button>' : ''}
          <datalist id="lvUnidades">${UNIDADES_MAT.map(u => `<option value="${u}">`).join('')}</datalist>
        </section>`,
      acciones: [
        { texto: 'Cerrar', clase: 'btn-ghost' },
        ...(editable && !registrado ? [{ texto: 'Registrar levantamiento', clase: 'btn-primary btn-grande', fn: async mm => {
          await guardarTodo();
          const n = this.fotosDe(media, 'antes').length, diag = mm.q('#lvDiag').value.trim();
          if (n < LEV_FOTOS_MIN) { UI.toast(`Se requieren al menos ${LEV_FOTOS_MIN} fotografías del área; lleva ${n}.`, 'err'); return false; }
          if (!diag) { UI.toast('Escriba el diagnóstico inicial.', 'err'); mm.q('#lvDiag').classList.add('err'); return false; }
          const nm = filas.filter(f => String(f.desc).trim()).length;
          if (!nm && !(await UI.confirmar('No capturó materiales. ¿El trabajo no requiere materiales?', { texto: 'Registrar sin materiales' }))) return false;
          const c = { fechaLevantamiento: nowISO(), diagnostico: diag };
          await DB.actualizar('ordenes', id, c);
          DB.log('PASO', 'ordenes', o.folio, `Levantamiento del técnico: ${n} fotografías, ${nm} materiales`);
          UI.toast('Levantamiento registrado.', 'ok');
          alRegistrar && alRegistrar(c, media);
        } }] : [])
      ],
      alCerrar: () => { guardarTodo(); alCerrar && alCerrar(media); }
    });

    const estado = (t, cls) => { const e = m.q('#lvEstado'); if (e) { e.textContent = t; e.className = 'autosave ' + (cls || ''); } };
    const hora = () => new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Fotografías
    const cont = m.q('#lvCont');
    this.montarFotos(m.q('#lvFotos'), 'antes', media, fotosEd, id, {
      alCambiar: n => { if (cont) { cont.textContent = `${n} de ${LEV_FOTOS_MIN} mínimas`; cont.className = 'conteo-fotos' + (n >= LEV_FOTOS_MIN ? ' ok' : ''); } }
    });

    // Diagnóstico con autoguardado
    const diagEl = m.q('#lvDiag');
    const guardarDiag = async () => {
      clearTimeout(tDiag); tDiag = null;
      if (!editable) return;
      const v = diagEl.value.trim();
      if (v === String(o.diagnostico || '').trim()) return;
      o.diagnostico = v;
      await escribir(DB.db.ref(`${FB.root}/ordenes/${id}`).update({ diagnostico: v, updatedAt: nowISO() }));
    };
    diagEl.addEventListener('input', () => { estado('Guardando…', 'ing'); clearTimeout(tDiag); tDiag = setTimeout(guardarDiag, 800); });

    // Escritura con estado visible (sin conexión: Firebase la conserva y la envía al reconectar)
    const escribir = async promesa => {
      if (!DB.conectado) { estado('Sin conexión: se guardó en el dispositivo y se enviará al reconectar', 'err'); return; }
      try { await promesa; estado(`Guardado ${hora()}`, 'ok'); }
      catch (e) { estado('No se pudo guardar: ' + e.message, 'err'); }
    };

    // Lista de materiales
    const lista = m.q('#lvMats');
    const dis = editable ? '' : ' disabled';
    const pintarMats = () => {
      lista.innerHTML = filas.length ? filas.map(f => `<div class="mlev-fila" data-mid="${f.mid}">
          <input class="mlev-desc" data-k="desc" value="${esc(f.desc)}" placeholder="Material o refacción" aria-label="Material"${dis}>
          <input class="mlev-cant num" data-k="cant" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(f.cant)}" aria-label="Cantidad"${dis}>
          <input class="mlev-uni" data-k="unidad" list="lvUnidades" value="${esc(f.unidad)}" aria-label="Unidad"${dis}>
          <input class="mlev-nota" data-k="nota" value="${esc(f.nota)}" placeholder="Especificación, medida o marca (opcional)" aria-label="Especificación"${dis}>
          ${editable ? '<button type="button" class="btn-ico mlev-del" data-borrar aria-label="Quitar material">✕</button>' : ''}
        </div>`).join('') : '<p class="muted">Sin materiales capturados.</p>';
    };
    const ruta = mid => DB.db.ref(`${FB.root}/ordenes/${id}/materialesLev/${mid}`);
    const guardarFila = async mid => {
      clearTimeout(timers[mid]); delete timers[mid];
      const f = filas.find(x => x.mid === mid); if (!f) return;
      if (!String(f.desc).trim() && !f.guardado) return;           // no se crean renglones vacíos
      const ahora = nowISO();
      const d = { desc: String(f.desc).trim(), cant: Number(f.cant) || 0, unidad: mayus(f.unidad) || 'PZA', nota: String(f.nota).trim(), orden: f.orden, actualizado: ahora, por: quien };
      if (!f.guardado) d.creado = ahora;
      f.guardado = true;
      await escribir(ruta(mid).update(d));
    };
    const guardarTodo = () => Promise.all([...Object.keys(timers).map(guardarFila), tDiag ? guardarDiag() : null]);
    lista.addEventListener('input', e => {
      const t = e.target, fila = t.closest('[data-mid]'); if (!fila || !t.dataset.k) return;
      const f = filas.find(x => x.mid === fila.dataset.mid); if (!f) return;
      f[t.dataset.k] = t.value;
      estado('Guardando…', 'ing');
      clearTimeout(timers[f.mid]); timers[f.mid] = setTimeout(() => guardarFila(f.mid), 600);
    });
    lista.addEventListener('click', async e => {
      const b = e.target.closest('[data-borrar]'); if (!b) return;
      const mid = b.closest('[data-mid]').dataset.mid, f = filas.find(x => x.mid === mid);
      clearTimeout(timers[mid]); delete timers[mid];
      filas.splice(filas.indexOf(f), 1);
      pintarMats();
      if (f.guardado) { estado('Guardando…', 'ing'); await escribir(ruta(mid).remove()); }
    });
    if (m.q('#lvAdd')) m.q('#lvAdd').onclick = () => {
      const f = { mid: uid(), desc: '', cant: 1, unidad: 'PZA', nota: '', orden: Date.now(), guardado: false };
      filas.push(f); pintarMats();
      const inp = lista.querySelector(`[data-mid="${f.mid}"] .mlev-desc`); inp && inp.focus();
    };
    pintarMats();
  },

  /* ---------- Calendarizar la ejecución (técnico, Administrador o Auxiliar) ---------- */
  calendarizar(id, despues) {
    const o = this.porId(id); if (!o) return;
    if (esTecnico() && o.tecnicoId !== SESION.tecnicoId) { UI.toast('Esta orden no está asignada a usted.', 'err'); return; }
    if (!esTecnico() && !can('capture')) return;
    if (!OT_ABIERTAS.includes(o.estatus) || o.fechaCulminacion) { UI.toast('La orden ya está finalizada.'); return; }
    const quien = SESION.nombre || (ROLES[SESION.rol] || {}).label || '';
    UI.modal({
      titulo: 'Calendarizar ejecución', sub: `${esc(o.folio)}: ${esc(o.oficina)}, ${esc(tituloEdificio(o.edificio))}`, ancho: '460px', clase: 'm-agenda',
      cuerpo: `<label class="fl"><span>Fecha y hora de ejecución</span><input type="datetime-local" id="caFec" value="${o.agendaEjecucion ? localInput(o.agendaEjecucion) : ''}"></label>
        <label class="fl"><span>Duración estimada</span><select id="caDur">${opciones(DURACIONES, o.agendaDuracionMin || CAL_DURACION.ejecucion)}</select></label>
        <p class="hint">La fecha se refleja de inmediato en el Calendario general.${o.agendadoPor ? ` Última programación: ${esc(o.agendadoPor)}, ${fFechaHora(o.agendadoEn)}.` : ''}</p>`,
      acciones: [
        ...(o.agendaEjecucion ? [{ texto: 'Quitar fecha', clase: 'btn-ghost txt-rojo', fn: async () => {
          const c = { agendaEjecucion: null, agendaDuracionMin: null, agendadoPor: quien, agendadoEn: nowISO() };
          await DB.actualizar('ordenes', id, c);
          DB.log('AGENDA', 'ordenes', o.folio, 'Fecha de ejecución retirada');
          UI.toast('Fecha retirada.');
          despues && despues(c);
        } }] : []),
        { texto: 'Cancelar' },
        { texto: 'Guardar', clase: 'btn-primary', fn: async mm => {
          const v = desdeLocalInput(mm.q('#caFec').value);
          if (!v) { UI.toast('Indique fecha y hora.', 'err'); return false; }
          if (new Date(v) < new Date(Date.now() - 3600000) && !(await UI.confirmar('La fecha es anterior a la hora actual. ¿Guardarla de todos modos?', { texto: 'Guardar' }))) return false;
          const c = { agendaEjecucion: v, agendaDuracionMin: Number(mm.q('#caDur').value), agendadoPor: quien, agendadoEn: nowISO() };
          await DB.actualizar('ordenes', id, c);
          DB.log('AGENDA', 'ordenes', o.folio, `Ejecución ${fFechaHora(v)}`);
          UI.toast(`Ejecución agendada: ${fechaCorta(v)}.`, 'ok');
          despues && despues(c);
        } }
      ]
    });
  }
};

/* ==========================================================================
   Vista de órdenes (Administrador, Auxiliar y Gerencia)
   ========================================================================== */
const ModOT = {
  init() {
    ['otBuscar', 'otEstatus', 'otCat', 'otEdif', 'otTipo'].forEach(id => $('#' + id).addEventListener(id === 'otBuscar' ? 'input' : 'change', () => this.render()));
    $('#otEstatus').innerHTML = opciones([{ v: 'ACTIVAS', l: 'Abiertas' }, ...Object.keys(OT_ESTATUS).map(k => ({ v: k, l: OT_ESTATUS[k].l }))], 'ACTIVAS', 'Todos los estatus');
    $('#otCat').innerHTML = opciones(CATEGORIAS, '', 'Todas las categorías');
    $('#otTipo').innerHTML = opciones([...Object.keys(TIPOS_EJECUCION).map(k => ({ v: k, l: TIPOS_EJECUCION[k].l })), { v: 'SIN', l: 'Sin definir' }], '', 'Interno y externo');
    $('#otNueva').onclick = () => OT.levantamiento({});
    $('#otTecnicos').onclick = () => ModTecnicos.abrir();
    const abrir = e => {
      const b = e.target.closest('[data-ot]'); if (!b) return;
      if (b.dataset.acc === 'pdf') Reporte.abrir(b.dataset.ot); else OT.abrir(b.dataset.ot);
    };
    $('#otTabla').addEventListener('click', abrir);
    $('#otExternos').addEventListener('click', abrir);
  },
  render() {
    const eds = $('#otEdif'), ev = eds.value;
    eds.innerHTML = opciones(Areas.edificios(), ev, 'Todos los edificios');
    $('#otNueva').hidden = !can('capture');
    $('#otTecnicos').hidden = !can('config');
    const todas = ST.ordenes, ab = todas.filter(o => OT_ABIERTAS.includes(o.estatus));
    const fuera = ab.filter(o => !o.fechaCulminacion && slaInfo(o).estado === 'excedido').length;
    const porRec = ab.filter(o => slaInfo(o).pendiente).length;
    const porEnt = todas.filter(o => o.estatus === 'CULMINADA').length;
    const mes = ymdLocal().slice(0, 7);
    const entMes = todas.filter(o => o.estatus === 'ENTREGADA' && String(o.fechaEntrega || '').slice(0, 7) === mes).length;
    const cerr = todas.filter(o => o.fechaCulminacion && o.estatus !== 'CANCELADA');
    const cumpl = cerr.length ? Math.round(cerr.filter(o => slaInfo(o).cumple).length / cerr.length * 100) : null;
    $('#otKpis').innerHTML = [
      kpi(ab.length, 'Órdenes abiertas', `${fuera} fuera de SLA`, fuera ? 'k-rojo' : 'k-morado'),
      kpi(porRec, 'Por recibir', 'Técnicos sin confirmar', porRec ? 'k-ambar' : 'k-verde'),
      kpi(ab.filter(o => o.tipoEjecucion === 'EXTERNO').length, 'Con proveedor externo', 'En seguimiento', 'k-ambar'),
      kpi(porEnt, 'Por entregar', 'Culminadas sin firmas', porEnt ? 'k-ambar' : 'k-verde'),
      kpi(entMes, 'Entregadas este mes', MESES_L[new Date().getMonth()], 'k-verde'),
      kpi(cumpl == null ? '—' : cumpl + ' %', 'Cumplimiento de SLA', `${cerr.length} órdenes culminadas`, cumpl == null ? 'k-azul' : cumpl >= 90 ? 'k-verde' : cumpl >= 75 ? 'k-ambar' : 'k-rojo')
    ].join('');

    // Bandeja anclada de proveedores externos (seguimiento corporativo)
    const ext = ab.filter(o => o.tipoEjecucion === 'EXTERNO').sort((a, b) => String(a.agendaEjecucion || '9').localeCompare(String(b.agendaEjecucion || '9')) || String(otGeneracion(a)).localeCompare(String(otGeneracion(b))));
    $('#otExtBloque').hidden = !ext.length || esTecnico();
    $('#otExternos').innerHTML = ext.length ? `<table class="tbl"><thead><tr><th>Folio</th><th>Proveedor</th><th>Ubicación</th><th>Ejecución agendada</th><th>Estatus</th><th>Días abierta</th><th>SLA</th><th></th></tr></thead><tbody>
      ${ext.map(o => { const d = Math.floor((Date.now() - new Date(otGeneracion(o))) / 86400000); return `<tr>
        <td class="mono"><b>${esc(o.folio)}</b></td><td><b>${esc(o.proveedor || o.ejecutor || '—')}</b></td>
        <td>${esc(o.oficina)}<br><span class="muted">${esc(tituloEdificio(o.edificio))}</span></td>
        <td>${o.agendaEjecucion ? fFechaHora(o.agendaEjecucion) : '<span class="txt-ambar">Sin agendar</span>'}</td>
        <td>${OT.tag(o)}</td><td class="num${d > 7 ? ' txt-rojo' : ''}">${d}</td><td style="min-width:160px">${slaHTML(o, true)}</td>
        <td class="acc"><button class="btn btn-sm" data-ot="${esc(o.id)}">Abrir</button></td></tr>`; }).join('')}</tbody></table>` : '';

    const q = norm($('#otBuscar').value), es = $('#otEstatus').value, ca = $('#otCat').value, ed = $('#otEdif').value, tp = $('#otTipo').value;
    const f = todas.filter(o => (!es || (es === 'ACTIVAS' ? OT_ABIERTAS.includes(o.estatus) : o.estatus === es)) && (!ca || o.categoria === ca) && (!ed || o.edificio === ed) &&
      (!tp || (tp === 'SIN' ? !o.tipoEjecucion : o.tipoEjecucion === tp)) &&
      (!q || norm([o.folio, o.oficina, o.hallazgo, o.solicitanteNombre, OT.ejecutorTxt(o), o.origen && o.origen.folio].join(' ')).includes(q)))
      .sort((a, b) => String(otGeneracion(b)).localeCompare(String(otGeneracion(a))));
    $('#otConteo').textContent = `${f.length} de ${todas.length}`;
    $('#otTabla').innerHTML = f.length ? `<table class="tbl"><thead><tr><th>Folio</th><th>Origen</th><th>Ubicación</th><th>Categoría</th><th>Ejecución</th><th>Estatus</th><th>Tiempo de atención</th><th class="num">Costo</th><th></th></tr></thead><tbody>
      ${f.map(o => `<tr class="clic" data-ot="${esc(o.id)}">
        <td class="mono"><b>${esc(o.folio)}</b><br><span class="muted">${fFechaHora(otGeneracion(o))}</span></td>
        <td>${esc(OT.origenTxt(o))}</td>
        <td><b>${esc(o.oficina)}</b><br><span class="muted">${esc(tituloEdificio(o.edificio))}</span></td>
        <td>${esc(o.categoria)}<br>${tagPrioridad(o.prioridad)}</td>
        <td>${OT.tipoTag(o)}<br><span class="muted">${esc(OT.ejecutorTxt(o))}</span></td>
        <td>${OT.tag(o)}</td>
        <td style="min-width:170px">${slaHTML(o)}</td><td class="num">${money(OT.costos(o).total)}</td>
        <td class="acc"><button class="btn btn-sm" data-ot="${esc(o.id)}">Abrir</button>
        ${['CULMINADA', 'ENTREGADA'].includes(o.estatus) ? `<button class="btn btn-sm btn-ghost" data-ot="${esc(o.id)}" data-acc="pdf">Reporte</button>` : ''}</td></tr>`).join('')}</tbody></table>`
      : UI.vacio(todas.length ? 'Ninguna orden coincide con los filtros.' : 'Sin órdenes de trabajo. Genere la primera desde una solicitud, una incidencia o un levantamiento.', can('capture') ? '<button class="btn btn-primary" onclick="OT.levantamiento({})">Nueva orden de trabajo</button>' : '');
  }
};

/* ==========================================================================
   Mis órdenes (vista móvil del Operador técnico)
   ========================================================================== */
const ModMisOT = {
  init() {
    $('#moLista').addEventListener('click', e => {
      const a = e.target.closest('[data-agendar]');
      if (a) { OT.calendarizar(a.dataset.agendar); return; }
      const c = e.target.closest('[data-ot]'); if (c) OT.pipeline(c.dataset.ot);
    });
  },
  render() {
    $('#moNombre').textContent = SESION.nombre || '';
    const mias = ST.ordenes.filter(o => o.tecnicoId && o.tecnicoId === SESION.tecnicoId && o.estatus !== 'CANCELADA');
    const prio = o => ordenIdx(['ALTA', 'MEDIA', 'BAJA'], o.prioridad);
    const abiertas = mias.filter(o => OT_ABIERTAS.includes(o.estatus))
      .sort((a, b) => String(a.agendaEjecucion || a.agendaLevantamiento || '9').localeCompare(String(b.agendaEjecucion || b.agendaLevantamiento || '9')) || prio(a) - prio(b));
    const entregadas = mias.filter(o => o.estatus === 'ENTREGADA').sort((a, b) => String(b.fechaEntrega).localeCompare(String(a.fechaEntrega))).slice(0, 10);
    const cnt = p => abiertas.filter(o => OT.paso(o) === p).length;
    const sinAgenda = abiertas.filter(o => !o.agendaEjecucion && OT.paso(o) < 4).length;
    $('#moResumen').innerHTML = [
      ['Por levantar', cnt(0)], ['Por recibir', cnt(1)], ['Por iniciar', cnt(2)], ['En proceso', cnt(3)], ['Por firmar', cnt(4)]
    ].map(([l, n]) => `<div class="mo-k${n ? ' on' : ''}"><b>${n}</b><span>${l}</span></div>`).join('') +
      (sinAgenda ? `<p class="mo-aviso">${sinAgenda} ${sinAgenda === 1 ? 'orden sin fecha' : 'órdenes sin fecha'} de ejecución. Use el botón de calendario para programarlas.</p>` : '');

    const tarjeta = (o, conAgenda) => {
      const p = OT.paso(o);
      const ag = o.agendaLevantamiento && p === 0 ? `Levantamiento ${fechaCorta(o.agendaLevantamiento)}` : '';
      const puedeAgendar = conAgenda && p < 4;
      return `<article class="mo-card prio-${(o.prioridad || 'MEDIA').toLowerCase()}">
        <button type="button" class="mo-main" data-ot="${esc(o.id)}">
          <div class="mo-top"><span class="mono">${esc(o.folio)}</span>${tagPrioridad(o.prioridad)}</div>
          <div class="mo-of">${esc(o.oficina)}</div>
          <div class="mo-ub">${esc(tituloNivel(o.nivel))}. ${esc(o.categoria)}</div>
          ${ag ? `<div class="mo-ag">${esc(ag)}</div>` : ''}
          <div class="mo-prog" aria-label="Paso ${Math.min(p + 1, 5)} de 5">${PASOS_TEC.map((_, i) => `<i class="${i < p ? 'ok' : i === p ? 'act' : ''}"></i>`).join('')}</div>
          <div class="mo-paso">${p < 5 ? `Paso ${p + 1} de 5: ${PASOS_TEC[p].l}` : 'Entregada'}</div>
          ${o.estatus !== 'ENTREGADA' ? slaHTML(o, true) : ''}
        </button>
        ${puedeAgendar ? `<button type="button" class="mo-cal${o.agendaEjecucion ? ' on' : ''}" data-agendar="${esc(o.id)}" aria-label="Calendarizar ejecución de ${esc(o.folio)}" title="Calendarizar">
          ${ICONO_CAL}<span>${o.agendaEjecucion ? esc(fechaCorta(o.agendaEjecucion)) : 'Agendar'}</span></button>` : ''}
      </article>`;
    };

    // Agrupación por edificio (orden del catálogo; ubicaciones generales al final)
    const eds = [...new Set(abiertas.map(o => o.edificio || 'SIN UBICACIÓN'))]
      .sort((a, b) => ordenIdx(EDIFICIOS_ORDEN, a) - ordenIdx(EDIFICIOS_ORDEN, b) || a.localeCompare(b));
    const grupos = eds.map(ed => {
      const l = abiertas.filter(o => (o.edificio || 'SIN UBICACIÓN') === ed);
      return `<section class="mo-edif" aria-label="${esc(tituloEdificio(ed))}">
        <header class="mo-edif-h"><h3>${esc(ed === 'TODAS LAS INSTALACIONES' ? 'Todas las instalaciones' : tituloEdificio(ed))}</h3><span>${l.length} ${l.length === 1 ? 'orden' : 'órdenes'}</span></header>
        ${l.map(o => tarjeta(o, true)).join('')}
      </section>`;
    }).join('');
    $('#moLista').innerHTML = (abiertas.length ? grupos : UI.vacio('No tiene órdenes de trabajo pendientes.')) +
      (entregadas.length ? `<h3 class="mo-sec">Entregadas recientemente</h3>${entregadas.map(o => tarjeta(o, false)).join('')}` : '');
  }
};

/* ==========================================================================
   Catálogo de Operadores técnicos (solo Administrador)
   ========================================================================== */
const ModTecnicos = {
  abrir() {
    if (!can('config')) return;
    const pintar = () => {
      const ts = Tecnicos.todos();
      return ts.length ? `<div class="tblwrap"><table class="tbl"><thead><tr><th>Nombre</th><th>Teléfono</th><th>PIN</th><th>OT abiertas</th><th>Estado</th><th></th></tr></thead><tbody>
        ${ts.map(t => `<tr><td><b>${esc(t.nombre)}</b></td><td>${esc(t.telefono || '—')}</td><td class="mono">••${esc(String(t.pin || '').slice(-2))}</td>
          <td class="num">${ST.ordenes.filter(o => o.tecnicoId === t.id && OT_ABIERTAS.includes(o.estatus)).length}</td>
          <td>${t.activo === false ? '<span class="tag t-gris">Inactivo</span>' : '<span class="tag t-verde">Activo</span>'}</td>
          <td class="acc"><button class="btn btn-sm" data-tec="${esc(t.id)}">Editar</button></td></tr>`).join('')}</tbody></table></div>`
        : UI.vacio('Sin técnicos registrados. Cada técnico entra al tablero con el rol Operador técnico y su PIN personal.');
    };
    const m = UI.modal({
      titulo: 'Operadores técnicos', ancho: '760px', sub: 'Personal interno al que se asignan órdenes de trabajo.',
      cuerpo: '<div id="tecLista"></div>',
      acciones: [{ texto: 'Cerrar' }, { texto: 'Agregar técnico', clase: 'btn-primary', cierra: false, fn: () => { this.editar(null, () => { m.q('#tecLista').innerHTML = pintar(); }); return false; } }]
    });
    m.q('#tecLista').innerHTML = pintar();
    m.q('#tecLista').addEventListener('click', e => { const b = e.target.closest('[data-tec]'); if (b) this.editar(b.dataset.tec, () => { m.q('#tecLista').innerHTML = pintar(); }); });
  },
  editar(id, despues) {
    const t = id ? Tecnicos.porId(id) : null;
    UI.modal({
      titulo: t ? 'Editar técnico' : 'Agregar técnico', ancho: '520px',
      cuerpo: `<label class="fl"><span>Nombre completo</span><input id="tNom" value="${esc(t ? t.nombre : '')}"></label>
        <div class="fg2">
          <label class="fl"><span>Teléfono</span><input id="tTel" inputmode="tel" value="${esc(t ? t.telefono || '' : '')}"></label>
          <label class="fl"><span>PIN personal (${PIN_TECNICO.min} a ${PIN_TECNICO.max} dígitos)</span><input id="tPin" inputmode="numeric" autocomplete="off" value="${esc(t ? t.pin || '' : '')}"></label>
        </div>
        ${t ? `<label class="chk"><input type="checkbox" id="tAct"${t.activo !== false ? ' checked' : ''}> Activo (al desactivarlo pierde el acceso de inmediato)</label>` : ''}
        <p class="hint">Entregue el PIN al técnico en persona. Entra con el rol Operador técnico y solo ve sus órdenes asignadas.</p>`,
      acciones: [{ texto: 'Cancelar' }, {
        texto: 'Guardar', clase: 'btn-primary', fn: async mm => {
          const nombre = mayus(mm.q('#tNom').value), pin = mm.q('#tPin').value.trim();
          if (!nombre) { UI.toast('El nombre es obligatorio.', 'err'); return false; }
          if (!new RegExp(`^\\d{${PIN_TECNICO.min},${PIN_TECNICO.max}}$`).test(pin)) { UI.toast(`El PIN debe tener de ${PIN_TECNICO.min} a ${PIN_TECNICO.max} dígitos.`, 'err'); return false; }
          if (Object.values(AUTH_CODES).includes(pin)) { UI.toast('El PIN no puede coincidir con un código de rol.', 'err'); return false; }
          if (ST.tecnicos.some(x => x.id !== (t && t.id) && String(x.pin) === pin)) { UI.toast('Ese PIN ya pertenece a otro técnico.', 'err'); return false; }
          if (ST.tecnicos.some(x => x.id !== (t && t.id) && norm(x.nombre) === norm(nombre))) { UI.toast('Ya existe un técnico con ese nombre.', 'err'); return false; }
          const d = { nombre, telefono: mm.q('#tTel').value.trim(), pin };
          if (t) { d.activo = mm.q('#tAct').checked; await DB.actualizar('tecnicos', t.id, d); DB.log('EDICION', 'tecnicos', nombre, d.activo ? 'Activo' : 'Inactivo'); }
          else { d.activo = true; await DB.guardar('tecnicos', d); DB.log('ALTA', 'tecnicos', nombre, ''); }
          UI.toast('Técnico guardado.', 'ok');
          setTimeout(() => despues && despues(), 150);
        }
      }]
    });
  }
};

UI.registrar('ordenes', ModOT);
UI.registrar('misordenes', ModMisOT);
