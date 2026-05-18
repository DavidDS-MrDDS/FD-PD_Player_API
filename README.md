# FDPDPlayer API

Este repositorio contiene la API REST de **FD-PD Player**, una aplicación Android de reproducción de música. La API actúa como backend de la app, gestionando los usuarios y sus canciones favoritas.

Esta API se ha hecho sobre una base proporcionada por el profesor, habiéndola modificado para adaptarla a los requerimientos de la aplicación.
Se encuentra subida en Vercel y con conexión a la base de datos de Supabase para el sistema de almacenamiento.

La aplicación Android se comunica con esta API para registrar usuarios, iniciar sesión y gestionar su biblioteca de canciones favoritas. Cada usuario puede subir, escuchar y eliminar sus propios archivos.


## Uso de la API

Sistema de login/registro:

**Registro:**
```
POST /api/register
Body: { username, email, password }
```

**Login:**
```
POST /api/login
Body: { email, password }
→ Devuelve un token JWT
```

Sistema de favoritos:

**Ver mis favoritos:**
```
GET /api/favorites
```

**Ver canciones de todos los usuarios (con posibilidad de búsqueda):**
```
GET /api/public/favorites?search=nombre&page=1&limit=10
```

**Subir una canción:**
```
1. POST /api/favorites/get-upload-url  → obtiene URL de subida
2. Subir el .mp3 directamente a Supabase con esa URL
3. POST /api/favorites/confirm-upload  → guarda nombre, artista y álbum
```

**Eliminar una canción:**
```
DELETE /api/favorites/:songKey
```
