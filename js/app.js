/* ==========================================================================
   CONTROL DE EDIFICIOS · IES
   js/app.js — Arranque: sesión por rol, navegación y eventos generales
   Fase 2: el Operador técnico entra con su PIN personal y solo ve «Mis órdenes».
   ========================================================================== */
(function () {
  const SKEY = 'edificios_sesion';
  $('#loginLogo').src = LOGO_IES;
  $('#topLogo').src = LOGO_IES;

  function aplicarRol() {
    const tec = esTecnico();
    document.body.classList.toggle('modo-tecnico', tec);
    $('#rolBadge').textContent = tec ? `Técnico: ${SESION.nombre}` : ROLES[SESION.rol].label;
    $$('.nav-tab').forEach(b => {
      const v = b.dataset.v;
      b.hidden = tec ? v !== 'misordenes' : (v === 'misordenes' || (v === 'bitacora' && !can('bitacora')));
    });
    $('#fab').classList.toggle('activo', can('capture'));
    if (tec) UI.ir('misordenes');
    else if (UI.vista === 'misordenes' || (UI.vista === 'bitacora' && !can('bitacora'))) UI.ir('tablero');
  }
  function iniciarSesion(rol, tecnico) {
    SESION.rol = rol;
    SESION.tecnicoId = tecnico ? tecnico.id : '';
    SESION.nombre = tecnico ? tecnico.nombre : '';
    try { sessionStorage.setItem(SKEY, JSON.stringify({ rol, tecnicoId: SESION.tecnicoId, nombre: SESION.nombre, ts: nowISO() })); } catch (e) {}
    $('#login').hidden = true;
    aplicarRol();
    DB.log('LOGIN', 'sesion', tecnico ? tecnico.nombre : ROLES[rol].label, '');
    UI.refresh('login');
  }
  function cerrarSesion() {
    if (SESION.rol) DB.log('LOGOUT', 'sesion', SESION.nombre || ROLES[SESION.rol].label, '');
    SESION.rol = null; SESION.tecnicoId = ''; SESION.nombre = '';
    try { sessionStorage.removeItem(SKEY); } catch (e) {}
    Drawer.cerrar(); Reporte.cerrar();
    UI._pila.slice().forEach(m => m.cerrar());
    document.body.classList.remove('modo-tecnico');
    $('#login').hidden = false; $('#loginCodigo').value = ''; $('#loginErr').textContent = '';
    $$('.rol').forEach(b => b.setAttribute('aria-pressed', 'false'));
  }
  window.App = { cerrarSesion };

  // Acceso
  let rolSel = null;
  $$('.rol').forEach(b => b.onclick = () => {
    rolSel = b.dataset.rol;
    $$('.rol').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    $('#loginErr').textContent = '';
    $('#loginCodigo').placeholder = rolSel === 'tecnico' ? 'PIN personal de técnico' : 'Código del rol';
    $('#loginCodigo').focus();
  });
  $('#loginBtn').onclick = () => {
    if (!rolSel) { $('#loginErr').textContent = 'Seleccione su rol.'; return; }
    const codigo = $('#loginCodigo').value.trim();
    if (rolSel === 'tecnico') {
      if (!ST.cargado.tecnicos) { $('#loginErr').textContent = 'Cargando la lista de técnicos; intente de nuevo en unos segundos.'; return; }
      const t = ST.tecnicos.find(x => String(x.pin) === codigo && x.activo !== false);
      if (!t) { $('#loginErr').textContent = 'PIN incorrecto o técnico inactivo.'; return; }
      iniciarSesion('tecnico', t);
      return;
    }
    if (codigo !== AUTH_CODES[rolSel]) { $('#loginErr').textContent = 'Código incorrecto para el rol seleccionado.'; return; }
    iniciarSesion(rolSel, null);
  };
  $('#loginCodigo').addEventListener('keydown', e => { if (e.key === 'Enter') $('#loginBtn').click(); });
  $('#btnSalir').onclick = cerrarSesion;

  // Navegación
  $$('.nav-tab').forEach(b => b.onclick = () => UI.ir(b.dataset.v));
  $('#btnExcel').onclick = exportarExcel;
  $('#drawerCerrar').onclick = () => Drawer.cerrar();
  $('#rpCerrar').onclick = () => Reporte.cerrar();
  $('#rpPdf').onclick = () => Reporte.pdf();
  $('#rpImprimir').onclick = () => Reporte.imprimir();
  $('#lbCerrar').onclick = () => $('#lightbox').classList.remove('open');
  $('#lightbox').addEventListener('click', e => { if (e.target.id === 'lightbox') $('#lightbox').classList.remove('open'); });
  $('#fab').onclick = () => OT.levantamiento({});

  // Módulos
  [ModTablero, ModIncidencias, ModTareas, ModMant, ModCalendario, ModOT, ModMisOT, ModSolicitudes, ModKPI, ModBitacora].forEach(m => {
    try { m.init && m.init(); } catch (e) { console.error('init', e); }
  });

  // Firebase
  try { DB.init(origen => UI.refresh(origen)); }
  catch (e) {
    console.error(e);
    $('#loginStatus').textContent = 'No se pudo cargar Firebase. Verifique su conexión a internet.';
    $('#cargando').textContent = 'No se pudo conectar con Firebase.';
  }

  // Sesión vigente en esta pestaña
  try {
    const s = JSON.parse(sessionStorage.getItem(SKEY) || 'null');
    if (s && ROLES[s.rol] && (s.rol !== 'tecnico' || s.tecnicoId)) {
      SESION.rol = s.rol; SESION.tecnicoId = s.tecnicoId || ''; SESION.nombre = s.nombre || '';
      $('#login').hidden = true; aplicarRol();
    }
  } catch (e) {}

  const h = location.hash.replace('#', '');
  UI.ir(UI.vistas[h] ? h : (esTecnico() ? 'misordenes' : 'tablero'));
})();
