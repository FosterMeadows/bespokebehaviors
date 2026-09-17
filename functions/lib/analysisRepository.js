import { AnalysisError } from "./analysisService.js";

export function createAnalysisRepository(db) {
  const analysisRef = (id) => db.collection("behaviorAnalyses").doc(id);
  const controlRef = db.collection("behaviorAnalysisControl").doc("school");

  return {
    async profile(uid) {
      return (await db.collection("teachers").doc(uid).get()).data();
    },
    async records() {
      const snapshot = await db
        .collection("behaviorReteaches")
        .where("status", "==", "served")
        .limit(10001)
        .get();
      if (snapshot.size > 10000)
        throw new AnalysisError(
          "resource-exhausted",
          "The school dataset exceeds the current analysis retrieval limit. Contact the administrator to configure indexed retrieval.",
        );
      return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
    },
    async identities() {
      const [students, teachers] = await Promise.all([
        db.collection("students").select("displayName", "studentName").get(),
        db.collection("teachers").select("displayName", "contactEmail").get(),
      ]);
      return [...students.docs, ...teachers.docs].flatMap((doc) =>
        Object.values(doc.data()),
      );
    },
    async cached(id) {
      return (await analysisRef(id).get()).data();
    },
    async reserve({
      analysisId,
      fingerprint,
      model,
      requestId,
      scope,
      uid,
      now,
    }) {
      return db.runTransaction(async (transaction) => {
        const [cached, control] = await Promise.all([
          transaction.get(analysisRef(analysisId)),
          transaction.get(controlRef),
        ]);
        const previous = cached.data();
        if (
          previous?.result &&
          previous.sourceFingerprint === fingerprint &&
          previous.model === model
        )
          return { cached: true };
        const limit = control.data() || {};
        const nowMs = now.getTime();
        if (limit.lockUntil > nowMs)
          throw new AnalysisError(
            "resource-exhausted",
            "Another analysis is running. Wait for it to finish, then try again.",
          );
        if (limit.lastAttemptAt && nowMs - limit.lastAttemptAt < 30000)
          throw new AnalysisError(
            "resource-exhausted",
            "Wait 30 seconds between analysis requests.",
          );
        const day = now.toISOString().slice(0, 10);
        const dailyAttempts = limit.day === day ? limit.dailyAttempts || 0 : 0;
        if (dailyAttempts >= 100)
          throw new AnalysisError(
            "resource-exhausted",
            "The school’s daily analysis limit has been reached. Try again tomorrow.",
          );
        transaction.set(controlRef, {
          requestId,
          lockUntil: nowMs + 180000,
          lastAttemptAt: nowMs,
          day,
          dailyAttempts: dailyAttempts + 1,
        });
        transaction.set(
          analysisRef(analysisId),
          {
            status: "running",
            requestId,
            startedAt: now.toISOString(),
            scope,
            requestedByUid: uid,
            error: null,
          },
          { merge: true },
        );
        return { cached: false };
      });
    },
    async complete({ analysisId, requestId, final }) {
      await db.runTransaction(async (transaction) => {
        const [cached, control] = await Promise.all([
          transaction.get(analysisRef(analysisId)),
          transaction.get(controlRef),
        ]);
        if (cached.data()?.requestId !== requestId)
          throw new AnalysisError(
            "aborted",
            "A newer analysis request replaced this one.",
          );
        transaction.set(analysisRef(analysisId), {
          ...final,
          status: "complete",
          requestId,
          error: null,
        });
        if (control.data()?.requestId === requestId)
          transaction.set(controlRef, { lockUntil: 0 }, { merge: true });
      });
    },
    async fail({ analysisId, requestId, message }) {
      await db.runTransaction(async (transaction) => {
        const [cached, control] = await Promise.all([
          transaction.get(analysisRef(analysisId)),
          transaction.get(controlRef),
        ]);
        if (cached.data()?.requestId === requestId)
          transaction.set(
            analysisRef(analysisId),
            { status: "failed", error: message },
            { merge: true },
          );
        if (control.data()?.requestId === requestId)
          transaction.set(controlRef, { lockUntil: 0 }, { merge: true });
      });
    },
  };
}
