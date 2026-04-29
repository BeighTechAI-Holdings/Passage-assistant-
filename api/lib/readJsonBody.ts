/** Same behavior as api/tts.ts — Vercel sometimes delivers POST bodies as strings/buffers. */
export async function readJsonBody(req: any): Promise<Record<string, unknown>> {
  const b = req?.body;
  if (Buffer.isBuffer(b)) {
    try {
      return JSON.parse(b.toString("utf8")) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof b === "string") {
    try {
      return b.trim() ? (JSON.parse(b) as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (b != null && typeof b === "object" && !Array.isArray(b)) {
    return b as Record<string, unknown>;
  }
  if (!req || typeof req.on !== "function") {
    return {};
  }
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), "utf8"));
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8").trim();
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}
