# Control de Edificios IES: Fase 3

Calendarización por el Operador técnico, levantamiento con lista de materiales autoguardada, evidencia del reporte visible para el técnico, y respaldo ZIP con depuración de evidencia.

## 1. Archivos

Reemplace los archivos completos en `CALIDAD135/tablero-edificios`.

| Archivo | Estado | Cambio |
|---|---|---|
| `js/mod-ot.js` | Modificado | Bandeja por edificio, botón de calendario, levantamiento con materiales, evidencia del reporte |
| `js/mod-respaldo.js` | **Nuevo** | Respaldo ZIP y depuración de `edificios_media` |
| `js/mod-calendario.js` | Modificado | Color de cada OT según su estatus en tiempo real |
| `js/mod-incidencias.js` | Modificado | Fotografías del reporte en la incidencia |
| `js/pdf.js` | Modificado | PDF reutilizable por el respaldo; filas de 3 fotos; evidencia del reporte; nota de depuración |
| `js/ui-core.js` | Modificado | Libro de Excel reutilizable con hoja de materiales; Galería con selección múltiple |
| `js/config.js` | Modificado | Ranuras de fotos, mínimo del levantamiento, unidades, duraciones, colores por estatus, parámetros de depuración |
| `js/firebase-db.js` | Modificado | Lectura sin caché para el respaldo y limpieza de la caché local |
| `js/app.js` | Modificado | Botón «Respaldo y depuración» solo para Administrador |
| `index.html` | Modificado | JSZip, botón del encabezado y script `mod-respaldo.js` |
| `css/edificios.css` | Modificado | Estilos de la Fase 3 |

Sin cambios: `solicitud.html`, `js/solicitud.js`, `js/mod-tablero.js`, `js/mod-mantenimientos.js`, `js/mod-solicitudes.js`, `js/mod-kpis.js`, `js/logo.js` y `database.rules.json`.

## 2. JSZip en `index.html`

Sí se requiere. Se usa la misma versión que el Tablero Vehicular:

```html
<script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
<!-- … -->
<script src="js/pdf.js"></script>
<script src="js/mod-respaldo.js"></script>
```

## 3. Estructura de datos

### 3.1 Lista de materiales del levantamiento

Cada material es un nodo propio. Así cada renglón se autoguarda por separado (600 ms después de dejar de escribir) sin reescribir la orden completa.

```
tableros/edificios/ordenes/{otId}/
├── diagnostico: "Sifón fisurado y empaque deteriorado."      ← autoguardado (800 ms)
├── fechaLevantamiento: "2026-10-08T15:05:20.000Z"           ← al pulsar «Registrar levantamiento»
└── materialesLev/
    └── {materialId}/                                         ← id cronológico (uid)
        ├── desc:        "Sifón PVC 1 1/2\""
        ├── cant:        2
        ├── unidad:      "PZA"                 (catálogo UNIDADES_MAT, admite otras)
        ├── nota:        "Con contratuerca"    (especificación, medida o marca)
        ├── orden:       1791471914837         (posición en la lista)
        ├── creado:      "2026-10-08T15:05:15.503Z"
        ├── actualizado: "2026-10-08T15:05:15.503Z"
        └── por:         "CARLOS PECH UC"
```

Reglas de la lista:
- No se crean renglones vacíos; el nodo nace al escribir la descripción.
- Quitar un renglón borra su nodo.
- Sin conexión, el SDK conserva el cambio y lo envía al reconectar; el indicador lo avisa.
- La lista es editable hasta la culminación. Las fotografías del levantamiento se congelan al registrarlo.
- En la ficha del Administrador aparece como tabla de solo lectura con el botón **Pasar a la tabla de costos**, que copia los materiales a `materiales[]` con costo cero para cotizar.

### 3.2 Evidencia fotográfica en `tableros/edificios_media`

```
tableros/edificios_media/
├── {otId}/
│   ├── rep_0 … rep_3        Evidencia del reporte capturada al generar la OT (4)
│   ├── antes_0 … antes_5    Levantamiento del técnico (6 ranuras, mínimo 4)
│   ├── despues_0 … despues_5  Culminación (6 ranuras, mínimo 1)
│   ├── firmaEntrega
│   └── firmaRecibe
└── {incidenciaId}/
    └── rep_0 … rep_3        Fotografías del reporte de la incidencia (4)
```

La sección **Evidencia del reporte** del técnico combina `rep_*` de la OT y `rep_*` de la incidencia de origen (`origen.id`), sin duplicar imágenes.

### 3.3 Campos nuevos en la OT

| Campo | Contenido |
|---|---|
| `agendaDuracionMin` | Duración estimada de la ejecución en minutos (calendario) |
| `agendadoPor`, `agendadoEn` | Quién calendarizó y cuándo |
| `evidenciaDepurada` | Fecha en que se borró su evidencia (también en incidencias) |
| `firmasDepuradas` | Fecha, solo si la depuración incluyó firmas |

## 4. Calendario por estatus

| Estatus | Color | Cuándo |
|---|---|---|
| Por levantar | Gris pizarra | Técnico asignado, sin levantamiento |
| Por recibir | Ámbar | Con levantamiento, sin confirmar recibido |
| Por iniciar | Azul IES | Recibida o externa sin iniciar |
| En proceso | Morado | Trabajos iniciados |
| Finalizado, por firmar | Verde | Culminada, faltan firmas |
| Entregada | Gris claro, tachada | Cerrada |

Las órdenes de proveedor externo se ven rayadas y los levantamientos agendados con contorno punteado. El color cambia en cuanto el técnico avanza su pipeline o calendariza, porque el calendario se vuelve a dibujar con cada cambio de Firebase.

## 5. Respaldo y depuración

**Respaldo ZIP** (`Respaldo_Edificios_IES_AAAAMMDD_HHMM.zip`):

```
Control_Edificios_IES.xlsx         11 hojas (se agregó «Materiales levantamiento»)
CSV/                               Una por hoja
Datos/respaldo_firebase.json       Copia íntegra de la base sin imágenes
Reportes_de_entrega/               PDF de cada OT culminada o entregada, con costos
Evidencias/OT/{folio}_{oficina}/   reporte_n, antes_n, despues_n, firma_entrega, firma_recibe
Evidencias/Incidencias/{folio}_{oficina}/
Evidencias/INDICE_EVIDENCIAS.csv
LEEME.txt
```

**Depuración** (botón **Borrar fotografías y evidencia antigua**):

- Solo se habilita después de generar el ZIP en la misma sesión.
- Solo borra archivos que quedaron dentro de ese ZIP.
- Alcance predeterminado: registros cerrados hace más de 30 días (OT entregadas o canceladas, incidencias resueltas o canceladas). Opción: toda la evidencia respaldada.
- Por defecto conserva las firmas, para poder reimprimir reportes firmados.
- Pide dos confirmaciones: un resumen y escribir `LIMPIAR`, igual que el Tablero Vehicular.
- Borra con actualizaciones por lotes, marca `evidenciaDepurada`, limpia la caché local de imágenes y lo registra en la bitácora y en `meta/ultimaDepuracion`.
- Nunca toca datos operativos: folios, fechas, SLA, materiales, costos, firmantes, solicitudes ni bitácora.

## 6. Reglas de Firebase

**No requieren cambios.** `materialesLev`, los campos de agenda y `meta/ultimoRespaldo` viven en `tableros/edificios`. Las fotos de incidencias y los borrados viven en `tableros/edificios_media`. Ambos nodos ya tienen lectura y escritura.

## 7. Recomendación de uso

Genere el respaldo cada mes y guarde el ZIP en una carpeta compartida con control de versiones. En el plan Spark, la base tiene 1 GB de almacenamiento y 10 GB de descarga al mes. Una OT con sus 16 ranuras de fotografía llenas ocupa hasta 3 MB. Con depuraciones mensuales de registros cerrados, el uso se mantiene muy por debajo del límite.
