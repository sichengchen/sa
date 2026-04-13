import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type TranscriptionBackend = "whisper-cpp" | "whisper-python" | "openai-api";

export interface TranscriberOptions {
  preferLocal: boolean;
}

export interface Transcriber {
  transcribe(audio: Buffer, format: string): Promise<string>;
  backend: TranscriptionBackend | null;
}

async function commandExists(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, ["--help"], { stdio: "ignore" });
    proc.on("error", () => resolve(false));
    proc.on("close", () => resolve(true));
  });
}

async function detectLocalBackend(): Promise<"whisper-cpp" | "whisper-python" | null> {
  if (await commandExists("whisper-cli")) return "whisper-cpp";
  if (await commandExists("whisper-cpp")) return "whisper-cpp";
  if (await commandExists("whisper")) return "whisper-python";
  return null;
}

async function transcribeWithWhisperCpp(audio: Buffer, format: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "aria-audio-"));
  const inputPath = join(dir, `input.${format}`);
  const outputPath = join(dir, "input.txt");

  await writeFile(inputPath, audio);

  try {
    const cmd = (await commandExists("whisper-cli")) ? "whisper-cli" : "whisper-cpp";
    return await new Promise<string>((resolve, reject) => {
      const proc = spawn(
        cmd,
        [
          "-m",
          process.env.WHISPER_CPP_MODEL || "",
          "-f",
          inputPath,
          "--output-txt",
          "--output-file",
          join(dir, "input"),
        ].filter(Boolean),
        {
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 120_000,
        },
      );

      let stderr = "";
      proc.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      proc.on("error", (error) => reject(error));
      proc.on("close", async (code) => {
        if (code !== 0) {
          reject(new Error(`whisper-cpp exited with code ${code}: ${stderr}`));
          return;
        }
        try {
          const text = await readFile(outputPath, "utf-8");
          resolve(text.trim());
        } catch {
          reject(new Error("whisper-cpp produced no output file"));
        }
      });
    });
  } finally {
    try {
      await rm(dir, { recursive: true, force: true });
    } catch {}
  }
}

async function transcribeWithWhisperPython(audio: Buffer, format: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "aria-audio-"));
  const inputPath = join(dir, `input.${format}`);

  await writeFile(inputPath, audio);

  try {
    return await new Promise<string>((resolve, reject) => {
      const proc = spawn(
        "whisper",
        [inputPath, "--model", "small", "--output_format", "txt", "--output_dir", dir],
        {
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 120_000,
        },
      );

      let stderr = "";
      proc.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      proc.on("error", (error) => reject(error));
      proc.on("close", async (code) => {
        if (code !== 0) {
          reject(new Error(`whisper exited with code ${code}: ${stderr}`));
          return;
        }
        try {
          const text = await readFile(join(dir, "input.txt"), "utf-8");
          resolve(text.trim());
        } catch {
          reject(new Error("whisper produced no output file"));
        }
      });
    });
  } finally {
    try {
      await rm(dir, { recursive: true, force: true });
    } catch {}
  }
}

async function transcribeWithOpenAI(audio: Buffer, format: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set - cannot use cloud transcription");

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(audio)], { type: `audio/${format}` });
  formData.append("file", blob, `audio.${format}`);
  formData.append("model", "whisper-1");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI Whisper API error (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { text: string };
  return data.text.trim();
}

export async function createTranscriber(options: TranscriberOptions): Promise<Transcriber> {
  const localBackend = await detectLocalBackend();
  const hasOpenAI = !!process.env.OPENAI_API_KEY;

  let backend: TranscriptionBackend | null = null;
  if (options.preferLocal && localBackend) {
    backend = localBackend;
  } else if (hasOpenAI) {
    backend = "openai-api";
  } else if (localBackend) {
    backend = localBackend;
  }

  return {
    backend,
    async transcribe(audio: Buffer, format: string): Promise<string> {
      if (!backend) {
        throw new Error(
          "No transcription backend available. Install whisper-cpp/whisper locally, or set OPENAI_API_KEY for cloud transcription.",
        );
      }

      switch (backend) {
        case "whisper-cpp":
          return transcribeWithWhisperCpp(audio, format);
        case "whisper-python":
          return transcribeWithWhisperPython(audio, format);
        case "openai-api":
          return transcribeWithOpenAI(audio, format);
      }
    },
  };
}
