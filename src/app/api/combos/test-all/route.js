import { NextResponse } from "next/server";
import { pingModelByKind } from "@/app/api/models/test/ping";

/**
 * POST /api/combos/test-all
 * Body: { models: ["provider/model1", "provider/model2", ...] }
 * Sends "say hi" to all models in parallel, returns results.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const models = body?.models;

    if (!Array.isArray(models) || models.length === 0) {
      return NextResponse.json({ error: "No models provided" }, { status: 400 });
    }

    const baseUrl = `http://127.0.0.1:${process.env.PORT || 20128}`;

    const results = await Promise.all(
      models.map(async (model) => {
        const start = Date.now();
        try {
          const result = await pingModelByKind(model, "llm", baseUrl);
          return { model, ...result };
        } catch (e) {
          return {
            model,
            ok: false,
            latencyMs: Date.now() - start,
            error: String(e?.message || e).slice(0, 240),
            status: 0,
          };
        }
      })
    );

    return NextResponse.json({ results });
  } catch (error) {
    console.log("Error testing combo models:", error);
    return NextResponse.json({ error: "Test failed" }, { status: 500 });
  }
}
