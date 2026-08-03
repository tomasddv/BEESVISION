# Estandar para dashboards y apps compartidas

Objetivo: toda app o dashboard nuevo debe poder abrirse desde cualquier celular o PC, sin depender de que la computadora local este prendida, y debe guardar comentarios, planes de accion o relevamientos en una base consultable.

## Arquitectura base

- Link publico estable para la mesa de trabajo.
- Frontend web mobile-first, usable desde celular.
- Base de datos cloud para guardar cargas.
- Vista de carga para el equipo.
- Vista de reporte/seguimiento para lectura y gestion.
- Exportacion a CSV/Excel cuando haga falta.
- PIN simple por app o perfiles basicos cuando el dato sea sensible.

## Opcion recomendada

- Frontend: Vercel, Netlify o GitHub Pages.
- Base cloud: Supabase.
- Ventaja: abre normal en Chrome de celular, no depende de Apps Script ni de Google Drive, y permite guardar datos ordenados.

## Estructura minima por app

Cada app deberia tener:

- `index.html` o app React: pantalla principal.
- `src/config`: datos de conexion y nombre de app.
- `src/lib/db`: funciones para leer y guardar datos.
- `src/views/Form`: carga de comentarios, planes o relevamientos.
- `src/views/Report`: reporte para seguimiento.
- `src/views/Admin`: carga o actualizacion de base si aplica.

## Datos comunes a guardar

Toda carga de usuario deberia guardar:

- Fecha y hora.
- Usuario o responsable.
- Codigo de cliente, promotor, zona o entidad principal.
- Tipo de registro.
- Estado.
- Comentario.
- Plan de accion.
- Fecha compromiso.
- Ultima actualizacion.

## App EDF

Uso:

- Relevar activos comodateados.
- Confirmar si el numero de serie en sistema coincide con el fisico.
- Guardar OK, No OK, adicional y comentarios.
- Reportar dispersiones.

Tablas sugeridas:

- `edf_assets`: base del sistema.
- `edf_surveys`: cabecera del relevamiento.
- `edf_survey_items`: detalle por heladera.

## App NPS

Uso:

- Ver clientes o casos NPS.
- Cargar causa raiz.
- Cargar plan de accion.
- Cargar responsable.
- Cargar fecha compromiso.
- Cargar comentario de seguimiento.
- Marcar estado: Pendiente, En progreso, Cerrado.

Tablas sugeridas:

- `nps_cases`: base de casos/clientes.
- `nps_actions`: planes de accion y comentarios.
- `nps_updates`: historial de cambios o seguimientos.

## Regla para futuros desarrollos

No dejar una app nueva solamente en `localhost` si la va a usar la mesa. Primero puede probarse local, pero la version final debe tener:

- Link cloud.
- Base cloud.
- Reporte de seguimiento.
- Instrucciones de publicacion.
