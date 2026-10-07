/* ==========================================================================
   CONTROL DE EDIFICIOS · IES
   js/app.js — Arranque: sesión por rol, navegación y eventos generales
   ========================================================================== */
(function () {
  const SKEY = 'edificios_sesion';
  $('#loginLogo').src = LOGO_IES;
  $('#topLogo').src = LOGO_IES;

  function aplicarRol() {
    $('#rolBadge').textContent = ROLES[SESION.rol].label;
    $('.nav-tab[data-v="bitacora"]').hidden = !can('bitacora');
    $('#fab').classList.toggle('activo', can('capture'));
    if (UI.vista === 'bitacora' && !can('bitacora')) UI.ir('tablero');
  }
  function iniciarSesion(rol) {
    SESION.rol = rol;
    try { sessionStorage.setItem(SKEY, JSON.stringify({ rol, ts: nowISO() })); } catch (e) {}
    $('#login').hidden = true;
    aplicarRol();
    DB.log('LOGIN', 'sesion', ROLES[rol].label, '');
    UI.refresh('login');
  }
  function cerrarSesion() {
    if (SESION.rol) DB.log('LOGOUT', 'sesion', ROLES[SESION.rol].label, '');
    SESION.rol = null;
    try { sessionStorage.removeItem(SKEY); } catch (e) {}
    Drawer.cerrar(); Reporte.cerrar();
    UI._pila.slice().forEach(m => m.cerrar());
    $('#login').hidden = false; $('#loginCodigo').value = ''; $('#loginErr').textContent = '';
    $$('.rol').forEach(b => b.setAttribute('aria-pressed', 'false'));
  }

  // Acceso
  let rolSel = null;
  $$('.rol').forEach(b => b.onclick = () => {
    rolSel = b.dataset.rol;
    $$('.rol').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    $('#loginErr').textContent = '';
    $('#loginCodigo').focus();
  });
  $('#loginBtn').onclick = () => {
    if (!rolSel) { $('#loginErr').textContent = 'Seleccione su rol.'; return; }
    if ($('#loginCodigo').value.trim() !== AUTH_CODES[rolSel]) { $('#loginErr').textContent = 'Código incorrecto para el rol seleccionado.'; return; }
    iniciarSesion(rolSel);
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
  [ModTablero, ModIncidencias, ModTareas, ModMant, ModOT, ModSolicitudes, ModKPI, ModBitacora].forEach(m => {
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
    if (s && ROLES[s.rol]) { SESION.rol = s.rol; $('#login').hidden = true; aplicarRol(); }
  } catch (e) {}

  const h = location.hash.replace('#', '');
  UI.ir(UI.vistas[h] ? h : 'tablero');
})();
