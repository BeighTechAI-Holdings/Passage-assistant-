import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { google } from "googleapis";
import session from "express-session";
import cookieParser from "cookie-parser";

async function startServer() {
  const app = express();
  const PORT = 3000;
  const isProduction = process.env.NODE_ENV === "production";

  app.use(express.json());
  app.use(cookieParser());
  if (isProduction) {
    // Required when running behind a reverse proxy (Vercel/Cloud Run/etc.)
    app.set("trust proxy", 1);
  }
  // 1. Session Configuration
  // - Local dev: secure cookies are rejected on http://localhost.
  // - Prod: use SameSite=None + Secure for iframe compatibility over HTTPS.
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "passage-dev-secret",
      resave: false,
      saveUninitialized: false,
      proxy: isProduction,
      cookie: {
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
      },
    })
  );

  // 2. OAuth Client Helper
  const createOAuthClient = () => {
    const redirectUri = `${process.env.APP_URL}/auth/callback`;
    return new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );
  };

  // 3. Auth Routes
  app.post("/api/auth/firebase-session", (req, res) => {
    const { accessToken } = req.body;
    if (!accessToken) return res.status(400).json({ error: "No access token provided" });
    
    (req.session as any).tokens = { access_token: accessToken };
    req.session.save(() => {
      res.json({ success: true });
    });
  });

  app.get("/api/auth/url", (req, res) => {
    try {
      if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        return res.status(500).json({ error: "Missing Google OAuth Credentials" });
      }
      
      const client = createOAuthClient();
      const url = client.generateAuthUrl({
        access_type: "offline",
        scope: [
          "https://www.googleapis.com/auth/drive.readonly",
          "https://www.googleapis.com/auth/userinfo.profile",
          "https://www.googleapis.com/auth/userinfo.email",
        ],
        prompt: "consent",
      });
      res.json({ url });
    } catch (err) {
      res.status(500).json({ error: "Failed to create auth URL" });
    }
  });

  app.get("/auth/callback", async (req, res) => {
    const { code, error } = req.query;

    if (error || !code) {
      return res.status(400).send(`Auth Error: ${error || 'No code received'}`);
    }

    try {
      const client = createOAuthClient();
      const { tokens } = await client.getToken(code as string);
      (req.session as any).tokens = tokens;
      
      req.session.save(() => {
        res.send(`
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <div style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h2>Authenticated!</h2>
            <p>Closing window...</p>
          </div>
        `);
      });
    } catch (err: any) {
      res.status(500).send(`Token Exchange Failed: ${err.message}`);
    }
  });

  app.get("/api/auth/status", (req, res) => {
    res.json({ isAuthenticated: !!(req.session as any).tokens });
  });

  // Debug endpoint to check environment variables (safe version)
  app.get("/api/debug/config", (req, res) => {
    res.json({
      hasClientId: !!process.env.GOOGLE_CLIENT_ID,
      clientIdPrefix: process.env.GOOGLE_CLIENT_ID ? process.env.GOOGLE_CLIENT_ID.substring(0, 10) : null,
      hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
      appUrl: process.env.APP_URL,
      nodeEnv: process.env.NODE_ENV,
      redirectUri: `${process.env.APP_URL || 'http://localhost:3000'}/auth/callback`
    });
  });

  app.get("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  // ElevenLabs TTS proxy (local dev). On Vercel, use /api/tts serverless function.
  app.post("/api/tts", async (req, res) => {
    try {
      const apiKey = process.env.ELEVENLABS_API_KEY;
      const voiceId = process.env.ELEVENLABS_VOICE_ID || "c6SfcYrb2t09NHXiT80T";
      const text = String(req.body?.text || "").trim();

      if (!apiKey) return res.status(500).json({ error: "Missing ELEVENLABS_API_KEY" });
      if (!text) return res.status(400).json({ error: "Missing text" });

      const elevenRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.45, similarity_boost: 0.85 },
        }),
      });

      if (!elevenRes.ok) {
        const details = await elevenRes.text().catch(() => "");
        return res.status(502).json({ error: "ElevenLabs request failed", status: elevenRes.status, details });
      }

      const audio = Buffer.from(await elevenRes.arrayBuffer());
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "no-store");
      res.send(audio);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Unknown error" });
    }
  });

  // Drive API Proxy
  app.get("/api/drive/files", async (req, res) => {
    const tokens = (req.session as any).tokens;
    if (!tokens) return res.status(401).json({ error: "Not authenticated" });

    const folderId = req.query.folderId as string;
    const client = createOAuthClient();
    client.setCredentials(tokens);
    const drive = google.drive({ version: "v3", auth: client });

    try {
      const query = folderId ? `'${folderId}' in parents and trashed = false` : "trashed = false";
      const response = await drive.files.list({
        q: query,
        pageSize: 20,
        fields: "nextPageToken, files(id, name, mimeType, thumbnailLink, description)",
      });
      res.json(response.data);
    } catch (error) {
      console.error("Drive API error:", error);
      res.status(500).json({ error: "Failed to fetch files" });
    }
  });

  app.get("/api/drive/file/:fileId", async (req, res) => {
    const tokens = (req.session as any).tokens;
    if (!tokens) return res.status(401).json({ error: "Not authenticated" });

    const client = createOAuthClient();
    client.setCredentials(tokens);
    const drive = google.drive({ version: "v3", auth: client });

    try {
      const fileId = req.params.fileId;
      // First fetch metadata so we can export Google Docs types.
      const meta = await drive.files.get({
        fileId,
        fields: "id,name,mimeType,size",
      });
      const mimeType = meta.data.mimeType || "";

      // Google Workspace files must be exported.
      const isGoogleDoc = mimeType.startsWith("application/vnd.google-apps.");
      if (isGoogleDoc) {
        let exportMimeType = "text/plain";
        if (mimeType === "application/vnd.google-apps.spreadsheet") {
          exportMimeType = "text/csv";
        } else if (mimeType === "application/vnd.google-apps.presentation") {
          exportMimeType = "text/plain";
        }
        const exported = await drive.files.export(
          { fileId, mimeType: exportMimeType },
          { responseType: "text" as any }
        );
        res.setHeader("Content-Type", `${exportMimeType}; charset=utf-8`);
        res.setHeader("Cache-Control", "no-store");
        return res.send(exported.data as any);
      }

      // Regular files can be downloaded directly.
      const downloaded = await drive.files.get({ fileId, alt: "media" }, { responseType: "text" as any });
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.send(downloaded.data as any);
    } catch (error) {
      console.error("Drive API error:", error);
      res.status(500).json({ error: "Failed to fetch file content" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
