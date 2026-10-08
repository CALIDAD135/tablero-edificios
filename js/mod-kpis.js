/* ==========================================================================
   CONTROL DE EDIFICIOS · IES
   js/mod-kpis.js — Módulo 4: Análisis de indicadores
     · Inversión (OT + mantenimientos programados) por edificio y departamento
     · Consumo de servicios: agua (m³) y energía eléctrica (kWh) mes a mes
   ========================================================================== */

const SERV = {
  AGUA:    { l: 'Agua', u: 'm³', c: '#1f7fd1' },
  ENERGIA: { l: 'Energía eléctrica', u: 'kWh', c: '#c77700' }
};
const PALETA = ['#0b4f9e', '#38a3f5', '#0f7a4e', '#c77700', '#5a3fb8', '#b81f30', '#3d6b8f', '#7a8ea6'];

const ModKPI = {
  init() {
    ['kpAnio', 'kpEdif', 'kpDepto'].forEach(id => $('#' + id).addEventListener('change', () => this.render()));
    ['csAnio', 'csMedidor'].forEach(id => $('#' + id).addEventListener('change', () => this.renderConsumos()));
    $('#csNuevo').onclick = () => this.capturarConsumo(null);
    $('#csTabla').addEventListener('click', e => {
      const b = e.target.closest('[data-cs]'); if (!b) return;
      const c = ST.consumos.find(x => x.id === b.dataset.id); if (!c) return;
      if (b.dataset.cs === 'editar') this.capturarConsumo(c.id);
    });
  },

  /* Movimientos de inversión normalizados */
  movimientos() {
    const r = [];
    ST.ordenes.filter(o => o.estatus !== 'CANCELADA').forEach(o => {
      const c = OT.costos(o); if (!c.total) return;
      const fecha = ymdLocal(o.fechaCulminacion || o.fechaLevantamiento || otGeneracion(o));
      const base = { fecha, mes: fecha.slice(0, 7), edificio: o.edificio || 'SIN UBICACIÓN', departamento: o.departamento || 'SIN ASIGNAR', categoria: o.categoria || 'Sin categoría', ref: o.folio, ubic: o.oficina };
      if (c.materiales) r.push(Object.assign({ concepto: 'Materiales y refacciones', monto: c.materiales }, base));
      if (c.manoObra) r.push(Object.assign({ concepto: 'Mano de obra', monto: c.manoObra }, base));
    });
    ST.mantenimientos.forEach(p => {
      const a = p.alcance === 'AREA' ? Areas.porId(p.areaId) : null;
      Mant.ejecuciones(p).forEach(e => {
        if (e.otId || !(Number(e.costo) > 0)) return;   // las ejecuciones con OT ya se contabilizan en la orden
        r.push({
          fecha: e.fecha, mes: String(e.fecha).slice(0, 7), concepto: 'Mantenimiento programado', monto: Number(e.costo),
          edificio: a ? a.edificio : (p.alcance === 'EDIFICIO' ? p.edificio : 'GENERAL'), departamento: a ? (a.departamento || 'SIN ASIGNAR') : 'ÁREAS COMUNES',
          categoria: p.rubro, ref: p.rubro, ubic: Mant.alcanceTxt(p)
        });
      });
    });
    return r;
  },

  render() {
    const movs = this.movimientos();
    const y = new Date().getFullYear();
    const anios = [...new Set([y, ...movs.map(m => Number(m.fecha.slice(0, 4))), ...ST.consumos.map(c => Number(String(c.periodo).slice(0, 4)))])].filter(Boolean).sort((a, b) => b - a);
    const ka = $('#kpAnio'); const kav = ka.value || y; ka.innerHTML = opciones(anios, kav);
    const ca = $('#csAnio'); const cav = ca.value || y; ca.innerHTML = opciones(anios, cav);
    const ke = $('#kpEdif'), kev = ke.value; ke.innerHTML = opciones([...new Set([...Areas.edificios(), ...movs.map(m => m.edificio)])], kev, 'Todos los edificios');
    const kd = $('#kpDepto'), kdv = kd.value; kd.innerHTML = opciones([...new Set([...DEPARTAMENTOS, ...movs.map(m => m.departamento)])], kdv, 'Todos los departamentos');
    this.renderInversion(movs);
    this.renderConsumos();
  },

  renderInversion(movs) {
    const anio = $('#kpAnio').value, ed = $('#kpEdif').value, dp = $('#kpDepto').value;
    const f = movs.filter(m => m.fecha.slice(0, 4) === String(anio) && (!ed || m.edificio === ed) && (!dp || m.departamento === dp));
    const suma = (lista, fn) => lista.reduce((s, m) => s + (fn ? (fn(m) ? m.monto : 0) : m.monto), 0);
    const total = suma(f);
    const otCosto = new Set(f.filter(m => m.concepto !== 'Mantenimiento programado').map(m => m.ref)).size;
    const mesAct = ymdLocal().slice(0, 7), mesAnt = ymdLocal(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)).slice(0, 7);
    const tMes = suma(f, m => m.mes === mesAct), tAnt = suma(f, m => m.mes === mesAnt);
    $('#kpKpis').innerHTML = [
      kpi(money(total).replace(/\.\d\d$/, ''), `Inversión ${anio}`, ed || dp ? 'Con filtros aplicados' : 'Todas las ubicaciones', 'k-azul'),
      kpi(money(suma(f, m => m.concepto === 'Materiales y refacciones')).replace(/\.\d\d$/, ''), 'Materiales y refacciones', `${total ? Math.round(suma(f, m => m.concepto === 'Materiales y refacciones') / total * 100) : 0} % del total`, 'k-azul'),
      kpi(money(suma(f, m => m.concepto === 'Mano de obra')).replace(/\.\d\d$/, ''), 'Mano de obra', `${total ? Math.round(suma(f, m => m.concepto === 'Mano de obra') / total * 100) : 0} % del total`, 'k-azul'),
      kpi(money(suma(f, m => m.concepto === 'Mantenimiento programado')).replace(/\.\d\d$/, ''), 'Mantenimiento programado', 'Ejecuciones sin OT', 'k-verde'),
      kpi(otCosto ? money(suma(f, m => m.concepto !== 'Mantenimiento programado') / otCosto).replace(/\.\d\d$/, '') : '—', 'Costo medio por OT', `${otCosto} órdenes con costo`, 'k-morado'),
      kpi(money(tMes).replace(/\.\d\d$/, ''), 'Mes en curso', tAnt ? `${tMes >= tAnt ? '+' : ''}${Math.round((tMes - tAnt) / tAnt * 100)} % contra el mes anterior` : 'Sin referencia del mes anterior', tAnt && tMes > tAnt * 1.2 ? 'k-rojo' : 'k-azul')
    ].join('');

    const conceptos = ['Materiales y refacciones', 'Mano de obra', 'Mantenimiento programado'];
    const meses = MESES.map((_, i) => `${anio}-${String(i + 1).padStart(2, '0')}`);
    const tt = { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: v => money(v) };
    UI.chart('kpChMes', f.length ? {
      grid: { left: 70, right: 16, top: 36, bottom: 28 }, tooltip: tt, legend: { top: 0 },
      xAxis: { type: 'category', data: MESES }, yAxis: { type: 'value', axisLabel: { formatter: v => '$' + nfmt(v) } },
      series: conceptos.map((c, i) => ({ name: c, type: 'bar', stack: 'm', barMaxWidth: 38, itemStyle: { color: [PALETA[0], PALETA[1], PALETA[2]][i] }, data: meses.map(m => suma(f, x => x.mes === m && x.concepto === c)) }))
    } : sinDatos());

    const agrupar = k => { const g = {}; f.forEach(m => g[m[k]] = (g[m[k]] || 0) + m.monto); return Object.entries(g).sort((a, b) => a[1] - b[1]); };
    const barH = (id, datos, color) => UI.chart(id, datos.length ? {
      grid: { left: 150, right: 70, top: 10, bottom: 20 }, tooltip: tt,
      xAxis: { type: 'value', axisLabel: { formatter: v => '$' + nfmt(v / 1000) + 'k' } },
      yAxis: { type: 'category', data: datos.map(d => d[0]), axisLabel: { width: 140, overflow: 'truncate' } },
      series: [{ type: 'bar', data: datos.map(d => d[1]), itemStyle: { color }, barMaxWidth: 22, label: { show: true, position: 'right', formatter: p => '$' + nfmt(p.value) } }]
    } : sinDatos());
    barH('kpChEdif', agrupar('edificio').map(([k, v]) => [tituloEdificio(k), v]), PALETA[0]);
    barH('kpChDepto', agrupar('departamento'), PALETA[1]);
    barH('kpChCat', agrupar('categoria').slice(-10), PALETA[4]);

    const top = [...f].sort((a, b) => b.monto - a.monto).slice(0, 15);
    $('#kpTop').innerHTML = top.length ? `<table class="tbl"><thead><tr><th>Referencia</th><th>Fecha</th><th>Ubicación</th><th>Departamento</th><th>Concepto</th><th class="num">Monto</th></tr></thead><tbody>
      ${top.map(m => `<tr><td class="mono">${esc(m.ref)}</td><td>${fFecha(m.fecha)}</td><td>${esc(m.ubic || '')}<br><span class="muted">${esc(tituloEdificio(m.edificio))}</span></td><td>${esc(m.departamento)}</td><td>${esc(m.concepto)}</td><td class="num">${money(m.monto)}</td></tr>`).join('')}
      </tbody></table>` : UI.vacio('Sin inversión registrada con los filtros actuales. Los costos provienen de las órdenes de trabajo y de las ejecuciones de mantenimiento.');
  },

  /* ---------- Consumo de servicios ---------- */
  serie(servicio, medidor) {
    // Suma por periodo (todos los medidores o uno específico), ordenada cronológicamente
    const g = {};
    ST.consumos.filter(c => c.servicio === servicio && (!medidor || (c.medidor || 'GENERAL') === medidor)).forEach(c => {
      const k = c.periodo; g[k] = g[k] || { periodo: k, consumo: 0, importe: 0 };
      g[k].consumo += Number(c.consumo) || 0; g[k].importe += Number(c.importe) || 0;
    });
    const arr = Object.values(g).sort((a, b) => a.periodo.localeCompare(b.periodo));
    arr.forEach((x, i) => {
      const prev = arr.slice(Math.max(0, i - 3), i);
      x.prom3 = prev.length ? prev.reduce((s, p) => s + p.consumo, 0) / prev.length : null;
      x.varProm = x.prom3 ? (x.consumo - x.prom3) / x.prom3 : null;
      x.varAnt = i && arr[i - 1].consumo ? (x.consumo - arr[i - 1].consumo) / arr[i - 1].consumo : null;
      x.anomalia = x.varProm == null ? '' : x.varProm > UMBRAL_ANOMALIA ? 'alta' : x.varProm < -UMBRAL_ANOMALIA ? 'baja' : '';
      x.unit = x.consumo ? x.importe / x.consumo : null;
    });
    return arr;
  },

  renderConsumos() {
    const anio = $('#csAnio').value || String(new Date().getFullYear());
    const ms = $('#csMedidor'), mv = ms.value;
    ms.innerHTML = opciones([...new Set(ST.consumos.map(c => c.medidor || 'GENERAL'))].sort(), mv, 'Todos los medidores');
    $('#csNuevo').hidden = !can('capture');
    const med = ms.value;
    const meses = MESES.map((_, i) => `${anio}-${String(i + 1).padStart(2, '0')}`);
    const mesesAnt = MESES.map((_, i) => `${Number(anio) - 1}-${String(i + 1).padStart(2, '0')}`);
    const kp = [];
    Object.keys(SERV).forEach(sv => {
      const s = this.serie(sv, med), info = SERV[sv];
      const mapa = Object.fromEntries(s.map(x => [x.periodo, x]));
      const ult = s.filter(x => x.periodo.slice(0, 4) <= anio).slice(-1)[0];
      const anom = s.filter(x => x.periodo.slice(0, 4) === anio && x.anomalia === 'alta').length;
      kp.push(kpi(ult ? `${nfmt(ult.consumo)} ${info.u}` : '—', `${info.l}, último periodo`, ult ? `${periodoTxt(ult.periodo)}: ${money(ult.importe)}${ult.varAnt != null ? `, ${ult.varAnt >= 0 ? '+' : ''}${Math.round(ult.varAnt * 100)} % vs mes previo` : ''}` : 'Sin capturas', ult && ult.anomalia === 'alta' ? 'k-rojo' : 'k-azul'));
      kp.push(kpi(anom, `Anomalías de ${info.l.toLowerCase()} ${anio}`, `Consumo > ${Math.round(UMBRAL_ANOMALIA * 100)} % sobre el promedio de 3 meses`, anom ? 'k-rojo' : 'k-verde'));
      const datos = meses.map(m => mapa[m] || null);
      UI.chart(sv === 'AGUA' ? 'csChAgua' : 'csChEnergia', s.length ? {
        grid: { left: 60, right: 56, top: 40, bottom: 28 }, legend: { top: 0, data: [`${anio}`, `${Number(anio) - 1}`, 'Importe'] },
        tooltip: {
          trigger: 'axis', formatter: ps => {
            const i = ps[0].dataIndex, x = datos[i], prev = mapa[mesesAnt[i]];
            if (!x && !prev) return `${MESES_L[i]}: sin captura`;
            return `<b>${MESES_L[i]} ${anio}</b><br>${x ? `Consumo: ${nfmt(x.consumo)} ${info.u}<br>Importe: ${money(x.importe)}<br>Costo unitario: ${x.unit ? money(x.unit) + '/' + info.u : '—'}<br>` +
              (x.varProm != null ? `Vs. promedio 3 meses: ${x.varProm >= 0 ? '+' : ''}${Math.round(x.varProm * 100)} %` : 'Sin promedio de referencia') +
              (x.anomalia ? `<br><b style="color:${x.anomalia === 'alta' ? '#b81f30' : '#c77700'}">Anomalía ${x.anomalia === 'alta' ? 'por exceso' : 'por consumo bajo (revise lectura)'}</b>` : '') : 'Sin captura en este año'}` +
              (prev ? `<br>${Number(anio) - 1}: ${nfmt(prev.consumo)} ${info.u}` : '');
          }
        },
        xAxis: { type: 'category', data: MESES },
        yAxis: [{ type: 'value', name: info.u, axisLabel: { formatter: v => nfmt(v) } }, { type: 'value', name: 'MXN', splitLine: { show: false }, axisLabel: { formatter: v => '$' + nfmt(v / 1000) + 'k' } }],
        series: [
          { name: `${anio}`, type: 'bar', barMaxWidth: 34, data: datos.map(x => x ? { value: x.consumo, itemStyle: { color: x.anomalia === 'alta' ? '#b81f30' : x.anomalia === 'baja' ? '#c77700' : info.c } } : null),
            markLine: { symbol: 'none', lineStyle: { type: 'dashed', color: '#42566f' }, label: { formatter: p => 'Promedio ' + nfmt(p.value), color: '#42566f', position: 'insideStartTop' }, data: [{ type: 'average' }] } },
          { name: `${Number(anio) - 1}`, type: 'line', symbol: 'circle', symbolSize: 5, lineStyle: { type: 'dotted', width: 2 }, itemStyle: { color: '#7a8ea6' }, data: mesesAnt.map(m => mapa[m] ? mapa[m].consumo : null), connectNulls: true },
          { name: 'Importe', type: 'line', yAxisIndex: 1, symbol: 'none', smooth: true, lineStyle: { width: 2 }, itemStyle: { color: '#0b2a52' }, data: datos.map(x => x ? x.importe : null), connectNulls: true }
        ]
      } : sinDatos());
    });
    $('#csKpis').innerHTML = kp.join('');

    const lista = ST.consumos.filter(c => String(c.periodo).slice(0, 4) === String(anio) && (!med || (c.medidor || 'GENERAL') === med))
      .sort((a, b) => b.periodo.localeCompare(a.periodo) || a.servicio.localeCompare(b.servicio));
    const ser = { AGUA: Object.fromEntries(this.serie('AGUA', med).map(x => [x.periodo, x])), ENERGIA: Object.fromEntries(this.serie('ENERGIA', med).map(x => [x.periodo, x])) };
    const c = can('capture');
    $('#csTabla').innerHTML = lista.length ? `<table class="tbl"><thead><tr><th>Periodo</th><th>Servicio</th><th>Medidor</th><th class="num">Lect. anterior</th><th class="num">Lect. actual</th><th class="num">Consumo</th><th class="num">Importe</th><th class="num">Costo unitario</th><th class="num">Vs. prom. 3 meses</th><th>Recibo</th><th></th></tr></thead><tbody>
      ${lista.map(r => { const x = ser[r.servicio][r.periodo] || {}; const u = SERV[r.servicio].u; return `<tr>
        <td>${periodoTxt(r.periodo)}</td><td>${esc(SERV[r.servicio].l)}</td><td>${esc(r.medidor || 'GENERAL')}</td>
        <td class="num">${r.lecturaAnterior != null && r.lecturaAnterior !== '' ? nfmt(r.lecturaAnterior) : '—'}</td><td class="num">${r.lecturaActual != null && r.lecturaActual !== '' ? nfmt(r.lecturaActual) : '—'}</td>
        <td class="num"><b>${nfmt(r.consumo)} ${u}</b></td><td class="num">${money(r.importe)}</td>
        <td class="num">${Number(r.consumo) ? money(r.importe / r.consumo) : '—'}</td>
        <td class="num ${x.anomalia === 'alta' ? 'txt-rojo' : x.anomalia === 'baja' ? 'txt-ambar' : ''}">${x.varProm != null ? `${x.varProm >= 0 ? '+' : ''}${Math.round(x.varProm * 100)} %${x.anomalia ? ' (anomalía)' : ''}` : '—'}</td>
        <td>${esc(r.recibo || '')}${r.fechaFactura ? `<br><span class="muted">${fFecha(r.fechaFactura)}</span>` : ''}</td>
        <td class="acc">${c ? `<button class="btn btn-sm btn-ghost" data-cs="editar" data-id="${esc(r.id)}">Editar</button>` : ''}</td></tr>`; }).join('')}
      </tbody></table>` : UI.vacio(`Sin capturas de ${anio}. Registre la lectura y el importe del recibo de cada mes.`);
  },

  capturarConsumo(id) {
    const r = id ? ST.consumos.find(x => x.id === id) : null;
    const hoy = new Date(), perDef = ymdLocal(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)).slice(0, 7);
    const medidores = [...new Set(['GENERAL', ...ST.consumos.map(c => c.medidor || 'GENERAL')])];
    const m = UI.modal({
      titulo: r ? 'Editar captura de consumo' : 'Capturar consumo mensual', ancho: '680px',
      cuerpo: `<fieldset class="seg"><legend>Servicio</legend>
          ${Object.keys(SERV).map(k => `<label><input type="radio" name="cSv" value="${k}"${(r ? r.servicio : 'AGUA') === k ? ' checked' : ''}${r ? ' disabled' : ''}> ${SERV[k].l} (${SERV[k].u})</label>`).join('')}</fieldset>
        <div class="fg3">
          <label class="fl"><span>Periodo facturado</span><input type="month" id="cPer" value="${esc(r ? r.periodo : perDef)}"${r ? ' disabled' : ''}></label>
          <label class="fl"><span>Medidor</span><input id="cMed" list="dlMed" value="${esc(r ? r.medidor || 'GENERAL' : 'GENERAL')}"${r ? ' disabled' : ''}></label>
          <label class="fl"><span>Número de recibo</span><input id="cRec" value="${esc(r ? r.recibo || '' : '')}"></label>
          <label class="fl"><span>Lectura anterior</span><input type="number" id="cLA" step="any" value="${r ? r.lecturaAnterior ?? '' : ''}"></label>
          <label class="fl"><span>Lectura actual</span><input type="number" id="cLB" step="any" value="${r ? r.lecturaActual ?? '' : ''}"></label>
          <label class="fl"><span>Consumo (<b id="cU">${SERV[r ? r.servicio : 'AGUA'].u}</b>)</span><input type="number" id="cCon" step="any" min="0" value="${r ? r.consumo ?? '' : ''}"></label>
          <label class="fl"><span>Importe facturado (MXN)</span><input type="number" id="cImp" step="0.01" min="0" value="${r ? r.importe ?? '' : ''}"></label>
          <label class="fl"><span>Fecha de factura</span><input type="date" id="cFF" value="${esc(r ? r.fechaFactura || '' : '')}"></label>
        </div>
        <label class="fl"><span>Observaciones</span><input id="cObs" value="${esc(r ? r.obs || '' : '')}"></label>
        <p class="hint" id="cAviso"></p>
        <datalist id="dlMed">${medidores.map(x => `<option value="${esc(x)}">`).join('')}</datalist>`,
      acciones: [
        ...(r && can('delete') ? [{ texto: 'Eliminar', clase: 'btn-ghost txt-rojo', fn: async () => {
          if (!(await UI.confirmar('¿Eliminar esta captura?', { texto: 'Eliminar', peligro: true }))) return false;
          await DB.eliminar('consumos', r.id); DB.log('BAJA', 'consumos', `${r.servicio} ${r.periodo}`, '');
        } }] : []),
        { texto: 'Cancelar' },
        {
          texto: 'Guardar captura', clase: 'btn-primary', fn: async mm => {
            const sv = mm.q('input[name=cSv]:checked').value, per = mm.q('#cPer').value, med = mayus(mm.q('#cMed').value) || 'GENERAL';
            const la = mm.q('#cLA').value, lb = mm.q('#cLB').value, con = Number(mm.q('#cCon').value);
            if (!per) { UI.toast('Indique el periodo.', 'err'); return false; }
            if (!(con >= 0) || mm.q('#cCon').value === '') { UI.toast('Indique el consumo o las lecturas.', 'err'); return false; }
            if (la !== '' && lb !== '' && Number(lb) < Number(la)) { UI.toast('La lectura actual es menor que la anterior. Verifique el recibo.', 'err'); return false; }
            const dup = ST.consumos.find(x => x.id !== (r && r.id) && x.servicio === sv && x.periodo === per && (x.medidor || 'GENERAL') === med);
            if (dup) { UI.toast(`Ya existe la captura de ${SERV[sv].l.toLowerCase()} de ${periodoTxt(per)} para el medidor ${med}. Edite esa captura.`, 'err'); return false; }
            const d = {
              servicio: sv, periodo: per, medidor: med, recibo: mm.q('#cRec').value.trim(),
              lecturaAnterior: la === '' ? '' : Number(la), lecturaActual: lb === '' ? '' : Number(lb),
              consumo: con, importe: Number(mm.q('#cImp').value) || 0, fechaFactura: mm.q('#cFF').value, obs: mm.q('#cObs').value.trim()
            };
            if (r) { await DB.actualizar('consumos', r.id, d); DB.log('EDICION', 'consumos', `${sv} ${per}`, `${con} ${SERV[sv].u}`); }
            else { await DB.guardar('consumos', d); DB.log('ALTA', 'consumos', `${sv} ${per}`, `${con} ${SERV[sv].u}, ${money(d.importe)}`); }
            UI.toast('Consumo guardado.', 'ok');
          }
        }
      ]
    });
    // Lectura anterior automática y cálculo del consumo
    const prellenar = () => {
      if (r) return;
      const sv = m.q('input[name=cSv]:checked').value, per = m.q('#cPer').value, med = mayus(m.q('#cMed').value) || 'GENERAL';
      m.q('#cU').textContent = SERV[sv].u;
      const prev = ST.consumos.filter(x => x.servicio === sv && (x.medidor || 'GENERAL') === med && x.periodo < per).sort((a, b) => b.periodo.localeCompare(a.periodo))[0];
      if (prev && prev.lecturaActual !== '' && prev.lecturaActual != null) { m.q('#cLA').value = prev.lecturaActual; m.q('#cAviso').textContent = `Lectura anterior tomada de ${periodoTxt(prev.periodo)}.`; }
      else m.q('#cAviso').textContent = '';
      calc();
    };
    const calc = () => {
      const la = m.q('#cLA').value, lb = m.q('#cLB').value;
      if (la !== '' && lb !== '') m.q('#cCon').value = Math.max(0, Number(lb) - Number(la)).toFixed(2).replace(/\.00$/, '');
    };
    $$('input[name=cSv]', m.el).forEach(x => x.onchange = prellenar);
    m.q('#cPer').onchange = prellenar; m.q('#cMed').onchange = prellenar;
    m.q('#cLA').oninput = calc; m.q('#cLB').oninput = calc;
    prellenar();
  }
};

function periodoTxt(p) { if (!p) return '—'; const [y, mo] = String(p).split('-'); return `${MESES[Number(mo) - 1]} ${y}`; }

UI.registrar('indicadores', ModKPI);
