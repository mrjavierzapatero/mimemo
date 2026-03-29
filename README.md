# mimemo 🎙️

**Captura y analiza tus ideas con voz.**

mimemo es una Progressive Web App (PWA) que te permite grabar ideas por voz, analizarlas automáticamente con Google Gemini AI y organizarlas en categorías.

## ✨ Funcionalidades

- 🎙️ **Grabación por voz** — Toca el botón y habla
- 🤖 **Análisis con IA** — Gemini genera título, resumen, viabilidad y opciones de monetización
- 📁 **Organización** — Filtra por categoría (música, app, web, negocio, otro)
- ✏️ **Editar ideas** — Modifica cualquier campo después de guardar
- 🔍 **Búsqueda** — Busca en todas tus ideas a la vez
- 📤 **Compartir** — WhatsApp, email o copiar al portapapeles
- 💾 **Exportar** — Descarga tus ideas en `.txt` o `.json`
- 📱 **Instalable** — Funciona como app nativa en móvil (PWA)

## 🚀 Cómo usar

1. Abre `index.html` en un servidor local o despliega en GitHub Pages / Netlify
2. Ve a **Ajustes** (⚙️) y añade tu API Key de Google Gemini
3. Toca el botón central para grabar una idea
4. ¡La IA la analiza automáticamente!

## 🔑 API Key

mimemo usa **Google Gemini 1.5 Flash** — completamente gratis.

1. Ve a [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Crea una API Key (no necesitas tarjeta de crédito)
3. Pégala en Ajustes dentro de la app

> **La API Key se guarda SOLO en tu dispositivo** (localStorage). Nunca se envía a ningún servidor propio.

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

- Todas las ideas se guardan **localmente** en tu dispositivo (localStorage)
- La API Key nunca sale de tu dispositivo
- No hay servidor propio, ni base de datos, ni analíticas

## 📄 Licencia

Proyecto personal — uso libre.
