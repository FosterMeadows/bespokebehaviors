function normalizeIdentityPart(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export async function academicTaskDocId({ studentId, subject, title }) {
  const identity = [studentId, subject, title].map(normalizeIdentityPart).join("|");
  if (!normalizeIdentityPart(studentId) || !normalizeIdentityPart(title)) {
    throw new Error("Student and assignment name are required");
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  return `task_${hash}`;
}
