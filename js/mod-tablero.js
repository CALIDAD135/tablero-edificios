/* ==========================================================================
   CONTROL DE EDIFICIOS · IES
   js/mod-tablero.js — Módulo 1: Tablero interactivo y edición de edificios
   Vista en alzado: cada edificio con sus plantas apiladas y cada oficina como
   un módulo coloreado por su estado operativo en tiempo real.
   ========================================================================== */

const ModTablero = {
  areaSel: null,

  init() {
    $('#tbBuscar').addEventListener('input', () => this.render());
    $('#tbDepto').addEventListener('change', () => this.render());
    $('#tbNuevaArea').onclick = () => this.editarArea(null);
    $('#tbSitio').addEventListener('click', e => {
      const t = e.target.closest('.tile'); if (t) this.abrirArea(t.dataset.area);
    });
  },

  render() {
    const est = estadoAreas();
    const activas = Areas.activas();

    // Carga inicial de la estructura (solo Administrador, cuando la base está vacía)
    $('#tbSemilla').innerHTML = !ST.areas.length
      ? `<div class="aviso aviso-accion"><div><b>La base de áreas está vacía.</b> ${can('seed')
          ? 'Cargue la estructura de 63 áreas (Edificio A, Edificio B, Edificio C y Taller 3) del listado EDIFICIOS_IES.'
          : 'El Administrador debe cargar la estructura inicial.'}</div>
          ${can('seed') ? '<button class="btn btn-primary" id="btnSemilla">Cargar 63 áreas</button>' : ''}</div>` : '';
    const bs = $('#btnSemilla');
    if (bs) bs.onclick = async () => {
      bs.disabled = true;
      try { await DB.sembrarAreas(); await new Promise(r => setTimeout(r, 400)); await DB.publicarCatalogo(); UI.toast('Estructura de 63 áreas cargada.', 'ok'); }
      catch (e) { UI.toast('No se pudo cargar: ' + e.message, 'err'); bs.disabled = false; }
    };

    // Filtro de departamento (conserva la selección)
    const dsel = $('#tbDepto'), dv = dsel.value;
    const deptos = [...new Set(activas.map(a => a.departamento).filter(Boolean))].sort();
    dsel.innerHTML = opciones(deptos, dv, 'Todos los departamentos');
    $('#tbNuevaArea').hidden = !can('edit_areas');

    // Indicadores
    const conPend = activas.filter(a => nivelArea(est.m[a.id]) !== 'ok').length;
    const otAb = ST.ordenes.filter(o => OT_ABIERTAS.includes(o.estatus));
    const slaEx = otAb.filter(o => !o.fechaCulminacion && slaInfo(o).estado === 'excedido').length;
    const mv = ST.mantenimientos.filter(p => p.activo !== false && Mant.proxima(p) && Mant.proxima(p) < ymdLocal()).length;
    const solN = ST.solicitudes.filter(s => !s.gestion || s.gestion.estado === 'NUEVA').length;
    $('#tbKpis').innerHTML = [
      kpi(activas.length, 'Áreas registradas', `${Areas.edificios().length} edificios`, 'k-azul'),
      kpi(conPend, 'Áreas con pendientes', `${activas.length ? Math.round(conPend / activas.length * 100) : 0} % del total`, conPend ? 'k-ambar' : 'k-verde'),
      kpi(otAb.length, 'Órdenes abiertas', slaEx ? `${slaEx} fuera de SLA` : 'Todas en tiempo', slaEx ? 'k-rojo' : 'k-morado'),
      kpi(mv, 'Mantenimientos vencidos', mv ? 'Requieren programación' : 'Programa al día', mv ? 'k-rojo' : 'k-verde'),
      kpi(solN, 'Solicitudes nuevas', 'Formulario público', solN ? 'k-ambar' : 'k-azul')
    ].join('');

    // Alzados
    const q = norm($('#tbBuscar').value), dp = dsel.value;
    const coincide = a => (!dp || a.departamento === dp) &&
      (!q || norm(a.oficina).includes(q) || norm(Areas.responsable(a)).includes(q) || norm(a.departamento).includes(q));
    const html = Areas.edificios().map(ed => this.edificioHTML(ed, est, coincide)).join('');
    $('#tbSitio').innerHTML = html || UI.vacio('Sin áreas para mostrar.');
    $('#tbGeneral').innerHTML = est.generalMv
      ? `<span class="tag t-rojo">${est.generalMv} mantenimiento${est.generalMv > 1 ? 's' : ''} general${est.generalMv > 1 ? 'es' : ''} vencido${est.generalMv > 1 ? 's' : ''}</span>` : '';
    if (this.areaSel) { const t = $(`.tile[data-area="${this.areaSel}"]`); t && Drawer.abierto && t.classList.add('sel'); }
  },

  edificioHTML(ed, est, coincide) {
    const niveles = Areas.niveles(ed);
    const areas = Areas.activas().filter(a => a.edificio === ed);
    const pend = areas.filter(a => nivelArea(est.m[a.id]) !== 'ok').length;
    const maxT = Math.max(...niveles.map(n => Areas.oficinas(ed, n).length), 1);
    const peso = Math.max(1, Math.ceil(maxT / 3));
    const mvEd = est.edifMv[ed] || 0;
    return `<article class="edif" style="flex:${peso} 1 ${maxT <= 2 ? 150 : 230}px">
      <header class="edif-head">
        <h3>${esc(tituloEdificio(ed))}</h3>
        <p>${areas.length} área${areas.length !== 1 ? 's' : ''}${pend ? `, <b>${pend} con pendientes</b>` : ', sin pendientes'}</p>
        ${mvEd ? `<span class="tag t-rojo" title="Mantenimientos vencidos que aplican a todo el edificio">${mvEd} mant. vencido${mvEd > 1 ? 's' : ''}</span>` : ''}
      </header>
      <div class="edif-cuerpo">
        <div class="techo" aria-hidden="true"></div>
        ${niveles.map(n => `<div class="planta">
          <div class="planta-lbl">${esc(tituloNivel(n))}</div>
          <div class="tiles">${Areas.oficinas(ed, n).map(a => this.tileHTML(a, est.m[a.id], coincide(a))).join('')}</div>
        </div>`).join('')}
      </div>
    </article>`;
  },

  tileHTML(a, x, visible) {
    const nv = nivelArea(x);
    const resp = Areas.responsable(a);
    const det = [];
    if (x && x.ot) det.push(`${x.ot} OT`);
    if (x && x.inc) det.push(`${x.inc} inc.`);
    if (x && x.mv) det.push(`${x.mv} mant.`);
    const tit = `${a.oficina}\n${resp ? 'Responsable: ' + resp : 'Sin responsable asignado'}${det.length ? '\nPendientes: ' + det.join(', ') : ''}`;
    return `<button type="button" class="tile st-${nv}${visible ? '' : ' dim'}" data-area="${a.id}" title="${esc(tit)}">
      <span class="t-of">${esc(a.oficina)}</span>
      <span class="t-re">${esc(resp || 'Sin responsable')}</span>
      ${det.length ? `<span class="t-pe">${esc(det.join(', '))}</span>` : ''}
    </button>`;
  },

  /* ---------- Panel de detalle del área ---------- */
  abrirArea(id) {
    this.areaSel = id;
    $$('.tile.sel').forEach(t => t.classList.remove('sel'));
    const t = $(`.tile[data-area="${id}"]`); t && t.classList.add('sel');
    const pintar = () => {
      const a = Areas.porId(id);
      if (!a) { Drawer.cerrar(); return; }
      Drawer.pintar(a.oficina, this.detalleHTML(a));
      this.enlazarDetalle(a);
    };
    Drawer.abrir('', '', pintar);
    pintar();
  },

  detalleHTML(a) {
    const est = estadoAreas();
    const x = est.m[a.id], nv = nivelArea(x);
    const p = a.responsableId ? Personas.porId(a.responsableId) : null;
    const incs = ST.incidencias.filter(i => i.areaId === a.id && ['ABIERTA', 'EN_ATENCION'].includes(i.estatus));
    const ots = ST.ordenes.filter(o => o.areaId === a.id).sort((u, v) => String(otGeneracion(v)).localeCompare(String(otGeneracion(u))));
    const mants = ST.mantenimientos.filter(m => m.activo !== false && (m.alcance === 'GENERAL' || (m.alcance === 'EDIFICIO' && m.edificio === a.edificio) || (m.alcance === 'AREA' && m.areaId === a.id)));
    const ultSol = [...ST.ordenes.filter(o => o.areaId === a.id && o.solicitanteNombre), ...ST.incidencias.filter(i => i.areaId === a.id && i.solicitanteNombre)]
      .sort((u, v) => String(v.createdAt).localeCompare(String(u.createdAt)))[0];
    const estTxt = { ok: 'Sin pendientes', inc: 'Incidencia abierta', ot: 'Orden de trabajo en atención', sla: 'Orden fuera de SLA', mv: 'Mantenimiento vencido' }[nv];
    const inv = ots.reduce((s, o) => s + (o.estatus === 'CANCELADA' ? 0 : OT.costos(o).total), 0);
    return `
      <div class="dr-ubic">${esc(tituloEdificio(a.edificio))}, ${esc(tituloNivel(a.nivel).toLowerCase())}</div>
      <div class="dr-estado st-${nv}"><i></i>${estTxt}</div>
      <dl class="dr-datos">
        <dt>Departamento</dt><dd>${esc(a.departamento || 'Sin asignar')}</dd>
        <dt>Responsable</dt><dd>${p ? `<b>${esc(p.nombre)}</b>${p.puesto ? `<br><span class="muted">${esc(p.puesto)}</span>` : ''}${p.correo ? `<br><a href="mailto:${esc(p.correo)}">${esc(p.correo)}</a>` : ''}${p.telefono ? `<br><a href="tel:${esc(p.telefono)}">${esc(p.telefono)}</a>` : ''}` : '<span class="muted">Sin responsable asignado</span>'}</dd>
        <dt>Último solicitante</dt><dd>${ultSol ? esc(ultSol.solicitanteNombre) : '<span class="muted">—</span>'}</dd>
        <dt>Inversión acumulada</dt><dd>${money(inv)}</dd>
        ${a.notas ? `<dt>Notas</dt><dd>${esc(a.notas)}</dd>` : ''}
        <dt>Ítem</dt><dd>${a.item || '—'} <span class="muted">(${esc(a.id)})</span></dd>
      </dl>
      <div class="dr-acc">
        ${can('capture') ? `<button class="btn btn-primary" data-dr="ot">Levantamiento y OT</button>
        <button class="btn" data-dr="inc">Reportar incidencia</button>` : ''}
        ${can('capture') ? '<button class="btn" data-dr="edit">Editar área</button>' : ''}
        <button class="btn btn-ghost" data-dr="liga">Liga y QR de solicitud</button>
      </div>
      <h4 class="dr-sec">Incidencias abiertas <span>${incs.length}</span></h4>
      ${incs.length ? `<ul class="dr-lista">${incs.map(i => `<li><div><b>${esc(i.folio)}</b> ${tag(INC_ESTATUS, i.estatus)} ${tagPrioridad(i.prioridad)}</div>
        <div>${esc(i.categoria)}: ${esc(i.descripcion)}</div><div class="muted">${fFechaHora(i.fechaReporte)}</div></li>`).join('')}</ul>` : '<p class="muted dr-v">Ninguna.</p>'}
      <h4 class="dr-sec">Órdenes de trabajo <span>${ots.length}</span></h4>
      ${ots.length ? `<ul class="dr-lista">${ots.slice(0, 8).map(o => `<li class="dr-click" data-ot="${esc(o.id)}"><div><b>${esc(o.folio)}</b> ${OT.tag(o)} ${OT.tipoTag(o)}</div>
        <div>${esc(o.categoria)}: ${esc(o.hallazgo || '')}</div>${slaHTML(o, true)}</li>`).join('')}</ul>` : '<p class="muted dr-v">Sin órdenes registradas.</p>'}
      <h4 class="dr-sec">Mantenimientos que aplican <span>${mants.length}</span></h4>
      ${mants.length ? `<ul class="dr-lista">${mants.map(m => { const px = Mant.proxima(m); return `<li><div><b>${esc(m.rubro)}</b> ${Mant.tagEstado(m)}</div>
        <div>${esc(m.descripcion || '')}</div><div class="muted">${esc(Mant.alcanceTxt(m))}. Próxima: ${fFecha(px)}</div></li>`; }).join('')}</ul>` : '<p class="muted dr-v">Sin planes de mantenimiento.</p>'}`;
  },

  enlazarDetalle(a) {
    const b = $('#drawerBody');
    b.querySelectorAll('[data-dr]').forEach(btn => btn.onclick = () => {
      const k = btn.dataset.dr;
      if (k === 'ot') OT.levantamiento({ areaId: a.id });
      if (k === 'inc') ModIncidencias.editar(null, { areaId: a.id });
      if (k === 'edit') this.editarArea(a.id);
      if (k === 'liga') ModSolicitudes.mostrarLiga(a.id);
    });
    b.querySelectorAll('[data-ot]').forEach(li => li.onclick = () => OT.abrir(li.dataset.ot));
  },

  /* ---------- Alta y edición de áreas ---------- */
  editarArea(id) {
    const a = id ? Areas.porId(id) : null;
    const estructura = can('edit_areas');
    if (!a && !estructura) return;
    const dis = estructura ? '' : ' disabled';
    const sigItem = Math.max(0, ...ST.areas.map(x => Number(x.item) || 0)) + 1;
    const m = UI.modal({
      titulo: a ? 'Editar área' : 'Agregar área', ancho: '680px',
      sub: a ? `${esc(Areas.etiqueta(a))}` : 'La nueva área aparecerá en el tablero y en el formulario público.',
      cuerpo: `<div class="fg2">
        <label class="fl"><span>Edificio</span><input id="aEd" list="dlEdif" value="${esc(a ? a.edificio : '')}"${dis}></label>
        <label class="fl"><span>Nivel o planta</span><input id="aNiv" list="dlNiv" value="${esc(a ? a.nivel : '')}"${dis}></label>
        <label class="fl full"><span>Oficina o área</span><input id="aOf" value="${esc(a ? a.oficina : '')}"${dis}></label>
        <label class="fl"><span>Departamento</span><select id="aDep"${dis}>${opciones(DEPARTAMENTOS, a ? a.departamento : 'SIN ASIGNAR')}</select></label>
        <label class="fl"><span>Ítem</span><input id="aItem" type="number" min="1" value="${a ? (a.item || '') : sigItem}" disabled></label>
        <label class="fl full"><span>Responsable del área</span>${Personas.campo('aResp', a ? Areas.responsable(a) : '', a ? a.responsableId : '', 'Escriba para buscar; si no existe se agrega al directorio')}
          <small class="ayuda">Si escribe un nombre nuevo se guarda automáticamente en el directorio para futuras selecciones.</small></label>
        <label class="fl full"><span>Notas</span><textarea id="aNotas" rows="2">${esc(a ? a.notas || '' : '')}</textarea></label>
        ${a && estructura ? `<label class="chk full"><input type="checkbox" id="aActiva"${a.activa !== false ? ' checked' : ''}> Área activa (al desactivarla deja de mostrarse en el tablero y en el formulario)</label>` : ''}
      </div>
      <datalist id="dlEdif">${[...new Set(ST.areas.map(x => x.edificio))].map(e => `<option value="${esc(e)}">`).join('')}</datalist>
      <datalist id="dlNiv">${[...new Set(ST.areas.map(x => x.nivel))].map(e => `<option value="${esc(e)}">`).join('')}</datalist>`,
      acciones: [{ texto: 'Cancelar' }, {
        texto: a ? 'Guardar cambios' : 'Agregar área', clase: 'btn-primary', fn: async mm => {
          const ed = mayus(mm.q('#aEd').value), niv = mayus(mm.q('#aNiv').value), of = mayus(mm.q('#aOf').value);
          if (!ed || !niv || !of) { UI.toast('Edificio, nivel y oficina son obligatorios.', 'err'); return false; }
          const dup = ST.areas.find(x => x.id !== (a && a.id) && x.activa !== false && x.edificio === ed && x.nivel === niv && norm(x.oficina) === norm(of));
          if (dup) { UI.toast(`Ya existe "${of}" en ${ed}, ${niv} (ítem ${dup.item}).`, 'err'); return false; }
          const resp = await Personas.resolver(mm.q('#aResp'), 'esResponsable', { departamento: mm.q('#aDep').value });
          const datos = {
            edificio: ed, nivel: niv, oficina: of, departamento: mm.q('#aDep').value,
            responsableId: resp ? resp.id : '', notas: mm.q('#aNotas').value.trim()
          };
          if (a) {
            if (mm.q('#aActiva')) datos.activa = mm.q('#aActiva').checked;
            const cambios = Object.keys(datos).filter(k => String(a[k] ?? '') !== String(datos[k] ?? '')).map(k => k === 'responsableId' ? `responsable: ${Personas.nombre(a.responsableId) || '—'} → ${resp ? resp.nombre : '—'}` : `${k}: ${a[k] ?? '—'} → ${datos[k]}`);
            await DB.actualizar('areas', a.id, datos);
            DB.log('EDICION', 'areas', `${a.id} ${of}`, cambios.join('; ') || 'Sin cambios');
          } else {
            datos.item = sigItem; datos.activa = true; datos.id = areaIdDeItem(sigItem);
            await DB.guardar('areas', datos);
            DB.log('ALTA', 'areas', `${datos.id} ${of}`, `${ed} › ${niv}`);
          }
          setTimeout(() => DB.publicarCatalogo().catch(e => console.warn('catálogo', e)), 300);
          UI.toast(a ? 'Área actualizada.' : 'Área agregada.', 'ok');
        }
      }]
    });
    Personas.activar(m.q('#aResp'), { flag: 'esResponsable' });
  }
};

function kpi(v, l, s, cls) {
  return `<div class="kpi ${cls || ''}"><div class="kpi-v">${v}</div><div class="kpi-l">${esc(l)}</div>${s ? `<div class="kpi-s">${esc(s)}</div>` : ''}</div>`;
}
function tituloEdificio(e) { return String(e || '').toLowerCase().replace(/(^|\s)([a-záéíóúñ])/g, (m, s, c) => s + c.toUpperCase()).replace(/\b([a-z])$/i, c => c.toUpperCase()); }
function tituloNivel(n) { const s = String(n || '').toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); }

UI.registrar('tablero', ModTablero);
