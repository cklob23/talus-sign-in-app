export function parseTrainingCompleteResponse(
  res: { ok: boolean },
  json: Record<string, unknown>,
  fallback: string,
): { ok: true; message: string; messageEs: string } | { ok: false; error: string } {
  if (!res.ok || json.success === false) {
    return {
      ok: false,
      error: typeof json.error === "string" && json.error.trim() ? json.error : "Could not save your training.",
    }
  }
  return {
    ok: true,
    message: typeof json.message === "string" && json.message.trim() ? json.message : fallback,
    messageEs: typeof json.messageEs === "string" && json.messageEs.trim() ? json.messageEs : fallback,
  }
}

export function trainingLinkShowsCleared(done: boolean): boolean {
  return done
}
