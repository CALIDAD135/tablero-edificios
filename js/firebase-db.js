/* ==========================================================================
   CONTROL DE EDIFICIOS · IES
   js/firebase-db.js — Capa de datos (Firebase Realtime Database, SDK compat 10.13)
   --------------------------------------------------------------------------
   Estructura de nodos:
     tableros/edificios/
        areas/{AR01…}          edificios_oficinas (63 áreas base + nuevas)
        directorio/{id}        directorio_responsables (responsables y solicitantes)
        incidencias/{id}       reportes por categoría
        tareas/{id}            Kanban PHVA de cuadrillas
        mantenimientos/{id}    mantenimientos_programados (+ ejecuciones)
        tecnicos/{id}          operadores técnicos (nombre, teléfono, PIN, activo) — Fase 2
        ordenes/{id}           ordenes_trabajo (SLA, materiales, firmas)
        consumos/{id}          consumos_servicios (agua m³ / energía kWh)
        contadores/…           consecutivos atómicos de folios
        bitacora/{id}          trazabilidad de cambios
        meta                   versión y semillado
     tableros/edificios_media/{otId}    firmas y fotos (bajo demanda)
     tableros/edificios_publico/
        catalogo/{areaId}      edificio/nivel/oficina para el formulario público
        solicitudes/{folio}    tickets del formulario (+ gestion)
        contadores/…           consecutivo SOL-
   ========================================================================== */

const ST = {
  areas: [], directorio: [], incidencias: [], tareas: [], mantenimientos: [], tecnicos: [],
  ordenes: [], consumos: [], bitacora: [], solicitudes: [], meta: {},
  cargado: {}
};

const NODOS_LISTA = ['areas', 'directorio', 'incidencias', 'tareas', 'mantenimientos', 'ordenes', 'consumos', 'tecnicos'];

/* ---------- Utilidades de identidad y fecha (compartidas) ---------- */
function uid() {
  // Prefijo de tiempo en base36 (longitud fija) → el orden por clave coincide con el orden cronológico
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function nowISO() { return new Date().toISOString(); }
function ymdLocal(d) {
  d = d ? new Date(d) : new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function conTiempoLimite(promesa, ms) {
  return Promise.race([promesa, new Promise((_, rej) => setTimeout(() => rej(new Error('tiempo de espera agotado')), ms))]);
}

const DB = {
  app: null,
  db: null,
  conectado: false,
  alCambiar: null,          // callback de refresco de la interfaz
  _t: null,

  init(alCambiar) {
    this.alCambiar = alCambiar;
    this.app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
    this.db = firebase.database();

    this.db.ref('.info/connected').on('value', s => {
      this.conectado = !!s.val();
      this._avisar('conexion');
    });

    NODOS_LISTA.forEach(n => {
      this.db.ref(`${FB.root}/${n}`).on('value', snap => {
        const v = snap.val() || {};
        ST[n] = Object.keys(v).map(k => Object.assign({ id: k }, v[k]));
        ST.cargado[n] = true;
        this._avisar(n);
      }, err => this._error(n, err));
    });

    this.db.ref(`${FB.root}/meta`).on('value', s => { ST.meta = s.val() || {}; ST.cargado.meta = true; this._avisar('meta'); },
      err => this._error('meta', err));

    this.db.ref(`${FB.root}/bitacora`).orderByKey().limitToLast(500).on('value', s => {
      const v = s.val() || {};
      ST.bitacora = Object.keys(v).map(k => Object.assign({ id: k }, v[k])).reverse();
      ST.cargado.bitacora = true;
      this._avisar('bitacora');
    }, err => this._error('bitacora', err));

    this.db.ref(`${FB.publico}/solicitudes`).orderByKey().limitToLast(1500).on('value', s => {
      const v = s.val() || {};
      ST.solicitudes = Object.keys(v).map(k => Object.assign({ folio: k }, v[k]));
      ST.cargado.solicitudes = true;
      this._avisar('solicitudes');
    }, err => this._error('solicitudes', err));
  },

  _avisar(origen) {
    clearTimeout(this._t);
    this._t = setTimeout(() => this.alCambiar && this.alCambiar(origen), 60);
  },
  _error(nodo, err) {
    console.error('Firebase', nodo, err);
    if (typeof UI !== 'undefined') UI.toast(`Sin permiso de lectura en "${nodo}": revise las reglas de Firebase (${err.code || err.message}).`, 'err', 8000);
  },

  listo() { return NODOS_LISTA.every(n => ST.cargado[n]) && ST.cargado.meta; },

  /* ---------- Escrituras ---------- */
  ruta(nodo, id) { return `${FB.root}/${nodo}${id ? '/' + id : ''}`; },
  guardar(nodo, obj) {
    obj.updatedAt = nowISO();
    if (!obj.createdAt) obj.createdAt = obj.updatedAt;
    const id = obj.id || uid();
    obj.id = id;
    return this.db.ref(this.ruta(nodo, id)).set(limpiarUndefined(obj)).then(() => id);
  },
  actualizar(nodo, id, campos) {
    campos.updatedAt = nowISO();
    return this.db.ref(this.ruta(nodo, id)).update(limpiarUndefined(campos));
  },
  eliminar(nodo, id) { return this.db.ref(this.ruta(nodo, id)).remove(); },
  multi(mapa) { return this.db.ref().update(limpiarUndefined(mapa)); },

  /* ---------- Folios consecutivos irrepetibles ----------
     Consecutivo diario por prefijo, reservado con transacción atómica:
     OT-20261007-001, INC-20261007-002 … Si no hay conexión en 8 s se emite
     un folio provisional con marca de tiempo (nunca colisiona). */
  async reservarFolio(prefijo, base) {
    const dia = ymdLocal().replace(/-/g, '');
    const ref = this.db.ref(`${base || FB.root}/contadores/${prefijo}/${dia}`);
    try {
      const r = await conTiempoLimite(ref.transaction(n => (Number(n) || 0) + 1), 8000);
      if (r && r.committed) return `${prefijo}-${dia}-${String(r.snapshot.val()).padStart(3, '0')}`;
    } catch (e) { console.warn('reservarFolio', e); }
    return `${prefijo}-${dia}-T${Date.now().toString(36).slice(-5).toUpperCase()}`;
  },

  /* ---------- Bitácora (trazabilidad ISO 9001:2015, 7.5.3) ---------- */
  log(accion, entidad, ref, detalle) {
    const id = uid();
    const e = {
      ts: nowISO(), accion, entidad: entidad || '—', ref: ref || '—',
      detalle: detalle ? String(detalle).slice(0, 300) : '',
      rol: (typeof SESION !== 'undefined' && SESION.rol) || 'publico',
      usuario: (typeof SESION !== 'undefined' && SESION.nombre) || ''
    };
    return this.db.ref(`${FB.root}/bitacora/${id}`).set(e).catch(err => console.warn('bitácora', err));
  },

  /* ---------- Multimedia (firmas y fotos) bajo demanda ---------- */
  _media: {},
  async media(otId, forzar) {
    if (this._media[otId] && !forzar) return this._media[otId];
    const s = await this.db.ref(`${FB.media}/${otId}`).get();
    this._media[otId] = s.val() || {};
    return this._media[otId];
  },
  async guardarMedia(otId, clave, dataUrl) {
    await this.db.ref(`${FB.media}/${otId}/${clave}`).set(dataUrl || null);
    if (!this._media[otId]) this._media[otId] = {};
    if (dataUrl) this._media[otId][clave] = dataUrl; else delete this._media[otId][clave];
  },
  eliminarMedia(otId) { delete this._media[otId]; return this.db.ref(`${FB.media}/${otId}`).remove(); },
  /* Lectura directa del servidor, sin caché (respaldo ZIP) */
  async mediaServidor(id) { const s = await this.db.ref(`${FB.media}/${id}`).get(); return s.val() || {}; },
  limpiarCache() { this._media = {}; },

  /* ---------- Solicitudes públicas ---------- */
  gestionSolicitud(folio, campos) {
    campos.actualizado = nowISO();
    campos.por = (typeof SESION !== 'undefined' && (SESION.nombre || SESION.rol)) || '';
    return this.db.ref(`${FB.publico}/solicitudes/${folio}/gestion`).update(limpiarUndefined(campos));
  },

  /* Catálogo espejo para el formulario público (solo edificio, nivel y oficina) */
  publicarCatalogo() {
    const cat = {};
    ST.areas.filter(a => a.activa !== false).forEach(a => { cat[a.id] = { e: a.edificio, n: a.nivel, o: a.oficina }; });
    return this.db.ref(`${FB.publico}/catalogo`).set(cat);
  },

  /* ---------- Semilla de las 63 áreas ---------- */
  async sembrarAreas() {
    const t = nowISO();
    const mapa = {};
    SEED_AREAS.forEach(([item, edificio, nivel, oficina, depto]) => {
      const id = areaIdDeItem(item);
      mapa[`${FB.root}/areas/${id}`] = {
        item, edificio, nivel, oficina, departamento: depto,
        responsableId: '', notas: '', activa: true, createdAt: t, updatedAt: t
      };
    });
    mapa[`${FB.root}/meta`] = { version: APP.version, sembrado: t, areasBase: SEED_AREAS.length };
    await this.db.ref().update(mapa);
    await this.log('SEMILLA', 'areas', '63 áreas', 'Carga inicial desde EDIFICIOS_IES.pdf');
  }
};

/* Firebase rechaza valores undefined: se eliminan antes de escribir */
function limpiarUndefined(o) {
  if (Array.isArray(o)) return o.map(limpiarUndefined);
  if (o && typeof o === 'object') {
    const r = {};
    Object.keys(o).forEach(k => { if (o[k] !== undefined) r[k] = limpiarUndefined(o[k]); });
    return r;
  }
  return o;
}
