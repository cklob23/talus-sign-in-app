export interface Location {
  id: string
  name: string
  address: string | null
  timezone: string
  latitude: number | null
  longitude: number | null
  auto_signin_radius_meters: number | null
  auto_signout_minutes: number | null
  /** Present after 011-geofence.sql. false means the admin turned the fence off. */
  geofence_enabled?: boolean | null
  /** Present after 015-location-auto-signout.sql. null means use the global setting. */
  auto_sign_out_employees?: boolean | null
  auto_sign_out_employees_time?: string | null
  auto_sign_out_visitors?: boolean | null
  auto_sign_out_visitors_time?: string | null
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: "admin" | "staff" | "viewer" | "employee"
  custom_role_id: string | null
  location_id: string | null
  phone: string | null
  department: string | null
  avatar_url: string | null
  timezone: string | null
  last_password_change: string | null
  last_auth_time: string | null
  failed_login_attempts: number
  account_locked_until: string | null
  created_at: string
  updated_at: string
}

export type SignOutSource = "manual" | "auto"

export interface EmployeeSignIn {
  id: string
  profile_id: string
  location_id: string
  sign_in_time: string
  sign_out_time: string | null
  /** Present after 016-sign-out-source-and-duration-unit.sql. */
  sign_out_source?: SignOutSource | null
  auto_signed_in: boolean
  device_id: string | null
  created_at: string
  // Joined fields
  profile?: Profile
  location?: Location
}

export interface VisitorType {
  id: string
  name: string
  badge_color: string
  requires_host: boolean
  requires_company: boolean
  requires_training: boolean
  requires_nda: boolean
  /** Missing before 010. App treats undefined as true. */
  requires_photo?: boolean
  training_video_url: string | null
  training_title: string | null
  location_id: string
  created_at: string
}

/** One immutable uploaded NDA version. Null location_id is the global fallback. */
export interface NdaDocument {
  id: string
  location_id: string | null
  version: number
  title: string
  storage_path: string
  file_name: string | null
  byte_size: number | null
  is_current: boolean
  uploaded_by: string | null
  field_positions?: import("@/lib/nda-fields").NdaFieldPosition[]
  created_at: string
  // Joined fields
  locations?: { name: string } | null
}

/**
 * The audit record of a visitor signing. Name/company/host are denormalised on
 * purpose so the record still reads correctly after later renames or deletions.
 */
export interface NdaAcknowledgement {
  id: string
  nda_document_id: string
  visitor_id: string | null
  sign_in_id: string | null
  visitor_type_id: string | null
  location_id: string | null
  host_id: string | null
  visitor_name: string
  visitor_company: string | null
  visitor_email: string | null
  visitor_type_name: string | null
  host_name: string | null
  signed_at: string
  expires_at: string | null
  signed_pdf_storage_path: string | null
  signature_storage_path: string | null
  signature_ip: string | null
  user_agent: string | null
  created_at: string
  // Joined fields
  nda_documents?: { version: number; title: string } | null
  locations?: { name: string } | null
}

export interface TrainingCompletion {
  id: string
  visitor_id: string
  visitor_type_id: string
  completed_at: string
  expires_at: string | null
  source?: "kiosk" | "qr" | "training_link" | "prior" | null
  location_id?: string | null
  created_at: string
  visitor?: Visitor
  visitor_type?: VisitorType
  location?: Location
}

export interface ReportSchedule {
  id: string
  name: string
  kind: "visitors" | "employees" | "training"
  location_ids: string[]
  visitor_type_ids: string[]
  range_type: "previous_day" | "previous_week" | "previous_month" | "last_n_days"
  last_n_days: number | null
  frequency: "daily" | "weekly" | "monthly"
  weekday: number | null
  month_day: number | null
  send_time: string
  timezone: string
  recipients: string[]
  format: "csv" | "summary" | "both"
  /** Present after 016. minutes is the historical default. */
  duration_unit?: "minutes" | "hours" | null
  enabled: boolean
  next_run_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ReportRun {
  id: string
  schedule_id: string
  trigger: "scheduled" | "manual"
  status: "queued" | "running" | "sent" | "failed" | "skipped"
  period_start: string
  period_end: string
  row_count: number | null
  recipients: string[] | null
  error: string | null
  started_at: string
  finished_at: string | null
}

export interface Host {
  id: string
  name: string
  email: string | null
  phone: string | null
  department: string | null
  location_id: string
  is_active: boolean
  profile_id: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
  // Joined fields
  profile?: Profile
  location?: Location
}

export interface Visitor {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  company: string | null
  photo_url: string | null
  created_at: string
  updated_at: string
}

export interface SignIn {
  id: string
  visitor_id: string
  location_id: string
  visitor_type_id: string | null
  host_id: string | null
  sign_in_time: string
  sign_out_time: string | null
  /** Present after 016-sign-out-source-and-duration-unit.sql. */
  sign_out_source?: SignOutSource | null
  purpose: string | null
  badge_number: string | null
  notes: string | null
  created_at: string
  // Joined fields
  visitor?: Visitor
  host?: Host
  visitor_type?: VisitorType
  location?: Location
}

export interface Booking {
  id: string
  visitor_id: string | null
  location_id: string
  host_id: string | null
  visitor_type_id: string | null
  expected_arrival: string
  expected_departure: string | null
  visitor_first_name: string
  visitor_last_name: string
  visitor_email: string | null
  visitor_company: string | null
  purpose: string | null
  status: "pending" | "checked_in" | "completed" | "cancelled"
  created_by: string | null
  created_at: string
  updated_at: string
  preferred_language?: "en" | "es"
  invite_mode?: "now" | "scheduled" | "manual"
  invite_lead_minutes?: number | null
  invite_send_at?: string | null
  invite_status?: "none" | "scheduled" | "sending" | "sent" | "failed"
  invite_sent_at?: string | null
  invite_count?: number
  invite_error?: string | null
  // Joined fields
  host?: Host
  visitor_type?: VisitorType
  location?: Location
}

export interface Evacuation {
  id: string
  location_id: string
  started_at: string
  ended_at: string | null
  initiated_by: string | null
  completed_by: string | null
  reason: string | null
  all_clear: boolean
  created_at: string
  // Joined fields
  location?: Location
  initiated_by_profile?: Profile
  completed_by_profile?: Profile
}

export interface Vendor {
  id: string
  ramp_vendor_id: string | null
  name: string
  name_legal: string | null
  is_active: boolean
  country: string | null
  state: string | null
  description: string | null
  category_name: string | null
  synced_at: string | null
  created_at: string
  updated_at: string
}

export interface SyncRun {
  id: string
  provider: "azure" | "ramp"
  trigger: "cron" | "manual"
  status: "queued" | "running" | "succeeded" | "failed"
  phase: string | null
  progress_current: number | null
  progress_total: number | null
  synced: number
  created: number
  updated: number
  deactivated: number
  error_count: number
  errors: string[]
  started_at: string
  finished_at: string | null
  heartbeat_at: string
}

export interface AuditLog {
  id: string
  user_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  description: string | null
  metadata: Record<string, unknown>
  ip_address: string | null
  user_agent: string | null
  created_at: string
  // Joined fields
  user?: Profile
}

// Re-export Role from permissions lib for convenience
export type { Role } from "@/lib/permissions"
