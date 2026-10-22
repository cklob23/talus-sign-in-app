"use client"

import { TrainingLinkClient } from "@/app/t/[token]/training-link-client"
import { VisitPageClient } from "@/app/visit/[token]/visit-client"

const SAMPLE = {
  firstName: "Diego",
  lastName: "Ruiz",
  email: "diego@gulfcoastelectric.com",
  hostName: "Maya Chen",
  siteName: "Houston HQ",
  companyName: "Talus Ag",
  message: "You did the safety video on Oct 2. You are cleared until Oct 2027.",
}

export function PreviewScreens({ screen }: { screen?: string }) {
  const only = screen?.trim() || "all"
  const show = (id: string) => only === "all" || only === id
  return (
    <div className="space-y-16 bg-[#eef4f0] p-6">
      {show("training-link") ? (
        <section id="training-link" className="mx-auto max-w-xl overflow-hidden rounded-2xl border bg-white shadow">
          <TrainingLinkClient
            token="preview"
            firstName={SAMPLE.firstName}
            lastName={SAMPLE.lastName}
            email={SAMPLE.email}
            hostName={SAMPLE.hostName}
            videoTitle="Site Safety Orientation"
            videoUrl="https://cdn.example.com/safety.mp4"
            siteName={SAMPLE.siteName}
            companyName={SAMPLE.companyName}
            logoUrl={null}
            alreadyCleared={false}
            clearanceMessage={null}
            clearanceMessageEs={null}
          />
        </section>
      ) : null}

      {show("kiosk-cleared") ? (
        <section id="kiosk-cleared" className="mx-auto max-w-3xl space-y-4 rounded-2xl bg-[#f5f8f6] p-6">
          <div className="rounded-2xl border-2 border-[#00854c] bg-white p-8">
            <p className="inline-flex items-center gap-2 rounded-full bg-[#e2f4e9] px-3 py-1 text-sm font-semibold text-[#00703f]">
              Safety training done
            </p>
            <h2 className="mt-3 text-3xl font-bold">You are cleared, Diego</h2>
            <p className="mt-2 text-lg">{SAMPLE.message}</p>
            <p className="mt-2 text-[#55625a]">You watched the safety video from your training link. No video and no code today.</p>
          </div>
          <div className="flex gap-3">
            <span className="inline-flex h-14 items-center rounded-xl border bg-white px-5">Watch it anyway</span>
            <span className="inline-flex h-14 flex-1 items-center justify-center rounded-xl bg-[#00854c] px-5 font-semibold text-white">
              Next: photo
            </span>
          </div>
        </section>
      ) : null}

      {show("kiosk-code") ? (
        <section id="kiosk-code" className="mx-auto max-w-4xl rounded-2xl bg-[#f5f8f6] p-6">
          <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border bg-white p-8">
              <p className="inline-flex items-center gap-2 rounded-full bg-[#e2f4e9] px-3 py-1 text-sm font-semibold text-[#00703f]">
                Training on file
              </p>
              <h2 className="mt-3 text-3xl font-bold">Type the 6 digit code</h2>
              <p className="mt-2 text-[#55625a]">
                Welcome back. This email finished safety training before. To skip the video, type the code we sent to{" "}
                <b className="text-[#0f1a13]">d••••o@gulfcoastelectric.com</b>. It works for 30 minutes.
              </p>
              <div className="mt-4 flex gap-2">
                {["4", "8", "2", "9", "", ""].map((digit, index) => (
                  <div
                    key={index}
                    className="flex h-16 w-12 items-center justify-center rounded-xl border-2 border-[#7b8b7f] font-mono text-3xl font-bold"
                  >
                    {digit}
                  </div>
                ))}
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <span className="inline-flex h-14 items-center rounded-xl border px-5">Send again</span>
                <span className="inline-flex h-14 items-center rounded-xl border px-5">Watch the video instead</span>
                <span className="inline-flex h-14 items-center rounded-xl bg-[#00854c] px-5 font-semibold text-white">
                  Continue
                </span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 rounded-2xl border bg-white p-5">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((key, index) =>
                key ? (
                  <span
                    key={key}
                    className="inline-flex h-24 items-center justify-center rounded-xl border text-3xl"
                  >
                    {key}
                  </span>
                ) : (
                  <span key={`blank-${index}`} />
                ),
              )}
            </div>
          </div>
        </section>
      ) : null}

      {show("visit-page") ? (
        <section id="visit-page" className="mx-auto max-w-md overflow-hidden rounded-2xl border bg-white shadow">
          <VisitPageClient
            token="preview"
            visitorName="Carlos Mendoza"
            hostName="Maya Chen"
            company="Gulf Coast Electric"
            visitorType="Contractor"
            siteName="Houston HQ"
            timezone="America/Chicago"
            arrivalTime="2026-10-21T23:28:00.000Z"
            signedOutAt={null}
            badgeNumber="V04821"
            purpose="Electrical panel upgrade"
            photoUrl=""
            trainingDone
            trainingMessage="Done"
            companyName="Talus Ag"
            logoUrl={null}
            signedOut={false}
            expiresAt={Date.parse("2026-10-28T23:28:00.000Z")}
          />
        </section>
      ) : null}
    </div>
  )
}
