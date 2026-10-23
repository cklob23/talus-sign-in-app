export type CameraIssue = "denied" | "unavailable"

export function classifyCameraError(err: unknown): CameraIssue {
  const name = err && typeof err === "object" && "name" in err ? String((err as { name: unknown }).name) : ""
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return "denied"
  return "unavailable"
}

export function photoFallbackAllowed(opts: {
  required: boolean
  hasPhoto: boolean
  cameraUnavailable: boolean
}): boolean {
  if (opts.hasPhoto) return true
  if (!opts.required) return true
  return opts.cameraUnavailable
}

/** Server-side counterpart: a required photo is present or flagged missing. */
export function photoRequirementMet(opts: {
  required: boolean
  hasPhoto: boolean
  photoMissing: boolean
}): boolean {
  return photoFallbackAllowed({
    required: opts.required,
    hasPhoto: opts.hasPhoto,
    cameraUnavailable: opts.photoMissing,
  })
}
