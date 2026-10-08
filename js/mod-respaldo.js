/* ==========================================================================
   CONTROL DE EDIFICIOS · IES
   js/mod-respaldo.js — Respaldo ZIP y depuración de evidencia (solo Administrador)
   Replica el «Cierre de Día» del Tablero Vehicular:
     1. Respaldo: Excel, CSV, JSON íntegro de Firebase, reportes de entrega en PDF
        y todas las fotografías y firmas, en Respaldo_Edificios_IES_AAAAMMDD_HHMM.zip
     2. Depuración: borra de tableros/edificios_media únicamente la evidencia que
        quedó dentro del ZIP generado en esta misma sesión, y limpia la caché local.
   Los datos operativos (folios, fechas, SLA, materiales, firmantes) nunca se borran.
   ========================================================================== */

const Respaldo = {
  inventario: null,      // evidencia incluida en el último ZIP de esta sesión
  ultimoZip: null,       // { nombre, bytes, ts }
  ocupado: false,

  sello() {
    const d = new Date(), z = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}`;
  },
  mb(b) { return (b / 1048576).toFixed(b > 10485760 ? 0 : 1) + ' MB'; },
  limpio(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').slice(0, 60); },
  ext(dataUrl) { return /^data:image\/png/.test(dataUrl) ? 'png' : 'jpg'; },
  b64(dataUrl) { return String(dataUrl).split(',')[1] || ''; },
  bytes(dataUrl) { return Math.round(String(dataUrl).length * 0.75); },
  nombreArchivo(k) {
    if (k === 'firmaEntrega') return 'firma_entrega';
    if (k === 'firmaRecibe') return 'firma_recibe';
    const [f, i] = k.split('_');
    return `${{ rep: 'reporte', antes: 'antes', despues: 'despues' }[f] || f}_${Number(i) + 1}`;
  },
  esFirma(k) { return k === 'firmaEntrega' || k === 'firmaRecibe'; },
  csv(filas) {
    return '\ufeff' + filas.map(r => r.map(v => {
      const t = String(v == null ? '' : v);
      return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    }).join(',')).join('\r\n');
  },

  /* ---------- Ventana principal ---------- */
  abrir() {
    if (!can('config')) return;
    const ur = ST.meta.ultimoRespaldo, ud = ST.meta.ultimaDepuracion;
    const m = UI.modal({
      titulo: 'Respaldo y depuración', ancho: '760px', clase: 'm-respaldo m-fija',
      sub: 'Exclusivo del Administrador. Genere el respaldo antes de liberar espacio.',
      cuerpo: `
        <div class="rs-estado">
          <div><span>Último respaldo</span><b>${ur ? `${fFechaHora(ur.ts)}, ${esc(ur.tamano || '')}` : 'Sin registro'}</b>${ur && ur.por ? `<small>${esc(ur.por)}</small>` : ''}</div>
          <div><span>Última depuración</span><b>${ud ? `${fFechaHora(ud.ts)}, ${esc(ud.liberado || '')}` : 'Sin registro'}</b>${ud && ud.registros ? `<small>${ud.registros} registros</small>` : ''}</div>
        </div>
        <section class="rs-paso">
          <h3><span>1</span>Respaldo ZIP</h3>
          <p>Empaqueta en un solo archivo:</p>
          <ul class="rs-lista">
            <li><b>Control_Edificios_IES.xlsx</b> con todas las hojas del sistema y su equivalente en <b>CSV/</b></li>
            <li><b>Datos/respaldo_firebase.json</b>: copia íntegra de la base (sin imágenes) para restauración</li>
            <li><b>Reportes_de_entrega/</b>: PDF firmado de cada orden culminada o entregada, con costos</li>
            <li><b>Evidencias/</b>: una carpeta por OT e incidencia con fotografías y firmas, más su índice CSV</li>
          </ul>
          <div class="rs-prog" id="rsProg" hidden><div class="rs-bar"><i id="rsBar"></i></div><p id="rsTxt"></p></div>
          <button type="button" class="btn btn-success btn-grande" id="rsZip">Generar respaldo ZIP</button>
        </section>
        <section class="rs-paso" id="rsDep">
          <h3><span>2</span>Liberar espacio en Firebase</h3>
          <p>Borra fotografías y evidencia antigua de <code>tableros/edificios_media</code>. Solo se elimina lo que quedó dentro del ZIP generado en esta sesión. Folios, fechas, SLA, materiales, costos, nombres de firmantes y bitácora se conservan.</p>
          <div id="rsDepCuerpo"><p class="aviso">Genere primero el respaldo ZIP en esta sesión; después se habilita la depuración.</p></div>
        </section>`,
      acciones: [{ texto: 'Cerrar', clase: 'btn-ghost' }]
    });
    m.q('#rsZip').onclick = () => this.generar(m);
    if (this.inventario) this.pintarDepuracion(m);
  },

  progreso(m, pct, txt) {
    const p = m.q('#rsProg'); if (!p) return;
    p.hidden = false;
    m.q('#rsBar').style.width = Math.max(2, Math.min(100, pct)) + '%';
    m.q('#rsTxt').textContent = txt;
  },

  /* ---------- 1. Respaldo ZIP ---------- */
  async generar(m) {
    if (this.ocupado) return;
    if (typeof JSZip === 'undefined') { UI.toast('La librería de compresión (JSZip) no se cargó. Verifique su conexión.', 'err'); return; }
    if (typeof XLSX === 'undefined') { UI.toast('La librería de Excel no se cargó. Verifique su conexión.', 'err'); return; }
    const hayPdf = !!window.jspdf;
    const btn = m.q('#rsZip'); btn.disabled = true; this.ocupado = true;
    const stamp = new Date().toLocaleString('es-MX');
    const zip = new JSZip();
    const indice = [['Registro', 'Tipo', 'Ubicacion', 'Estatus', 'Archivo', 'Clase', 'Bytes']];
    const inv = { registros: [], archivos: 0, bytes: 0, generado: nowISO() };
    let pdfs = 0, pdfFallos = 0, fallos = 0;
    try {
      // Datos íntegros de Firebase (sin multimedia)
      this.progreso(m, 3, 'Descargando datos de Firebase…');
      const [sRoot, sPub] = await Promise.all([DB.db.ref(FB.root).get(), DB.db.ref(FB.publico).get()]);
      zip.file('Datos/respaldo_firebase.json', JSON.stringify({
        generado: inv.generado, sistema: `${APP.nombre} IES v${APP.version}`, nodos: { [FB.root]: sRoot.val() || {}, [FB.publico]: sPub.val() || {} }
      }, null, 1));

      // Excel y CSV
      this.progreso(m, 8, 'Generando Excel y CSV…');
      const wb = libroExcel();
      zip.file('Control_Edificios_IES.xlsx', XLSX.write(wb, { bookType: 'xlsx', type: 'array' }));
      wb.SheetNames.forEach(n => zip.file(`CSV/${this.limpio(n)}.csv`, '\ufeff' + XLSX.utils.sheet_to_csv(wb.Sheets[n])));

      // Evidencia por registro (OT e incidencias) y reportes de entrega
      const dueños = [
        ...ST.ordenes.map(o => ({ nodo: 'ordenes', r: o, folio: o.folio, carpeta: `Evidencias/OT/${this.limpio(o.folio)}_${this.limpio(o.oficina)}` })),
        ...ST.incidencias.map(i => ({ nodo: 'incidencias', r: i, folio: i.folio, carpeta: `Evidencias/Incidencias/${this.limpio(i.folio)}_${this.limpio(i.oficina)}` }))
      ];
      for (let n = 0; n < dueños.length; n++) {
        const x = dueños[n], r = x.r;
        this.progreso(m, 10 + (n / Math.max(1, dueños.length)) * 70, `Empaquetando ${x.folio} (${n + 1} de ${dueños.length})…`);
        let media = {};
        try { media = await DB.mediaServidor(r.id); } catch (e) { fallos++; continue; }
        const claves = Object.keys(media).filter(k => media[k]);
        const reg = { id: r.id, nodo: x.nodo, folio: x.folio, claves: [], bytes: 0 };
        for (const k of claves) {
          try {
            const nombre = `${x.carpeta}/${this.nombreArchivo(k)}.${this.ext(media[k])}`;
            zip.file(nombre, this.b64(media[k]), { base64: true });
            const b = this.bytes(media[k]);
            reg.claves.push({ k, bytes: b }); reg.bytes += b;
            indice.push([x.folio, x.nodo === 'ordenes' ? 'OT' : 'Incidencia', r.oficina || '', r.estatus || '', nombre, this.esFirma(k) ? 'Firma' : 'Fotografía', b]);
          } catch (e) { fallos++; }
        }
        if (reg.claves.length) { inv.registros.push(reg); inv.archivos += reg.claves.length; inv.bytes += reg.bytes; }
        // Reporte de entrega con costos (expediente interno)
        if (x.nodo === 'ordenes' && hayPdf && ['CULMINADA', 'ENTREGADA'].includes(r.estatus)) {
          try {
            const d = await Reporte.datos(r, media);
            zip.file(`Reportes_de_entrega/Entrega_${this.limpio(r.folio)}.pdf`, Reporte.documento(d, { costos: true, fotos: true }).output('arraybuffer'));
            pdfs++;
          } catch (e) { console.warn('PDF', r.folio, e); pdfFallos++; }
        }
        media = null;
      }
      zip.file('Evidencias/INDICE_EVIDENCIAS.csv', this.csv(indice));

      zip.file('LEEME.txt',
        `RESPALDO GENERAL · ${APP.nombre} IES\r\n${'='.repeat(52)}\r\n` +
        `Generado: ${stamp}\r\nPerfil: Administrador\r\nEmpresa: ${APP.empresa}\r\n\r\n` +
        `CONTENIDO\r\n` +
        `  Control_Edificios_IES.xlsx   Libro con ${wb.SheetNames.length} hojas de todo el sistema\r\n` +
        `  CSV/                         Los mismos datos en texto plano\r\n` +
        `  Datos/respaldo_firebase.json Copia íntegra de la base sin imágenes\r\n` +
        `  Reportes_de_entrega/         PDF de cada OT culminada o entregada, con costos\r\n` +
        `  Evidencias/                  Una carpeta por OT e incidencia: fotografías y firmas\r\n\r\n` +
        `RESUMEN\r\n` +
        `  Áreas: ${Areas.activas().length}\r\n  Órdenes de trabajo: ${ST.ordenes.length}\r\n  Incidencias: ${ST.incidencias.length}\r\n` +
        `  Solicitudes: ${ST.solicitudes.length}\r\n  Planes de mantenimiento: ${ST.mantenimientos.length}\r\n  Capturas de consumo: ${ST.consumos.length}\r\n` +
        `  Archivos de evidencia: ${inv.archivos} (${this.mb(inv.bytes)})${fallos ? `\r\n  No recuperados: ${fallos}` : ''}\r\n` +
        `  Reportes de entrega (PDF): ${pdfs}${!hayPdf ? ' (no se cargó el generador de PDF)' : ''}${pdfFallos ? `\r\n  PDF no generados: ${pdfFallos}` : ''}\r\n\r\n` +
        `Conserve este paquete antes de ejecutar «Borrar fotografías y evidencia antigua».\r\n`);

      this.progreso(m, 82, 'Comprimiendo…');
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
        meta => this.progreso(m, 82 + meta.percent * 0.16, `Comprimiendo ${Math.round(meta.percent)} %…`));
      const nombre = `Respaldo_Edificios_IES_${this.sello()}.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);

      this.inventario = inv;
      this.ultimoZip = { nombre, bytes: blob.size, ts: nowISO() };
      const reg = { ts: nowISO(), por: (ROLES[SESION.rol] || {}).label || '', tamano: this.mb(blob.size), archivos: inv.archivos, pdfs, nombre };
      await DB.db.ref(`${FB.root}/meta/ultimoRespaldo`).set(reg).catch(() => {});
      DB.log('RESPALDO', 'respaldo', nombre, `${inv.archivos} evidencias (${this.mb(inv.bytes)}), ${pdfs} PDF, ZIP de ${this.mb(blob.size)}${fallos + pdfFallos ? `, ${fallos + pdfFallos} con error` : ''}`);
      this.progreso(m, 100, `Respaldo descargado: ${nombre} (${this.mb(blob.size)}). ${inv.archivos} ${inv.archivos === 1 ? 'evidencia' : 'evidencias'} y ${pdfs} ${pdfs === 1 ? 'reporte' : 'reportes'} PDF.${fallos + pdfFallos ? ` ${fallos + pdfFallos} elementos no se pudieron incluir.` : ''}`);
      UI.toast('Respaldo ZIP generado.', 'ok');
      this.pintarDepuracion(m);
    } catch (e) {
      console.error(e);
      this.progreso(m, 0, 'Error: ' + e.message);
      UI.toast('No se pudo generar el respaldo: ' + e.message, 'err', 7000);
    } finally { this.ocupado = false; btn.disabled = false; }
  },

  /* ---------- 2. Depuración ---------- */
  cerradoEn(x) {
    const r = (x.nodo === 'ordenes' ? ST.ordenes : ST.incidencias).find(z => z.id === x.id);
    if (!r) return { cerrado: true, fecha: '' };   // registro eliminado: su evidencia es huérfana
    if (x.nodo === 'ordenes') return { cerrado: ['ENTREGADA', 'CANCELADA'].includes(r.estatus), fecha: r.fechaEntrega || r.fechaCancelacion || r.updatedAt || '' };
    return { cerrado: ['RESUELTA', 'CANCELADA'].includes(r.estatus), fecha: r.fechaCierre || r.updatedAt || '' };
  },
  candidatos(alcance, dias, conservarFirmas) {
    const lim = Date.now() - dias * 86400000;
    const out = { registros: [], archivos: 0, bytes: 0 };
    (this.inventario ? this.inventario.registros : []).forEach(x => {
      if (alcance === 'cerrados') {
        const c = this.cerradoEn(x);
        if (!c.cerrado || (c.fecha && new Date(c.fecha).getTime() > lim)) return;
      }
      const claves = x.claves.filter(c => !(conservarFirmas && this.esFirma(c.k)));
      if (!claves.length) return;
      const bytes = claves.reduce((s, c) => s + c.bytes, 0);
      out.registros.push({ id: x.id, nodo: x.nodo, folio: x.folio, claves, bytes, conFirmas: !conservarFirmas && x.claves.some(c => this.esFirma(c.k)) });
      out.archivos += claves.length; out.bytes += bytes;
    });
    return out;
  },

  pintarDepuracion(m) {
    const cont = m.q('#rsDepCuerpo'); if (!cont) return;
    cont.innerHTML = `
      <p class="ok-respaldo">Respaldo de esta sesión: <b>${esc(this.ultimoZip.nombre)}</b> (${this.mb(this.ultimoZip.bytes)}). Verifique que se descargó completo antes de depurar.</p>
      <fieldset class="seg"><legend>Alcance</legend>
        <label><input type="radio" name="rsAlc" value="cerrados" checked> Registros cerrados con más de <input type="number" id="rsDias" min="0" max="3650" value="${RESPALDO.diasAntiguedad}" class="rs-dias"> días (OT entregadas o canceladas e incidencias resueltas o canceladas)</label>
        <label><input type="radio" name="rsAlc" value="todo"> Toda la evidencia respaldada, incluidas órdenes abiertas</label>
      </fieldset>
      <label class="chk"><input type="checkbox" id="rsFirmas" checked> Conservar firmas digitales (ocupan poco espacio y permiten reimprimir reportes firmados)</label>
      <div class="rs-estimado" id="rsEst"></div>
      <button type="button" class="btn btn-danger btn-grande" id="rsBorrar">Borrar fotografías y evidencia antigua</button>`;
    const calc = () => {
      const alc = m.q('input[name=rsAlc]:checked').value, dias = Math.max(0, Number(m.q('#rsDias').value) || 0);
      const c = this.candidatos(alc, dias, m.q('#rsFirmas').checked);
      m.q('#rsEst').innerHTML = c.archivos
        ? `Se eliminarán <b>${c.archivos} archivos</b> de <b>${c.registros.length} registros</b>, aproximadamente <b>${this.mb(c.bytes)}</b> en Firebase.`
        : 'No hay evidencia que cumpla el criterio seleccionado.';
      m.q('#rsBorrar').disabled = !c.archivos;
      return { c, alc, dias };
    };
    cont.onchange = calc; cont.oninput = calc;
    calc();
    m.q('#rsBorrar').onclick = async () => {
      const { c, alc, dias } = calc();
      if (!c.archivos) return;
      if (await this.confirmar(c, alc, dias, m.q('#rsFirmas').checked)) await this.depurar(m, c, alc, dias);
    };
  },

  /* Doble confirmación: resumen y palabra clave */
  confirmar(c, alc, dias, firmas) {
    return new Promise(res => {
      let ok = false;
      UI.modal({
        titulo: 'Confirmar depuración', ancho: '560px', clase: 'm-fija',
        cuerpo: `<p class="m-msg"><b>Se eliminará de Firebase:</b> ${c.archivos} archivos de ${c.registros.length} registros (${this.mb(c.bytes)}), ${alc === 'cerrados' ? `de registros cerrados hace más de ${dias} días` : 'de toda la evidencia respaldada'}. ${firmas ? 'Las firmas se conservan.' : '<b>Incluye firmas digitales.</b>'}</p>
          <p class="m-msg"><b>Se conserva íntegramente:</b> áreas, responsables, incidencias, órdenes, materiales, costos, SLA, solicitudes, mantenimientos, consumos y bitácora.</p>
          <p class="m-msg">Los archivos eliminados no se pueden recuperar desde el tablero; quedan únicamente en el ZIP.</p>
          <label class="fl"><span>Escriba ${RESPALDO.palabraConfirmacion} para confirmar</span><input id="rsPalabra" autocomplete="off" autocapitalize="characters"></label>`,
        alCerrar: () => res(ok),
        acciones: [{ texto: 'Cancelar' }, { texto: 'Eliminar evidencia', clase: 'btn-danger', fn: mm => {
          if (mm.q('#rsPalabra').value.trim() !== RESPALDO.palabraConfirmacion) { UI.toast(`Escriba ${RESPALDO.palabraConfirmacion} exactamente, en mayúsculas.`, 'err'); return false; }
          ok = true;
        } }]
      });
    });
  },

  async depurar(m, c, alc, dias) {
    if (this.ocupado) return;
    this.ocupado = true;
    const btn = m.q('#rsBorrar'); btn.disabled = true;
    const ts = nowISO();
    try {
      // Rutas de borrado en lotes (multi-path update de Realtime Database)
      const rutas = {};
      c.registros.forEach(x => {
        x.claves.forEach(k => { rutas[`${FB.media}/${x.id}/${k.k}`] = null; });
        const existe = (x.nodo === 'ordenes' ? ST.ordenes : ST.incidencias).some(z => z.id === x.id);
        if (existe) {
          x.claves.filter(k => !this.esFirma(k.k)).forEach(k => { rutas[`${FB.root}/${x.nodo}/${x.id}/fotos/${k.k}`] = null; });
          rutas[`${FB.root}/${x.nodo}/${x.id}/evidenciaDepurada`] = ts;
          if (x.conFirmas) rutas[`${FB.root}/${x.nodo}/${x.id}/firmasDepuradas`] = ts;
        }
      });
      const claves = Object.keys(rutas), lote = 300;
      for (let i = 0; i < claves.length; i += lote) {
        this.progreso(m, (i / claves.length) * 100, `Liberando espacio (${Math.min(i + lote, claves.length)} de ${claves.length})…`);
        const parte = {}; claves.slice(i, i + lote).forEach(k => { parte[k] = rutas[k]; });
        await DB.multi(parte);
      }
      // Limpieza de la caché local de evidencia
      DB.limpiarCache();
      c.registros.forEach(x => {
        const reg = this.inventario.registros.find(r => r.id === x.id);
        if (reg) { const borradas = new Set(x.claves.map(k => k.k)); reg.claves = reg.claves.filter(k => !borradas.has(k.k)); reg.bytes = reg.claves.reduce((s, k) => s + k.bytes, 0); }
      });
      this.inventario.registros = this.inventario.registros.filter(r => r.claves.length);
      const reg = { ts, por: (ROLES[SESION.rol] || {}).label || '', registros: c.registros.length, archivos: c.archivos, liberado: this.mb(c.bytes), respaldo: this.ultimoZip.nombre, alcance: alc === 'cerrados' ? `cerrados > ${dias} días` : 'todo' };
      await DB.db.ref(`${FB.root}/meta/ultimaDepuracion`).set(reg).catch(() => {});
      DB.log('DEPURACION', 'edificios_media', this.ultimoZip.nombre, `${c.archivos} archivos de ${c.registros.length} registros, ${this.mb(c.bytes)} liberados (${reg.alcance})`);
      this.progreso(m, 100, `Depuración terminada: ${c.archivos} archivos eliminados, ${this.mb(c.bytes)} liberados. La caché local se limpió.`);
      UI.toast('Evidencia depurada y caché local limpia.', 'ok');
      this.pintarDepuracion(m);
    } catch (e) {
      console.error(e);
      UI.toast('La depuración se interrumpió: ' + e.message + '. Lo ya borrado está respaldado en el ZIP.', 'err', 8000);
    } finally { this.ocupado = false; if (m.q('#rsBorrar')) m.q('#rsBorrar').disabled = false; }
  }
};
