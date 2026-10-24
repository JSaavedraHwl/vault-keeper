# Gestor de inventario para Destiny 2

App web personal estilo DIM, hecha con Next.js (App Router), TypeScript, Tailwind y la API oficial de Bungie
(`bungie-api-ts`). Estado actual: **hito 1** — login con Bungie, manifest en español y lectura del alijo.

## 1. Registrar la app en Bungie

1. Entra en <https://www.bungie.net/en/Application> con tu cuenta y pulsa **Create New App**.
2. Rellena:
   - **Application Name**: el que quieras.
   - **OAuth Client Type**: **Confidential** (el client secret vive solo en el servidor).
   - **Redirect URL**: `https://localhost:3000/api/auth/callback` (debe coincidir exactamente con `BUNGIE_REDIRECT_URI`).
   - **Origin Header**: `*` (o déjalo vacío; las llamadas se hacen desde el servidor).
3. **Scopes** (permisos) a marcar:
   - **Read your Destiny 1 and 2 information** (Destiny 2 y Destiny 1): lectura de inventario, alijo y personajes.
   - **Move or equip Destiny gear and other items**: transferir y equipar (no se usa aún, pero se pedirá en el consentimiento; así no hay que reautorizar luego).
4. Guarda y copia: **API Key**, **OAuth client_id** y **OAuth client_secret**.

## 2. Variables de entorno

```
cp .env.example .env.local     # en Windows: copy .env.example .env.local
```

Rellena `.env.local` (nunca se sube a git):

| Variable | Qué es |
| --- | --- |
| `BUNGIE_API_KEY` | API Key de tu app |
| `BUNGIE_CLIENT_ID` | OAuth client_id |
| `BUNGIE_CLIENT_SECRET` | OAuth client_secret |
| `BUNGIE_REDIRECT_URI` | `https://localhost:3000/api/auth/callback` |
| `SESSION_SECRET` | Cadena aleatoria de 32+ caracteres para cifrar la cookie de sesión |

Generar `SESSION_SECRET`:

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## 3. HTTPS local

Bungie exige HTTPS en la redirect URL.

### Opción A (por defecto): `next dev --experimental-https`

`npm run dev` ya lo incluye. Next.js genera un certificado autofirmado en `certificates/` (ignorado por git).
La primera vez el navegador mostrará una advertencia: acepta la excepción para `localhost`.

### Opción B: `mkcert` (certificado de confianza, sin advertencias)

```
# Windows (con Chocolatey o Scoop)
choco install mkcert        # o: scoop install mkcert
mkcert -install             # instala la CA local una sola vez
mkdir certificates
mkcert -key-file certificates/localhost-key.pem -cert-file certificates/localhost.pem localhost 127.0.0.1 ::1

npx next dev --experimental-https --experimental-https-key certificates/localhost-key.pem --experimental-https-cert certificates/localhost.pem
```

## 4. Ejecutar

```
npm install
npm run dev
```

Abre <https://localhost:3000>, pulsa **Iniciar sesión con Bungie** y autoriza la app. Serás llevado a `/vault`.

La primera carga descarga el manifest (≈30–40 s). Se cachea en `.cache/manifest/es/manifest.json` y solo se
vuelve a descargar cuando Bungie publica una versión nueva (se comprueba como máximo una vez por hora).
Para forzar la descarga, borra la carpeta `.cache/`.

## Estructura

```
src/
├─ lib/
│  ├─ env.ts               variables de entorno (solo servidor)
│  ├─ bungie/              cliente HTTP (X-API-Key, reintentos), OAuth, sesión, perfil
│  ├─ manifest/            descarga y caché en disco del manifest (es)
│  └─ inventory/           normalización a NormalizedItem y lectura del alijo
└─ app/
   ├─ api/auth/            login, callback, refresh, logout
   ├─ api/dev/manifest/    diagnóstico del manifest (solo fuera de producción)
   └─ vault/               página del alijo con filtros y búsqueda
```

## Seguridad

- El client secret y los tokens solo existen en el servidor. El navegador recibe únicamente una cookie
  `httpOnly`, `secure`, `sameSite=lax`, cifrada con `iron-session`.
- El `state` aleatorio de OAuth se valida en el callback para evitar CSRF.
- El access token se refresca automáticamente cuando caduca (vía `/api/auth/refresh`).

## Problemas frecuentes

- **`Falta la variable de entorno ...`**: completa `.env.local` y reinicia `npm run dev`.
- **Vuelves a `/` con "state inválido"**: abriste el login en otra pestaña o caducó (10 min). Reintenta.
- **"Bungie en mantenimiento"**: la API está desactivada; espera.
- **Alijo vacío o error de inventario**: comprueba que marcaste el scope de lectura y que tu cuenta tiene Destiny 2 vinculada.
