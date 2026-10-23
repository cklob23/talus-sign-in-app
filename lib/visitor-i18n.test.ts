import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { fill, hostArrivalMessage, staffGeofenceLine, visitorCopy } from "./visitor-i18n.ts"

describe("visitor copy", () => {
  it("points bookings at I have a booking, not Sign in", () => {
    const en = visitorCopy("en")
    const es = visitorCopy("es")
    assert.equal(en.tapToUnmute, "Turn on sound")
    assert.equal(es.tapToUnmute, "Activar sonido")
    assert.equal(en.soundOn, "Sound on")
    assert.equal(es.soundOn, "Sonido activado")
    assert.equal(en.soundOff, "Sound off")
    assert.equal(es.soundOff, "Sonido desactivado")
    assert.equal(en.haveBooking, "I have a booking")
    assert.equal(es.haveBooking, "Tengo una reserva")
    assert.equal(en.bookingHint, "Booked ahead? Tap I have a booking.")
    assert.equal(es.bookingHint, "¿Reservó de antemano? Toque Tengo una reserva.")
    assert.equal(/tap sign in/i.test(en.bookingHint), false)
    assert.equal(/toque entrar/i.test(es.bookingHint), false)
    assert.equal(en.locationUnavailable, "Location unavailable")
    assert.equal(es.locationUnavailable, "Ubicación no disponible")
    assert.equal(en.siteDistanceAway, "{site}, {distance} away")
    assert.equal(es.siteDistanceAway, "{site}, a {distance}")
  })

  it("keeps English and Spanish sentences short and paired", () => {
    const en = visitorCopy("en")
    const es = visitorCopy("es")
    assert.equal(en.trainingAck, "I watched the video. I will follow the safety rules.")
    assert.equal(es.trainingAck, "Vi el video. Seguiré las reglas de seguridad.")
    assert.equal(en.geofenceVisitor, "Sign in is paused. Please ask reception.")
    assert.equal(en.geofenceBlockedHelp, "Visitor and staff sign-in are only available on site.")
    assert.equal(es.geofenceBlockedHelp, "El registro de visitantes y personal solo está disponible en el sitio.")
    assert.equal(es.emailHint.includes("video"), true)
    assert.equal(en.emailHint.includes("visit record"), false)
  })

  it("fills host and idle templates", () => {
    assert.equal(fill(visitorCopy("en").hostTold, { host: "Maya Chen" }), "We told Maya Chen you are here.")
    assert.equal(fill(visitorCopy("en").startingOver, { seconds: 8 }), "Starting over in 8s. Tap to keep going.")
  })

  it("shows host-told copy only after sign-in when notify was queued", () => {
    const copy = visitorCopy("en")
    assert.equal(hostArrivalMessage({ signedIn: false, hostName: "Maya Chen", hostNotified: true, copy }), null)
    assert.equal(
      hostArrivalMessage({ signedIn: true, hostName: "Maya Chen", hostNotified: true, copy }),
      "We told Maya Chen you are here.",
    )
    assert.equal(
      hostArrivalMessage({ signedIn: true, hostName: "Maya Chen", hostNotified: false, copy }),
      copy.hostNotifyOff,
    )
    assert.equal(copy.askReception, "Ask reception")
    assert.equal(visitorCopy("es").askReception, "Pregunte en recepción")
  })

  it("formats the staff geofence banner like the header distances", () => {
    const en = visitorCopy("en")
    const es = visitorCopy("es")
    assert.equal(
      staffGeofenceLine({
        copy: en,
        distanceMeters: 76_220,
        site: "Test Location",
        radiusMeters: 200,
      }),
      "This kiosk is about 76.2 km from Test Location. Sign-in only works within 200 m.",
    )
    assert.equal(
      staffGeofenceLine({
        copy: es,
        distanceMeters: 76_220,
        site: "Test Location",
        radiusMeters: 200,
      }),
      "Este kiosco está a unos 76.2 km de Test Location. El registro solo funciona dentro de 200 m.",
    )
    assert.equal(en.geofenceStaff.includes("looks"), false)
    assert.equal(en.geofenceStaff.includes("set to stay"), false)
    assert.equal(es.geofenceStaff.includes("parece"), false)
    const nearby = staffGeofenceLine({
      copy: en,
      distanceMeters: 76.22,
      site: "Test Location",
      radiusMeters: 200,
    })
    assert.equal(nearby.endsWith("."), true)
    assert.equal(/\s\./.test(nearby), false)
  })
})
