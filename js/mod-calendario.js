/* ==========================================================================
   CONTROL DE EDIFICIOS · IES
   js/mod-calendario.js — Calendario de mantenimientos y órdenes de trabajo
   Librería: FullCalendar 6 (bundle global, incluye sus estilos).
   Fuentes (Firebase en tiempo real, ya cargadas en ST por firebase-db.js):
     · mantenimientos/{id}  fechas ejecutadas, próxima fecha y proyección por periodicidad
     · ordenes/{id}         agendaEjecucion (interno o externo) y agendaLevantamiento
   Vistas: Mes, Semana, Hoy (día actual) y Agenda (lista semanal, ideal en celular).
   Fase 3: las OT se pintan con el color de su estatus actual (CAL_ESTATUS) y se
   actualizan en tiempo real cuando el técnico calendariza o avanza su pipeline.
   Las de proveedor externo se distinguen con rayado; los levantamientos, con contorno.
   ========================================================================== */

const CAL_TIPOS = {
  mant:    { l: 'Mantenimientos',          cls: 'sw-mant' },
  interno: { l: 'OT personal interno',     cls: 'sw-int' },
  externo: { l: 'OT proveedor externo',    cls: 'sw-ext' },
  lev:     { l: 'Levantamientos agendados', cls: 'sw-lev' }
};

const ModCalendario = {
  cal: null,
  filtros: { mant: true, interno: true, externo: true, lev: true },

  init() {
    $('#calFiltros').innerHTML = `<div class="cal-fila"><span class="cal-t">Mostrar</span>${Object.keys(CAL_TIPOS).map(k => `<label class="cal-f">
        <input type="checkbox" data-cf="${k}" checked><i class="${CAL_TIPOS[k].cls}"></i>${CAL_TIPOS[k].l}</label>`).join('')}</div>
      <div class="cal-fila"><span class="cal-t">Estatus de OT</span>${Object.keys(CAL_ESTATUS).map(k => `<span class="cal-f cal-f-nota"><i style="background:${CAL_ESTATUS[k].c}"></i>${CAL_ESTATUS[k].l}</span>`).join('')}</div>
      <div class="cal-fila"><span class="cal-t">Mantenimiento</span>
        <span class="cal-f cal-f-nota"><i style="background:${CAL_COLORES.mant}"></i>Programado</span>
        <span class="cal-f cal-f-nota"><i style="background:${CAL_COLORES.mantEjecutado}"></i>Ejecutado</span>
        <span class="cal-f cal-f-nota"><i style="background:${CAL_COLORES.mantVencido}"></i>Vencido</span></div>`;
    $('#calFiltros').addEventListener('change', e => {
      const x = e.target.closest('[data-cf]'); if (!x) return;
      this.filtros[x.dataset.cf] = x.checked; this.refrescar();
    });
    $('#calTecnico').addEventListener('change', () => this.refrescar());
  },

  render() {
    const s = $('#calTecnico'), v = s.value;
    s.innerHTML = opciones(Tecnicos.todos().map(t => ({ v: t.id, l: t.nombre })), v, 'Todos los técnicos');
    if (typeof FullCalendar === 'undefined') {
      $('#calendario').innerHTML = UI.vacio('No se cargó la librería del calendario. Verifique la conexión a internet y recargue la página.');
      return;
    }
    if (!this.cal) this.crear();
    else { this.cal.updateSize(); this.cal.refetchEvents(); }
    this.resumen();
  },

  crear() {
    const movil = matchMedia('(max-width: 760px)').matches;
    this.cal = new FullCalendar.Calendar($('#calendario'), {
      locale: 'es', firstDay: 1, height: 'auto', nowIndicator: true, dayMaxEvents: 4, eventDisplay: 'block',
      initialView: movil ? 'listWeek' : 'dayGridMonth',
      customButtons: {
        hoy: { text: 'Hoy', hint: 'Ver el día de hoy', click: () => { this.cal.changeView('timeGridDay'); this.cal.today(); } }
      },
      headerToolbar: movil
        ? { left: 'prev,next', center: 'title', right: 'hoy' }
        : { left: 'prev,next', center: 'title', right: 'dayGridMonth,timeGridWeek,hoy,listWeek' },
      footerToolbar: movil ? { center: 'dayGridMonth,timeGridWeek,listWeek' } : false,
      buttonText: { month: 'Mes', week: 'Semana', day: 'Día', list: 'Agenda' },
      slotMinTime: '06:00:00', slotMaxTime: '21:00:00', allDayText: 'Día', noEventsText: 'Sin eventos en este periodo',
      eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
      events: (info, ok, fallo) => { try { ok(this.eventos(info.start, info.end)); } catch (e) { console.error('calendario', e); fallo(e); } },
      eventClick: info => { info.jsEvent.preventDefault(); this.abrirEvento(info.event.extendedProps); },
      eventDidMount: info => { info.el.title = info.event.extendedProps.tip || info.event.title; }
    });
    this.cal.render();
  },

  refrescar() { if (this.cal) this.cal.refetchEvents(); this.resumen(); },

  /* ---------- Construcción de eventos desde Firebase (ST) ---------- */
  eventos(start, end) {
    const ev = [], f = this.filtros, hoy = ymdLocal();
    const ini = ymdLocal(start), fin = ymdLocal(end), tec = $('#calTecnico').value;
    const masMin = (iso, min) => new Date(new Date(iso).getTime() + min * 60000).toISOString();

    if (f.mant) ST.mantenimientos.forEach(p => {
      if (p.activo === false) return;
      const alc = Mant.alcanceTxt(p);
      // Ejecuciones registradas
      Mant.ejecuciones(p).forEach(e => {
        if (e.fecha < ini || e.fecha >= fin) return;
        ev.push({
          id: `me-${p.id}-${e.id}`, title: `${p.rubro} (ejecutado)`, start: e.fecha, allDay: true,
          backgroundColor: CAL_COLORES.mantEjecutado, borderColor: CAL_COLORES.mantEjecutado,
          extendedProps: { tipo: 'mant', planId: p.id, fecha: e.fecha, estado: 'ejecutado', tip: `${p.rubro}: ${p.descripcion || ''}\n${alc}\nEjecutado ${fFecha(e.fecha)}${e.proveedor ? ', ' + e.proveedor : ''}` }
        });
      });
      // Próxima fecha y proyección por periodicidad
      const per = Number(p.periodicidadDias) || 0;
      let px = Mant.proxima(p), n = 0;
      while (px && px < fin && n < 600) {
        if (px >= ini) {
          const venc = px < hoy;
          const c = venc ? CAL_COLORES.mantVencido : CAL_COLORES.mant;
          ev.push({
            id: `mp-${p.id}-${px}`, title: (venc ? 'Vencido: ' : '') + p.rubro, start: px, allDay: true, backgroundColor: c, borderColor: c,
            extendedProps: { tipo: 'mant', planId: p.id, fecha: px, estado: venc ? 'vencido' : 'programado', tip: `${p.rubro}: ${p.descripcion || ''}\n${alc}\n${venc ? 'Vencido desde' : 'Programado para'} ${fFecha(px)}` }
          });
        }
        if (!per) break;
        px = sumarDias(px, per); n++;
      }
    });

    ST.ordenes.forEach(o => {
      if (o.estatus === 'CANCELADA') return;
      if (tec && o.tecnicoId !== tec) return;
      const tipo = o.tipoEjecucion === 'INTERNO' ? 'interno' : 'externo';
      const est = OT.estatusCal(o), ce = CAL_ESTATUS[est];
      const quien = OT.ejecutorTxt(o);
      if (o.agendaEjecucion && f[tipo]) {
        ev.push({
          id: `oe-${o.id}`, title: `${o.folio} ${o.oficina}`, start: o.agendaEjecucion, end: masMin(o.agendaEjecucion, Number(o.agendaDuracionMin) || CAL_DURACION.ejecucion),
          backgroundColor: ce.c, borderColor: ce.c, classNames: [tipo === 'externo' ? 'ev-ext' : 'ev-int', ...(est === 'ENTREGADA' ? ['ev-hecho'] : [])],
          extendedProps: { tipo: 'ot', otId: o.id, tip: `${o.folio}: ejecución agendada\n${o.oficina}, ${tituloEdificio(o.edificio)}\n${o.categoria}. ${TIPOS_EJECUCION[o.tipoEjecucion] ? TIPOS_EJECUCION[o.tipoEjecucion].l + ': ' : ''}${quien}\nEstatus: ${ce.l}${o.agendadoPor ? '\nProgramó: ' + o.agendadoPor : ''}` }
        });
      }
      if (o.agendaLevantamiento && f.lev) {
        const c = CAL_COLORES.levantamiento;
        ev.push({
          id: `ol-${o.id}`, title: `Levantamiento ${o.oficina}`, start: o.agendaLevantamiento, end: masMin(o.agendaLevantamiento, CAL_DURACION.levantamiento),
          backgroundColor: '#ffffff', borderColor: c, textColor: c, classNames: ['ev-lev', ...(o.fechaLevantamiento ? ['ev-hecho'] : [])],
          extendedProps: { tipo: 'ot', otId: o.id, tip: `${o.folio}: levantamiento en sitio\n${o.oficina}, ${tituloEdificio(o.edificio)}\n${quien || 'Sin asignar'}${o.fechaLevantamiento ? '\nRealizado ' + fFechaHora(o.fechaLevantamiento) : ''}` }
        });
      }
    });
    return ev;
  },

  /* ---------- Resumen de los próximos 7 días ---------- */
  resumen() {
    const hoy = ymdLocal(), lim = sumarDias(hoy, 7);
    const enRango = iso => iso && ymdLocal(iso) >= hoy && ymdLocal(iso) < lim;
    const act = ST.mantenimientos.filter(p => p.activo !== false);
    const mVenc = act.filter(p => Mant.estado(p) === 'vencido').length;
    const mProx = act.filter(p => { const px = Mant.proxima(p); return px && px >= hoy && px < lim; }).length;
    const abiertas = ST.ordenes.filter(o => OT_ABIERTAS.includes(o.estatus));
    const oInt = abiertas.filter(o => o.tipoEjecucion === 'INTERNO' && enRango(o.agendaEjecucion)).length;
    const oExt = abiertas.filter(o => o.tipoEjecucion !== 'INTERNO' && enRango(o.agendaEjecucion)).length;
    const lev = abiertas.filter(o => !o.fechaLevantamiento && enRango(o.agendaLevantamiento)).length;
    const sinAg = abiertas.filter(o => !o.agendaEjecucion).length;
    $('#calResumen').innerHTML = [
      kpi(mVenc, 'Mantenimientos vencidos', mVenc ? 'Programe o registre su ejecución' : 'Programa al día', mVenc ? 'k-rojo' : 'k-verde'),
      kpi(mProx, 'Mantenimientos en 7 días', 'Próxima fecha programada', 'k-azul'),
      kpi(oInt, 'OT internas agendadas', 'Próximos 7 días', 'k-azul'),
      kpi(oExt, 'OT de proveedores agendadas', 'Próximos 7 días', 'k-ambar'),
      kpi(lev, 'Levantamientos agendados', 'Próximos 7 días', 'k-morado'),
      kpi(sinAg, 'OT abiertas sin fecha de ejecución', 'Agéndelas desde la orden', sinAg ? 'k-ambar' : 'k-verde')
    ].join('');
  },

  /* ---------- Clic en un evento ---------- */
  abrirEvento(x) {
    if (x.tipo === 'ot') { OT.abrir(x.otId); return; }
    if (x.tipo === 'mant') this.detalleMant(x.planId, x.fecha, x.estado);
  },

  detalleMant(planId, fecha, estado) {
    const p = ST.mantenimientos.find(z => z.id === planId); if (!p) return;
    const u = Mant.ultima(p);
    const est = { ejecutado: ['t-verde', 'Ejecutado'], vencido: ['t-rojo', 'Vencido'], programado: ['t-azul', 'Programado'] }[estado] || ['t-gris', estado];
    const c = can('capture') && p.activo !== false && Mant.estado(p) !== 'concluido';
    UI.modal({
      titulo: `${p.rubro}`, ancho: '600px',
      sub: `<span class="tag ${est[0]}">${est[1]}</span> ${esc(fFecha(fecha))}`,
      cuerpo: `<dl class="dl2">
        <dt>Actividad</dt><dd>${esc(p.descripcion || '—')}</dd>
        <dt>Tipo</dt><dd>${esc(p.tipo || '—')}</dd>
        <dt>Alcance</dt><dd>${esc(Mant.alcanceTxt(p))}</dd>
        <dt>Periodicidad</dt><dd>${esc(Mant.periodicidadTxt(p.periodicidadDias))}</dd>
        <dt>Última ejecución</dt><dd>${u ? `${fFecha(u.fecha)}${u.proveedor ? ', ' + esc(u.proveedor) : ''}${u.otFolio ? ' (' + esc(u.otFolio) + ')' : ''}` : 'Sin registro'}</dd>
        <dt>Próxima fecha</dt><dd>${fFecha(Mant.proxima(p))} ${Mant.tagEstado(p)}</dd>
        <dt>Proveedor</dt><dd>${esc(p.proveedor || '—')}</dd>
        <dt>Responsable</dt><dd>${esc(p.responsable || '—')}</dd>
      </dl>`,
      acciones: [
        { texto: 'Cerrar', clase: 'btn-ghost' },
        { texto: 'Historial', fn: () => { setTimeout(() => ModMant.historial(p), 60); } },
        ...(can('capture') ? [{ texto: 'Editar plan', fn: () => { setTimeout(() => ModMant.editar(p.id), 60); } }] : []),
        ...(c ? [{ texto: 'Generar OT', fn: () => { setTimeout(() => ModMant.generarOT(p), 60); } },
                 { texto: 'Registrar ejecución', clase: 'btn-primary', fn: () => { setTimeout(() => ModMant.ejecutar(p), 60); } }] : [])
      ]
    });
  }
};

UI.registrar('calendario', ModCalendario);
