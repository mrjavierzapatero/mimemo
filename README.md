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
