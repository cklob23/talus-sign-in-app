"use client"

import { useEffect, useState } from "react"

export function useNdaEnabled(): boolean {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    fetch("/api/features")
      .then((res) => res.json())
      .then((data) => setEnabled(data.ndaEnabled === true))
      .catch(() => setEnabled(false))
  }, [])

  return enabled
}
