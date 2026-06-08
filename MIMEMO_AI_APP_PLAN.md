# Mimemo AI App Plan

## Vision

Mimemo deja de ser solo una app para guardar ideas y pasa a ser una memoria personal inteligente para gestionar todo: notas habladas, reuniones, tareas, recordatorios, archivos, mapas mentales, preguntas sobre tu propia memoria y exportaciones.

## Product Tiers

### Pocket

- Transcripcion ilimitada con precision estandar.
- Resumenes ilimitados guardados durante 30 dias.
- Ask Pocket limitado a 2 mensajes por dia.
- Tareas ilimitadas.
- Integraciones basicas de tareas.
- Mapas mentales dentro de la app.
- Exportacion en texto plano.

### Unlimited

- Resumenes ilimitados guardados para siempre.
- Transcripcion de maxima precision.
- Deteccion automatica de nombres de hablantes.
- Ask Pocket ilimitado.
- Acceso a los modelos de IA mas capaces disponibles en la arquitectura.
- Highlights diarios.
- Widgets en pantalla de inicio.
- Plantillas personalizadas.
- Regeneracion de resumenes.
- Tareas ilimitadas e integraciones avanzadas.
- Adjuntos de archivos.
- Exportacion de mapas mentales.
- Formatos completos de exportacion.
- Descarga de audios.

## What Can Stay Local

Estas funciones pueden seguir viviendo en la PWA actual:

- Captura rapida de texto.
- Dictado del navegador cuando HTTPS y el dispositivo lo permiten.
- Clasificacion basica local.
- Busqueda local.
- Exportacion de texto.
- Mapas mentales simples generados desde las memorias locales.
- Tareas locales.
- Resumenes basicos no garantizados.

## What Requires Backend

Estas funciones no deben depender solo de `localStorage`:

- Cuentas reales de usuario.
- Sincronizacion entre dispositivos.
- Resumenes guardados para siempre.
- Adjuntos de archivos.
- Descargas de audio.
- Transcripcion de alta precision.
- Deteccion de hablantes.
- Ask Pocket ilimitado.
- Regeneracion de resumenes.
- Integraciones con apps externas.
- Avisos garantizados aunque la app este cerrada.
- Widgets alimentados por datos sincronizados.

## Recommended Architecture

### Frontend

- PWA Mimemo.
- Captura de voz/texto.
- Vistas: Capturar, Memoria, Ask, Tareas, Mapa.
- Modo offline limitado.
- Exportaciones desde navegador cuando sea posible.

### Backend

- Autenticacion de usuario.
- Base de datos para memorias, resumenes, tareas, recordatorios y conversaciones.
- Almacenamiento de archivos y audios.
- Cola de procesamiento para transcripcion/resumen.
- Scheduler para recordatorios y highlights diarios.
- API propia para no exponer claves de IA en el navegador.

### AI Layer

- Servicio de transcripcion.
- Servicio de resumenes con plantillas.
- Servicio de preguntas sobre memoria personal.
- Extraccion estructurada de tareas, fechas, personas y decisiones.
- Generacion de mapas mentales.

## Core Data Model

### memory_items

- id
- user_id
- type: idea, meeting, reminder, task, note, file
- title
- raw_text
- summary
- created_at
- expires_at
- pinned
- source: voice, text, file, import

### transcripts

- id
- memory_item_id
- audio_url
- transcript_text
- accuracy_mode
- speaker_detection_enabled
- speakers
- created_at

### tasks

- id
- user_id
- memory_item_id
- title
- status
- due_at
- integration_target
- external_id

### reminders

- id
- user_id
- memory_item_id
- remind_at
- channel
- sent_at

### ask_messages

- id
- user_id
- question
- answer
- created_at
- tier_counted

### files

- id
- user_id
- memory_item_id
- file_url
- file_type
- original_name
- created_at

## Implementation Phases

### Phase 1: Local Pocket Prototype

- Keep the current static PWA.
- Add Ask view with local search over saved memories.
- Add task view.
- Add mind map view.
- Add 30-day expiry for Pocket summaries.
- Add plain text export.

### Phase 2: Backend Foundation

- Add real auth.
- Move memory from localStorage to database.
- Add file/audio storage.
- Add API gateway for AI calls.
- Preserve local-only fallback.

### Phase 3: Unlimited Intelligence

- High accuracy transcription.
- Speaker names and diarization.
- Summary templates.
- Summary regeneration.
- Ask Pocket unlimited for paid tier.
- Mind map export.
- Full export formats.
- Audio downloads.

### Phase 4: Assistant Layer

- Daily highlights.
- Reminder scheduler.
- External task integrations.
- Home screen widgets.
- Smart review of overdue tasks and stale notes.

## Immediate Next Build

The next code step should be Phase 1:

1. Add an Ask tab.
2. Add a Tasks tab.
3. Add a Mind Map tab.
4. Add feature limits in local settings.
5. Keep existing capture flow working.

