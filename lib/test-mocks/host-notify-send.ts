export type HostNotificationType = "arrived" | "completing_training"

export async function resolveHostContact() {
  return { name: "Pat Host", email: "pat@talusag.com", phone: null }
}

export async function sendResolvedHostNotification() {
  return { email: "sent", sms: "skipped", loggedOnly: false }
}
