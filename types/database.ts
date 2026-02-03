export interface Location {
  id: string
  name: string
  address: string | null
  timezone: string
  latitude: number | null
  longitude: number | null
  auto_signin_radius_meters: number | null
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: "admin" | "staff" | "viewer" | "employee"
  location_id: string | null
  phone: string | null
  department: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface EmployeeSignIn {
  id: string
  profile_id: string
  location_id: string
  sign_in_time: string
  sign_out_time: string | null
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
  training_video_url: string | null
  training_title: string | null
  location_id: string
  created_at: string
}

export interface TrainingCompletion {
  id: string
  visitor_id: string
  visitor_type_id: string
  completed_at: string
  expires_at: string | null
  created_at: string
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
