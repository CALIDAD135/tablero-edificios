/* ==========================================================================
   CONTROL DE EDIFICIOS · IES
   js/config.js — Configuración general, catálogos y estructura base
   --------------------------------------------------------------------------
   Este archivo lo cargan las dos páginas del módulo:
     · index.html       (tablero interno con acceso por rol)
     · solicitud.html   (formulario público de solicitudes)
   Todo lo que se ajusta sin tocar la lógica vive aquí.
   ========================================================================== */

const APP = {
  nombre: 'Control de Edificios',
  version: '1.0',
  empresa: 'Innovaciones Tecnológicas en Tratamiento del Agua',
  departamento: 'Departamento de Activos Fijos',
  tituloReporte: 'Reporte de entrega de Trabajos Realizados',
  // Ajuste el código y la revisión a su Lista Maestra de Documentos (ISO 9001:2015, 7.5)
  formato: { codigo: 'FO-AFI-ED-01', revision: '0' },
  sitio: 'Cancún, Q. Roo'
};

/* ---------- Firebase: mismo proyecto que Control Vehicular y Comparativo ---------- */
const firebaseConfig = {
  apiKey: "AIzaSyDq42ANqMO_dKogrNfk5QehtrRTSsOlTik",
  authDomain: "ies-comparativos.firebaseapp.com",
  databaseURL: "https://ies-comparativos-default-rtdb.firebaseio.com",
  projectId: "ies-comparativos",
  storageBucket: "ies-comparativos.firebasestorage.app",
  messagingSenderId: "867998406582",
  appId: "1:867998406582:web:e781815ac4b2077f671317"
};

/* Nodos de Realtime Database (equivalentes a las "colecciones" del requerimiento) */
const FB = {
  root:    'tableros/edificios',          // datos operativos del tablero
  media:   'tableros/edificios_media',    // firmas y fotografías (se descargan solo bajo demanda)
  publico: 'tableros/edificios_publico'   // catálogo y solicitudes del formulario público
};

/* ---------- Acceso por rol (mismos códigos que Control Vehicular) ---------- */
const AUTH_CODES = {
  admin:    '0386',   // Coordinador de Activos Fijos (Lic. Marcos)
  auxiliar: '0387',   // Auxiliar: captura y operación diaria
  gerencia: '0388'    // Gerencia: solo lectura
  // tecnico: cada Operador técnico entra con su PIN personal, que el Administrador
  //          registra en Órdenes de trabajo > Técnicos (nodo tableros/edificios/tecnicos)
};
const ROLES = {
  // baja_activo (Fase 4): solo el Administrador autoriza bajas y reactivaciones de activos
  admin:    { label: 'Administrador',     permisos: ['capture', 'edit_areas', 'delete', 'seed', 'bitacora', 'config', 'baja_activo'] },
  auxiliar: { label: 'Auxiliar',          permisos: ['capture'] },
  gerencia: { label: 'Gerencia',          permisos: [] },
  // Vista móvil exclusiva de sus OT asignadas: sin configuración, áreas, finanzas ni eliminaciones
  tecnico:  { label: 'Operador técnico',  permisos: ['tecnico'] }
};
const PIN_TECNICO = { min: 4, max: 6 };   // longitud permitida del PIN personal

/* ---------- Fase 2: ejecución interna o externa y calendario ---------- */
const TIPOS_EJECUCION = {
  INTERNO: { l: 'Personal interno',  c: 't-azul' },
  EXTERNO: { l: 'Proveedor externo', c: 't-ambar' }
};
// Colores del calendario (también se usan en la leyenda)
const CAL_COLORES = {
  mant:          '#0f7a8a',   // mantenimiento programado
  mantEjecutado: '#4d7c0f',   // mantenimiento ejecutado
  mantVencido:   '#b81f30',   // mantenimiento vencido
  interno:       '#0b4f9e',   // OT de personal interno
  externo:       '#c77700',   // OT de proveedor externo
  levantamiento: '#5a3fb8'    // levantamiento agendado en sitio
};
// Duración con que se pintan en el calendario los eventos sin hora de término (minutos)
const CAL_DURACION = { ejecucion: 120, levantamiento: 60 };

/* ---------- Fase 3: levantamiento del técnico, calendarización y respaldo ---------- */
// Ranuras de fotografía por tipo de evidencia (nodo tableros/edificios_media/{otId|incidenciaId}/{tipo}_{n})
const FOTOS = { rep: 4, antes: 6, despues: 6 };
const LEV_FOTOS_MIN = 4;              // mínimo de fotografías en el levantamiento del técnico
const UNIDADES_MAT = ['PZA', 'M', 'M2', 'M3', 'ML', 'L', 'KG', 'JGO', 'ROLLO', 'CUBETA', 'GALÓN', 'SACO', 'TRAMO', 'CAJA', 'LOTE'];
const DURACIONES = [
  { v: 30, l: '30 min' }, { v: 60, l: '1 h' }, { v: 120, l: '2 h' }, { v: 180, l: '3 h' },
  { v: 240, l: '4 h' }, { v: 360, l: '6 h' }, { v: 480, l: '8 h (jornada)' }
];
// Color de las OT en el calendario según su estatus actual (cambia en tiempo real)
const CAL_ESTATUS = {
  POR_LEVANTAR: { l: 'Por levantar',           c: '#64748b' },
  POR_RECIBIR:  { l: 'Por recibir',            c: '#c77700' },
  POR_INICIAR:  { l: 'Por iniciar',            c: '#0b4f9e' },
  EN_PROCESO:   { l: 'En proceso',             c: '#5a3fb8' },
  FINALIZADO:   { l: 'Finalizado, por firmar', c: '#0e9f6e' },
  ENTREGADA:    { l: 'Entregada',              c: '#94a3b8' }
};
// Depuración sugerida: evidencia de registros cerrados hace más de N días
const RESPALDO = { diasAntiguedad: 30, palabraConfirmacion: 'LIMPIAR' };

/* ---------- Fase 4: inventario de activos de instalaciones ----------
   Folio permanente por clase: AF-CLI-0001, AF-MOB-0001… (consecutivo atómico en
   tableros/edificios/contadores/AF/{clase}). El folio no cambia aunque el activo
   se traslade, cambie de resguardante o se dé de baja. */
const FOLIO_ACTIVO = { prefijo: 'AF', digitos: 4 };
const FOTOS_ACTIVO = ['Vista general', 'Placa de datos o número de serie', 'Ubicación o detalle'];
const ALTA_MULTIPLE_MAX = 50;          // piezas idénticas por captura (un folio por pieza)
const ETIQUETA_ACTIVO = { leyenda: 'Propiedad de IES. No retire esta etiqueta.' };
const ESTATUS_ACTIVO = {
  EN_USO:         { l: 'En uso',            c: 't-verde' },
  EN_ALMACEN:     { l: 'En almacén',        c: 't-azul' },
  EN_REPARACION:  { l: 'En reparación',     c: 't-morado' },
  FUERA_SERVICIO: { l: 'Fuera de servicio', c: 't-ambar' },
  BAJA:           { l: 'Baja',              c: 't-gris' }
};
const CONDICION_ACTIVO = {
  BUENO:   { l: 'Bueno',   c: 't-verde' },
  REGULAR: { l: 'Regular', c: 't-ambar' },
  MALO:    { l: 'Malo',    c: 't-rojo' }
};
const MOTIVOS_BAJA = [
  'Obsolescencia', 'Daño irreparable', 'Reparación incosteable', 'Robo o extravío', 'Siniestro',
  'Venta', 'Donación', 'Transferencia a otra sede', 'Destrucción o desecho'
];
/* Clases de activo. Cada clase define:
   l      nombre visible            rubro  rubro del programa de mantenimiento
   cat    categoría de OT           per    periodicidad sugerida del preventivo (días)
   vida   vida útil sugerida (años) tipos  subtipos; un objeto {l, rubro, cat, per} ajusta el subtipo
   specs  campos técnicos propios de la clase: {k, l, ph?, op? (lista), t? ('date' | 'number')} */
const CLASES_ACTIVO = {
  CLI: { l: 'Climatización', rubro: 'Aires Acondicionados', cat: 'Aire Acondicionado', per: 90, vida: 10,
    tipos: ['Minisplit', 'Aire de ventana', 'Cassette', 'Piso-techo', 'Equipo paquete', 'Fan & coil o sistema central', 'Aire portátil'],
    specs: [{ k: 'capacidad', l: 'Capacidad', ph: '12,000 BTU o 1 TR' }, { k: 'refrigerante', l: 'Refrigerante', op: ['R-410A', 'R-32', 'R-22', 'R-134a', 'Otro'] },
      { k: 'voltaje', l: 'Voltaje', op: ['115 V', '220 V', '440 V'] }, { k: 'tecnologia', l: 'Tecnología', op: ['Inverter', 'Convencional'] },
      { k: 'serieCondensadora', l: 'Serie de la condensadora', ph: 'Unidad exterior' }] },
  VEN: { l: 'Ventilación', rubro: 'Ventilación', cat: 'Electricidad', per: 180, vida: 8,
    tipos: ['Ventilador de techo', 'Ventilador de pedestal', 'Ventilador de pared', 'Ventilador de torre', 'Extractor de aire', 'Cortina de aire'],
    specs: [{ k: 'potencia', l: 'Potencia', ph: '75 W' }, { k: 'voltaje', l: 'Voltaje', op: ['115 V', '220 V'] }, { k: 'medida', l: 'Diámetro o medida', ph: '52 in' }] },
  MOB: { l: 'Mobiliario de oficina', rubro: 'Mobiliario', cat: 'Carpintería', per: 180, vida: 10,
    tipos: ['Escritorio', 'Silla operativa', 'Silla ejecutiva', 'Silla de visita', 'Mesa de juntas', 'Mesa desmontable de trabajo', 'Anaquel',
      'Librero', 'Archivero', 'Gabinete o locker', 'Credenza', 'Sillón o sofá', 'Pizarrón', 'Mueble por definir'],
    specs: [{ k: 'material', l: 'Material', ph: 'Melamina, metal, malla…' }, { k: 'color', l: 'Color' }, { k: 'medidas', l: 'Medidas (largo × ancho × alto)', ph: '120 × 60 × 75 cm' }] },
  COC: { l: 'Cocina y comedor', rubro: 'Equipos de Cocina', cat: 'Electricidad', per: 90, vida: 8,
    tipos: ['Refrigerador', 'Frigobar', 'Estufa', 'Parrilla eléctrica', 'Horno de microondas', 'Horno eléctrico', 'Cafetera', 'Despachador de agua',
      { l: 'Purificador de agua', cat: 'Plomería' }, { l: 'Mueble de autoservicio', cat: 'Carpintería', rubro: 'Mobiliario', per: 180 },
      { l: 'Tarja', cat: 'Plomería', rubro: 'Muebles Sanitarios' }, 'Campana extractora', { l: 'Mesa de comedor', cat: 'Carpintería', rubro: 'Mobiliario', per: 180 }],
    specs: [{ k: 'capacidad', l: 'Capacidad', ph: '14 ft³, 30 L, 12 tazas' }, { k: 'energia', l: 'Energía', op: ['Eléctrica', 'Gas LP', 'Gas natural', 'No aplica'] },
      { k: 'voltaje', l: 'Voltaje', op: ['115 V', '220 V', 'No aplica'] }, { k: 'material', l: 'Material o acabado', ph: 'Acero inoxidable…' }] },
  SAN: { l: 'Baños y muebles sanitarios', rubro: 'Muebles Sanitarios', cat: 'Plomería', per: 90, vida: 15,
    tipos: ['Taza o inodoro', 'Mingitorio', 'Lavabo', 'Llave o grifería', 'Fluxómetro', 'Regadera', 'Calentador de agua',
      { l: 'Secador de manos', cat: 'Electricidad' }, 'Despachador de papel', 'Despachador de jabón', 'Espejo', { l: 'Mampara o división', cat: 'Herrería' }],
    specs: [{ k: 'material', l: 'Material', ph: 'Porcelana, acero…' }, { k: 'sistema', l: 'Sistema', op: ['Tanque', 'Fluxómetro', 'Sensor', 'Manual', 'Seco o ecológico'] },
      { k: 'consumo', l: 'Consumo', ph: '4.8 L por descarga' }] },
  BOM: { l: 'Bombeo e hidráulica', rubro: 'Equipos de Bombeo', cat: 'Plomería', per: 90, vida: 10,
    tipos: ['Bomba centrífuga', 'Bomba sumergible', 'Bomba presurizadora', 'Equipo hidroneumático', 'Equipo de filtración o suavizador',
      { l: 'Tinaco', rubro: 'Cisternas y Tinacos', per: 180 }, { l: 'Cisterna', rubro: 'Cisternas y Tinacos', per: 180 }],
    specs: [{ k: 'potencia', l: 'Potencia', ph: '1 HP' }, { k: 'voltaje', l: 'Voltaje', op: ['115 V', '220 V', '440 V', 'No aplica'] },
      { k: 'fases', l: 'Alimentación', op: ['Monofásica', 'Trifásica', 'No aplica'] }, { k: 'caudal', l: 'Caudal', ph: '40 L/min' },
      { k: 'capacidad', l: 'Capacidad', ph: '1,100 L' }] },
  ACC: { l: 'Puertas, ventanas y accesos', rubro: 'Puertas y Accesos', cat: 'Carpintería', per: 180, vida: 15,
    tipos: ['Puerta de madera', { l: 'Puerta de aluminio y vidrio', cat: 'Aluminio' }, { l: 'Puerta metálica', cat: 'Herrería' },
      { l: 'Portón', cat: 'Herrería' }, { l: 'Cortina metálica', cat: 'Herrería' }, { l: 'Ventana', cat: 'Aluminio' }, { l: 'Cancel', cat: 'Aluminio' },
      { l: 'Cerradura o chapa', cat: 'Herrería' }, { l: 'Control de acceso', cat: 'Electricidad' }, 'Persiana'],
    specs: [{ k: 'material', l: 'Material' }, { k: 'medidas', l: 'Medidas', ph: '0.90 × 2.10 m' }, { k: 'cerradura', l: 'Cerradura o herraje', ph: 'Chapa de manija, barra antipánico…' }] },
  ELE: { l: 'Eléctrico e iluminación', rubro: 'Instalación Eléctrica', cat: 'Electricidad', per: 180, vida: 15,
    tipos: ['Tablero o centro de carga', 'Interruptor general', 'Luminaria', 'Planta de emergencia', 'No-break (UPS)', 'Regulador de voltaje', 'Transformador', 'Banco de capacitores'],
    specs: [{ k: 'capacidad', l: 'Capacidad', ph: '100 A, 10 kVA, 40 W' }, { k: 'voltaje', l: 'Voltaje', op: ['115 V', '220 V', '440 V', '13.2 kV'] },
      { k: 'fases', l: 'Fases', op: ['Monofásica', 'Bifásica', 'Trifásica'] }] },
  SEG: { l: 'Seguridad y protección civil', rubro: 'Protección Civil', cat: 'Electricidad', per: 180, vida: 10,
    tipos: [{ l: 'Extintor', rubro: 'Extintores', per: 365 }, 'Detector de humo', 'Lámpara de emergencia', 'Alarma', 'Gabinete contra incendio',
      'Botiquín', 'Señalética', { l: 'Cámara de videovigilancia', cat: 'Redes' }],
    specs: [{ k: 'agente', l: 'Agente o tipo', op: ['PQS', 'CO2', 'Agua', 'Tipo K', 'No aplica'] }, { k: 'capacidad', l: 'Capacidad', ph: '6 kg' },
      { k: 'ultimaRecarga', l: 'Última recarga o revisión', t: 'date' }] },
  TIC: { l: 'Equipo electrónico', rubro: 'Equipo Electrónico', cat: 'Redes', per: 180, vida: 5,
    tipos: ['Pantalla o televisión', 'Proyector', 'Impresora o multifuncional', 'Teléfono o conmutador', 'Equipo de red (switch o access point)', 'Reloj checador', 'Equipo de audio'],
    specs: [{ k: 'tamano', l: 'Tamaño o capacidad', ph: '55 in, 24 puertos…' }, { k: 'conectividad', l: 'Conectividad', ph: 'HDMI, Wi-Fi, red…' }] },
  OTR: { l: 'Otros', rubro: '', cat: '', per: 180, vida: 5, tipos: ['Por definir'], specs: [] }
};

/* ---------- Catálogos ---------- */
// Selector ESTRICTO de categorías para incidencias, órdenes de trabajo y solicitudes
const CATEGORIAS = [
  'Plomería', 'Electricidad', 'Albañilería', 'Limpieza', 'Carpintería', 'Herrería',
  'Aire Acondicionado', 'Pintura', 'Jardinería', 'Tablaroca', 'Aluminio',
  'Impermeabilizado', 'Fumigación', 'Redes'
];

// Rubros del programa de mantenimiento (los 8 originales + 8 de la Fase 4 para el inventario de activos)
const RUBROS_MANT = [
  'Aires Acondicionados', 'Fumigación', 'Extintores', 'Pintura',
  'Cisternas y Tinacos', 'Mobiliario', 'Impermeabilizado', 'EPP',
  'Ventilación', 'Equipos de Cocina', 'Muebles Sanitarios', 'Equipos de Bombeo',
  'Puertas y Accesos', 'Instalación Eléctrica', 'Protección Civil', 'Equipo Electrónico'
];

const PERIODICIDADES = [
  { d: 0,   l: 'Única' },
  { d: 7,   l: 'Semanal' },
  { d: 15,  l: 'Quincenal' },
  { d: 30,  l: 'Mensual' },
  { d: 60,  l: 'Bimestral' },
  { d: 90,  l: 'Trimestral' },
  { d: 120, l: 'Cuatrimestral' },
  { d: 180, l: 'Semestral' },
  { d: 365, l: 'Anual' }
];

// Prioridad y meta de SLA en horas naturales (levantamiento → culminación)
const PRIORIDADES = {
  ALTA:  { l: 'Alta',  h: 24  },
  MEDIA: { l: 'Media', h: 72  },
  BAJA:  { l: 'Baja',  h: 168 }
};

// Mismo catálogo de departamentos del Comparativo de Proveedores + áreas comunes
const DEPARTAMENTOS = [
  'OYS', 'PROYECTOS', 'VENTAS', 'DIRECCION', 'COMPRAS', 'TDA', 'ALMACEN', 'ADMINISTRACION',
  'ACTIVOS', 'FINANZAS', 'RRHH', 'OBRA', 'SISTEMAS', 'AUTOMATIZACION', 'ÁREAS COMUNES', 'SIN ASIGNAR'
];

// Personal autorizado para entregar trabajos (firma "Quien entrega")
const PERSONAL_AF = ['MARCOS XOOL CORTÉS', 'JOSÉ REJÓN KINIL', 'UROY ACOSTA AUGUST'];

// Fases del tablero Kanban (ciclo PHVA)
const FASES_PHVA = [
  { k: 'P', l: 'Planear',   d: 'Diagnóstico, materiales y programación' },
  { k: 'H', l: 'Hacer',     d: 'Ejecución en sitio' },
  { k: 'V', l: 'Verificar', d: 'Revisión de calidad y pruebas' },
  { k: 'A', l: 'Actuar',    d: 'Ajustes, estandarización y cierre' }
];

// Detección de anomalías en consumos: variación contra el promedio de los 3 meses previos
const UMBRAL_ANOMALIA = 0.20;   // 20 %

// Orden de presentación en el tablero (los nuevos edificios/niveles se agregan al final)
const EDIFICIOS_ORDEN = ['EDIFICIO A', 'EDIFICIO B', 'EDIFICIO C', 'TALLER 3'];
const NIVELES_ORDEN   = ['PLANTA ALTA', 'PLANTA BAJA'];   // de arriba hacia abajo

/* ---------- Estructura base: 63 áreas (EDIFICIOS_IES.pdf) ----------
   [item, edificio, nivel, oficina, departamento sugerido]
   Corregidos del listado original: ítem 37 "SITEMAS" → "SISTEMAS"
   e ítem 58 "ALMACEN FITROS" → "ALMACEN FILTROS". */
const SEED_AREAS = [
  [1,  'EDIFICIO A', 'PLANTA BAJA', 'RECEPCION', 'ÁREAS COMUNES'],
  [2,  'EDIFICIO A', 'PLANTA BAJA', 'VENTAS', 'VENTAS'],
  [3,  'EDIFICIO A', 'PLANTA BAJA', 'PASILLO A', 'ÁREAS COMUNES'],
  [4,  'EDIFICIO A', 'PLANTA BAJA', 'PASILLO B', 'ÁREAS COMUNES'],
  [5,  'EDIFICIO A', 'PLANTA BAJA', 'PASILLO C', 'ÁREAS COMUNES'],
  [6,  'EDIFICIO A', 'PLANTA BAJA', 'PASILLO D', 'ÁREAS COMUNES'],
  [7,  'EDIFICIO A', 'PLANTA BAJA', 'PASILLO E', 'ÁREAS COMUNES'],
  [8,  'EDIFICIO A', 'PLANTA BAJA', 'TDA', 'TDA'],
  [9,  'EDIFICIO A', 'PLANTA BAJA', 'SITE', 'SISTEMAS'],
  [10, 'EDIFICIO A', 'PLANTA BAJA', 'MP', 'SIN ASIGNAR'],
  [11, 'EDIFICIO A', 'PLANTA BAJA', 'GERENCIA ADMVA OYS', 'OYS'],
  [12, 'EDIFICIO A', 'PLANTA BAJA', 'ADMON OYS', 'OYS'],
  [13, 'EDIFICIO A', 'PLANTA BAJA', 'RH RECLUTAMIENTO', 'RRHH'],
  [14, 'EDIFICIO A', 'PLANTA BAJA', 'BAÑO 1 - DAMAS', 'ÁREAS COMUNES'],
  [15, 'EDIFICIO A', 'PLANTA BAJA', 'BAÑO 2 - CABALLEROS', 'ÁREAS COMUNES'],
  [16, 'EDIFICIO A', 'PLANTA BAJA', 'DESARROLLO DE NEGOCIO', 'SIN ASIGNAR'],
  [17, 'EDIFICIO A', 'PLANTA BAJA', 'ARCHIVO MUERTO', 'SIN ASIGNAR'],
  [18, 'EDIFICIO A', 'PLANTA BAJA', 'JARDINERA 1', 'ÁREAS COMUNES'],
  [19, 'EDIFICIO A', 'PLANTA ALTA', 'FINANZAS Y CONTABILIDAD', 'FINANZAS'],
  [20, 'EDIFICIO A', 'PLANTA ALTA', 'OFICINA NUEVA CREACION', 'SIN ASIGNAR'],
  [21, 'EDIFICIO A', 'PLANTA ALTA', 'RH GERENCIA', 'RRHH'],
  [22, 'EDIFICIO A', 'PLANTA ALTA', 'GERENCIA OPERATIVA', 'SIN ASIGNAR'],
  [23, 'EDIFICIO A', 'PLANTA ALTA', 'DIRECCION', 'DIRECCION'],
  [24, 'EDIFICIO A', 'PLANTA ALTA', 'BAÑO 5 - CABALLEROS', 'ÁREAS COMUNES'],
  [25, 'EDIFICIO A', 'PLANTA ALTA', 'BAÑO 6 - DAMAS', 'ÁREAS COMUNES'],
  [26, 'EDIFICIO A', 'PLANTA ALTA', 'PASILLO I', 'ÁREAS COMUNES'],
  [27, 'EDIFICIO A', 'PLANTA ALTA', 'PASILLO J', 'ÁREAS COMUNES'],
  [28, 'TALLER 3',   'PLANTA ALTA', 'PROYECTOS', 'PROYECTOS'],
  [29, 'TALLER 3',   'PLANTA ALTA', 'GERENCIA OYS', 'OYS'],
  [30, 'EDIFICIO B', 'PLANTA BAJA', 'BAÑO 3 - CABALLEROS', 'ÁREAS COMUNES'],
  [31, 'EDIFICIO B', 'PLANTA BAJA', 'BAÑO 4 - DAMAS', 'ÁREAS COMUNES'],
  [32, 'EDIFICIO B', 'PLANTA BAJA', 'PASILLO F', 'ÁREAS COMUNES'],
  [33, 'EDIFICIO B', 'PLANTA BAJA', 'PASILLO G', 'ÁREAS COMUNES'],
  [34, 'EDIFICIO B', 'PLANTA BAJA', 'PASILLO H', 'ÁREAS COMUNES'],
  [35, 'EDIFICIO B', 'PLANTA BAJA', 'COSTOS', 'SIN ASIGNAR'],
  [36, 'EDIFICIO B', 'PLANTA BAJA', 'COMPRAS', 'COMPRAS'],
  [37, 'EDIFICIO B', 'PLANTA BAJA', 'SISTEMAS', 'SISTEMAS'],
  [38, 'EDIFICIO B', 'PLANTA BAJA', 'SALA DE JUNTAS', 'ÁREAS COMUNES'],
  [39, 'EDIFICIO B', 'PLANTA BAJA', 'JARDINERA 2', 'ÁREAS COMUNES'],
  [40, 'EDIFICIO B', 'PLANTA BAJA', 'JARDINERA 3', 'ÁREAS COMUNES'],
  [41, 'EDIFICIO B', 'PLANTA BAJA', 'JARDINERA 4', 'ÁREAS COMUNES'],
  [42, 'EDIFICIO C', 'PLANTA BAJA', 'ALMACEN', 'ALMACEN'],
  [43, 'EDIFICIO C', 'PLANTA BAJA', 'ACTIVOS FIJOS', 'ACTIVOS'],
  [44, 'TALLER 3',   'PLANTA BAJA', 'OFICINA ALMACEN', 'ALMACEN'],
  [45, 'TALLER 3',   'PLANTA BAJA', 'ALMACEN GENERAL', 'ALMACEN'],
  [46, 'TALLER 3',   'PLANTA BAJA', 'ALMACEN PROYECTOS', 'PROYECTOS'],
  [47, 'TALLER 3',   'PLANTA BAJA', 'AUTOMATIZACION', 'AUTOMATIZACION'],
  [48, 'TALLER 3',   'PLANTA BAJA', 'OFICINA PROYECTOS', 'PROYECTOS'],
  [49, 'TALLER 3',   'PLANTA BAJA', 'ARMADO ESTRUCTURAS', 'SIN ASIGNAR'],
  [50, 'TALLER 3',   'PLANTA BAJA', 'ALMACEN QUIMICOS', 'ALMACEN'],
  [51, 'TALLER 3',   'PLANTA BAJA', 'ALMACEN HOUSINGS', 'ALMACEN'],
  [52, 'TALLER 3',   'PLANTA BAJA', 'ALMACEN FILTROS', 'ALMACEN'],
  [53, 'TALLER 3',   'PLANTA BAJA', 'ALMACEN TANQUES', 'ALMACEN'],
  [54, 'TALLER 3',   'PLANTA BAJA', 'ALMACEN REFACCIONES OYS', 'OYS'],
  [55, 'TALLER 3',   'PLANTA BAJA', 'ALMACEN DIRECCION', 'DIRECCION'],
  [56, 'TALLER 3',   'PLANTA BAJA', 'ARCHIVO MUERTO T3', 'SIN ASIGNAR'],
  [57, 'TALLER 3',   'PLANTA BAJA', 'ALMACEN TUBERIAS', 'ALMACEN'],
  [58, 'TALLER 3',   'PLANTA ALTA', 'ALMACEN FILTROS', 'ALMACEN'],
  [59, 'TALLER 3',   'PLANTA ALTA', 'ALMACEN DIRECCION 2', 'DIRECCION'],
  [60, 'TALLER 3',   'PLANTA ALTA', 'ALMACEN MATERIALES CONSTRUCCIONES', 'OBRA'],
  [61, 'TALLER 3',   'PLANTA ALTA', 'ALMACEN ACTIVOS FIJOS', 'ACTIVOS'],
  [62, 'TALLER 3',   'PLANTA ALTA', 'ALMACEN MOBILIARIO BAJA', 'ACTIVOS'],
  [63, 'TALLER 3',   'PLANTA ALTA', 'ALMACEN DE BIDONES Y CONTENEDORES', 'ALMACEN']
];

/* Identificador estable del área a partir del número de ítem: 1 → "AR01" */
function areaIdDeItem(item) { return 'AR' + String(item).padStart(2, '0'); }
