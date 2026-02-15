"use client"

import React, { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { createClient } from "@/lib/supabase/client"
import { resolvePermissions, ALL_PERMISSIONS, type PermissionKey } from "@/lib/permissions"

interface PermissionsContextValue {
    permissions: Set<PermissionKey>
    isLoading: boolean
    profileRole: string | null
    customRoleName: string | null
    /** Re-fetch permissions (e.g. after role change) */
    refresh: () => Promise<void>
}

const PermissionsContext = createContext<PermissionsContextValue>({
    permissions: new Set(),
    isLoading: true,
    profileRole: null,
    customRoleName: null,
    refresh: async () => { },
})

export function usePermissions() {
    return useContext(PermissionsContext)
}

export function PermissionsProvider({ children }: { children: ReactNode }) {
    const [permissions, setPermissions] = useState<Set<PermissionKey>>(new Set())
    const [isLoading, setIsLoading] = useState(true)
    const [profileRole, setProfileRole] = useState<string | null>(null)
    const [customRoleName, setCustomRoleName] = useState<string | null>(null)

    const load = async () => {
        setIsLoading(true)
        try {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                setPermissions(new Set())
                setProfileRole(null)
                setCustomRoleName(null)
                setIsLoading(false)
                return
            }

            const { data: profile } = await supabase
                .from("profiles")
                .select("role, custom_role_id")
                .eq("id", user.id)
                .single()

            if (!profile) {
                setPermissions(new Set())
                setProfileRole(null)
                setCustomRoleName(null)
                setIsLoading(false)
                return
            }

            setProfileRole(profile.role)

            // Built-in admin gets everything
            if (profile.role === "admin") {
                setPermissions(new Set(ALL_PERMISSIONS))
                setCustomRoleName(null)
                setIsLoading(false)
                return
            }

            // Fetch custom role permissions if assigned
            if (profile.custom_role_id) {
                const { data: role } = await supabase
                    .from("roles")
                    .select("name, permissions")
                    .eq("id", profile.custom_role_id)
                    .single()

                if (role) {
                    setCustomRoleName(role.name)
                    const perms = resolvePermissions(profile.role, role.permissions as PermissionKey[])
                    setPermissions(perms)
                    setIsLoading(false)
                    return
                }
            }

            // No custom role, resolve from profile role alone
            setCustomRoleName(null)
            setPermissions(resolvePermissions(profile.role, null))
        } catch (err) {
            console.error("Failed to load permissions:", err)
            setPermissions(new Set())
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        load()
    }, [])

    return (
        <PermissionsContext.Provider value={{ permissions, isLoading, profileRole, customRoleName, refresh: load }}>
            {children}
        </PermissionsContext.Provider>
    )
}
