"use client"

import { useEffect, useState } from "react"
import { CheckinFlow, type CheckinHost, type CheckinVisitorType } from "./checkin-flow"
import { CheckinShell } from "./checkin-shell"
import type { CheckinGeofence } from "./location-gate"
import { readVisitorLang, writeVisitorLang, type VisitorLang } from "@/lib/visitor-i18n"

export function CheckinClient({
  token,
  companyName,
  logo,
  locationName,
  visitorTypes,
  hosts,
  geofence,
  ndaEnabled,
}: {
  token: string
  companyName: string
  logo?: string
  locationName: string
  visitorTypes: CheckinVisitorType[]
  hosts: CheckinHost[]
  geofence: CheckinGeofence | null
  ndaEnabled?: boolean
}) {
  const [lang, setLang] = useState<VisitorLang>("en")
  useEffect(() => {
    setLang(readVisitorLang())
  }, [])

  return (
    <CheckinShell
      companyName={companyName}
      logo={logo}
      locationName={locationName}
      lang={lang}
      onLang={(next) => {
        writeVisitorLang(next)
        setLang(next)
      }}
    >
      <CheckinFlow
        token={token}
        locationName={locationName}
        visitorTypes={visitorTypes}
        hosts={hosts}
        geofence={geofence}
        ndaEnabled={ndaEnabled}
        lang={lang}
      />
    </CheckinShell>
  )
}
