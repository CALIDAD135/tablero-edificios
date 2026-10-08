# Control de Edificios IES

Tablero de control de instalaciones y mantenimiento de activos de Innovaciones Tecnológicas en Tratamiento del Agua. Comparte arquitectura con Control Vehicular y Comparativo de Proveedores: Firebase Realtime Database (proyecto `ies-comparativos`), SDK compat 10.13, ECharts, jsPDF y publicación en GitHub Pages.

## 1. Estructura del repositorio

| Archivo | Función |
|---|---|
| `index.html` | Tablero interno con acceso por rol |
| `solicitud.html` | Formulario público de solicitudes (sin código de acceso) |
| `css/edificios.css` | Estilos, alzados de edificios, Kanban, hoja A4 e impresión |
| `js/config.js` | Configuración, catálogos, códigos de acceso y las 63 áreas base |
| `js/logo.js` | Logotipo IES embebido (el mismo de la SOLPED) |
| `js/firebase-db.js` | Capa de datos: conexión, tiempo real, folios atómicos, bitácora, fotos y firmas |
| `js/ui-core.js` | Utilidades, sesión, ventanas, buscador de personas, selector de áreas, firma digital y exportación a Excel |
| `js/mod-tablero.js` | Módulo 1: tablero interactivo y edición de edificios |
| `js/mod-incidencias.js` | Módulo 2: incidencias y Kanban PHVA |
| `js/mod-mantenimientos.js` | Módulo 3: mantenimientos programados |
| `js/mod-kpis.js` | Módulo 4: inversión y consumo de servicios |
| `js/mod-ot.js` | Módulo 5: órdenes de trabajo, ejecución interna o externa, pipeline del técnico, Mis órdenes y catálogo de técnicos |
| `js/mod-calendario.js` | Calendario de mantenimientos, OT y levantamientos (FullCalendar 6), color por estatus |
| `js/mod-respaldo.js` | Respaldo ZIP y depuración de evidencia (solo Administrador) |
| `js/mod-solicitudes.js` | Módulo 6: bandeja de solicitudes, liga y QR; bitácora |
| `js/pdf.js` | Reporte de entrega de Trabajos Realizados (vista dividida y PDF jsPDF) |
| `js/solicitud.js` | Lógica del formulario público |
| `js/app.js` | Arranque de la aplicación |
| `database.rules.json` | Reglas de Realtime Database (ver sección 3) |

## 2. Publicación en GitHub Pages

1. Cree el repositorio `CALIDAD135/tablero-edificios` y suba **todo el contenido de esta carpeta** respetando las subcarpetas `css/` y `js/`.
2. En *Settings > Pages*, elija *Deploy from a branch*, rama `main`, carpeta `/ (root)`.
3. Direcciones resultantes:
   - Tablero: `https://calidad135.github.io/tablero-edificios/`
   - Formulario público: `https://calidad135.github.io/tablero-edificios/solicitud.html`
4. Cada cambio posterior se publica con un commit; GitHub Pages tarda uno o dos minutos en reflejarlo.

## 3. Reglas de Firebase

En la consola de Firebase: *Realtime Database > Reglas*. **Integre** los bloques nuevos dentro de `"tableros"`, sin borrar los que ya existen para `vehicular` e `ies-comparativos`. El archivo `database.rules.json` muestra el resultado completo esperado.

Bloques nuevos:

- `tableros/edificios`: datos operativos del tablero (lectura y escritura).
- `tableros/edificios_media`: firmas y fotografías; se descargan solo al abrir una orden o un reporte.
- `tableros/edificios_publico/catalogo`: espejo de edificio, nivel y oficina para el formulario público.
- `tableros/edificios_publico/contadores`: consecutivos; la regla solo permite incrementar de uno en uno.
- `tableros/edificios_publico/solicitudes`: cada solicitud **solo se puede crear**; no se puede sobrescribir ni borrar desde la web. Únicamente su subnodo `gestion` (estado, OT asignada, motivo) es editable. Esto conserva la evidencia original del usuario.

Recuerde que en Realtime Database los permisos se heredan hacia abajo y no hacia arriba: cada nodo nuevo debe declararse.

## 4. Primer uso

1. Publique las reglas.
2. Entre al tablero como **Administrador** y pulse **Cargar 63 áreas**. Se crean las áreas `AR01` a `AR63` y el catálogo del formulario público.
3. Edite cada área para asignar responsable y confirmar el departamento sugerido (los casos dudosos quedaron como `SIN ASIGNAR`).
4. Desde **Solicitudes**, comparta la liga general o descargue el QR por área para colocarlo en cada oficina.

Ajustes del listado original: ítem 37 «SITEMAS» se corrigió a «SISTEMAS» e ítem 58 «ALMACEN FITROS» a «ALMACEN FILTROS».

## 5. Acceso por rol

| Rol | Código | Permisos |
|---|---|---|
| Administrador | 0386 | Todo, incluida la estructura de áreas, eliminaciones, carga inicial y bitácora |
| Auxiliar | 0387 | Captura y operación diaria; en áreas solo modifica responsable y notas |
| Gerencia | 0388 | Solo lectura, consulta de reportes y exportación |
| Operador técnico | PIN personal | Solo sus OT asignadas en vista móvil; pipeline Levantamiento, Recibido, Inicio, Culminación y Firmas |

Los códigos se cambian en `js/config.js` (`AUTH_CODES`). Los PIN de los técnicos se administran en **Órdenes de trabajo > Técnicos**.

La Fase 2 (Operador técnico, tipo de ejecución y calendario) se detalla en `FASE2_CAMBIOS.md`.
La Fase 3 (calendarización del técnico, levantamiento con materiales, evidencia del reporte y respaldo ZIP) se detalla en `FASE3_CAMBIOS.md`.

## 6. Flujo operativo (enfoque a procesos, ISO 9001:2015)

```
Solicitud pública (SOL) ─┐
Incidencia (INC) ────────┼─► Orden de trabajo (OT) ─► En proceso ─► Culminada ─► Firmas ─► Entregada
Mantenimiento programado ┘        │                                     │                     │
Levantamiento en sitio ───────────┘                     SLA se detiene ─┘      Reporte PDF ───┘
```

- **Folios** consecutivos diarios e irrepetibles por transacción atómica: `SOL-AAAAMMDD-001`, `INC-…`, `OT-…`.
- **SLA:** tiempo exacto desde el levantamiento hasta la culminación, contra la meta por prioridad (Alta 24 h, Media 72 h, Baja 168 h; ajustable en `PRIORIDADES`).
- **Al entregar** con ambas firmas, el sistema actualiza el origen: la incidencia pasa a *Resuelta*, la solicitud a *Culminada* (visible al usuario al consultar su folio) y el plan de mantenimiento registra la ejecución con el costo de la OT.
- **Reporte de entrega:** vista dividida igual que la SOLPED; permite incluir u ocultar costos y fotografías y agregar observaciones de entrega. El PDF se dibuja con jsPDF en milímetros (A4) con firmas y fotos incrustadas.
- **Bitácora:** cada alta, edición, cambio de fase, firma, entrega y descarga queda registrada con fecha y rol.

## 7. Configuración frecuente (`js/config.js`)

| Constante | Uso |
|---|---|
| `APP.formato` | Código y revisión del formato en el reporte (actualmente provisional: FO-AFI-ED-01 Rev. 0) |
| `CATEGORIAS` | Selector estricto de 14 categorías |
| `RUBROS_MANT` | 8 rubros del programa de mantenimiento |
| `PRIORIDADES` | Metas de SLA en horas |
| `PERSONAL_AF` | Personal autorizado para firmar «Quien entrega» |
| `DEPARTAMENTOS` | Catálogo para inversión por departamento |
| `UMBRAL_ANOMALIA` | Variación de consumo que se marca como anomalía (20 %) |

## 8. Consideraciones

- **Plan Spark:** las fotos se comprimen a 1280 px (≈120–200 KB) y se guardan en `edificios_media`, fuera del nodo que se escucha en tiempo real, para no afectar la velocidad del tablero.
- **Seguridad:** los códigos de acceso viven en el código del sitio y las reglas son abiertas, igual que en los tableros actuales. Cuando se atienda la exposición pública del repositorio, conviene migrar a Firebase Authentication y restringir las reglas por usuario.
- **Excel:** el botón *Exportar Excel* descarga un libro con áreas, directorio, incidencias, órdenes, mantenimientos, ejecuciones, consumos, solicitudes, tareas y bitácora.
