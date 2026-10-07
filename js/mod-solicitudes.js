/* ==========================================================================
   CONTROL DE EDIFICIOS · IES
   js/mod-solicitudes.js — Módulo 6 (lado interno)
   Bandeja de solicitudes del formulario público, generador de liga única,
   código QR por área y conversión de solicitudes en órdenes de trabajo.
   ========================================================================== */

function solFecha(s) { return s.ts ? new Date(s.ts).toISOString() : (s.tsCliente || ''); }
function solEstado(s) { return (s.gestion && s.gestion.estado) || 'NUEVA'; }

const ModSolicitudes = {
  urlFormulario(areaId) {
    const u = new URL('solicitud.html', location.href.split('#')[0]);
    u.search = ''; if (areaId) u.searchParams.set('a', areaId);
    return u.href;
  },

  /* Dibuja el QR en un canvas con leyenda (listo para imprimir y pegar en la puerta del área) */
  qrCanvas(texto, lineas = []) {
    if (typeof qrcode === 'undefined') return null;
    const qr = qrcode(0, 'M'); qr.addData(texto); qr.make();
    const n = qr.getModuleCount(), cel = 8, margen = 32, lado = n * cel;
    const altoTxt = lineas.length ? 26 + lineas.length * 26 : 0;
    const c = document.createElement('canvas');
    c.width = lado + margen * 2; c.height = lado + margen * 2 + altoTxt;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#0b2a52';
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) x.fillRect(margen + k * cel, margen + r * cel, cel, cel);
    x.textAlign = 'center';
    lineas.forEach((l, i) => {
      x.font = `${i === 0 ? '700 20px' : '500 17px'} Archivo, Arial, sans-serif`;
      x.fillStyle = i === 0 ? '#0b4f9e' : '#1d2b3a';
      x.fillText(l, c.width / 2, lado + margen + 24 + i * 26, c.width - 24);
    });
    return c;
  },

  mostrarLiga(areaId) {
    const a = areaId ? Areas.porId(areaId) : null;
    const url = this.urlFormulario(areaId);
    const lineas = a ? ['Solicitud de mantenimiento', a.oficina, tituloEdificio(a.edificio) + ', ' + tituloNivel(a.nivel).toLowerCase()] : ['Solicitud de mantenimiento', 'Departamento de Activos Fijos'];
    const m = UI.modal({
      titulo: a ? 'Liga y QR del área' : 'Liga del formulario de solicitudes', ancho: '640px',
      sub: a ? `${esc(Areas.etiqueta(a))}. El formulario abre con la ubicación ya seleccionada.` : 'Compártala con los colaboradores de IES; no requiere código de acceso.',
      cuerpo: `<div class="liga"><input id="lgUrl" readonly value="${esc(url)}"><button class="btn btn-primary" id="lgCopiar">Copiar liga</button></div>
        <div class="liga-acc">
          <a class="btn" href="${esc(url)}" target="_blank" rel="noopener">Abrir formulario</a>
          <a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent('Para solicitar trabajos de mantenimiento a Activos Fijos utilice este formulario: ' + url)}">Enviar por WhatsApp</a>
          <a class="btn" href="mailto:?subject=${encodeURIComponent('Formulario de solicitudes de mantenimiento')}&body=${encodeURIComponent('Para solicitar trabajos de mantenimiento al Departamento de Activos Fijos utilice el siguiente formulario:\n\n' + url)}">Enviar por correo</a>
        </div>
        <div class="qr-box" id="lgQR"></div>`,
      acciones: [{ texto: 'Cerrar' }, { texto: 'Descargar QR', clase: 'btn-primary', cierra: false, fn: () => {
        const c = this.qrCanvas(url, lineas); if (!c) { UI.toast('La librería de QR no se cargó.', 'err'); return false; }
        const l = document.createElement('a'); l.href = c.toDataURL('image/png'); l.download = `QR_Solicitud_${a ? a.id + '_' + a.oficina.replace(/[^A-Z0-9]+/gi, '_') : 'General'}.png`; l.click();
        return false;
      } }]
    });
    const c = this.qrCanvas(url, lineas);
    if (c) { c.className = 'qr-canvas'; m.q('#lgQR').appendChild(c); } else m.q('#lgQR').innerHTML = '<p class="muted">No se pudo generar el QR (librería no disponible).</p>';
    m.q('#lgCopiar').onclick = async () => {
      try { await navigator.clipboard.writeText(url); UI.toast('Liga copiada.', 'ok'); }
      catch (e) { m.q('#lgUrl').select(); document.execCommand('copy'); UI.toast('Liga copiada.', 'ok'); }
    };
  },

  init() {
    ['solBuscar', 'solEstado'].forEach(id => $('#' + id).addEventListener(id === 'solBuscar' ? 'input' : 'change', () => this.render()));
    $('#solEstado').innerHTML = opciones([{ v: 'PEND', l: 'Pendientes de atender' }, ...Object.keys(SOL_ESTADOS).map(k => ({ v: k, l: SOL_ESTADOS[k].l }))], 'PEND', 'Todos los estados');
    $('#solLiga').onclick = () => this.mostrarLiga(null);
    $('#solLigaArea').onclick = () => this.elegirArea();
    $('#solTabla').addEventListener('click', e => {
      const b = e.target.closest('[data-sol]'); if (!b) return;
      const s = ST.solicitudes.find(x => x.folio === b.dataset.folio); if (!s) return;
      ({ ver: () => this.ver(s), revisar: () => this.revisar(s), ot: () => this.generarOT(s), rechazar: () => this.rechazar(s), abrirot: () => OT.abrir(s.gestion.otId) })[b.dataset.sol]();
    });
  },

  elegirArea() {
    UI.modal({
      titulo: 'Liga para un área específica', ancho: '640px',
      cuerpo: `<p class="m-msg">Seleccione el área; la liga y el QR abrirán el formulario con la ubicación precargada.</p>${AreaPicker.html('qa')}`,
      acciones: [{ texto: 'Cancelar' }, { texto: 'Generar liga y QR', clase: 'btn-primary', fn: () => {
        const id = AreaPicker.valor('qa'); if (!id) { UI.toast('Seleccione el área.', 'err'); return false; }
        setTimeout(() => this.mostrarLiga(id), 50);
      } }]
    });
    AreaPicker.init('qa', '');
  },

  render() {
    $('#solUrl').textContent = this.urlFormulario();
    const todas = ST.solicitudes;
    const cnt = k => todas.filter(s => solEstado(s) === k).length;
    const conOT = todas.filter(s => s.gestion && s.gestion.otId);
    const tResp = conOT.map(s => { const o = OT.porId(s.gestion.otId); return o ? new Date(o.fechaLevantamiento) - new Date(solFecha(s)) : null; }).filter(x => x != null && x >= 0);
    $('#solKpis').innerHTML = [
      kpi(cnt('NUEVA'), 'Nuevas', 'Sin revisar', cnt('NUEVA') ? 'k-ambar' : 'k-verde'),
      kpi(cnt('EN_REVISION'), 'En revisión', 'Por convertir en OT', 'k-azul'),
      kpi(cnt('EN_ATENCION'), 'Con orden de trabajo', 'En ejecución', 'k-morado'),
      kpi(cnt('CULMINADA'), 'Culminadas', 'Con reporte de entrega', 'k-verde'),
      kpi(tResp.length ? fDur(tResp.reduce((a, b) => a + b, 0) / tResp.length).replace(/ \d+ min$/, '') : '—', 'Tiempo medio de respuesta', 'Solicitud → levantamiento', 'k-azul')
    ].join('');
    const q = norm($('#solBuscar').value), es = $('#solEstado').value;
    const f = todas.filter(s => (!es || (es === 'PEND' ? ['NUEVA', 'EN_REVISION'].includes(solEstado(s)) : solEstado(s) === es)) &&
      (!q || norm([s.folio, s.solicitante, s.oficina, s.descripcion, s.correo].join(' ')).includes(q)))
      .sort((a, b) => String(solFecha(b)).localeCompare(String(solFecha(a))));
    const c = can('capture');
    $('#solConteo').textContent = `${f.length} de ${todas.length}`;
    $('#solTabla').innerHTML = f.length ? `<table class="tbl"><thead><tr><th>Folio</th><th>Recibida</th><th>Solicitante</th><th>Ubicación</th><th>Categoría</th><th>Descripción</th><th>Estado</th><th></th></tr></thead><tbody>
      ${f.map(s => { const e = solEstado(s); return `<tr>
        <td class="mono"><b>${esc(s.folio)}</b></td><td>${fFechaHora(solFecha(s))}</td>
        <td><b>${esc(s.solicitante)}</b><br><span class="muted">${esc(s.correo || '')}${s.telefono ? '<br>' + esc(s.telefono) : ''}</span></td>
        <td><b>${esc(s.oficina)}</b><br><span class="muted">${esc(tituloEdificio(s.edificio))}, ${esc(tituloNivel(s.nivel).toLowerCase())}</span></td>
        <td>${esc(s.categoria || 'Sin especificar')}</td><td class="desc">${esc(s.descripcion)}</td>
        <td>${tag(SOL_ESTADOS, e)}${s.gestion && s.gestion.otFolio ? `<br><button class="lnk mono" data-sol="abrirot" data-folio="${esc(s.folio)}">${esc(s.gestion.otFolio)}</button>` : ''}</td>
        <td class="acc"><button class="btn btn-sm btn-ghost" data-sol="ver" data-folio="${esc(s.folio)}">Ver</button>
          ${c && e === 'NUEVA' ? `<button class="btn btn-sm" data-sol="revisar" data-folio="${esc(s.folio)}">Revisar</button>` : ''}
          ${c && ['NUEVA', 'EN_REVISION'].includes(e) ? `<button class="btn btn-sm btn-primary" data-sol="ot" data-folio="${esc(s.folio)}">Generar OT</button>
          <button class="btn btn-sm btn-ghost" data-sol="rechazar" data-folio="${esc(s.folio)}">Rechazar</button>` : ''}</td></tr>`; }).join('')}</tbody></table>`
      : UI.vacio(todas.length ? 'Ninguna solicitud coincide con los filtros.' : 'Aún no llegan solicitudes. Comparta la liga del formulario con los colaboradores.');
  },

  ver(s) {
    const e = solEstado(s), g = s.gestion || {};
    const tel = String(s.telefono || '').replace(/\D/g, '');
    const wa = tel ? `https://wa.me/${tel.length === 10 ? '52' + tel : tel}?text=${encodeURIComponent(`Buen día ${s.solicitante}. Le escribimos del Departamento de Activos Fijos respecto a su solicitud ${s.folio} (${s.oficina}). Estado actual: ${SOL_ESTADOS[e].l}.`)}` : '';
    UI.modal({
      titulo: `Solicitud ${s.folio}`, sub: `${tag(SOL_ESTADOS, e)} Recibida ${fFechaHora(solFecha(s))}`, ancho: '680px',
      cuerpo: `<dl class="dl2">
        <dt>Solicitante</dt><dd><b>${esc(s.solicitante)}</b></dd>
        <dt>Correo</dt><dd>${s.correo ? `<a href="mailto:${esc(s.correo)}">${esc(s.correo)}</a>` : '—'}</dd>
        <dt>Teléfono</dt><dd>${s.telefono ? `<a href="tel:${esc(s.telefono)}">${esc(s.telefono)}</a>` : '—'}</dd>
        <dt>Ubicación</dt><dd>${esc(s.edificio)} › ${esc(s.nivel)} › <b>${esc(s.oficina)}</b></dd>
        <dt>Categoría</dt><dd>${esc(s.categoria || 'Sin especificar')}</dd>
        <dt>Descripción</dt><dd>${esc(s.descripcion)}</dd>
        ${g.motivo ? `<dt>Motivo de rechazo</dt><dd>${esc(g.motivo)}</dd>` : ''}
        ${g.otFolio ? `<dt>Orden de trabajo</dt><dd class="mono">${esc(g.otFolio)}</dd>` : ''}
        ${g.actualizado ? `<dt>Última gestión</dt><dd>${fFechaHora(g.actualizado)} (${esc(g.por || '')})</dd>` : ''}
      </dl>
      <div class="liga-acc">
        ${s.correo ? `<a class="btn" href="mailto:${esc(s.correo)}?subject=${encodeURIComponent('Seguimiento a su solicitud ' + s.folio)}&body=${encodeURIComponent(`Buen día ${s.solicitante}:\n\nLe informamos que su solicitud ${s.folio} (${s.oficina}) se encuentra en estado: ${SOL_ESTADOS[e].l}.\n\nAtentamente,\n${APP.departamento}\n${APP.empresa}`)}">Notificar por correo</a>` : ''}
        ${wa ? `<a class="btn" target="_blank" rel="noopener" href="${esc(wa)}">Notificar por WhatsApp</a>` : ''}
      </div>`,
      acciones: [{ texto: 'Cerrar' }]
    });
  },

  async revisar(s) {
    await DB.gestionSolicitud(s.folio, { estado: 'EN_REVISION' });
    DB.log('REVISION', 'solicitudes', s.folio, s.oficina);
    UI.toast(`${s.folio} en revisión.`);
  },

  generarOT(s) {
    const area = s.areaId && Areas.porId(s.areaId) ? s.areaId : (Areas.activas().find(a => a.edificio === s.edificio && a.nivel === s.nivel && a.oficina === s.oficina) || {}).id;
    OT.levantamiento({
      areaId: area || '', categoria: CATEGORIAS.includes(s.categoria) ? s.categoria : '', prioridad: 'MEDIA', hallazgo: s.descripcion,
      solicitanteNombre: mayus(s.solicitante), solicitanteCorreo: s.correo, solicitanteTel: s.telefono, fechaSolicitud: solFecha(s),
      origen: { tipo: 'SOLICITUD', id: s.folio, folio: s.folio }
    });
  },

  async rechazar(s) {
    const motivo = await UI.pedirTexto(`Rechazar ${s.folio}`, 'Motivo (se mostrará al solicitante al consultar su folio)');
    if (!motivo) return;
    await DB.gestionSolicitud(s.folio, { estado: 'RECHAZADA', motivo });
    DB.log('RECHAZO', 'solicitudes', s.folio, motivo);
    UI.toast(`${s.folio} rechazada.`);
  }
};

/* ---------- Bitácora (solo Administrador) ---------- */
const ModBitacora = {
  init() { ['bitBuscar', 'bitEntidad'].forEach(id => $('#' + id).addEventListener(id === 'bitBuscar' ? 'input' : 'change', () => this.render())); },
  render() {
    const es = $('#bitEntidad'), ev = es.value;
    es.innerHTML = opciones([...new Set(ST.bitacora.map(b => b.entidad))].sort(), ev, 'Todas las entidades');
    const q = norm($('#bitBuscar').value);
    const f = ST.bitacora.filter(b => (!es.value || b.entidad === es.value) && (!q || norm([b.accion, b.ref, b.detalle, b.rol].join(' ')).includes(q)));
    $('#bitTabla').innerHTML = f.length ? `<table class="tbl"><thead><tr><th>Fecha</th><th>Rol</th><th>Acción</th><th>Entidad</th><th>Referencia</th><th>Detalle</th></tr></thead><tbody>
      ${f.map(b => `<tr><td>${fFechaHora(b.ts)}</td><td>${esc((ROLES[b.rol] || {}).label || b.rol)}</td><td><b>${esc(b.accion)}</b></td><td>${esc(b.entidad)}</td><td class="mono">${esc(b.ref)}</td><td class="desc">${esc(b.detalle)}</td></tr>`).join('')}
      </tbody></table>` : UI.vacio('Sin movimientos registrados.');
  }
};

UI.registrar('solicitudes', ModSolicitudes);
UI.registrar('bitacora', ModBitacora);
