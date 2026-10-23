/**
 * Attach a getUserMedia stream to a <video> and actually start playback.
 * Setting srcObject alone leaves a blank preview on iOS and some desktop browsers.
 */
export type CameraPreviewVideo = {
  srcObject: MediaStream | null
  muted: boolean
  playsInline: boolean
  play: () => Promise<void>
}

export async function attachAndPlayCamera(
  video: CameraPreviewVideo,
  stream: MediaStream,
): Promise<void> {
  video.srcObject = stream
  video.muted = true
  video.playsInline = true
  await video.play()
}
