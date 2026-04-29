import { supabaseAdmin } from "./lib/supabaseRag.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const sb = supabaseAdmin();

    const [{ count: documentsCount }, { count: chunksCount }] = await Promise.all([
      sb.from("passage_documents").select("id", { count: "exact", head: true }),
      sb.from("passage_chunks").select("id", { count: "exact", head: true }),
    ]);

    // Return the most recent indexing runs for quick debugging.
    const { data: runs, error: runsErr } = await sb
      .from("passage_index_runs")
      .select("status, started_at, finished_at, root_folder_id, modified_since, page_token, files_indexed, last_error")
      .order("started_at", { ascending: false })
      .limit(5);

    if (runsErr) throw runsErr;

    res.status(200).json({
      ok: true,
      documentsCount: documentsCount ?? 0,
      chunksCount: chunksCount ?? 0,
      indexRuns: Array.isArray(runs) ? runs : [],
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to fetch RAG stats" });
  }
}

