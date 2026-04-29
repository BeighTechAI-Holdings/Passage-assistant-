/**
 * GET — which RAG-related env vars are present (never returns secret values).
 */
export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      ok: true,
      hasGoogleServiceAccountJson: !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
      hasPassageDriveRootFolderId: !!process.env.PASSAGE_DRIVE_ROOT_FOLDER_ID,
      hasSupabaseUrl: !!process.env.SUPABASE_URL,
      hasSupabaseServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasVoyageApiKey: !!process.env.VOYAGE_API_KEY,
      voyageModel: process.env.VOYAGE_MODEL || "(default voyage-4)",
      hasAnthropicApiKey: !!process.env.ANTHROPIC_API_KEY,
      anthropicModel: process.env.ANTHROPIC_MODEL || "(default)",
    })
  );
}
