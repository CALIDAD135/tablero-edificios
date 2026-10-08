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
  admin:    { label: 'Administrador',     permisos: ['capture', 'edit_areas', 'delete', 'seed', 'bitacora', 'config'] },
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

/* ---------- Catálogos ---------- */
// Selector ESTRICTO de categorías para incidencias, órdenes de trabajo y solicitudes
const CATEGORIAS = [
  'Plomería', 'Electricidad', 'Albañilería', 'Limpieza', 'Carpintería', 'Herrería',
  'Aire Acondicionado', 'Pintura', 'Jardinería', 'Tablaroca', 'Aluminio',
  'Impermeabilizado', 'Fumigación', 'Redes'
];

// Rubros del programa de mantenimiento
const RUBROS_MANT = [
  'Aires Acondicionados', 'Fumigación', 'Extintores', 'Pintura',
  'Cisternas y Tinacos', 'Mobiliario', 'Impermeabilizado', 'EPP'
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
