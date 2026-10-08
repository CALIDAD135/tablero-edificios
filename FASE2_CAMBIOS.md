# Control de Edificios IES: Fase 2

Operador técnico con vista móvil, ejecución interna o externa, pipeline de ejecución por pasos y calendario de mantenimientos y órdenes.

## 1. Archivos

Reemplace en el repositorio `CALIDAD135/tablero-edificios` los archivos completos; los fragmentos sueltos son propensos a errores al pegarlos.

| Archivo | Estado | Motivo |
|---|---|---|
| `index.html` | Modificado | CDN de FullCalendar, rol técnico, pestañas Calendario y Mis órdenes, bandeja de proveedores |
| `js/config.js` | Modificado | Rol `tecnico`, tipos de ejecución, colores y duraciones del calendario |
| `js/mod-ot.js` | Reescrito | Tipo de ejecución, asignación, pipeline del técnico, Mis órdenes, catálogo de técnicos |
| `js/mod-calendario.js` | **Nuevo** | Calendario con vistas Mes, Semana, Hoy y Agenda |
| `js/app.js` | Modificado | Acceso con PIN personal y vista restringida del técnico |
| `js/ui-core.js` | Modificado | SLA desde el recibido, navegación por rol, columnas nuevas en Excel |
| `js/firebase-db.js` | Modificado | Lectura del nodo `tecnicos` y nombre del usuario en la bitácora |
| `js/pdf.js` | Modificado | Diagnóstico del técnico, base del SLA y sin costos para el técnico |
| `js/mod-solicitudes.js`, `js/mod-tablero.js`, `js/mod-kpis.js` | Ajustes menores | Fecha de generación de la OT y etiquetas de estatus |
| `css/edificios.css` | Modificado | Estilos de vista móvil, pipeline y calendario |

Sin cambios: `solicitud.html`, `js/solicitud.js`, `js/logo.js`, `js/mod-incidencias.js`, `js/mod-mantenimientos.js`, `database.rules.json`.

## 2. Fragmentos agregados a `index.html` (referencia)

```html
<!-- En <head>, después de qrcode-generator -->
<script src="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.global.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@fullcalendar/core@6.1.15/locales/es.global.min.js"></script>

<!-- En el acceso, cuarto rol -->
<button type="button" class="rol" data-rol="tecnico" aria-pressed="false">Operador técnico<small>Mis órdenes</small></button>

<!-- En la navegación -->
<button class="nav-tab" role="tab" data-v="calendario">Calendario</button>
<button class="nav-tab" role="tab" data-v="misordenes" hidden>Mis órdenes <span class="cnt" hidden></span></button>

<!-- Vista Calendario -->
<section class="vista" id="v-calendario" hidden>
  … #calTecnico, #calResumen, #calFiltros y #calendario …
</section>

<!-- Vista Mis órdenes (técnico) -->
<section class="vista" id="v-misordenes" hidden>
  … #moNombre, #moResumen y #moLista …
</section>

<!-- En Órdenes de trabajo: botón Técnicos, filtro #otTipo y bandeja #otExtBloque / #otExternos -->

<!-- Antes de js/mod-ot.js -->
<script src="js/mod-calendario.js"></script>
```

## 3. Puesta en marcha

1. Suba los archivos y espere uno o dos minutos a que GitHub Pages publique.
2. Entre como **Administrador** y vaya a **Órdenes de trabajo > Técnicos**.
3. Dé de alta a cada técnico con nombre, teléfono y un **PIN personal** de 4 a 6 dígitos. El PIN no puede repetirse ni coincidir con los códigos 0386, 0387 o 0388.
4. Entregue el PIN al técnico en persona. Él entra con el rol **Operador técnico** y solo ve sus órdenes.
5. Abra cada OT abierta anterior a la Fase 2 y defina su **tipo de ejecución**; el sistema lo pide al guardar.

## 4. Reglas de flujo implementadas

| Concepto | Personal interno | Proveedor externo |
|---|---|---|
| Asignación | Técnico obligatorio | Proveedor obligatorio |
| Dónde se sigue | Celular del técnico y bandeja general | Bandeja «Seguimiento de proveedores externos» |
| Levantamiento | Lo registra el técnico (paso 1), salvo que se marque como ya realizado | Se registra al generar la OT |
| Inicio del SLA | Confirmación de recibido (paso 2) | Generación de la OT |
| Tiempo de reacción | Visible como «Por recibir» desde la asignación | No aplica |
| Firmas | Quien recibe y el técnico | Quien recibe y personal de Activos Fijos |

**Pipeline del técnico:** Levantamiento (mínimo una foto del antes y diagnóstico) → Confirmar recibido → Iniciar trabajos → Culminar trabajos (mínimo una foto del después y trabajos realizados) → Firmas. Al guardar la segunda firma la OT se entrega, se actualiza su origen y se descarga el PDF.

El Administrador puede abrir cualquier OT interna con **Vista del técnico** para revisar o completar pasos.

## 5. Calendario

| Capa | Fuente en Firebase | Color |
|---|---|---|
| Mantenimiento programado | `mantenimientos`: próxima fecha y proyección por periodicidad | Verde azulado |
| Mantenimiento ejecutado | `mantenimientos/{id}/ejecuciones` | Verde |
| Mantenimiento vencido | Próxima fecha anterior a hoy | Rojo |
| OT de personal interno | `ordenes`, campo `agendaEjecucion` | Azul IES |
| OT de proveedor externo | `ordenes`, campo `agendaEjecucion` | Ámbar |
| Levantamiento agendado | `ordenes`, campo `agendaLevantamiento` | Morado |

Las fechas se capturan en **Ejecución agendada** y **Levantamiento agendado en sitio** al generar o editar la OT. Al hacer clic en un evento se abre la OT o el detalle del plan de mantenimiento con sus acciones.

## 6. Reglas de Firebase

**No requieren cambios.** Todo lo nuevo vive dentro de nodos ya declarados:

- `tableros/edificios/tecnicos` (catálogo de técnicos) y los campos nuevos de `ordenes` quedan bajo `tableros/edificios`, que ya tiene lectura y escritura.
- El calendario solo lee `mantenimientos` y `ordenes`; no crea nodos.
- No se necesitan índices (`.indexOn`), porque el tablero escucha los nodos completos y filtra en el navegador.

**Consideración de seguridad:** con las reglas abiertas, los PIN de los técnicos son legibles por cualquiera que conozca la base de datos, igual que hoy los códigos de rol en `config.js`. La restricción de vistas del técnico es de interfaz. Para una restricción real por usuario se requiere migrar a Firebase Authentication.
