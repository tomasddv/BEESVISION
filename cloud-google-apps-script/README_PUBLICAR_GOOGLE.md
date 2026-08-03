# Relevamiento EDF en la nube

Esta version corre en Google Apps Script y guarda todo en una Google Sheet. Funciona desde cualquier red y no necesita que la compu quede prendida.

## Publicacion

1. Crear una Google Sheet nueva con el nombre `Relevamiento EDF`.
2. En esa Sheet ir a `Extensiones` > `Apps Script`.
3. Pegar el contenido de `Code.gs` en el archivo `Code.gs`.
4. Crear un archivo HTML llamado `Index` y pegar el contenido de `Index.html`.
5. Ejecutar la funcion `setup` una vez y aceptar los permisos.
6. Ir a `Implementar` > `Nueva implementacion`.
7. Elegir tipo `Aplicacion web`.
8. En `Ejecutar como`, elegir `Yo`.
9. En `Quien tiene acceso`, elegir `Cualquier usuario con el enlace`.
10. Implementar y copiar el enlace final.

## Carga inicial de base

1. Abrir el enlace publicado.
2. Ingresar PIN: `galaxia2026`.
3. Ir a la pestana `Base`.
4. Pegar el contenido completo de `BASE_EDF.csv`.
5. Tocar `Importar base`.

## Uso diario

- Enviar el link a los relevadores.
- Cada relevador ingresa el codigo de cliente, marca OK o No OK por cada EDF, y guarda.
- El reporte queda en la pestana `Reporte` de la app y tambien en la hoja `RELEVAMIENTOS` de Google Sheets.

## Seguridad simple

La app usa PIN `galaxia2026`. Si queres cambiarlo, modificar `APP_PIN` en `Code.gs` y volver a implementar.
