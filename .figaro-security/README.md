# Protección transversal de secretos

Autor: Javier Zapatero. Versión inicial: 23/10/2026.

## Uso y cierre comprobable

- Instalar escáner oficial con versión y SHA-256 fijados: `node .figaro-security/install-scanner.mjs`.
- Probar el control y el escáner real con fixtures desechables: `node .figaro-security/run-tests.mjs`.
- Índice preparado para commit: `node .figaro-security/guard.mjs staged`.
- Historial completo accesible localmente: `node .figaro-security/guard.mjs history`.
- Límites de código cliente: `node .figaro-security/guard.mjs source`.
- Después del build: `node .figaro-security/guard.mjs browser`.
- Permisos/entornos acreditados: `node .figaro-security/guard.mjs governance`.
- Lanzar un comando con lista cerrada de variables, una vez acreditado el entorno:
  `node .figaro-security/with-environment.mjs test -- comando argumentos`.

El hook `pre-commit` analiza el índice, no una copia sin preparar que pueda
ocultar un secreto staged. `pre-push` lee todos los refs de stdin y analiza los
commits salientes y sus árboles. Una rama nueva incluye su historial completo.
Los hooks existentes por defecto se conservan y se ejecutan antes del control.
Los clones nuevos deben instalar el escáner y configurar `core.hooksPath` con
la ruta absoluta a `.figaro-security/hooks`. Los worktrees del mismo repositorio
comparten el hook local; el control examina el árbol del worktree desde el que
se ejecuta Git, no el checkout principal.

El workflow usa permisos de lectura, checkout sin credenciales persistentes,
acciones fijadas por SHA y no recibe secretos de aplicación. Instalar archivos
locales NO acredita que el workflow haya llegado a GitHub ni que sus checks sean
obligatorios en la protección de rama. Verificar ambas cosas por separado antes
de declarar el control remoto activo. No utilizar `pull_request_target` para
ejecutar código de un PR.

## Qué se verifica y qué no

Gitleaks reconoce patrones de secretos en código e historial. No comprueba su
validez contra proveedores, no promete detectar cualquier secreto y no analiza
por defecto archivos comprimidos, imágenes u otros formatos binarios. Las
detecciones se comunican solo mediante archivo, línea, regla y commit, sin el
valor ni la línea de código. El informe interno temporal se elimina al acabar.
No se activan baselines ni excepciones globales para ocultar hallazgos previos.
Los falsos positivos comprobados pueden registrarse individualmente en
`reviewed-history-findings.json`, con commit inmutable, archivo, línea, regla,
fecha y motivo. El recibo cuenta esas revisiones de forma separada. Esa revisión
no permite el mismo patrón en otro commit, en el índice ni en un artefacto público.

El control estático rechaza variables públicas no aprobadas o con nombres
privados, `.env` operativos versionados, exposición masiva de `process.env` y
lecturas privadas en entradas cliente y sus imports relativos/`@/`. Es una
barrera conservadora basada en patrones, no un analizador semántico completo:
aliases particulares, imports dinámicos, obfuscación y secretos de formato
desconocido requieren revisión específica. El control de artefactos examina el
JavaScript público construido y valores privados disponibles en el entorno del
proceso, también codificados de formas comunes; NO se cargan `.env` para ello.
Un build ausente no puede darse por comprobado cuando se ha declarado necesario.

Las claves públicas de Supabase y Stripe pueden ser legítimas: no conceden por
sí mismas acceso administrativo. Verificar RLS, grants y permisos del servidor;
no convertir una clave privilegiada en pública por cambiarle el nombre.

## Gestión de secretos y entornos

Usar el almacén seguro ya disponible del proveedor o un gestor aprobado, con
referencias en `policy.json`, nunca valores. Inventariar por entorno: identidad
de acceso, almacén, variables necesarias, permisos mínimos y prueba fechada.
Pruebas/desarrollo no deben recibir identidades ni credenciales de producción.
El lanzador de entorno elimina variables no declaradas y rechaza contextos sin
evidencia, identidades compartidas y variables de inyección del runtime.

`pending-provider-verification` significa pendiente real, no seguro por decreto.
No cambiar claves, permisos remotos o la forma de arrancar un servicio sin
inventariar consumidores, autorización y verificación posterior. No añadir un
servicio nuevo de secretos por defecto. Un gestor tampoco protege de un proceso
comprometido que ya está autorizado a usar el secreto.

## Incidente confirmado

1. Bloquear push/exportación/despliegue afectado. Conservar evidencia mínima
   privada, sin copiar el secreto al chat, informe o ticket.
2. Identificar proveedor, clave, privilegios, consumidores y entornos afectados;
   distinguir candidato sintético/falso positivo de credencial real expuesta.
3. Revocar o rotar en origen con autorización concreta y ventana/rollback cuando
   proceda. Una rotación puede interrumpir ingestas, pagos u otros servicios.
   Si una acción exige intervención humana, pedir exactamente esa acción.
4. Actualizar los consumidores mediante el almacén autorizado, comprobar que la
   clave anterior ya no sirve y que el servicio funciona con la nueva.
5. Revisar accesos/consumo y limpiar artefactos/historial coordinadamente cuando
   sea necesario. Borrar un archivo o reescribir Git no revoca una credencial.
6. Cerrar solo con recibo de revocación/rotación y pruebas funcionales; no hacerlo
   por una detección de formato ni por haber eliminado el texto.

Fuentes: [GitHub](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository),
[OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html),
[Gitleaks](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1),
[Vite](https://vite.dev/guide/env-and-mode),
[Next.js](https://nextjs.org/docs/pages/guides/environment-variables),
[Supabase](https://supabase.com/docs/guides/database/secure-data).
