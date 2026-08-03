# NPS cloud

App compartida para cargar comentarios, planes de accion, responsables, fecha compromiso y estado.

## 1. Crear tablas

En el mismo proyecto Supabase usado para EDF:

1. Abrir `SQL Editor`.
2. Crear una query nueva.
3. Pegar `supabase-schema.sql`.
4. Ejecutar `Run`.

## 2. Probar local

Abrir:

`http://localhost:5173/nps-cloud/index.html`

La app ya tiene configurada la URL y anon key del proyecto Supabase.

## 3. Publicar

Subir la carpeta `nps-cloud` a Netlify con deploy manual.

## 4. Uso

- `Cargar`: buscar cliente y guardar plan/comentario.
- `Seguimiento`: ver todos los planes y exportar CSV.
- `Base`: importar casos NPS desde CSV si existe una base inicial.

## Columnas sugeridas para importar base

`clientCode,clientName,promoter,zone,npsScore,reason,segment,status`
