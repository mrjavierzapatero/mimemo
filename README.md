# Leteo

Leteo es la agenda personal de Javier. Su pantalla principal sigue la segunda
página de `Branding/branding Leteo-v2.ai`: blanco y logotipo amarillo. El micrófono
amarillo acompaña a «No olvidar»; las ondas aparecen durante el dictado.
«No olvidar» abre el dictado; «Casa» abre el calendario de mes. Una
pulsación prolongada sobre una semana abre la semana, y sobre un día abre el día.
Los puntos negros del mes cuentan citas, no avisos.

## Cómo funciona

1. Toca «No olvidar» y dicta una sola cita.
2. Revisa el texto, la fecha, la hora, el lugar y la repetición. Una hora como
   «3:45» sin mañana o tarde queda por confirmar, para evitar una alarma a las
   03:45 cuando querías 15:45.
3. Guarda la cita. En Android, Leteo programa en el propio teléfono los avisos
   futuros: víspera a las 20:00, mismo día a las 09:00 y una hora antes. Si la
   cita no tiene hora, prepara solo los dos primeros. Cada semana se repite en
   el mismo día y hora hasta que se cancela o se edita.
4. Desde Casa puedes comprobar el estado de los permisos. Si falta alguno, la cita se guarda
   pero Casa la indica como pendiente de activar.

La interfaz de ideas y asistente queda fuera del flujo actual. Las citas se
conservan en el almacenamiento local de esta instalación; no hay cuenta ni
sincronización entre dispositivos. El dictado de Android usa el servicio de
reconocimiento disponible en el teléfono y podría requerir red. El texto es
editable antes de guardar.

## App Android

Código nativo y empaquetado: `android-app/`. La app incluye los archivos web y
usa reconocimiento de voz y notificaciones locales de Android. Los avisos
programados no dependen de que la página web siga abierta. Requieren que Android
conceda notificaciones y alarmas exactas. La prueba física en el Galaxy debe
confirmar voz, sonido, pantalla bloqueada y una repetición real.

Para compilar un APK de prueba con JDK 21 y Android SDK 36 instalados:

```bash
cd android-app
npm ci
npm run sync
npm run assets
cd android
./gradlew assembleDebug
```

APK resultante: `android-app/android/app/build/outputs/apk/debug/app-debug.apk`.
El workflow `.github/workflows/leteo-android-debug.yml` usa un runner con SDK
Android y guarda el APK de prueba como artefacto durante 7 días. Este APK de
depuración sirve para probar en el móvil; una distribución permanente requiere
firma y versión de lanzamiento. Cada runner firma el APK de prueba con una clave
temporal distinta: instalar otro APK de prueba puede exigir desinstalar el
anterior y borrar sus citas. Para la prueba usa citas ficticias.

Por petición de Javier, en `output/android/` y en la carpeta de entrega de
Dropbox se conserva solo la APK más reciente. Una vez verificada y copiada la
nueva entrega, eliminar las APK anteriores de Leteo, sus ZIP y los temporales
de extracción. No acumular compilaciones ni borrar otros archivos de Dropbox.

## Web de prueba y datos

La web pública anterior está en <https://leteo-prueba.vercel.app/>. Hasta una
publicación nueva, puede seguir mostrando la versión anterior. Una web estática
no garantiza que un aviso suene a la hora elegida con la página cerrada. La app
Android incluye los recursos dentro del APK; no necesita alojamiento web para
mostrar la agenda ni un servidor de push para sus avisos locales.

Los datos de la web y los de la app Android son almacenamientos distintos. No
se han migrado, subido ni borrado las notas antiguas. Las claves internas
`mimemo_ideas_v2`, `mimemo_ideas_v1` y `memo_ideas_v1` se conservan para leer
contenido previo sin ocultarlo. Los documentos históricos siguen en
`docs/historico/`.

## Verificación local

```bash
node tests/agenda-local29Oct.cjs
node tests/calendar31Oct.cjs
node tests/dictated-date4.cjs
node tests/date-review-ui.cjs
node tests/notification-planner.mjs
```

Estas comprobaciones usan texto y tiempo sintéticos. Las capturas de navegador
están en `output/playwright/branding-v2/`. No sustituyen la prueba con micrófono,
permisos y notificaciones en el Galaxy. Estado técnico: `docs/operacion/estado.json`.
