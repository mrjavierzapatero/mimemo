# mimemo 🎙️

**Captura y ordena tu memoria personal con voz.**

mimemo es una Progressive Web App (PWA) que te permite grabar ideas, reuniones, tareas, notas y recordatorios por voz.

## ✨ Funcionalidades

- 🎙️ **Grabación por voz** — Toca el botón y habla cuando el navegador lo permite
- 🧠 **Clasificación local** — Distingue ideas, reuniones, tareas, notas y recordatorios sin servicios externos
- 📅 **Recordatorios básicos** — Detecta fecha/hora y prepara avisos locales
- 📁 **Organización** — Filtra por tipo de memoria
- 💬 **Ask Pocket local** — Pregunta a tu memoria guardada, con límite de 2 preguntas/día en modo Pocket
- ✅ **Tareas** — Lista local de tareas y recordatorios detectados
- 🧩 **Mapa mental** — Visualiza tu memoria agrupada por categorías
- ✏️ **Editar memoria** — Modifica cualquier campo después de guardar
- 🔍 **Búsqueda** — Busca en toda tu memoria a la vez
- 📤 **Compartir** — WhatsApp, email o copiar al portapapeles
- 💾 **Exportar** — Descarga tu memoria en `.txt`
- 📱 **Instalable** — Funciona como app nativa en móvil (PWA)

## 🧠 Roadmap Pocket / Unlimited

La versión actual implementa una capa **Pocket local**: transcripción del navegador, búsqueda, Ask limitado, tareas, mapa mental y exportación en texto plano.

La capa **Unlimited** necesita backend: cuentas reales, sincronización, transcripción de alta precisión, detección de hablantes, modelos avanzados, adjuntos, descarga de audio, avisos garantizados, widgets y exportaciones completas.

## 🚀 Cómo usar

1. Abre `index.html` en un servidor local o despliega en GitHub Pages / Netlify
2. Toca el botón central para grabar una idea, reunión, tarea o recordatorio
3. mimemo la clasifica y la guarda localmente
4. Entra en Asistente para buscar, preguntar, revisar tareas o ver el mapa mental
5. Activa notificaciones desde Ajustes si quieres avisos locales

## 🔔 Avisos

mimemo puede mostrar notificaciones locales cuando la app está abierta o se vuelve a abrir.

Para avisos garantizados aunque la app esté cerrada, el siguiente paso será añadir backend.

## Agenda personal de Leteo · preparación local29/10/2026

La captura por texto y el texto producido por el dictado existente pasan ahora por una confirmación editable de título, fecha, hora, lugar y repetición. El micrófono no se ha probado en este bloque. Nada se guarda como cita antes de confirmar; también se puede conservar solo como nota, sin fecha ni avisos.

El módulo `agenda.js` usa Europe/Madrid, rechaza fechas imposibles/pasadas y horas inexistentes o repetidas por el cambio horario. El parser admite un conjunto acotado de expresiones españolas, no comprensión universal: ante datos dudosos pide corrección. Las órdenes habladas de cambiar/cancelar no se ejecutan; se usa Editar en la memoria guardada.

Las rutinas diarias/semanales preparan 4 ocurrencias para revisión, sin renovación automática. Se calculan 24 horas y 1 hora reales antes de cada ocurrencia; los avisos ya pasados se omiten. Todas las citas nuevas llevan `deliveryMode: preview-only`: NO envían notificaciones, aunque ya exista permiso del navegador. Editar recalcula el plan; cancelar conserva la nota y anula el plan local. La prevención de duplicados compara título normalizado, instante, lugar y repetición; no identifica equivalencia semántica universal.

Pruebas dirigidas: `node tests/agenda-local29Oct.cjs`. Evidencia y límites en `docs/operacion/nocturna-20261029/verification.json`. No se migraron ni borraron notas reales, no se conectó calendario, no hubo citas o avisos reales ni despliegue. Falta elegir calendario/cuenta y probar dictado y avisos con el Galaxy S24 real, pantalla bloqueada y app cerrada.

## 🗂️ Estructura del proyecto

```
mimemo/
├── index.html              # App principal (HTML + CSS + JS todo-en-uno)
├── manifest.json           # Configuración PWA
├── sw.js                   # Service Worker (offline support)
├── .gitignore
├── README.md
└── assets/
    └── icons/
        ├── icon-192.png    # Icono PWA
        ├── icon-512.png    # Icono PWA grande
        ├── apple-touch-icon.png
        ├── icon_mimemo.svg
        ├── rec_button_mimemo.svg
        ├── folder.svg
        ├── mis_ideas.svg
        ├── search.svg
        ├── share.svg
        └── more.svg
```

## 🌐 Despliegue

### GitHub Pages
1. Sube el proyecto a un repo en GitHub
2. Ve a Settings → Pages → Source: `main` branch, carpeta `/` (root)
3. Accede a `https://tuusuario.github.io/mimemo/`

### Servidor local
```bash
# Con Python
python3 -m http.server 8080

# Con Node.js
npx serve .
```

## 🔒 Privacidad

- Todas las memorias se guardan **localmente** en tu dispositivo (localStorage)
- No hay API Key ni análisis externo en esta versión
- No hay servidor propio, ni base de datos, ni analíticas

## 📄 Licencia

Proyecto personal — uso libre.

## Calendario personal local — 31/10/2026

La prueba vigente incorpora `calendar.js`, `calendar-ui.js` y `calendar.css`,
sin dependencias nuevas. A partir de un dictado propone varias entradas con
sus propias fechas y lugares literales; las revisa el usuario antes de guardar.
Incluye cumpleaños anuales, entradas de día sin hora inventada, mes completo
con flechas inferiores, semana, detalle de día y botones alternativos al gesto
de separar/juntar dos dedos. Mantiene el aspecto grafito/ámbar de Leteo.

Los avisos de24h y1h se preparan, no están activados en el teléfono. Una entrada
sin hora no recibe una hora de aviso por inferencia. No hay conexión nueva a
Samsung/Google ni prueba física del Galaxy S24. El reconocimiento español es
acotado: las fechas ambiguas, contradictorias o fuera de lo admitido requieren
revisión. No se guardaron las citas reales de la captura de Javier para probar.

Se conserva el emisor local de memoria y su protección ante cambios en otra
pestaña/almacenamiento fallido. Las pruebas usan datos sintéticos:37casos del
módulo nuevo,53regresiones VM y recorridos reales de navegador360×780 y1360×900,
incluidos gestos multitáctiles simulados en una página aislada. Evidencia,
límites y rollback: `docs/operacion/calendario-20261031/verification.json`.
Para repetir: `node tests/calendar31Oct.cjs` y `node tests/agenda-local29Oct.cjs`.

La vista local sigue en `http://127.0.0.1:18791` mientras el servidor esté activo
en este Mac. Copiar el dictado no guardado antes de recargar. Esa dirección no
es un despliegue accesible desde el Samsung ni acredita disponibilidad24/7.
