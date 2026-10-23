export const RECENT_ACTIVITY_DESCRIPTION = "Latest visitor and employee sign-ins"
export const RECENT_ACTIVITY_EMPTY = "No recent visitor or employee activity"

export type RecentActivityItem = {
  id: string
  type: "visitor" | "employee"
  name: string
  initials: string
  photo_url?: string | null
  sign_in_time: string
  sign_out_time: string | null
  badge_color?: string
  badge_text?: string
  subtitle: string
  timezone: string
  on_site: boolean
}

type VisitorLike = {
  id: string
  sign_in_time: string
  sign_out_time: string | null
  visitor?: {
    first_name?: string | null
    last_name?: string | null
    photo_url?: string | null
  } | null
  host?: { name?: string | null } | null
  visitor_type?: { badge_color?: string | null; name?: string | null } | null
  location?: { timezone?: string | null } | null
}

type EmployeeLike = {
  id: string
  sign_in_time: string
  sign_out_time: string | null
  auto_signed_in?: boolean | null
  profile?: {
    full_name?: string | null
    email?: string | null
    avatar_url?: string | null
  } | null
  location?: { timezone?: string | null } | null
}

export function mapVisitorRecentActivity(v: VisitorLike): RecentActivityItem {
  const first = v.visitor?.first_name || ""
  const last = v.visitor?.last_name || ""
  const onSite = v.sign_out_time == null
  return {
    id: v.id,
    type: "visitor",
    name: `${first} ${last}`.trim() || "Unknown Visitor",
    initials: `${first[0] || ""}${last[0] || ""}`,
    photo_url: v.visitor?.photo_url,
    sign_in_time: v.sign_in_time,
    sign_out_time: v.sign_out_time,
    badge_color: v.visitor_type?.badge_color ?? undefined,
    badge_text: v.visitor_type?.name ?? undefined,
    subtitle: v.host?.name
      ? onSite
        ? `Visiting ${v.host.name}`
        : `Visited ${v.host.name}`
      : onSite
        ? "No host assigned"
        : "Signed out",
    timezone: v.location?.timezone || "UTC",
    on_site: onSite,
  }
}

export function mapEmployeeRecentActivity(e: EmployeeLike): RecentActivityItem {
  const name = e.profile?.full_name || e.profile?.email || "Unknown Employee"
  const onSite = e.sign_out_time == null
  const how = e.auto_signed_in ? "Auto sign-in" : "Manual sign-in"
  return {
    id: e.id,
    type: "employee",
    name,
    initials: name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
    photo_url: e.profile?.avatar_url,
    sign_in_time: e.sign_in_time,
    sign_out_time: e.sign_out_time,
    badge_color: "#2563eb",
    badge_text: "Employee",
    subtitle: onSite ? how : `${how} · Signed out`,
    timezone: e.location?.timezone || "UTC",
    on_site: onSite,
  }
}

/** Newest sign-ins first, including people who already signed out. */
export function combineRecentActivity(
  visitors: VisitorLike[],
  employees: EmployeeLike[],
  limit = 5,
): RecentActivityItem[] {
  return [...visitors.map(mapVisitorRecentActivity), ...employees.map(mapEmployeeRecentActivity)]
    .sort((a, b) => new Date(b.sign_in_time).getTime() - new Date(a.sign_in_time).getTime())
    .slice(0, limit)
}
