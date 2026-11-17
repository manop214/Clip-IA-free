# CLIPIA STUDIO — MVP

## Qué hace
- Permite subir un vídeo propio o autorizado.
- Extrae el audio con FFmpeg.
- Transcribe con Whisper (`whisper-1`) y marcas de tiempo.
- Usa `gpt-4o-mini` para elegir entre 1 y 5 momentos.
- Genera clips MP4 verticales 1080x1920 con FFmpeg.
- Muestra enlaces de descarga.

## Requisitos
- Node.js 20 o superior
- FFmpeg instalado y disponible en PATH
- Clave de API de OpenAI con acceso a los modelos usados

## Instalación
1. Descomprime el proyecto.
2. Abre una terminal dentro de la carpeta.
3. Ejecuta `npm install`.
4. Configura la variable de entorno `OPENAI_API_KEY` (no la pongas en el HTML ni la compartas).
   - macOS/Linux: `export OPENAI_API_KEY="tu_clave"`
   - Windows PowerShell: `$env:OPENAI_API_KEY="tu_clave"`
5. Ejecuta `npm start`.
6. Abre `http://localhost:3000`.

## Límites de este prototipo
- La versión inicial procesa archivos subidos, no páginas de YouTube ni enlaces de streams.
- La transcripción requiere voz; los momentos se eligen principalmente por lo que se dice.
- El audio extraído debe quedar por debajo de 24 MB para esta versión.
- El recorte vertical usa el centro de la imagen; todavía no incluye seguimiento inteligente de caras.
- No incluye subtítulos quemados, música licenciada, cuentas, pagos ni cola persistente.
- Para streams se debe conectar una fuente autorizada (por ejemplo, RTMP/HLS propio) y añadir control de acceso, almacenamiento y procesamiento en segundo plano.
- Usa únicamente material propio o para el que tengas permiso. Respeta derechos de autor y condiciones de las plataformas.

## Para producción
Añade autenticación, límites por usuario, almacenamiento privado, limpieza automática de archivos, validación de URLs para evitar SSRF, protección contra abuso, colas de trabajos (Redis/BullMQ), y despliegue de FFmpeg en workers. No expongas la clave de OpenAI al navegador.
