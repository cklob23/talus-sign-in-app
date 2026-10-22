export type VisitorLang = "en" | "es"

export const VISITOR_LANG_KEY = "talus_visitor_lang"

export function readVisitorLang(): VisitorLang {
  if (typeof window === "undefined") return "en"
  try {
    const stored = window.sessionStorage.getItem(VISITOR_LANG_KEY)
    return stored === "es" ? "es" : "en"
  } catch {
    return "en"
  }
}

export function writeVisitorLang(lang: VisitorLang) {
  try {
    window.sessionStorage.setItem(VISITOR_LANG_KEY, lang)
  } catch {
    // sessionStorage can be blocked in kiosk lockdown
  }
}

const en = {
  langLabel: "Language",
  welcomeTitle: "Welcome to {company}",
  welcomeSubtitle: "Sign in takes about 2 minutes. Tap a button to start.",
  signInTitle: "Sign in",
  signInHelp: "I am visiting or here to work today.",
  signInMinutes: "About 2 minutes",
  signInTraining: "Safety video if your visit needs it",
  signInHost: "We tell your host you are here",
  signOutTitle: "Sign out",
  signOutHelp: "I am leaving the site.",
  signOutHow: "Type your badge number or name",
  signOutMinutes: "About 10 seconds",
  bookingHint: "Have a booking? Tap Sign in. We will find it.",
  staffHint: "Talus staff: Staff sign in",
  staffSignIn: "Staff sign in",
  whyHere: "Why are you here today?",
  whyHereHelp: "Pick the option that fits your visit.",
  changeType: "Change",
  yourDetails: "Your details",
  firstName: "First name",
  lastName: "Last name",
  email: "Email",
  emailHint: "Use this email next time to skip the safety video if you already watched it.",
  phone: "Phone",
  company: "Company",
  companyHint: "Start typing. Pick your company from the list.",
  host: "Who are you here to see?",
  hostHint: "We will send them a message that you are here.",
  purpose: "What is this visit for? (optional)",
  required: "required",
  optional: "optional",
  back: "Back",
  continue: "Continue",
  nextTraining: "Next: safety video",
  nextPhoto: "Next: photo",
  completeSignIn: "Finish sign in",
  checkingLocation: "Checking your location...",
  retry: "Retry",
  staleLocation: "Your location reading is too old. Refresh your position and try again.",
  typeRequired: "Please pick why you are here.",
  firstNameRequired: "Please type your first name.",
  lastNameRequired: "Please type your last name.",
  companyRequired: "Please type your company.",
  hostRequired: "Please choose who you are visiting.",
  hostSearch: "Search by name",
  noHosts: "No matching hosts.",
  trainingTitle: "Safety video",
  trainingHelp: "Watch the full video before you continue.",
  tapToStart: "Tap to start the video",
  trainingAck: "I watched the video. I will follow the safety rules.",
  hostTold: "We told {host} you are here.",
  hostNotTold: "We could not notify a host. Please ask reception.",
  hostNotifyOff: "Your host will not get an automatic message. Please ask reception.",
  signedInTitle: "You are signed in",
  signedOutTitle: "You are signed out",
  collectBadge: "Show this badge if someone asks.",
  rememberSignOut: "Please sign out when you leave.",
  thanksVisit: "Thank you for visiting {company}.",
  badgeNumber: "Your badge number",
  done: "Done",
  startingOver: "Starting over in {seconds}s. Tap to keep going.",
  geofenceVisitor: "Sign in is paused. Please ask reception.",
  geofenceStaff: "This kiosk looks {distance} from {site}. Sign-in is set to stay within {radius}.",
  geofenceOverride: "Allow sign-in anyway",
  photoTitle: "Add a photo",
  photoHelp: "This goes on your visitor badge so your host can recognise you.",
  photoOptional: "Optional, but it helps your host recognise you.",
  photoRequired: "This visit type needs a photo.",
  takePhoto: "Take photo",
  skipPhoto: "Skip photo",
  skipPhotoStaff: "Skip photo (staff)",
  photoStaffHelp: "Reception can skip the photo if the camera is not working.",
  photoCameraUnavailable: "This device has no usable camera. Ask reception to take your photo.",
  photoCameraDenied: "Camera access was blocked. Ask reception to take your photo.",
  askReception: "Ask reception",
  alreadyHere: "Already signed in and leaving?",
  signOutOf: "Sign out of {site}",
  idleNotice: "Your sign-in was cleared after a period without activity. Please start again.",
  stepOf: "Step {current} of {total}",
  you: "You",
  details: "Details",
  safety: "Safety video",
  photo: "Photo",
}

const es: typeof en = {
  langLabel: "Idioma",
  welcomeTitle: "Bienvenido a {company}",
  welcomeSubtitle: "El registro toma unos 2 minutos. Toque un botón para empezar.",
  signInTitle: "Entrar",
  signInHelp: "Vengo de visita o a trabajar hoy.",
  signInMinutes: "Unos 2 minutos",
  signInTraining: "Video de seguridad si su visita lo necesita",
  signInHost: "Avisamos a su anfitrión que usted está aquí",
  signOutTitle: "Salir",
  signOutHelp: "Me voy del sitio.",
  signOutHow: "Escriba su número de gafete o su nombre",
  signOutMinutes: "Unos 10 segundos",
  bookingHint: "¿Tiene una reserva? Toque Entrar. La buscamos.",
  staffHint: "Personal de Talus: Entrada de personal",
  staffSignIn: "Entrada de personal",
  whyHere: "¿Por qué está aquí hoy?",
  whyHereHelp: "Elija la opción que corresponde a su visita.",
  changeType: "Cambiar",
  yourDetails: "Sus datos",
  firstName: "Nombre",
  lastName: "Apellido",
  email: "Correo",
  emailHint: "Use este correo la próxima vez para omitir el video si ya lo vio.",
  phone: "Teléfono",
  company: "Empresa",
  companyHint: "Empiece a escribir. Elija su empresa de la lista.",
  host: "¿A quién viene a ver?",
  hostHint: "Les enviaremos un mensaje de que usted está aquí.",
  purpose: "¿Para qué es esta visita? (opcional)",
  required: "obligatorio",
  optional: "opcional",
  back: "Atrás",
  continue: "Continuar",
  nextTraining: "Siguiente: video de seguridad",
  nextPhoto: "Siguiente: foto",
  completeSignIn: "Terminar registro",
  checkingLocation: "Comprobando su ubicación...",
  retry: "Reintentar",
  staleLocation: "La lectura de su ubicación es demasiado antigua. Actualice su posición e inténtelo de nuevo.",
  typeRequired: "Elija por qué está aquí.",
  firstNameRequired: "Escriba su nombre.",
  lastNameRequired: "Escriba su apellido.",
  companyRequired: "Escriba su empresa.",
  hostRequired: "Elija a quién visita.",
  hostSearch: "Buscar por nombre",
  noHosts: "No hay anfitriones que coincidan.",
  trainingTitle: "Video de seguridad",
  trainingHelp: "Vea el video completo antes de continuar.",
  tapToStart: "Toque para iniciar el video",
  trainingAck: "Vi el video. Seguiré las reglas de seguridad.",
  hostTold: "Avisamos a {host} que usted está aquí.",
  hostNotTold: "No pudimos avisar a un anfitrión. Pregunte en recepción.",
  hostNotifyOff: "Su anfitrión no recibirá un mensaje automático. Pregunte en recepción.",
  signedInTitle: "Ya está registrado",
  signedOutTitle: "Ya salió",
  collectBadge: "Muestre este gafete si se lo piden.",
  rememberSignOut: "Salga del registro cuando se vaya.",
  thanksVisit: "Gracias por visitar {company}.",
  badgeNumber: "Su número de gafete",
  done: "Listo",
  startingOver: "Empezamos de nuevo en {seconds}s. Toque para seguir.",
  geofenceVisitor: "El registro está en pausa. Pregunte en recepción.",
  geofenceStaff: "Este kiosco parece estar a {distance} de {site}. El registro debe estar dentro de {radius}.",
  geofenceOverride: "Permitir el registro de todos modos",
  photoTitle: "Agregar una foto",
  photoHelp: "Va en su gafete para que su anfitrión lo reconozca.",
  photoOptional: "Opcional, pero ayuda a que su anfitrión lo reconozca.",
  photoRequired: "Este tipo de visita necesita una foto.",
  takePhoto: "Tomar foto",
  skipPhoto: "Omitir foto",
  skipPhotoStaff: "Omitir foto (personal)",
  photoStaffHelp: "Recepción puede omitir la foto si la cámara no funciona.",
  photoCameraUnavailable: "Este dispositivo no tiene cámara. Pida en recepción que le tomen la foto.",
  photoCameraDenied: "Se bloqueó el acceso a la cámara. Pida en recepción que le tomen la foto.",
  askReception: "Pregunte en recepción",
  alreadyHere: "¿Ya está registrado y se va?",
  signOutOf: "Salir de {site}",
  idleNotice: "Se borró su registro por inactividad. Empiece de nuevo.",
  stepOf: "Paso {current} de {total}",
  you: "Usted",
  details: "Datos",
  safety: "Video",
  photo: "Foto",
}

export type VisitorCopy = typeof en

export function visitorCopy(lang: VisitorLang): VisitorCopy {
  return lang === "es" ? es : en
}

export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ""))
}

/** Host arrival copy is only for the success screen after notify was queued. */
export function hostArrivalMessage(opts: {
  signedIn: boolean
  hostName?: string | null
  hostNotified?: boolean | null
  copy: Pick<VisitorCopy, "hostTold" | "hostNotTold" | "hostNotifyOff">
}): string | null {
  if (!opts.signedIn) return null
  if (opts.hostNotified && opts.hostName) return fill(opts.copy.hostTold, { host: opts.hostName })
  if (opts.hostNotified === false) return opts.copy.hostNotifyOff
  return opts.copy.hostNotTold
}
