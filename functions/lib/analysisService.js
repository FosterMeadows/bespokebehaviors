import { createHash, randomUUID } from "node:crypto";
import {
  ANALYSIS_VERSION,
  MAX_ANALYSIS_RECORDS,
  normalizeAnalysisScope,
  scopeIdentity,
  sourceIdentity,
  selectAnalysisRecords,
} from "../shared/behaviorAnalysis.js";
import {
  ANALYSIS_INSTRUCTIONS,
  ANALYSIS_SCHEMA,
  prepareAnalysis,
  validateAnalysis,
} from "./analysisModel.js";

export class AnalysisError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
export const digest = (text) => createHash("sha256").update(text).digest("hex");
export function schoolwideProfile(profile) {
  return Boolean(
    profile &&
      profile.disabled !== true &&
      (profile.features?.admin === true ||
        (Array.isArray(profile.roles) &&
          profile.roles.some((role) =>
            ["owner", "admin", "mtssLead"].includes(role),
          ))),
  );
}

export async function requestModel({
  apiKey,
  model,
  records,
  fetchImpl = fetch,
}) {
  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(90000),
    body: JSON.stringify({
      model,
      store: false,
      instructions: ANALYSIS_INSTRUCTIONS,
      input: JSON.stringify({
        allowedCategories:
          ANALYSIS_SCHEMA.properties.categoryReviews.items.properties
            .suggestedCategory.enum,
        records,
      }),
      max_output_tokens: 8000,
      text: {
        format: {
          type: "json_schema",
          name: "served_reteach_analysis",
          strict: true,
          schema: ANALYSIS_SCHEMA,
        },
      },
    }),
  });
  if (!response.ok)
    throw new AnalysisError(
      "unavailable",
      "The AI provider could not complete this analysis. Check the server API key, billing, and model access, then try again.",
    );
  const body = await response.json();
  if (body.status !== "completed")
    throw new AnalysisError(
      "unavailable",
      "The analysis was incomplete. Try a smaller date range.",
    );
  const content = (body.output || []).flatMap((item) => item.content || []);
  if (content.some((item) => item.type === "refusal"))
    throw new AnalysisError(
      "failed-precondition",
      "The provider could not analyze this selection.",
    );
  const text = content
    .filter((item) => item.type === "output_text")
    .map((item) => item.text)
    .join("");
  return JSON.parse(text);
}

// No client-provided notes, record bodies, model names, or prompts are accepted.
export async function runBehaviorAnalysis({
  uid,
  data,
  repository,
  apiKey,
  model,
  generate = requestModel,
  now = () => new Date(),
}) {
  if (!uid)
    throw new AnalysisError("unauthenticated", "Sign in to analyze reteaches.");
  if (!schoolwideProfile(await repository.profile(uid)))
    throw new AnalysisError(
      "permission-denied",
      "Analysis requires schoolwide admin access.",
    );
  let scope;
  try {
    scope = normalizeAnalysisScope(data?.filters);
  } catch (error) {
    throw new AnalysisError("invalid-argument", error.message);
  }
  const records = selectAnalysisRecords(await repository.records(), scope);
  if (!records.length)
    throw new AnalysisError(
      "failed-precondition",
      "No served reteaches match this view.",
    );
  if (records.length > MAX_ANALYSIS_RECORDS)
    throw new AnalysisError(
      "resource-exhausted",
      `Select ${MAX_ANALYSIS_RECORDS} or fewer served reteaches using the filters.`,
    );
  const analysisId = digest(scopeIdentity(scope));
  const fingerprint = digest(sourceIdentity(records, scope));
  const current = await repository.cached(analysisId);
  if (
    current?.result &&
    current.sourceFingerprint === fingerprint &&
    current.model === model
  )
    return { analysisId, cached: true };
  const key = apiKey();
  if (!key || key === "not-configured")
    throw new AnalysisError(
      "failed-precondition",
      "AI analysis is not configured. Set the OPENAI_API_KEY server secret and deploy the analysis function.",
    );
  const requestId = randomUUID();
  const startedAt = now();
  const reservation = await repository.reserve({
    analysisId,
    fingerprint,
    model,
    requestId,
    scope,
    uid,
    now: startedAt,
  });
  if (reservation.cached) return { analysisId, cached: true };
  try {
    const prepared = prepareAnalysis(
      records,
      scope,
      await repository.identities(),
    );
    if (!prepared.payload.length)
      throw new AnalysisError(
        "failed-precondition",
        "No eligible written notes remain after excluding blank or sensitive notes.",
      );
    if (JSON.stringify(prepared.payload).length > 250000)
      throw new AnalysisError(
        "resource-exhausted",
        "These notes are too large for one analysis. Narrow the filters.",
      );
    const output = await generate({
      apiKey: key,
      model,
      records: prepared.payload,
    });
    const result = validateAnalysis(output, prepared);
    const final = {
      result,
      scope,
      model,
      version: ANALYSIS_VERSION,
      sourceFingerprint: fingerprint,
      generatedAt: now().toISOString(),
      generatedByUid: uid,
      servedCount: records.length,
      analyzedCount: prepared.payload.length,
      analyzedRecordIds: [...prepared.recordMap.values()].map(
        (record) => record.recordId,
      ),
      excluded: prepared.excluded,
    };
    await repository.complete({ analysisId, requestId, final });
    return { analysisId, cached: false };
  } catch (error) {
    const message =
      error instanceof AnalysisError
        ? error.message
        : "The analysis could not be validated or completed. No new results were saved. Try again with a smaller selection.";
    await repository.fail({ analysisId, requestId, message });
    throw error instanceof AnalysisError
      ? error
      : new AnalysisError("unavailable", message);
  }
}
