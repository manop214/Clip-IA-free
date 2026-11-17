// CLIPIA STUDIO — backend MVP
// Requiere Node.js 20+, FFmpeg instalado y una clave API de OpenAI.
const express = require("express");
const multer = require("multer");
const OpenAI = require("openai");
const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");
const { v4: uuid } = require("uuid");

const execFileAsync = promisify(execFile);
const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const INPUTS = path.join(ROOT, "uploads");
const OUTPUTS = path.join(ROOT, "outputs");
for (const dir of [INPUTS, OUTPUTS]) fs.mkdirSync(dir, { recursive: true });

app.use(express.static(path.join(ROOT, "public")));
app.use("/outputs", express.static(OUTPUTS));

const upload = multer({
  dest: INPUTS,
  limits: { fileSize: 500 * 1024 * 1024 }, // límite de carga: 500 MB
  fileFilter: (_req, file, cb) => {
    const ok = /^video\/(mp4|quicktime|webm|x-matroska)$/i.test(file.mimetype);
    cb(ok ? null : new Error("Formato no compatible. Usa MP4, MOV o WEBM."), ok);
  }
});

const jobs = new Map();
const openai = () => {
  if (!process.env.OPENAI_API_KEY) throw new Error("Falta configurar OPENAI_API_KEY en el servidor.");
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
};

async function runFfmpeg(args) {
  await execFileAsync("ffmpeg", args, { timeout: 30 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 });
}

async function makeClips(jobId, inputPath, clips) {
  const made = [];
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    const filename = `${jobId}-${i + 1}.mp4`;
    const output = path.join(OUTPUTS, filename);
    const duration = Math.max(5, Math.min(60, c.end - c.start));
    await runFfmpeg([
      "-y", "-ss", String(c.start), "-i", inputPath, "-t", String(duration),
      "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
      "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", output
    ]);
    made.push({ title: c.title, reason: c.reason, url: `/outputs/${filename}` });
  }
  return made;
}

async function processVideo(jobId, inputPath) {
  const job = jobs.get(jobId);
  try {
    job.status = "Analizando audio…";
    const audioPath = path.join(INPUTS, `${jobId}.mp3`);
    await runFfmpeg(["-y", "-i", inputPath, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", audioPath]);

    const stat = fs.statSync(audioPath);
    if (stat.size > 24 * 1024 * 1024) {
      throw new Error("El audio supera el límite de 24 MB para transcripción en esta versión. Prueba un vídeo más corto.");
    }

    job.status = "Transcribiendo…";
    const ai = openai();
    const transcript = await ai.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"]
    });

    const segments = (transcript.segments || []).map(s => ({
      start: s.start, end: s.end, text: s.text
    }));
    if (!segments.length) throw new Error("No se detectó suficiente diálogo para encontrar momentos.");

    job.status = "Buscando los mejores momentos…";
    const completion = await ai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Eres editor de vídeo corto. Elige entre 1 y 5 momentos con gancho, emoción, información útil, humor o acción verbal. Devuelve JSON: {clips:[{start:number,end:number,title:string,reason:string}]}. Usa segundos del transcript, clips de 15 a 55 segundos, no inventes tiempos y evita solapamientos." },
        { role: "user", content: JSON.stringify(segments) }
      ]
    });
    const parsed = JSON.parse(completion.choices[0].message.content || "{}");
    const duration = segments[segments.length - 1].end;
    const clips = (parsed.clips || []).filter(c =>
      Number.isFinite(c.start) && Number.isFinite(c.end) &&
      c.start >= 0 && c.end > c.start && c.end <= duration + 2
    ).slice(0, 5);
    if (!clips.length) throw new Error("La IA no encontró clips válidos en este vídeo.");

    job.status = "Editando clips verticales…";
    job.clips = await makeClips(jobId, inputPath, clips);
    job.status = "Listo";
    job.done = true;
  } catch (err) {
    job.status = "Error";
    job.error = err.message || "No se pudo procesar el vídeo.";
    job.done = true;
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(path.join(INPUTS, `${jobId}.mp3`)); } catch {}
  }
}

app.post("/api/create", upload.single("video"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Selecciona un vídeo." });
  const id = uuid();
  jobs.set(id, { id, status: "En cola…", clips: [], done: false });
  res.json({ jobId: id });
  processVideo(id, req.file.path);
});

app.get("/api/jobs/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Trabajo no encontrado." });
  res.json(job);
});

app.use((err, _req, res, _next) => {
  res.status(400).json({ error: err.message || "Error al recibir el archivo." });
});

app.listen(PORT, () => console.log(`CLIPIA STUDIO listo en http://localhost:${PORT}`));
