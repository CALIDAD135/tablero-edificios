/* ==========================================================================
   CONTROL DE EDIFICIOS · IES
   js/ui-core.js — Núcleo de la interfaz
   Utilidades, sesión por rol, navegación, modales, buscador inteligente de
   personas, selector dependiente de áreas, captura de fotos y firma digital.
   ========================================================================== */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function norm(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim().replace(/\s+/g, ' ');
}
/* Realtime Database puede devolver listas como objetos {0:…,1:…}; se normalizan a arreglo */
function lista(x) { return Array.isArray(x) ? x.filter(v => v != null) : (x && typeof x === 'object' ? Object.keys(x).sort((a, b) => a - b).map(k => x[k]).filter(v => v != null) : []); }
function mayus(s) { return String(s || '').trim().replace(/\s+/g, ' ').toUpperCase(); }
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function aFecha(v) {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d); }
  const d = new Date(v); return isNaN(d) ? null : d;
}
function fFecha(v) {
  const d = aFecha(v); if (!d) return '—';
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}
function fFechaHora(v) {
  const d = aFecha(v); if (!d) return '—';
  return fFecha(d) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function fDur(ms) {
  if (ms == null || isNaN(ms)) return '—';
  const m = Math.max(0, Math.round(ms / 60000));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mi = m % 60;
  if (d) return `${d} d ${h} h ${mi} min`;
  if (h) return `${h} h ${mi} min`;
  return `${mi} min`;
}
function money(n) {
  return '$' + (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function nfmt(n, dec = 0) { return (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
function localInput(iso) {
  // ISO → valor para <input type="datetime-local">
  const d = aFecha(iso) || new Date();
  const p = x => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function desdeLocalInput(v) { return v ? new Date(v).toISOString() : ''; }
function sumarDias(ymd, dias) {
  const d = aFecha(ymd); if (!d) return '';
  d.setDate(d.getDate() + Number(dias || 0)); return ymdLocal(d);
}
function diasEntre(a, b) { return Math.round((aFecha(b) - aFecha(a)) / 86400000); }

/* ---------- Sesión y permisos ---------- */
let SESION = { rol: null };
function can(p) { return !!(SESION.rol && ROLES[SESION.rol] && ROLES[SESION.rol].permisos.includes(p)); }

/* ---------- Catálogos derivados ---------- */
const OT_ABIERTAS = ['LEVANTADA', 'EN_PROCESO', 'CULMINADA'];
const OT_ESTATUS = {
  LEVANTADA:  { l: 'Levantada',   c: 't-azul' },
  EN_PROCESO: { l: 'En proceso',  c: 't-morado' },
  CULMINADA:  { l: 'Culminada, por entregar', c: 't-ambar' },
  ENTREGADA:  { l: 'Entregada',   c: 't-verde' },
  CANCELADA:  { l: 'Cancelada',   c: 't-gris' }
};
const INC_ESTATUS = {
  ABIERTA:     { l: 'Abierta',     c: 't-ambar' },
  EN_ATENCION: { l: 'En atención', c: 't-morado' },
  RESUELTA:    { l: 'Resuelta',    c: 't-verde' },
  CANCELADA:   { l: 'Cancelada',   c: 't-gris' }
};
const SOL_ESTADOS = {
  NUEVA:       { l: 'Nueva',            c: 't-ambar' },
  EN_REVISION: { l: 'En revisión',      c: 't-azul' },
  EN_ATENCION: { l: 'Orden de trabajo', c: 't-morado' },
  CULMINADA:   { l: 'Culminada',        c: 't-verde' },
  RECHAZADA:   { l: 'Rechazada',        c: 't-gris' }
};
function tag(map, k) { const x = map[k] || { l: k || '—', c: 't-gris' }; return `<span class="tag ${x.c}">${esc(x.l)}</span>`; }
function tagPrioridad(p) {
  const c = { ALTA: 't-rojo', MEDIA: 't-ambar', BAJA: 't-gris' }[p] || 't-gris';
  return `<span class="tag ${c}">${esc((PRIORIDADES[p] || { l: p || '—' }).l)}</span>`;
}
function opciones(lista, sel, vacio) {
  return (vacio != null ? `<option value="">${esc(vacio)}</option>` : '') +
    lista.map(o => {
      const v = typeof o === 'object' ? o.v : o, l = typeof o === 'object' ? o.l : o;
      return `<option value="${esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${esc(l)}</option>`;
    }).join('');
}

/* ---------- Áreas ---------- */
const Areas = {
  porId(id) { return ST.areas.find(a => a.id === id); },
  activas() { return ST.areas.filter(a => a.activa !== false); },
  edificios() {
    const set = [...new Set(this.activas().map(a => a.edificio))];
    return set.sort((a, b) => ordenIdx(EDIFICIOS_ORDEN, a) - ordenIdx(EDIFICIOS_ORDEN, b) || a.localeCompare(b));
  },
  niveles(ed) {
    const set = [...new Set(this.activas().filter(a => !ed || a.edificio === ed).map(a => a.nivel))];
    return set.sort((a, b) => ordenIdx(NIVELES_ORDEN, a) - ordenIdx(NIVELES_ORDEN, b) || a.localeCompare(b));
  },
  oficinas(ed, niv) {
    return this.activas().filter(a => a.edificio === ed && a.nivel === niv).sort((a, b) => (a.item || 999) - (b.item || 999));
  },
  etiqueta(a) { return a ? `${a.edificio} › ${a.nivel} › ${a.oficina}` : '—'; },
  responsable(a) { return a && a.responsableId ? Personas.nombre(a.responsableId) : ''; }
};
function ordenIdx(lista, v) { const i = lista.indexOf(v); return i < 0 ? 999 : i; }

/* Instantánea de ubicación que se copia en cada registro (trazabilidad histórica) */
function ubicacion(areaId) {
  const a = Areas.porId(areaId) || {};
  return { areaId: areaId || '', edificio: a.edificio || '', nivel: a.nivel || '', oficina: a.oficina || '', departamento: a.departamento || '' };
}

/* ---------- SLA de órdenes de trabajo ---------- */
function slaInfo(o) {
  const metaH = Number(o.slaHorasMeta) || (PRIORIDADES[o.prioridad] || PRIORIDADES.MEDIA).h;
  const meta = metaH * 3600000;
  const ini = new Date(o.fechaLevantamiento || o.createdAt).getTime();
  const cerrado = !!o.fechaCulminacion;
  const fin = cerrado ? new Date(o.fechaCulminacion).getTime() : Date.now();
  const transc = Math.max(0, fin - ini);
  const pct = meta ? transc / meta : 0;
  const estado = pct > 1 ? 'excedido' : pct > 0.75 ? 'riesgo' : 'ok';
  return { metaH, meta, transc, pct, cerrado, estado, cumple: cerrado ? transc <= meta : null };
}
function slaHTML(o, compacto) {
  if (o.estatus === 'CANCELADA') return '<span class="muted">—</span>';
  const s = slaInfo(o);
  const w = Math.min(100, Math.round(s.pct * 100));
  const txt = s.cerrado ? (s.cumple ? 'Cumplió' : 'Excedió') : (s.estado === 'excedido' ? 'Excedido' : s.estado === 'riesgo' ? 'En riesgo' : 'En tiempo');
  return `<div class="sla sla-${s.estado}${s.cerrado ? ' sla-fin' : ''}" data-sla-ot="${esc(o.id)}" data-c="${compacto ? 1 : 0}">
    <div class="sla-bar"><i style="width:${w}%"></i></div>
    <div class="sla-txt"><b>${fDur(s.transc)}</b>${compacto ? '' : ` de ${s.metaH} h`} <span>${txt}</span></div></div>`;
}

/* ---------- Estado consolidado por área (tablero) ---------- */
function estadoAreas() {
  const m = {};
  const g = id => (m[id] = m[id] || { inc: 0, ot: 0, sla: 0, mv: 0 });
  ST.incidencias.forEach(i => { if (['ABIERTA', 'EN_ATENCION'].includes(i.estatus) && i.areaId) g(i.areaId).inc++; });
  ST.ordenes.forEach(o => {
    if (OT_ABIERTAS.includes(o.estatus) && o.areaId) {
      const x = g(o.areaId); x.ot++;
      if (!o.fechaCulminacion && slaInfo(o).estado === 'excedido') x.sla++;
    }
  });
  const hoy = ymdLocal(), edifMv = {}; let generalMv = 0;
  ST.mantenimientos.forEach(p => {
    if (p.activo === false) return;
    const px = Mant.proxima(p);
    if (!px || px >= hoy) return;
    if (p.alcance === 'AREA' && p.areaId) g(p.areaId).mv++;
    else if (p.alcance === 'EDIFICIO') edifMv[p.edificio] = (edifMv[p.edificio] || 0) + 1;
    else generalMv++;
  });
  return { m, edifMv, generalMv };
}
function nivelArea(x) {
  if (!x) return 'ok';
  if (x.sla) return 'sla';
  if (x.ot) return 'ot';
  if (x.inc) return 'inc';
  if (x.mv) return 'mv';
  return 'ok';
}

/* ==========================================================================
   UI: navegación, refresco, avisos y ventanas
   ========================================================================== */
const UI = {
  vista: 'tablero',
  vistas: {},
  registrar(id, mod) { this.vistas[id] = mod; },

  ir(id) {
    if (!this.vistas[id]) return;
    if (id === 'bitacora' && !can('bitacora')) return;
    this.vista = id;
    if (Drawer.abierto) Drawer.cerrar();
    $$('.nav-tab').forEach(b => b.setAttribute('aria-selected', b.dataset.v === id ? 'true' : 'false'));
    $$('.vista').forEach(s => s.hidden = s.id !== 'v-' + id);
    try { history.replaceState(null, '', '#' + id); } catch (e) {}
    this.render();
    window.scrollTo({ top: 0 });
  },

  refresh(origen) {
    this.badges();
    if (!SESION.rol) return;
    if (origen === 'conexion') return;
    this.render();
    if (Drawer.abierto && Drawer.rerender) Drawer.rerender();
  },
  render() {
    if (!DB.listo()) { $('#cargando').hidden = false; return; }
    $('#cargando').hidden = true;
    const v = this.vistas[this.vista];
    try { v && v.render(); } catch (e) { console.error('render', this.vista, e); this.toast('Error al mostrar la vista: ' + e.message, 'err'); }
  },

  badges() {
    const sb = $('#syncBadge');
    if (sb) {
      sb.className = 'sync ' + (DB.conectado ? 'sync-on' : 'sync-off');
      sb.textContent = DB.conectado ? 'En línea' : 'Sin conexión';
      sb.title = DB.conectado ? 'Sincronizado en tiempo real con Firebase' : 'Los cambios se guardarán al recuperar la conexión';
    }
    const ls = $('#loginStatus');
    if (ls) ls.textContent = DB.conectado ? 'Conectado a Firebase. Listo.' : 'Conectando con Firebase…';
    const n = {
      incidencias: ST.incidencias.filter(i => i.estatus === 'ABIERTA').length,
      ordenes: ST.ordenes.filter(o => OT_ABIERTAS.includes(o.estatus)).length,
      solicitudes: ST.solicitudes.filter(s => !s.gestion || s.gestion.estado === 'NUEVA').length,
      mantenimientos: ST.mantenimientos.filter(p => p.activo !== false && Mant.proxima(p) && Mant.proxima(p) < ymdLocal()).length
    };
    Object.keys(n).forEach(k => {
      const el = $(`.nav-tab[data-v="${k}"] .cnt`);
      if (el) { el.textContent = n[k] || ''; el.hidden = !n[k]; }
    });
  },

  toast(msg, tipo, ms) {
    const t = document.createElement('div');
    t.className = 'toast' + (tipo === 'err' ? ' toast-err' : tipo === 'ok' ? ' toast-ok' : '');
    t.setAttribute('role', 'status');
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => t.classList.add('out'), ms || 3800);
    setTimeout(() => t.remove(), (ms || 3800) + 400);
  },

  /* Ventana modal apilable. Devuelve { el, cerrar, q } */
  _pila: [],
  modal({ titulo, sub, cuerpo, acciones, ancho, clase, alCerrar }) {
    const ov = document.createElement('div');
    ov.className = 'm-ov' + (clase ? ' ' + clase : '');
    ov.innerHTML = `<div class="m-box" role="dialog" aria-modal="true" aria-label="${esc(titulo)}" style="${ancho ? 'max-width:' + ancho : ''}">
      <div class="m-head"><div><h2>${esc(titulo)}</h2>${sub ? `<div class="m-sub">${sub}</div>` : ''}</div>
      <button type="button" class="btn-ico m-x" aria-label="Cerrar">✕</button></div>
      <div class="m-body">${cuerpo || ''}</div>
      ${acciones && acciones.length ? '<div class="m-foot"></div>' : ''}</div>`;
    document.body.appendChild(ov);
    document.body.classList.add('modal-open');
    const api = {
      el: ov,
      q: s => ov.querySelector(s),
      cerrar: () => {
        if (!ov.isConnected) return;
        ov.remove();
        UI._pila = UI._pila.filter(x => x !== api);
        if (!UI._pila.length) document.body.classList.remove('modal-open');
        Personas.limpiar();
        alCerrar && alCerrar();
      }
    };
    if (acciones) {
      const pie = ov.querySelector('.m-foot');
      acciones.forEach(a => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn ' + (a.clase || '');
        b.textContent = a.texto;
        if (a.id) b.id = a.id;
        b.onclick = async () => {
          if (!a.fn) return api.cerrar();
          b.disabled = true;
          try { const r = await a.fn(api); if (r !== false && a.cierra !== false) api.cerrar(); }
          catch (e) { console.error(e); UI.toast(e.message || String(e), 'err'); }
          finally { b.disabled = false; }
        };
        pie.appendChild(b);
      });
    }
    ov.querySelector('.m-x').onclick = api.cerrar;
    ov.addEventListener('mousedown', e => { if (e.target === ov && !ov.classList.contains('m-fija')) api.cerrar(); });
    this._pila.push(api);
    setTimeout(() => { const f = ov.querySelector('.m-body input:not([type=hidden]):not([disabled]), .m-body select, .m-body textarea'); f && !matchMedia('(pointer:coarse)').matches && f.focus(); }, 30);
    return api;
  },

  confirmar(msg, { texto = 'Confirmar', peligro = false, titulo = 'Confirmación' } = {}) {
    return new Promise(res => {
      let ok = false;
      UI.modal({
        titulo, cuerpo: `<p class="m-msg">${msg}</p>`, ancho: '460px',
        alCerrar: () => res(ok),
        acciones: [{ texto: 'Cancelar' }, { texto, clase: peligro ? 'btn-danger' : 'btn-primary', fn: () => { ok = true; } }]
      });
    });
  },

  pedirTexto(titulo, etiqueta, { requerido = true, valor = '', multilinea = true } = {}) {
    return new Promise(res => {
      let v = null;
      UI.modal({
        titulo, ancho: '520px',
        cuerpo: `<label class="fl"><span>${esc(etiqueta)}</span>${multilinea ? `<textarea id="ptxt" rows="4">${esc(valor)}</textarea>` : `<input id="ptxt" value="${esc(valor)}">`}</label>`,
        alCerrar: () => res(v),
        acciones: [{ texto: 'Cancelar' }, {
          texto: 'Aceptar', clase: 'btn-primary', fn: m => {
            const t = m.q('#ptxt').value.trim();
            if (requerido && !t) { m.q('#ptxt').classList.add('err'); UI.toast('Este dato es obligatorio.', 'err'); return false; }
            v = t;
          }
        }]
      });
    });
  },

  chart(el, opt) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (!el || typeof echarts === 'undefined') return null;
    const c = echarts.getInstanceByDom(el) || echarts.init(el, null, { renderer: 'canvas' });
    c.setOption(Object.assign({
      textStyle: { fontFamily: getComputedStyle(document.body).fontFamily },
      animationDuration: 300
    }, opt), true);
    return c;
  },

  vacio(msg, accion) {
    return `<div class="vacio"><p>${msg}</p>${accion || ''}</div>`;
  }
};

window.addEventListener('resize', () => {
  if (typeof echarts === 'undefined') return;
  $$('.chart').forEach(el => { const c = echarts.getInstanceByDom(el); c && c.resize(); });
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const t = UI._pila[UI._pila.length - 1];
  if (t) { if (!t.el.classList.contains('m-fija')) t.cerrar(); return; }
  if (Reporte.abierto) { Reporte.cerrar(); return; }
  if (Drawer.abierto) Drawer.cerrar();
});

/* Actualiza los contadores de SLA en vivo cada 30 s */
setInterval(() => {
  $$('[data-sla-ot]').forEach(el => {
    const o = ST.ordenes.find(x => x.id === el.dataset.slaOt);
    if (o && !o.fechaCulminacion) el.outerHTML = slaHTML(o, el.dataset.c === '1');
  });
}, 30000);

/* ---------- Panel lateral (detalle de área) ---------- */
const Drawer = {
  abierto: false, rerender: null,
  abrir(titulo, html, rerender) {
    $('#drawerTitulo').textContent = titulo;
    $('#drawerBody').innerHTML = html;
    $('#drawer').classList.add('open');
    $('#drawer').setAttribute('aria-hidden', 'false');
    this.abierto = true; this.rerender = rerender || null;
  },
  pintar(titulo, html) { $('#drawerTitulo').textContent = titulo; $('#drawerBody').innerHTML = html; },
  cerrar() {
    $('#drawer').classList.remove('open');
    $('#drawer').setAttribute('aria-hidden', 'true');
    this.abierto = false; this.rerender = null;
    $$('.tile.sel').forEach(t => t.classList.remove('sel'));
  }
};

/* ==========================================================================
   Directorio de personas: buscador inteligente con autoguardado
   ========================================================================== */
const Personas = {
  _listas: [],
  porId(id) { return ST.directorio.find(p => p.id === id); },
  nombre(id) { const p = this.porId(id); return p ? p.nombre : ''; },
  buscar(q) {
    const n = norm(q);
    const r = ST.directorio.filter(p => !n || norm(p.nombre).includes(n));
    return r.sort((a, b) => (norm(a.nombre).startsWith(n) ? 0 : 1) - (norm(b.nombre).startsWith(n) ? 0 : 1) || a.nombre.localeCompare(b.nombre)).slice(0, 8);
  },

  /* Marcado del campo: input + botón para editar la ficha de la persona */
  campo(id, valor, personaId, ph) {
    return `<div class="picker"><input id="${id}" autocomplete="off" value="${esc(valor || '')}" data-id="${esc(personaId || '')}" placeholder="${esc(ph || 'Escriba para buscar o agregar')}">
      <button type="button" class="btn-ico" data-ficha="${id}" title="Editar ficha en el directorio" aria-label="Editar ficha">✎</button></div>`;
  },

  /* Activa el buscador sobre un input. opts.flag: 'esResponsable' | 'esSolicitante'; opts.alElegir(p) */
  activar(input, opts = {}) {
    if (!input) return;
    const lista = document.createElement('div');
    lista.className = 'ta-list'; lista.setAttribute('role', 'listbox');
    document.body.appendChild(lista);
    this._listas.push({ input, lista });
    let items = [], idx = -1;
    const pos = () => {
      const r = input.getBoundingClientRect();
      lista.style.left = r.left + 'px'; lista.style.top = (r.bottom + 4) + 'px'; lista.style.width = Math.max(r.width, 260) + 'px';
    };
    const pintar = () => {
      const q = input.value, n = norm(q);
      items = Personas.buscar(q);
      const exacto = ST.directorio.some(p => norm(p.nombre) === n);
      let h = items.map((p, i) => `<div class="ta-opt${i === idx ? ' on' : ''}" data-i="${i}" role="option"><b>${esc(p.nombre)}</b><small>${esc([p.puesto, p.departamento, p.correo].filter(Boolean).join(', ') || 'Sin datos de contacto')}</small></div>`).join('');
      if (n && !exacto) h += `<div class="ta-opt ta-new${idx === items.length ? ' on' : ''}" data-i="new" role="option">Nuevo: «${esc(mayus(q))}» se guardará en el directorio</div>`;
      if (!h) { lista.classList.remove('open'); return; }
      lista.innerHTML = h; pos(); lista.classList.add('open');
    };
    const elegir = i => {
      if (i === 'new') { input.value = mayus(input.value); input.dataset.id = ''; }
      else { const p = items[i]; if (!p) return; input.value = p.nombre; input.dataset.id = p.id; opts.alElegir && opts.alElegir(p); }
      lista.classList.remove('open');
    };
    input.addEventListener('input', () => { input.dataset.id = ''; idx = -1; pintar(); });
    input.addEventListener('focus', () => { idx = -1; pintar(); });
    input.addEventListener('blur', () => setTimeout(() => lista.classList.remove('open'), 160));
    input.addEventListener('keydown', e => {
      if (!lista.classList.contains('open')) return;
      const max = lista.querySelectorAll('.ta-opt').length - 1;
      if (e.key === 'ArrowDown') { idx = Math.min(max, idx + 1); pintar(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { idx = Math.max(0, idx - 1); pintar(); e.preventDefault(); }
      else if (e.key === 'Enter' && idx >= 0) { elegir(idx >= items.length ? 'new' : idx); e.preventDefault(); }
      else if (e.key === 'Escape') { lista.classList.remove('open'); e.stopPropagation(); }
    });
    lista.addEventListener('mousedown', e => { const o = e.target.closest('.ta-opt'); if (!o) return; e.preventDefault(); elegir(o.dataset.i === 'new' ? 'new' : Number(o.dataset.i)); });
    const btn = document.querySelector(`[data-ficha="${input.id}"]`);
    if (btn) btn.onclick = () => {
      const p = (input.dataset.id && Personas.porId(input.dataset.id)) || ST.directorio.find(x => norm(x.nombre) === norm(input.value));
      if (!p) { UI.toast('Elija un nombre del directorio para editar su ficha. Los nombres nuevos se registran al guardar.'); return; }
      Personas.editar(p.id, np => { input.value = np.nombre; input.dataset.id = np.id; });
    };
  },
  limpiar() {
    this._listas = this._listas.filter(x => { if (!document.body.contains(x.input)) { x.lista.remove(); return false; } return true; });
  },

  /* Devuelve la persona del input; si el nombre no existe lo autoguarda */
  async resolver(input, flag, extra = {}) {
    const nombre = mayus(input && input.value);
    if (!nombre) return null;
    let p = (input.dataset.id && this.porId(input.dataset.id)) || null;
    if (!p || norm(p.nombre) !== norm(nombre)) p = ST.directorio.find(x => norm(x.nombre) === norm(nombre)) || null;
    if (p) {
      const cambios = {};
      if (flag && !p[flag]) cambios[flag] = true;
      if (extra.correo && !p.correo) cambios.correo = extra.correo;
      if (extra.telefono && !p.telefono) cambios.telefono = extra.telefono;
      if (Object.keys(cambios).length) await DB.actualizar('directorio', p.id, cambios);
      return p;
    }
    const nuevo = { nombre, puesto: '', departamento: extra.departamento || '', correo: extra.correo || '', telefono: extra.telefono || '' };
    if (flag) nuevo[flag] = true;
    const id = await DB.guardar('directorio', nuevo);
    DB.log('ALTA', 'directorio', nombre, 'Autoguardado desde captura');
    UI.toast(`${nombre} se agregó al directorio.`, 'ok');
    return Object.assign({ id }, nuevo);
  },

  editar(id, alGuardar) {
    const p = this.porId(id); if (!p) return;
    UI.modal({
      titulo: 'Ficha del directorio', sub: 'Los cambios se reflejan en todas las áreas y registros que la usan.', ancho: '560px',
      cuerpo: `<div class="fg2">
        <label class="fl full"><span>Nombre completo</span><input id="pNom" value="${esc(p.nombre)}"></label>
        <label class="fl"><span>Puesto</span><input id="pPue" value="${esc(p.puesto || '')}"></label>
        <label class="fl"><span>Departamento</span><select id="pDep">${opciones(DEPARTAMENTOS, p.departamento, 'Sin departamento')}</select></label>
        <label class="fl"><span>Correo</span><input id="pCor" type="email" value="${esc(p.correo || '')}"></label>
        <label class="fl"><span>Teléfono</span><input id="pTel" inputmode="tel" value="${esc(p.telefono || '')}"></label>
      </div>`,
      acciones: [{ texto: 'Cancelar' }, {
        texto: 'Guardar ficha', clase: 'btn-primary', fn: async m => {
          const nombre = mayus(m.q('#pNom').value);
          if (!nombre) { UI.toast('El nombre es obligatorio.', 'err'); return false; }
          const dup = ST.directorio.find(x => x.id !== id && norm(x.nombre) === norm(nombre));
          if (dup) { UI.toast('Ya existe otra ficha con ese nombre.', 'err'); return false; }
          const c = { nombre, puesto: m.q('#pPue').value.trim(), departamento: m.q('#pDep').value, correo: m.q('#pCor').value.trim(), telefono: m.q('#pTel').value.trim() };
          await DB.actualizar('directorio', id, c);
          DB.log('EDICION', 'directorio', nombre, p.nombre !== nombre ? `Antes: ${p.nombre}` : 'Datos de contacto');
          UI.toast('Ficha actualizada.', 'ok');
          alGuardar && alGuardar(Object.assign({}, p, c));
        }
      }]
    });
  }
};

/* ==========================================================================
   Selector dependiente Edificio → Nivel/Planta → Oficina
   ========================================================================== */
const AreaPicker = {
  html(pref, { opcional = false, etiquetas = true } = {}) {
    const l = t => etiquetas ? `<span>${t}</span>` : '';
    return `<div class="fg3 area-picker" data-pref="${pref}">
      <label class="fl">${l('Edificio')}<select id="${pref}Ed"></select></label>
      <label class="fl">${l('Nivel o planta')}<select id="${pref}Niv"></select></label>
      <label class="fl">${l('Oficina o área')}<select id="${pref}Of"></select></label>
    </div>`;
  },
  init(pref, areaId, { opcional = false, alCambiar } = {}) {
    const ed = $('#' + pref + 'Ed'), nv = $('#' + pref + 'Niv'), of = $('#' + pref + 'Of');
    const a = Areas.porId(areaId);
    const llenarEd = v => { ed.innerHTML = opciones(Areas.edificios(), v, opcional ? 'Sin área específica' : 'Seleccione'); };
    const llenarNv = v => { nv.innerHTML = opciones(ed.value ? Areas.niveles(ed.value) : [], v, ed.value ? 'Seleccione' : '—'); nv.disabled = !ed.value; };
    const llenarOf = v => {
      of.innerHTML = opciones(ed.value && nv.value ? Areas.oficinas(ed.value, nv.value).map(x => ({ v: x.id, l: x.oficina })) : [], v, nv.value ? 'Seleccione' : '—');
      of.disabled = !nv.value;
    };
    llenarEd(a ? a.edificio : '');
    llenarNv(a ? a.nivel : '');
    llenarOf(a ? a.id : '');
    ed.onchange = () => { llenarNv(''); llenarOf(''); alCambiar && alCambiar(''); };
    nv.onchange = () => { llenarOf(''); alCambiar && alCambiar(''); };
    of.onchange = () => alCambiar && alCambiar(of.value);
  },
  valor(pref) { const o = $('#' + pref + 'Of'); return o ? o.value : ''; },
  edificio(pref) { const o = $('#' + pref + 'Ed'); return o ? o.value : ''; }
};

/* ==========================================================================
   Fotografías: captura con cámara o galería y compresión antes de guardar
   ========================================================================== */
function comprimirImagen(file, max = 1280, calidad = 0.62) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(new Error('No se pudo leer la imagen.'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => rej(new Error('Formato de imagen no compatible.'));
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', calidad));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

/* Ranura de foto: botón Cámara + botón Galería (inputs híbridos) */
function ranuraFoto(clave, etiqueta, dataUrl, editable) {
  return `<div class="foto" data-clave="${clave}">
    <div class="foto-vista">${dataUrl ? `<img src="${dataUrl}" alt="${esc(etiqueta)}" data-zoom>` : `<span>${esc(etiqueta)}</span>`}</div>
    ${editable ? `<div class="foto-acc">
      <label class="btn btn-sm">Cámara<input type="file" accept="image/*" capture="environment" data-foto="${clave}" hidden></label>
      <label class="btn btn-sm">Galería<input type="file" accept="image/*" data-foto="${clave}" hidden></label>
      ${dataUrl ? `<button type="button" class="btn btn-sm btn-ghost" data-quitar-foto="${clave}">Quitar</button>` : ''}
    </div>` : ''}
  </div>`;
}

function verImagen(src, titulo) {
  const lb = $('#lightbox');
  lb.querySelector('img').src = src;
  lb.querySelector('.lb-cap').textContent = titulo || '';
  lb.classList.add('open');
}
document.addEventListener('click', e => {
  const z = e.target.closest('[data-zoom]');
  if (z) verImagen(z.src, z.alt);
});

/* ==========================================================================
   Firma digital en canvas (táctil y con mouse)
   ========================================================================== */
function padFirma(canvas) {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0a1f3d'; ctx.lineWidth = 2.4 * dpr;
  let dibujando = false, vacio = true, last = null;
  let bx = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const pt = e => { const b = canvas.getBoundingClientRect(); return { x: (e.clientX - b.left) * dpr, y: (e.clientY - b.top) * dpr }; };
  const marca = p => { bx.x0 = Math.min(bx.x0, p.x); bx.y0 = Math.min(bx.y0, p.y); bx.x1 = Math.max(bx.x1, p.x); bx.y1 = Math.max(bx.y1, p.y); };
  canvas.addEventListener('pointerdown', e => {
    e.preventDefault(); canvas.setPointerCapture(e.pointerId);
    dibujando = true; last = pt(e); marca(last);
    ctx.beginPath(); ctx.arc(last.x, last.y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
    vacio = false;
  });
  canvas.addEventListener('pointermove', e => {
    if (!dibujando) return;
    const p = pt(e); marca(p);
    ctx.beginPath(); ctx.moveTo(last.x, last.y);
    const mx = (last.x + p.x) / 2, my = (last.y + p.y) / 2;
    ctx.quadraticCurveTo(last.x, last.y, mx, my); ctx.lineTo(p.x, p.y); ctx.stroke();
    last = p;
  });
  const fin = () => { dibujando = false; };
  canvas.addEventListener('pointerup', fin); canvas.addEventListener('pointercancel', fin);
  return {
    vacio: () => vacio,
    limpiar() { ctx.clearRect(0, 0, canvas.width, canvas.height); vacio = true; bx = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }; },
    exportar() {
      // Recorta al trazo con margen y normaliza a 600 px de ancho máximo (PNG transparente)
      const pad = 14 * dpr;
      const x = Math.max(0, bx.x0 - pad), y = Math.max(0, bx.y0 - pad);
      const w = Math.min(canvas.width, bx.x1 + pad) - x, h = Math.min(canvas.height, bx.y1 + pad) - y;
      const k = Math.min(1, 600 / w);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
      c.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, c.width, c.height);
      return c.toDataURL('image/png');
    }
  };
}

const Firma = {
  /* opts: { titulo, nombre, nombres (lista para select), etiquetaNombre, alGuardar(dataUrl, nombre) } */
  capturar(opts) {
    const usaLista = Array.isArray(opts.nombres) && opts.nombres.length;
    const m = UI.modal({
      titulo: opts.titulo || 'Firma digital', clase: 'm-firma m-fija', ancho: '720px',
      sub: 'Firme dentro del recuadro con el dedo, lápiz óptico o mouse.',
      cuerpo: `<label class="fl"><span>${esc(opts.etiquetaNombre || 'Nombre de quien firma')}</span>
        ${usaLista ? `<select id="fNom">${opciones(opts.nombres, opts.nombre, 'Seleccione')}</select>` : `<input id="fNom" value="${esc(opts.nombre || '')}">`}</label>
        <div class="pad-wrap"><canvas id="fPad" class="pad" aria-label="Área de firma"></canvas><div class="pad-linea">Firma</div></div>`,
      acciones: [
        { texto: 'Limpiar', clase: 'btn-ghost', cierra: false, fn: () => { pad.limpiar(); return false; } },
        { texto: 'Cancelar' },
        {
          texto: 'Guardar firma', clase: 'btn-primary', fn: async mm => {
            const nombre = mayus(mm.q('#fNom').value);
            if (!nombre) { UI.toast('Indique el nombre de quien firma.', 'err'); return false; }
            if (pad.vacio()) { UI.toast('La firma está vacía.', 'err'); return false; }
            await opts.alGuardar(pad.exportar(), nombre);
          }
        }
      ]
    });
    const pad = padFirma(m.q('#fPad'));
  }
};

/* ==========================================================================
   Exportación general a Excel (respaldo de todos los nodos)
   ========================================================================== */
function exportarExcel() {
  if (typeof XLSX === 'undefined') { UI.toast('La librería de Excel no se cargó; revise su conexión.', 'err'); return; }
  const wb = XLSX.utils.book_new();
  const hoja = (nombre, filas) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas.length ? filas : [{ Sin: 'registros' }]), nombre);
  hoja('Áreas', Areas.activas().sort((a, b) => (a.item || 999) - (b.item || 999)).map(a => ({
    Item: a.item || '', Edificio: a.edificio, Nivel: a.nivel, Oficina: a.oficina, Departamento: a.departamento || '',
    Responsable: Areas.responsable(a), Notas: a.notas || ''
  })));
  hoja('Directorio', ST.directorio.map(p => ({ Nombre: p.nombre, Puesto: p.puesto || '', Departamento: p.departamento || '', Correo: p.correo || '', Teléfono: p.telefono || '', Responsable: p.esResponsable ? 'Sí' : '', Solicitante: p.esSolicitante ? 'Sí' : '' })));
  hoja('Incidencias', ST.incidencias.map(i => ({
    Folio: i.folio, Fecha: fFechaHora(i.fechaReporte), Edificio: i.edificio, Nivel: i.nivel, Oficina: i.oficina, Categoría: i.categoria,
    Prioridad: (PRIORIDADES[i.prioridad] || {}).l || '', Solicitante: i.solicitanteNombre || '', Descripción: i.descripcion,
    Estatus: (INC_ESTATUS[i.estatus] || {}).l || i.estatus, OT: i.otFolio || '', Cierre: fFechaHora(i.fechaCierre)
  })));
  hoja('Órdenes de trabajo', ST.ordenes.map(o => {
    const s = slaInfo(o);
    return {
      Folio: o.folio, Origen: o.origen ? `${o.origen.tipo} ${o.origen.folio || ''}` : 'LEVANTAMIENTO', Edificio: o.edificio, Nivel: o.nivel, Oficina: o.oficina,
      Departamento: o.departamento || '', Categoría: o.categoria, Prioridad: (PRIORIDADES[o.prioridad] || {}).l || '', Solicitante: o.solicitanteNombre || '',
      'Fecha solicitud': fFechaHora(o.fechaSolicitud), Levantamiento: fFechaHora(o.fechaLevantamiento), Inicio: fFechaHora(o.fechaInicio),
      Culminación: fFechaHora(o.fechaCulminacion), Entrega: fFechaHora(o.fechaEntrega), 'Tiempo de atención (h)': +(s.transc / 3600000).toFixed(2),
      'Meta SLA (h)': s.metaH, 'Cumple SLA': s.cerrado ? (s.cumple ? 'Sí' : 'No') : 'En curso', Estatus: (OT_ESTATUS[o.estatus] || {}).l || o.estatus,
      Ejecutor: o.ejecutor || '', 'Costo materiales': OT.costos(o).materiales, 'Mano de obra': OT.costos(o).manoObra, 'Costo total': OT.costos(o).total,
      Entrega_firma: o.entregaNombre || '', Recibe_firma: o.recibeNombre || ''
    };
  }));
  hoja('Mantenimientos', ST.mantenimientos.map(p => ({
    Rubro: p.rubro, Tipo: p.tipo, Actividad: p.descripcion, Alcance: Mant.alcanceTxt(p), Periodicidad: Mant.periodicidadTxt(p.periodicidadDias),
    'Próxima fecha': fFecha(Mant.proxima(p)), Proveedor: p.proveedor || '', 'Costo estimado': Number(p.costoEstimado) || 0,
    Ejecuciones: Object.keys(p.ejecuciones || {}).length, Activo: p.activo === false ? 'No' : 'Sí'
  })));
  hoja('Ejecuciones', ST.mantenimientos.flatMap(p => Object.values(p.ejecuciones || {}).map(e => ({
    Rubro: p.rubro, Actividad: p.descripcion, Fecha: fFecha(e.fecha), Costo: Number(e.costo) || 0, Proveedor: e.proveedor || '', OT: e.otFolio || '', Observaciones: e.obs || ''
  }))));
  hoja('Consumos', ST.consumos.map(c => ({
    Servicio: c.servicio === 'AGUA' ? 'Agua (m³)' : 'Energía (kWh)', Periodo: c.periodo, Medidor: c.medidor || '', 'Lectura anterior': c.lecturaAnterior ?? '',
    'Lectura actual': c.lecturaActual ?? '', Consumo: Number(c.consumo) || 0, Importe: Number(c.importe) || 0, 'Fecha factura': fFecha(c.fechaFactura), Recibo: c.recibo || ''
  })));
  hoja('Solicitudes', ST.solicitudes.map(s => ({
    Folio: s.folio, Fecha: fFechaHora(s.tsCliente), Solicitante: s.solicitante, Correo: s.correo, Teléfono: s.telefono, Edificio: s.edificio, Nivel: s.nivel,
    Oficina: s.oficina, Categoría: s.categoria || '', Descripción: s.descripcion, Estado: (SOL_ESTADOS[(s.gestion || {}).estado || 'NUEVA'] || {}).l, OT: (s.gestion || {}).otFolio || ''
  })));
  hoja('Tareas PHVA', ST.tareas.map(t => ({ Título: t.titulo, Fase: (FASES_PHVA.find(f => f.k === t.fase) || {}).l || t.fase, Cuadrilla: t.cuadrilla || '', Compromiso: fFecha(t.fecha), Vínculo: t.vinculo || '', Cerrada: t.archivada ? fFecha(t.fechaCierre) : '' })));
  if (can('bitacora')) hoja('Bitácora', ST.bitacora.map(b => ({ Fecha: fFechaHora(b.ts), Rol: b.rol, Acción: b.accion, Entidad: b.entidad, Referencia: b.ref, Detalle: b.detalle })));
  const d = new Date();
  XLSX.writeFile(wb, `Control_Edificios_IES_${ymdLocal(d).replace(/-/g, '')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}.xlsx`);
  DB.log('EXPORTACION', 'excel', 'general', '');
}
