/* ==========================================================================
   CONTROL DE EDIFICIOS · IES
   js/pdf.js — Reporte de entrega de Trabajos Realizados
   Vista dividida (igual que la SOLPED del Comparativo de Proveedores):
   panel de ajustes a la izquierda y hoja A4 a la derecha. El PDF se dibuja
   con jsPDF en coordenadas milimétricas (sin html2canvas), con firmas y
   fotografías incrustadas.
   ========================================================================== */

function pdfTxt(s) {
  return String(s == null ? '' : s)
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, '-')
    .replace(/\u203A/g, '>').replace(/\u2026/g, '...').replace(/\u00A0/g, ' ').replace(/[^\x00-\xFF\n]/g, '');
}
function medirImagen(src) {
  return new Promise(res => { if (!src) return res(null); const i = new Image(); i.onload = () => res({ src, w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => res(null); i.src = src; });
}
const DECLARACION = 'Quien recibe manifiesta haber verificado los trabajos descritos en este reporte y los recibe a su entera conformidad, en la ubicación y fechas señaladas.';

const Reporte = {
  abierto: false, otId: null, d: null,
  opc: { costos: false, fotos: true },

  async abrir(otId, { descargar = false } = {}) {
    const o = OT.porId(otId); if (!o) return;
    UI._pila.slice().forEach(m => m.cerrar());
    this.otId = otId;
    const media = await DB.media(otId, true).catch(() => ({}));
    this.d = await this.datos(o, media);
    this.opc.fotos = this.d.fotosAntes.length + this.d.fotosDespues.length > 0;
    if (esTecnico()) this.opc.costos = false;
    this.abierto = true;
    document.body.classList.add('rp-open');
    $('#rpView').classList.add('open');
    $('#rpFolio').textContent = o.folio;
    this.pintar();
    if (descargar) setTimeout(() => this.pdf(), 350);
  },

  async datos(o, media) {
    const a = Areas.porId(o.areaId);
    const org = o.origen || {};
    const s = slaInfo(o);
    const fa = [], fd = [];
    for (let i = 0; i < FOTOS_N; i++) {
      if (media['antes_' + i]) fa.push(await medirImagen(media['antes_' + i]));
      if (media['despues_' + i]) fd.push(await medirImagen(media['despues_' + i]));
    }
    return {
      o, folio: o.folio, estatus: o.estatus,
      solicitudFolio: org.tipo === 'SOLICITUD' ? org.folio : org.tipo === 'INCIDENCIA' ? `Incidencia ${org.folio}` : org.tipo === 'MANTENIMIENTO' ? 'Mantenimiento programado' : 'Levantamiento en sitio',
      solicitante: o.solicitanteNombre || '', correo: o.solicitanteCorreo || '', tel: o.solicitanteTel || '',
      edificio: o.edificio, nivel: o.nivel, oficina: o.oficina, departamento: o.departamento || '',
      responsable: Areas.responsable(a) || '', categoria: o.categoria, prioridad: (PRIORIDADES[o.prioridad] || {}).l || '',
      solicitado: o.hallazgo || '', trabajos: o.trabajos || '', ejecutor: OT.ejecutorTxt(o), diagnostico: o.diagnostico || '',
      tipoEjecucion: o.tipoEjecucion || '', fechaRecibido: o.fechaRecibido || '',
      materiales: lista(o.materiales), costos: OT.costos(o),
      fechaSolicitud: o.fechaSolicitud, fechaLevantamiento: o.fechaLevantamiento, fechaCulminacion: o.fechaCulminacion, fechaEntrega: o.fechaEntrega,
      sla: s, tiempoTotal: o.fechaCulminacion && o.fechaSolicitud ? new Date(o.fechaCulminacion) - new Date(o.fechaSolicitud) : null,
      fotosAntes: fa.filter(Boolean), fotosDespues: fd.filter(Boolean),
      entregaNombre: o.entregaNombre || '', recibeNombre: o.recibeNombre || '',
      firmaEntrega: await medirImagen(media.firmaEntrega), firmaRecibe: await medirImagen(media.firmaRecibe),
      fechaFirmaEntrega: o.fechaFirmaEntrega, fechaFirmaRecibe: o.fechaFirmaRecibe,
      obsEntrega: o.obsEntrega || ''
    };
  },

  slaTexto(d) {
    if (!d.fechaCulminacion) return 'En curso';
    const desde = d.tipoEjecucion === 'INTERNO' && d.fechaRecibido ? ', desde el recibido' : '';
    return `${fDur(d.sla.transc)} (meta ${d.sla.metaH} h${desde}): ${d.sla.cumple ? 'cumple' : 'excede'}`;
  },

  /* ---------- Panel izquierdo + hoja ---------- */
  pintar() {
    const d = this.d, o = d.o;
    const listo = !!(d.firmaEntrega && d.firmaRecibe);
    $('#rpLeft').innerHTML = `
      <div class="rp-sum">
        <div class="rp-sum-k">Orden de trabajo</div><div class="rp-sum-v mono">${esc(d.folio)}</div>
        <div class="rp-sum-k">Ubicación</div><div class="rp-sum-v">${esc(d.oficina)}<br><span class="muted">${esc(tituloEdificio(d.edificio))}, ${esc(tituloNivel(d.nivel).toLowerCase())}</span></div>
        <div class="rp-sum-k">Estatus</div><div>${tag(OT_ESTATUS, o.estatus)}</div>
      </div>
      ${o.estatus !== 'ENTREGADA' ? `<div class="aviso">Vista previa. El reporte queda definitivo al entregar el trabajo con ambas firmas.</div>` : ''}
      <div class="rp-sec"><h3>Contenido</h3>
        <label class="chk"${esTecnico() ? ' hidden' : ''}><input type="checkbox" id="rpCostos"${this.opc.costos ? ' checked' : ''}> Incluir materiales con costos</label>
        <label class="chk"><input type="checkbox" id="rpFotos"${this.opc.fotos ? ' checked' : ''}${d.fotosAntes.length + d.fotosDespues.length ? '' : ' disabled'}> Incluir evidencia fotográfica (${d.fotosAntes.length + d.fotosDespues.length})</label>
      </div>
      <div class="rp-sec"><h3>Observaciones de entrega</h3>
        <textarea id="rpObs" rows="4" placeholder="Garantías, recomendaciones de uso o pendientes acordados"${can('capture') ? '' : ' disabled'}>${esc(d.obsEntrega)}</textarea>
        <p class="hint">Se guardan en la orden y se imprimen en la sección de conformidad.</p>
      </div>
      <div class="rp-sec"><h3>Firmas</h3>
        ${[['firmaEntrega', 'Quien entrega', d.entregaNombre], ['firmaRecibe', 'Quien recibe', d.recibeNombre]].map(([k, l, n]) => `<div class="rp-firma ${d[k] ? 'ok' : ''}">
          <div><b>${l}</b><span>${d[k] ? esc(n) : 'Pendiente'}</span></div>
          ${can('capture') && o.estatus === 'CULMINADA' ? `<button class="btn btn-sm${d[k] ? ' btn-ghost' : ' btn-primary'}" data-rpfirma="${k}">${d[k] ? 'Volver a firmar' : 'Firmar'}</button>` : ''}
        </div>`).join('')}
        ${o.estatus === 'LEVANTADA' || o.estatus === 'EN_PROCESO' ? '<p class="hint">Las firmas se habilitan cuando la orden se registra como culminada.</p>' : ''}
      </div>
      ${can('capture') && o.estatus === 'CULMINADA' ? `<button class="btn btn-success btn-grande" id="rpEntregar"${listo ? '' : ' disabled'}>Entregar trabajo y descargar PDF</button>
        ${listo ? '' : '<p class="hint">Faltan firmas para entregar.</p>'}` : ''}`;

    $('#rpCostos').onchange = e => { this.opc.costos = e.target.checked; this.hoja(); };
    $('#rpFotos').onchange = e => { this.opc.fotos = e.target.checked; this.hoja(); };
    $('#rpObs').onchange = async e => {
      d.obsEntrega = e.target.value.trim();
      await DB.actualizar('ordenes', o.id, { obsEntrega: d.obsEntrega });
      DB.log('EDICION', 'ordenes', o.folio, 'Observaciones de entrega');
      this.hoja();
    };
    $$('[data-rpfirma]').forEach(b => b.onclick = () => OT.firmar(o.id, b.dataset.rpfirma, async () => { await this.refrescar(); }));
    const be = $('#rpEntregar');
    if (be) be.onclick = async () => {
      be.disabled = true;
      await OT.entregar(OT.porId(o.id), null);
    };
    this.hoja();
  },

  async refrescar() {
    const o = OT.porId(this.otId); if (!o) return;
    this.d = await this.datos(o, await DB.media(o.id, true));
    this.pintar();
  },

  hoja() {
    const d = this.d, c = this.opc;
    const lin = (l, v, cls) => `<div class="rp-c ${cls || ''}"><span class="rp-l">${esc(l)}</span><span class="rp-v">${esc(v || '—')}</span></div>`;
    const img = (f, alt) => `<div class="rp-ph">${f ? `<img src="${f.src}" alt="${esc(alt)}">` : ''}</div>`;
    const mats = d.materiales.filter(m => m.desc);
    $('#rpSheet').innerHTML = `
      <header class="rp-h">
        <img class="rp-logo" src="${LOGO_IES}" alt="IES">
        <div class="rp-h-t"><b>${esc(APP.empresa)}</b><span>${esc(APP.departamento)}</span><strong>${esc(APP.tituloReporte)}</strong></div>
        <div class="rp-h-box">
          <div><span>Folio OT</span><b>${esc(d.folio)}</b></div>
          <div><span>Solicitud</span><b>${esc(d.solicitudFolio)}</b></div>
          <div><span>Código</span><b>${esc(APP.formato.codigo)} Rev. ${esc(APP.formato.revision)}</b></div>
        </div>
      </header>
      <h4 class="rp-bar">1. Datos de la solicitud</h4>
      <div class="rp-row r3">${lin('Solicitante', d.solicitante)}${lin('Correo', d.correo)}${lin('Teléfono', d.tel)}</div>
      <div class="rp-row r3">${lin('Edificio', d.edificio)}${lin('Nivel o planta', d.nivel)}${lin('Oficina', d.oficina)}</div>
      <div class="rp-row r3">${lin('Departamento', d.departamento)}${lin('Responsable del área', d.responsable)}${lin('Categoría y prioridad', `${d.categoria}, prioridad ${d.prioridad.toLowerCase()}`)}</div>
      <div class="rp-txt"><span class="rp-l">Descripción de lo solicitado</span><p>${esc(d.solicitado)}</p></div>
      ${d.diagnostico && d.diagnostico !== d.solicitado ? `<div class="rp-txt"><span class="rp-l">Diagnóstico inicial del técnico</span><p>${esc(d.diagnostico)}</p></div>` : ''}
      <h4 class="rp-bar">2. Trabajos realizados</h4>
      <div class="rp-row r1">${lin('Ejecutado por', d.ejecutor)}</div>
      <div class="rp-txt"><span class="rp-l">Descripción de los trabajos</span><p>${esc(d.trabajos || 'Pendiente de registrar.')}</p></div>
      ${mats.length ? `<table class="rp-tbl"><thead><tr><th>Material o refacción</th><th>Cant.</th><th>Unidad</th>${c.costos ? '<th>Costo unit.</th><th>Importe</th>' : ''}</tr></thead><tbody>
        ${mats.map(m => `<tr><td>${esc(m.desc)}</td><td class="num">${nfmt(m.cant, 2).replace(/\.00$/, '')}</td><td>${esc(m.unidad || '')}</td>${c.costos ? `<td class="num">${money(m.costo)}</td><td class="num">${money(m.cant * m.costo)}</td>` : ''}</tr>`).join('')}
        ${c.costos ? `<tr class="tot"><td colspan="4">Materiales</td><td class="num">${money(d.costos.materiales)}</td></tr><tr class="tot"><td colspan="4">Mano de obra</td><td class="num">${money(d.costos.manoObra)}</td></tr><tr class="tot"><td colspan="4"><b>Total</b></td><td class="num"><b>${money(d.costos.total)}</b></td></tr>` : ''}
        </tbody></table>` : (c.costos && d.costos.total ? `<div class="rp-row r1">${lin('Costo total (mano de obra)', money(d.costos.total))}</div>` : '')}
      ${c.fotos && (d.fotosAntes.length || d.fotosDespues.length) ? `<h4 class="rp-bar">3. Evidencia fotográfica</h4>
        ${d.fotosAntes.length ? `<div class="rp-fot"><span class="rp-l">Antes</span><div>${d.fotosAntes.map((f, i) => img(f, 'Antes ' + (i + 1))).join('')}</div></div>` : ''}
        ${d.fotosDespues.length ? `<div class="rp-fot"><span class="rp-l">Después</span><div>${d.fotosDespues.map((f, i) => img(f, 'Después ' + (i + 1))).join('')}</div></div>` : ''}` : ''}
      <h4 class="rp-bar">${c.fotos && (d.fotosAntes.length || d.fotosDespues.length) ? 4 : 3}. Fechas de control</h4>
      <div class="rp-row r4">${lin('Fecha de solicitud del usuario', fFechaHora(d.fechaSolicitud))}${lin('Levantamiento', fFechaHora(d.fechaLevantamiento))}${lin('Culminación de trabajos', fFechaHora(d.fechaCulminacion))}${lin('Tiempo de atención (SLA)', this.slaTexto(d), d.fechaCulminacion ? (d.sla.cumple ? 'ok' : 'bad') : '')}</div>
      ${d.tiempoTotal != null ? `<p class="rp-nota">Tiempo total desde la solicitud del usuario hasta la culminación: ${fDur(d.tiempoTotal)}.</p>` : ''}
      <h4 class="rp-bar">${c.fotos && (d.fotosAntes.length || d.fotosDespues.length) ? 5 : 4}. Conformidad</h4>
      <p class="rp-decl">${esc(DECLARACION)}</p>
      ${d.obsEntrega ? `<div class="rp-txt"><span class="rp-l">Observaciones de entrega</span><p>${esc(d.obsEntrega)}</p></div>` : ''}
      <div class="rp-firmas">
        ${[[d.firmaEntrega, d.entregaNombre, 'Entrega: ' + APP.departamento, d.fechaFirmaEntrega], [d.firmaRecibe, d.recibeNombre, 'Recibe de conformidad', d.fechaFirmaRecibe]].map(([f, n, r, t]) => `<div class="rp-fi">
          <div class="rp-fi-img">${f ? `<img src="${f.src}" alt="Firma">` : ''}</div>
          <div class="rp-fi-n">${esc(n || 'Nombre y firma')}</div><div class="rp-fi-r">${esc(r)}</div>${t ? `<div class="rp-fi-t">${fFechaHora(t)}</div>` : ''}</div>`).join('')}
      </div>
      <footer class="rp-pie">Documento generado por ${esc(APP.nombre)} IES el ${fFechaHora(nowISO())}.</footer>`;
    this.escalar();
  },

  escalar() {
    const st = $('#rpStage'), sh = $('#rpSheet'), sc = $('#rpScaler');
    if (!st || !sh) return;
    sh.style.transform = 'none';
    const w = sh.offsetWidth, h = sh.offsetHeight;
    const k = Math.min(1, (st.clientWidth - 32) / w);
    sh.style.transform = `scale(${k})`;
    sc.style.width = (w * k) + 'px'; sc.style.height = (h * k) + 'px';
  },

  cerrar() {
    this.abierto = false;
    $('#rpView').classList.remove('open');
    document.body.classList.remove('rp-open');
  },

  imprimir() { window.print(); },

  /* ---------- PDF nativo (A4, milímetros) ---------- */
  pdf() {
    if (!window.jspdf) { UI.toast('La librería jsPDF no se cargó; revise su conexión.', 'err'); return; }
    const d = this.d, c = this.opc;
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const W = 210, H = 297, M = 12, CW = W - 2 * M, LIM = H - 17;
    const AZ = [11, 79, 158], AZC = [227, 238, 251], LN = [159, 183, 211], MU = [66, 86, 111], NE = [0, 0, 0];
    const T = pdfTxt;
    let y = 0;

    const encabezado = completo => {
      const lh = completo ? 17 : 11, lw = lh * 132 / 114;
      try { doc.addImage(LOGO_IES, 'PNG', M, 8, lw, lh); } catch (e) {}
      const tx = M + lw + 4;
      doc.setTextColor(...NE); doc.setFont('helvetica', 'bold'); doc.setFontSize(completo ? 12.5 : 10.5);
      doc.text(T(APP.empresa), tx, completo ? 13 : 12);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(completo ? 9.5 : 8.5); doc.setTextColor(...MU);
      doc.text(T(APP.departamento), tx, completo ? 18 : 16.5);
      if (completo) { doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...AZ); doc.text(T(APP.tituloReporte), tx, 24); }
      // Recuadro de control documental
      const bx = 150, bw = W - M - bx, rows = completo ? [['Folio OT', d.folio], ['Solicitud', d.solicitudFolio], ['Código', `${APP.formato.codigo} Rev. ${APP.formato.revision}`]] : [['Folio OT', d.folio]];
      const rh = 7;
      doc.setDrawColor(...LN); doc.setLineWidth(0.3);
      rows.forEach((r, i) => {
        const ry = 7.5 + i * rh;
        doc.rect(bx, ry, bw, rh);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...MU); doc.text(T(r[0]), bx + 1.5, ry + 2.6);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...NE);
        doc.text(doc.splitTextToSize(T(r[1]), bw - 3)[0], bx + 1.5, ry + 6);
      });
      const ly = completo ? 30.5 : 23;
      doc.setDrawColor(...AZ); doc.setLineWidth(0.8); doc.line(M, ly, W - M, ly);
      y = ly + 4;
    };
    const asegurar = h => { if (y + h > LIM) { doc.addPage(); encabezado(false); } };
    const barra = t => {
      asegurar(14);
      doc.setFillColor(...AZ); doc.rect(M, y, CW, 6.2, 'F');
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
      doc.text(T(t), M + 2.5, y + 4.3);
      y += 6.2; doc.setTextColor(...NE);
    };
    const fila = celdas => {
      const ws = celdas.map(x => x.w * CW);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8);
      const ls = celdas.map((x, i) => doc.splitTextToSize(T(x.v || '-'), ws[i] - 3.2));
      const h = Math.max(...ls.map(l => l.length)) * 3.9 + 6.6;
      asegurar(h);
      let x = M;
      celdas.forEach((cel, i) => {
        if (cel.color) { doc.setFillColor(...cel.color); doc.rect(x, y, ws[i], h, 'F'); }
        doc.setDrawColor(...LN); doc.setLineWidth(0.25); doc.rect(x, y, ws[i], h);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6.8); doc.setTextColor(...MU); doc.text(T(cel.l), x + 1.6, y + 3);
        doc.setFont('helvetica', cel.negrita ? 'bold' : 'normal'); doc.setFontSize(8.8); doc.setTextColor(...NE);
        doc.text(ls[i], x + 1.6, y + 6.8);
        x += ws[i];
      });
      y += h;
    };
    const parrafo = (etiqueta, texto) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8);
      const ls = doc.splitTextToSize(T(texto || '-'), CW - 6);
      asegurar(9 + Math.min(ls.length, 3) * 3.9);
      doc.setDrawColor(...LN); doc.setLineWidth(0.25); doc.rect(M, y, CW, 4.4);
      doc.setFillColor(...AZC); doc.rect(M, y, CW, 4.4, 'F'); doc.rect(M, y, CW, 4.4);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.8); doc.setTextColor(...MU); doc.text(T(etiqueta), M + 1.6, y + 3);
      y += 4.4;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8); doc.setTextColor(...NE);
      let ini = y;
      ls.forEach((l, i) => {
        if (y + 3.9 + 1.6 > LIM) {
          doc.setDrawColor(...LN); doc.line(M, ini, M, y + 1.6); doc.line(W - M, ini, W - M, y + 1.6); doc.line(M, y + 1.6, W - M, y + 1.6);
          doc.addPage(); encabezado(false); ini = y;
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8); doc.setTextColor(...NE);
        }
        doc.text(l, M + 2, y + 3.6); y += 3.9;
      });
      y += 1.6;
      doc.setDrawColor(...LN); doc.setLineWidth(0.25);
      doc.line(M, ini, M, y); doc.line(W - M, ini, W - M, y); doc.line(M, y, W - M, y);
    };
    const imagenEn = (f, x, yy, w, h, fmt) => {
      if (!f) return;
      const k = Math.min(w / f.w, h / f.h), iw = f.w * k, ih = f.h * k;
      try { doc.addImage(f.src, fmt, x + (w - iw) / 2, yy + (h - ih) / 2, iw, ih); } catch (e) { console.warn('imagen', e); }
    };

    encabezado(true);
    let n = 1;
    barra(`${n++}. Datos de la solicitud`);
    fila([{ l: 'Solicitante', v: d.solicitante, w: .38, negrita: true }, { l: 'Correo', v: d.correo, w: .37 }, { l: 'Teléfono', v: d.tel, w: .25 }]);
    fila([{ l: 'Edificio', v: d.edificio, w: .25 }, { l: 'Nivel o planta', v: d.nivel, w: .25 }, { l: 'Oficina', v: d.oficina, w: .5, negrita: true }]);
    fila([{ l: 'Departamento', v: d.departamento, w: .25 }, { l: 'Responsable del área', v: d.responsable, w: .4 }, { l: 'Categoría y prioridad', v: `${d.categoria}, prioridad ${d.prioridad.toLowerCase()}`, w: .35 }]);
    parrafo('Descripción de lo solicitado', d.solicitado);
    if (d.diagnostico && d.diagnostico !== d.solicitado) parrafo('Diagnóstico inicial del técnico', d.diagnostico);

    y += 3; barra(`${n++}. Trabajos realizados`);
    fila([{ l: 'Ejecutado por', v: d.ejecutor, w: 1 }]);
    parrafo('Descripción de los trabajos', d.trabajos || 'Pendiente de registrar.');
    const mats = d.materiales.filter(m => m.desc);
    if (mats.length) {
      y += 2;
      const cols = c.costos ? [['Material o refacción', .5], ['Cant.', .1], ['Unidad', .1], ['Costo unit.', .15], ['Importe', .15]] : [['Material o refacción', .7], ['Cant.', .15], ['Unidad', .15]];
      const cab = () => {
        asegurar(12);
        let x = M; doc.setFillColor(...AZC); doc.rect(M, y, CW, 5.2, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.6); doc.setTextColor(...AZ);
        cols.forEach(([t, w], i) => { doc.text(T(t), i ? x + w * CW - 1.6 : x + 1.6, y + 3.6, { align: i ? 'right' : 'left' }); x += w * CW; });
        y += 5.2;
      };
      cab();
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.4); doc.setTextColor(...NE);
      mats.forEach(m => {
        const dl = doc.splitTextToSize(T(m.desc), cols[0][1] * CW - 3.2);
        const h = dl.length * 3.7 + 1.8;
        if (y + h > LIM) { doc.addPage(); encabezado(false); cab(); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.4); doc.setTextColor(...NE); }
        const vals = [dl, nfmt(m.cant, 2).replace(/\.00$/, ''), m.unidad || '', ...(c.costos ? [money(m.costo), money(m.cant * m.costo)] : [])];
        let x = M;
        vals.forEach((v, i) => { const w = cols[i][1] * CW; doc.text(i ? T(v) : v, i ? x + w - 1.6 : x + 1.6, y + 3.4, { align: i ? 'right' : 'left' }); x += w; });
        y += h; doc.setDrawColor(...LN); doc.setLineWidth(0.2); doc.line(M, y, W - M, y);
      });
      if (c.costos) {
        [['Materiales', d.costos.materiales], ['Mano de obra', d.costos.manoObra], ['Total', d.costos.total]].forEach(([l, v], i) => {
          asegurar(5.2);
          doc.setFont('helvetica', i === 2 ? 'bold' : 'normal'); doc.setFontSize(8.6);
          doc.text(T(l), W - M - 0.15 * CW - 3, y + 3.8, { align: 'right' }); doc.text(T(money(v)), W - M - 1.6, y + 3.8, { align: 'right' });
          y += 5.2;
        });
      }
    } else if (c.costos && d.costos.total) {
      fila([{ l: 'Costo total (mano de obra)', v: money(d.costos.total), w: 1 }]);
    }

    if (c.fotos && (d.fotosAntes.length || d.fotosDespues.length)) {
      y += 3; barra(`${n++}. Evidencia fotográfica`);
      const gap = 3, cw = (CW - gap * 2) / 3, ch = 46;
      [['Antes', d.fotosAntes], ['Después', d.fotosDespues]].forEach(([l, fs]) => {
        if (!fs.length) return;
        asegurar(ch + 8);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.6); doc.setTextColor(...MU); doc.text(T(l), M, y + 4); y += 5.5;
        fs.forEach((f, i) => {
          const x = M + i * (cw + gap);
          doc.setDrawColor(...LN); doc.setLineWidth(0.25); doc.setFillColor(245, 248, 252); doc.rect(x, y, cw, ch, 'FD');
          imagenEn(f, x + 0.8, y + 0.8, cw - 1.6, ch - 1.6, 'JPEG');
        });
        y += ch + 2;
      });
    }

    y += 3; barra(`${n++}. Fechas de control`);
    const verde = [219, 242, 230], rojo = [251, 222, 225];
    fila([
      { l: 'Fecha de solicitud del usuario', v: fFechaHora(d.fechaSolicitud), w: .25 },
      { l: 'Levantamiento', v: fFechaHora(d.fechaLevantamiento), w: .23 },
      { l: 'Culminación de trabajos', v: fFechaHora(d.fechaCulminacion), w: .24, negrita: true },
      { l: 'Tiempo de atención (SLA)', v: this.slaTexto(d), w: .28, color: d.fechaCulminacion ? (d.sla.cumple ? verde : rojo) : null }
    ]);
    if (d.tiempoTotal != null) {
      asegurar(6); doc.setFont('helvetica', 'italic'); doc.setFontSize(7.8); doc.setTextColor(...MU);
      doc.text(T(`Tiempo total desde la solicitud del usuario hasta la culminación: ${fDur(d.tiempoTotal)}.`), M, y + 4); y += 5.5;
    }

    y += 3; barra(`${n++}. Conformidad`);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.6); doc.setTextColor(...NE);
    const dl = doc.splitTextToSize(T(DECLARACION), CW - 2);
    asegurar(dl.length * 3.8 + 4); doc.text(dl, M + 1, y + 4); y += dl.length * 3.8 + 3;
    if (d.obsEntrega) parrafo('Observaciones de entrega', d.obsEntrega);
    // Firmas
    const fh = 40; asegurar(fh + 6); y += 3;
    const fw = (CW - 10) / 2;
    [[d.firmaEntrega, d.entregaNombre, 'Entrega: ' + APP.departamento, d.fechaFirmaEntrega], [d.firmaRecibe, d.recibeNombre, 'Recibe de conformidad', d.fechaFirmaRecibe]].forEach(([f, nom, rol, t], i) => {
      const x = M + i * (fw + 10);
      doc.setDrawColor(...LN); doc.setLineWidth(0.25); doc.rect(x, y, fw, fh);
      imagenEn(f, x + 4, y + 2, fw - 8, 21, 'PNG');
      doc.setDrawColor(...NE); doc.setLineWidth(0.35); doc.line(x + 8, y + 25, x + fw - 8, y + 25);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.8); doc.setTextColor(...NE);
      doc.text(T(nom || 'Nombre y firma'), x + fw / 2, y + 29.5, { align: 'center', maxWidth: fw - 6 });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.6); doc.setTextColor(...MU);
      doc.text(T(rol), x + fw / 2, y + 33.5, { align: 'center', maxWidth: fw - 6 });
      if (t) doc.text(T(fFechaHora(t)), x + fw / 2, y + 37.3, { align: 'center' });
    });
    y += fh;

    // Pie de página con paginación
    const tot = doc.getNumberOfPages(), gen = fFechaHora(nowISO());
    for (let p = 1; p <= tot; p++) {
      doc.setPage(p);
      doc.setDrawColor(...LN); doc.setLineWidth(0.3); doc.line(M, H - 12, W - M, H - 12);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MU);
      doc.text(T(`${APP.empresa}. ${APP.departamento}. Documento generado el ${gen}.`), M, H - 8);
      doc.text(T(`Página ${p} de ${tot}`), W - M, H - 8, { align: 'right' });
    }
    doc.setProperties({ title: `${APP.tituloReporte} ${d.folio}`, subject: d.oficina, author: APP.departamento, creator: `${APP.nombre} IES` });
    doc.save(`Entrega_${d.folio}.pdf`);
    DB.log('PDF', 'ordenes', d.folio, 'Reporte de entrega descargado');
  }
};

window.addEventListener('resize', () => { if (Reporte.abierto) Reporte.escalar(); });
