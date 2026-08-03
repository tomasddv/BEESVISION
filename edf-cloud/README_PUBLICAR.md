# Relevamiento EDF cloud

Esta version esta pensada para publicarse como web normal y guardar datos en Supabase. No depende de la computadora prendida ni de Apps Script.

## 1. Crear base Supabase

1. Entrar a https://supabase.com
2. Crear un proyecto nuevo.
3. Ir a `SQL Editor`.
4. Pegar y ejecutar `supabase-schema.sql`.
5. Ir a `Project Settings` > `API`.
6. Copiar:
   - `Project URL`
   - `anon public key`

## 2. Publicar la app

Subir la carpeta `edf-cloud` a un hosting estatico:

- Netlify: arrastrar la carpeta `edf-cloud` a la pantalla de deploy.
- Vercel: crear proyecto usando esta carpeta como raiz.
- GitHub Pages: subir los archivos y activar Pages.

## 3. Primer ingreso

1. Abrir el link publicado.
2. Pegar `Project URL`.
3. Pegar `anon public key`.
4. PIN: `galaxia2026`.
5. Entrar.

## 4. Cargar base inicial

1. Abrir la pestana `Base`.
2. Pegar el contenido de `BASE_EDF.csv`.
3. Tocar `Importar base`.

## 5. Uso

- `Relevar`: carga por cliente y guarda el control.
- `Reporte`: seguimiento de OK, dispersiones y pendientes.
- `Base`: actualizacion de la base del sistema.

## Nota de seguridad

Esta version usa un PIN simple en la app y una clave anonima de Supabase. Es practica para equipo interno y datos operativos, pero no reemplaza autenticacion corporativa formal.
