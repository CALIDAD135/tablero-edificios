# Control de Edificios IES: Fase 4

Inventario de activos de instalaciones con folio permanente, fotografías, etiqueta QR, resguardante, plan de mantenimiento por activo, bajas autorizadas e historial de movimientos.

## 1. Archivos

Reemplace los archivos completos en `CALIDAD135/tablero-edificios`, respetando las carpetas `css/` y `js/`.

| Archivo | Estado | Cambio |
|---|---|---|
| `js/mod-activos.js` | **Nuevo** | Módulo 7: inventario, ficha, movimientos, etiquetas QR, identificación por foto y plan de mantenimiento |
| `index.html` | Modificado | Pestaña «Activos», vista del inventario, librería jsQR y script `mod-activos.js` |
| `js/config.js` | Modificado | Clases de activo, catálogos, folio, 8 rubros nuevos y permiso `baja_activo` del Administrador |
| `js/firebase-db.js` | Modificado | Nodo `activos` en tiempo real y reserva atómica de folios de inventario |
| `js/app.js` | Modificado | Arranque del módulo y apertura de la ficha desde la liga del QR |
| `js/ui-core.js` | Modificado | Contador de la pestaña y hojas «Activos» y «Movimientos de activos» en Excel |
| `js/mod-tablero.js` | Modificado | Sección «Activos del área» en el panel lateral del área |
| `js/mod-mantenimientos.js` | Modificado | El plan vinculado muestra el folio del activo; la OT del plan toma la categoría del activo |
| `js/mod-respaldo.js` | Modificado | Fotografías de activos en el ZIP, excluidas de la depuración |
| `css/edificios.css` | Modificado | Estilos de la Fase 4 |
| `README.md` | Modificado | Referencias a la Fase 4 |

Sin cambios: `solicitud.html`, `js/solicitud.js`, `js/logo.js`, `js/mod-incidencias.js`, `js/mod-calendario.js`, `js/mod-ot.js`, `js/mod-solicitudes.js`, `js/mod-kpis.js`, `js/pdf.js` y `database.rules.json`.

**Reglas de Firebase:** no requieren cambio. El inventario vive en `tableros/edificios/activos` y sus fotos en `tableros/edificios_media`, nodos que ya tienen lectura y escritura.

## 2. Librería nueva en `index.html`

```html
<script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js"></script>
<!-- … -->
<script src="js/mod-solicitudes.js"></script>
<script src="js/mod-activos.js"></script>
```

`mod-activos.js` debe cargarse después de `mod-ot.js` y `mod-mantenimientos.js`.

## 3. Clases de activo

| Código | Clase | Rubro de mantenimiento | Periodicidad sugerida | Vida útil |
|---|---|---|---|---|
| CLI | Climatización | Aires Acondicionados | Trimestral | 10 años |
| VEN | Ventilación | Ventilación | Semestral | 8 años |
| MOB | Mobiliario de oficina | Mobiliario | Semestral | 10 años |
| COC | Cocina y comedor | Equipos de Cocina | Trimestral | 8 años |
| SAN | Baños y muebles sanitarios | Muebles Sanitarios | Trimestral | 15 años |
| BOM | Bombeo e hidráulica | Equipos de Bombeo (tinaco y cisterna: Cisternas y Tinacos) | Trimestral | 10 años |
| ACC | Puertas, ventanas y accesos | Puertas y Accesos | Semestral | 15 años |
| ELE | Eléctrico e iluminación | Instalación Eléctrica | Semestral | 15 años |
| SEG | Seguridad y protección civil | Protección Civil (extintor: Extintores, anual) | Semestral | 10 años |
| TIC | Equipo electrónico | Equipo Electrónico | Semestral | 5 años |
| OTR | Otros | Se elige al programar | Semestral | 5 años |

Cada clase tiene sus subtipos y especificaciones técnicas (capacidad en BTU y refrigerante en climatización, potencia y caudal en bombeo, material y medidas en mobiliario, agente y última recarga en extintores, etc.). Se ajustan en `CLASES_ACTIVO` sin tocar la lógica.

## 4. Estructura de datos

```
tableros/edificios/activos/{activoId}/
├── folio:            "AF-CLI-0001"          ← permanente; no cambia con traslados ni bajas
├── clase / tipo:     "CLI" / "Minisplit"
├── descripcion, marca, modelo, serie, codigoAnterior
├── specs/            { capacidad, refrigerante, voltaje, … }
├── areaId, edificio, nivel, oficina, departamento   ← instantánea de ubicación
├── resguardanteId, resguardanteNombre
├── estatus:          EN_USO | EN_ALMACEN | EN_REPARACION | FUERA_SERVICIO | BAJA
├── condicion:        BUENO | REGULAR | MALO
├── fechaAdquisicion, proveedor, factura, costo, garantiaHasta, vidaUtil
├── fotos/            { foto_0: true, … }    ← la imagen vive en edificios_media/{activoId}
├── fotosDe:          id de la primera pieza (altas múltiples que comparten fotografía)
├── etiquetaImpresa:  fecha de la última etiqueta generada
├── ultimaVerificacion/ { ts, por, enUbicacion, condicion }
├── baja/             { motivo, fecha, documento, autorizo, valorRecuperacion, obs }
└── movimientos/{movId}/ { ts, tipo, detalle, por, rol, fecha?, de?, a?, autorizo? }

tableros/edificios/contadores/AF/{CLASE}   ← consecutivo atómico del folio
tableros/edificios/mantenimientos/{planId}/activoId, activoFolio   ← plan del activo
```

Tipos de movimiento: Alta en inventario, Edición de datos, Traslado, Cambio de resguardante, Cambio de estado, Verificación física, Plan de mantenimiento, Baja y Reactivación. El historial de la ficha integra además las órdenes de trabajo del activo y las ejecuciones de sus planes.

## 5. Flujo operativo

1. **Alta.** Activos > Alta de activo, o desde el panel del área. Para piezas idénticas (por ejemplo 12 sillas) indique la cantidad: se genera un folio consecutivo por pieza y comparten la fotografía.
2. **Plan de mantenimiento.** Al registrar un activo individual se propone su plan con rubro y periodicidad de la clase. Queda en Mantenimientos programados y en el Calendario con alcance en el área del activo, y lo acompaña en cada traslado.
3. **Etiqueta QR.** Desde la ficha (PNG o PDF) o en lote con «Etiquetas QR»: hoja carta con 10 etiquetas de 100 × 50 mm. Imprimir a escala real (100 %). La etiqueta solo lleva datos permanentes (folio, tipo, marca, modelo, serie y clase).
4. **Identificación.** Con la cámara del teléfono, el QR abre el tablero; tras iniciar sesión se abre la ficha. Dentro del tablero, «Identificar por QR» lee la etiqueta desde una fotografía o busca por folio o número de inventario anterior.
5. **Verificación física.** Al identificar un activo por QR, la ficha ofrece «Confirmar verificación física». Si no estaba en su ubicación, se abre el traslado. El indicador «Verificación física» mide el avance del año.
6. **Traslado y resguardo.** Cada cambio pide fecha y motivo; el traslado puede asignar como resguardante al responsable del área destino.
7. **Orden de trabajo.** «Generar OT» abre el levantamiento con el área, la categoría y el folio del activo; la OT queda con origen «Activo».
8. **Baja.** Solo el Administrador. Requiere motivo, fecha, quién autorizó y observaciones; admite documento de soporte y valor de recuperación. Desactiva los planes del activo. Se revierte con «Reactivar».
9. **Eliminar registro.** Solo el Administrador y solo para corregir capturas erróneas. El folio no se reutiliza.

## 6. Permisos

| Acción | Administrador | Auxiliar | Gerencia | Operador técnico |
|---|---|---|---|---|
| Consultar inventario y ficha | Sí | Sí | Sí | Solo la ficha, desde el QR |
| Alta, edición, traslado, resguardo, estado, verificación, plan, OT | Sí | Sí | No | No |
| Baja y reactivación | Sí | No | No | No |
| Eliminar registro | Sí | No | No | No |
| Descargar etiquetas | Sí | Sí | Sí | Sí |

## 7. Respaldo

El ZIP incluye `Evidencias/Activos/{folio}_{tipo}/` con las fotografías del inventario. Estas fotografías **no** entran a «Liberar espacio en Firebase», porque identifican al bien durante toda su vida útil.

## 8. Consideraciones

- **Inicio de sesión al escanear:** la sesión se guarda por pestaña. Si el QR se escanea con la cámara del teléfono se abre una pestaña nueva y se pide el código; desde «Identificar por QR» no se vuelve a pedir.
- **Valor estimado:** línea recta sobre el costo de adquisición y la vida útil, sin valor de rescate. Es referencial para decisiones de reposición; el valor contable lo determina Finanzas.
- **Carga inicial:** para un levantamiento masivo conviene recorrer por área, capturar con «piezas idénticas» lo repetido y generar las etiquetas filtrando por área.
