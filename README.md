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

## 5. Limpieza del alijo (`/cleanup`)

Clasifica cada arma y armadura del alijo con **reglas** (sin IA) en `keep`, `archive`, `junk` o `needs_review`,
siempre con una razón de una línea. Solo sugiere: **nunca desmantela nada** (la API de Bungie no lo permite);
eso lo haces tú en el juego.

- **Reglas** (`src/lib/classify/rules`): protegido (candado/equipado/«siempre conservar»), excepciones, obsoleto,
  rareza baja, armadura, copias sobrantes de un arma, tipo de arma que no usas y mejor copia. Su orden de prioridad
  y los umbrales están en `src/lib/classify/classify.config.ts`.
- **Armaduras:** si la pieza informa su nivel (`gearTier`), manda el nivel (el total de stats depende de él). Sin
  nivel, se juzga por el total.
- **Perfil de uso** (`/cleanup/profile`): clases que juegas, PvE / Grandmaster / PvP, stats prioritarias, armas
  preferidas y perks que valoras. Se guarda en `profile/usage-profile.json`.
- **Correcciones manuales** («siempre conservar» y cambios de veredicto) en `data/overrides.json`; tienen prioridad
  sobre las reglas. Un ítem con candado, equipado o «siempre conservar» nunca sale como basura.

## 6. Acciones sobre el inventario

Desde `/cleanup`, panel **Acciones**. Todo requiere el permiso «Mover o equipar objetos de Destiny» y un clic tuyo:

1. **Bloquear los que conservo** (`keep` y `archive`). Se hace **todo de una vez**: si son 480 ítems, se ejecutan
   en tandas automáticas de 50 una tras otra, como una sola ejecución (un único «Deshacer» las revierte todas).
   Tarda unos 250 ms por ítem (480 ≈ 2 min).
2. **Mover basura a [personaje]**, por rondas del tamaño del espacio libre del personaje (10 por ranura, contando lo
   equipado) y de un tope de 50 ítems por ronda. Aquí las rondas **no** se encadenan: entre una y otra desmantelas
   en el juego lo movido y pulsas «Siguiente ronda».
3. **Deshacer última ejecución** (devuelve al alijo lo movido y restaura candados; lo desmantelado no se recupera).

Cada acción pasa por: vista previa del plan → **Simular** (no cambia nada) o **Ejecutar** → progreso en vivo con
**Cancelar** → reporte. Puedes limitar la ejecución a 1 o 2 ítems para probar. Seguridad:

- El servidor **no ejecuta el plan del navegador**: lo recalcula con datos frescos y solo toma lo que confirmaste y
  sigue siendo válido (basura, sin candado, sin equipar, en el alijo).
- Una sola ejecución a la vez; 250 ms entre llamadas; reintentos ante límites de peticiones; se detiene sola si estás
  en una actividad, hay mantenimiento o caduca la sesión.
- Cada acción queda en `data/audit-log.jsonl`. Lo aprendido de la API (p. ej. que el alijo admite candado) en
  `data/capabilities.json`.
- En **Alijo**, cada ítem tiene un botón de candado para probar con uno solo.

## 7. Equipar (`/gear`)

Filtra tus armas (alijo y personajes) por lo que necesites para una actividad y equípalas desde la app.

- **Tres ranuras separadas:** Ranura 1 (cinética), Ranura 2 (energía) y Ranura 3 (pesada). Arriba ves lo que el
  personaje lleva equipado ahora; al elegir un arma se marca en qué ranura irá y a qué arma reemplaza.
- **Filtro por campeón** (Barrera, Imparable, Sobrecarga), además de tipo, elemento, ubicación y nombre. Un arma
  puede romper a un campeón por tres vías: de serie, por un rasgo que lleva (el texto dice «Efectivo contra
  [Aturdimiento]...») o por una **ventaja de artefacto activa** de ese personaje para su tipo de arma. Las que lo
  harían *si activaras* una ventaja aparecen con una etiqueta discontinua y «?».
- **Equipar:** si el arma está en el alijo o en otro personaje, se trae antes (pasando por el alijo). Se avisa antes
  de ejecutar si no hay hueco libre o si ya llevas otra exótica (el juego solo permite una). Solo funciona en una
  zona social, en órbita o sin conexión: en una actividad, Bungie lo rechaza y la app lo explica.
- Cada paso queda en el registro de auditoría y se puede **Deshacer** (vuelve a equipar lo anterior).
- Los **loadouts** (guardar y equipar un conjunto completo, con armaduras) están en su propia pantalla, más abajo.
- **Diagnóstico:** `https://localhost:3000/api/dev/champions` (con sesión, solo fuera de producción) contrasta la
  detección con tu cuenta; sirve para comprobar si el `breakerType` de la instancia ya incluye el artefacto.

### Loadouts (`/loadouts`)

Un loadout es un conjunto con nombre (3 armas + 5 piezas de armadura) para una actividad, guardado en
`data/loadouts.json` (ignorado por git).

- **Crear:** «Nuevo loadout» (eliges pieza por ranura, con buscador), o **«Guardar lo que llevo puesto»** para copiar
  el equipo actual de un personaje. Se puede editar y borrar.
- **Equipar de una vez:** elige el personaje y pulsa «Equipar». Un loadout vale para **cualquier personaje de su
  clase**. La barra inferior muestra qué hará con cada ranura (ya puesta, del alijo, de otro personaje, ya no existe...).
- **Reglas que se comprueban antes:** una sola exótica de arma y una sola de armadura (contando lo que ya llevas en
  las ranuras que el loadout no toca); la clase de la armadura; hueco libre para traer cada pieza. Las piezas que ya
  no existen (p. ej. desmanteladas) se omiten y se avisa, en vez de fallar a medias.
- **El orden importa:** las exóticas se equipan al final, para que la exótica que se reemplaza ya se haya quitado.
- Como el resto de acciones: el servidor recalcula el plan con datos frescos, queda en la auditoría y se puede
  **Deshacer**. Solo funciona en una zona social, en órbita o sin conexión.
- **Fuera de alcance por ahora:** la subclase, los aspectos y los fragmentos (ver `docs/pendientes.md`).

## 8. Modos de prueba (no tocan tu cuenta)

| Modo | Cómo | Qué hace |
| --- | --- | --- |
| Simulación completa | `https://localhost:3000/cleanup?sim=1` | Alijo y personajes de ejemplo en memoria (con «simular desmantelado»); no necesita sesión. |
| Mock de acciones | `ACTIONS_MODE=mock` | Lee tu cuenta real, pero mover y bloquear nunca llaman a Bungie. |
| Datos de ejemplo en el análisis | `CLASSIFY_SIMULATION=1` | `/cleanup` usa los datos de `fixtures/`. |
| Tamaño de tanda | `ACTIONS_MAX_ITEMS_PER_RUN=1..500` | Cambia el tope de ítems por tanda/ronda (por defecto 50). |

## 9. Diseño

Tema «la Torre de noche»: fondo azul casi negro con estrellas, acentos dorados, marcas en las esquinas de los
paneles, tipografía condensada (Barlow Condensed) para titulares y botones, y los colores del propio juego:
**rareza** (común, poco común, raro, legendario, exótico), **elemento** (rombo de color junto al arma) y
**campeón** (Barrera naranja, Imparable rojo, Sobrecarga azul).

- Los tokens y las clases comunes (`.panel`, `.btn`, `.chip`, `.field`, `.item-card`...) están en `src/app/globals.css`.
- Las piezas visuales compartidas están en `src/components/` (`item-bits.tsx`, `emblem.tsx`, `nav.tsx`) y los colores
  del juego en `src/lib/ui/theme.ts`.
- **No uses `transform` en un contenedor de página**: convierte a ese contenedor en el bloque de los elementos
  `position: fixed` (la barra de selección de Equipar dejaría de quedar pegada abajo).
- **Vista previa sin sesión** (solo desarrollo): `https://localhost:3000/dev/preview?view=gear|gear-selected|vault|cleanup|profile|loadouts|loadouts-equip|loadouts-editor`
  muestra cada pantalla con datos realistas del manifest. No existe en producción.

## 10. Tests

```
npm test        # Vitest: reglas, perfil, planificador, cola, ejecución, deshacer y panel
npm run lint
npx tsc --noEmit
```

## Estructura

```
src/
├─ components/             navegación
├─ lib/
│  ├─ env.ts               variables de entorno (solo servidor)
│  ├─ bungie/              cliente HTTP (X-API-Key, reintentos), OAuth, sesión, perfil
│  │  └─ actions/          transferir y bloquear (real y mock), errores tipados
│  ├─ manifest/            descarga y caché en disco del manifest (es)
│  ├─ inventory/           NormalizedItem, lectura del alijo y de los personajes
│  ├─ classify/            reglas, perfil de uso y correcciones manuales
│  └─ actions/             planificador, cola, ejecución, auditoría y deshacer
└─ app/
   ├─ api/auth/            login, callback, refresh, logout
   ├─ api/classify/        análisis del alijo (progreso por etapas)
   ├─ api/actions/         plan, ejecución (streaming) y simulación
   ├─ api/dev/             diagnósticos (solo fuera de producción)
   ├─ vault/               alijo con filtros, búsqueda y candado por ítem
   └─ cleanup/             limpieza, acciones y perfil de uso
fixtures/                  alijo de ejemplo para simulación y tests
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
