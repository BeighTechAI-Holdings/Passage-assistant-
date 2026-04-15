async function readJsonBody(req: any): Promise<Record<string, unknown>> {
  const b = req?.body;
  if (Buffer.isBuffer(b)) {
    try {
      return JSON.parse(b.toString('utf8')) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof b === 'string') {
    try {
      return b.trim() ? (JSON.parse(b) as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (b != null && typeof b === 'object' && !Array.isArray(b)) {
    return b as Record<string, unknown>;
  }
  if (!req || typeof req.on !== 'function') {
    return {};
  }
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8'));
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.end('Method Not Allowed');
    return;
  }

  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE_ID || 'c6SfcYrb2t09NHXiT80T';

    if (!apiKey) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing ELEVENLABS_API_KEY' }));
      return;
    }

    const body = await readJsonBody(req);
    const text = String(body?.text || '').trim();
    if (!text) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing text' }));
      return;
    }

    const elevenRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        // Turbo is lower-latency than multilingual for English-heavy content
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.45, similarity_boost: 0.85 },
      }),
    });

    if (!elevenRes.ok) {
      const errText = await elevenRes.text().catch(() => '');
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'ElevenLabs request failed', status: elevenRes.status, details: errText }));
      return;
    }

    const audio = Buffer.from(await elevenRes.arrayBuffer());
    res.statusCode = 200;
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.end(audio);
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: e?.message || 'Unknown error' }));
  }
}
