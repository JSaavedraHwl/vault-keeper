# Pendientes y decisiones aplazadas

Lista viva de lo que se dejó fuera a propósito, con el motivo y lo que haría falta para retomarlo.
Marca con ✅ lo que se vaya haciendo.

## Aplazado por decisión

### Subclase, fragmentos y aspectos en los loadouts
- **Qué es:** que un loadout recuerde y aplique también la subclase (Solar, Vacío...), sus aspectos y fragmentos.
- **Por qué se aplazó:** equipar la subclase es sencillo (es un ítem más), pero cambiar aspectos y fragmentos es otra
  operación de la API (insertar *plugs* en sockets, `InsertSocketPlug*`), con reglas propias: coste de energía de los
  fragmentos, aspectos que dan ranuras de fragmento, y el hecho de que depende de lo que tengas desbloqueado.
- **Qué haría falta:** leer los sockets de la subclase (componente 305 ya se pide), guardar la selección de plugs en el
  loadout, un planificador que respete el límite de fragmentos, y la acción de insertar plug en la capa de acciones
  (con su cola, auditoría y deshacer, como el resto).
- **Decisión:** el usuario ajusta fragmentos y aspectos a mano en el juego. Retomar si resulta incómodo.

### Asistente conversacional con IA
- **Qué es:** el chat de la fase 4 («arma un loadout para Grandmaster con void Titán»).
- **Por qué se aplazó:** se pasó el proyecto a «solo reglas» (la API de Anthropic se paga aparte del plan Pro).
- **Qué haría falta:** una `ANTHROPIC_API_KEY`, herramientas de consulta del inventario, y límites de gasto. La
  arquitectura ya separa el motor (reglas, planificador, acciones), así que se puede enchufar encima.

### Fuente de «mejores perks» (meta)
- **Qué es:** usar una lista de deseos (wish list) para que «mejor copia» de un arma duplicada sepa qué perks valen.
- **Por qué se aplazó:** hay que confirmar la licencia y los términos de la lista que se use; no se sacan datos de sitios
  sin permiso. Hoy solo cuentan los perks que el usuario marca en su perfil.
- **Qué haría falta:** importar un archivo en formato DIM que el usuario descargue y coloque en una carpeta; usarlo como
  una señal más del puntaje (con su motivo visible).

## Mejoras conocidas

- **Optimizador de stats de armadura:** dado un objetivo (p. ej. recuperación y resiliencia altas), calcular qué
  combinación de las piezas del usuario lo consigue. Cálculo determinista, sin IA.
- **Limpieza también sobre los personajes:** hoy solo analiza el alijo, así que «única copia» puede ser falso si hay otra
  en un personaje.
- **Filtro «solo alta confianza»** al mover basura, e **informe de precisión** (cuántas sugerencias corrige el usuario).
- **Filtros de campeón, munición y elemento en Alijo** (hoy solo están en Equipar).
- **Buscar por perk** («armas con Torrente»).
- **Limpiar correcciones de ítems que ya no existen** (`data/overrides.json` crece con ítems desmantelados).
- **Rasgos de origen y progreso de patrón/Deepsight:** no se leen todavía.
- **Pruebas con navegador real** (clics y estados dinámicos): hoy solo hay renderizado y lógica.
- **«Añadir al loadout» desde Equipar:** botón en la barra de selección para meter un arma o armadura en un loadout.

## Hecho

- ✅ Login, manifest y alijo (fase 1).
- ✅ Clasificación por reglas, perfil de uso, correcciones manuales y limpieza (fase 2).
- ✅ Acciones reales: bloquear, mover, equipar, mandar al inventario y deshacer (fase 3).
- ✅ Equipar con filtros de campeón, munición y elemento, y rediseño visual.
- ✅ Loadouts con armas y armaduras: crear, guardar lo que llevas puesto, editar, equipar de una vez y deshacer
  (sin subclase, aspectos ni fragmentos: ver más arriba).
