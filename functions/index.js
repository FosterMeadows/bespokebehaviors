import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import { AnalysisError, runBehaviorAnalysis } from "./lib/analysisService.js";

import { createAnalysisRepository } from "./lib/analysisRepository.js";

initializeApp();
const db = getFirestore();
const apiKey = defineSecret("OPENAI_API_KEY");
const model = defineString("BEHAVIOR_ANALYSIS_MODEL", {
  default: "gpt-4.1-mini-2025-04-14",
});
const repository = createAnalysisRepository(db);

export const analyzeBehaviorReteaches = onCall(
  {
    region: "us-central1",
    // Firebase callable authentication and schoolwide authorization run in the handler.
    invoker: "public",
    timeoutSeconds: 180,
    memory: "512MiB",
    maxInstances: 2,
    secrets: [apiKey],
  },
  async (request) => {
    try {
      return await runBehaviorAnalysis({
        uid: request.auth?.uid,
        data: request.data,
        repository,
        apiKey: () => apiKey.value(),
        model: model.value(),
      });
    } catch (error) {
      if (error instanceof AnalysisError)
        throw new HttpsError(error.code, error.message);
      // Do not log prompts, student notes, provider responses, or credentials.
      throw new HttpsError(
        "internal",
        "Analysis is temporarily unavailable. Try again later.",
      );
    }
  },
);
