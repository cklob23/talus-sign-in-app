import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

// Microsoft Graph API endpoint for users
const GRAPH_API_URL = "https://graph.microsoft.com/v1.0"

// Azure AD App Registration credentials (Client Credentials Flow)
const AZURE_TENANT_ID = process.env.AZURE_AD_TENANT_ID
const AZURE_CLIENT_ID = process.env.AZURE_AD_CLIENT_ID
const AZURE_CLIENT_SECRET = process.env.AZURE_AD_CLIENT_SECRET

// Get access token using Client Credentials Flow
async function getAzureAccessToken(): Promise<string> {
  if (!AZURE_TENANT_ID || !AZURE_CLIENT_ID || !AZURE_CLIENT_SECRET) {
    throw new Error("Azure AD credentials not configured. Please set AZURE_AD_TENANT_ID, AZURE_AD_CLIENT_ID, and AZURE_AD_CLIENT_SECRET environment variables.")
  }

  const tokenUrl = `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`
  
  const params = new URLSearchParams({
    client_id: AZURE_CLIENT_ID,
    client_secret: AZURE_CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  })

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(`Failed to get Azure AD token: ${errorData.error_description || errorData.error || "Unknown error"}`)
  }

  const data = await response.json()
  return data.access_token
}

// GET - Preview Azure AD users before import
export async function GET() {
  try {
    const supabase = await createClient()

    // Check if user is authenticated and is an admin
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user has admin role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    // Get access token using app credentials (Client Credentials Flow)
    let accessToken: string
    try {
      accessToken = await getAzureAccessToken()
    } catch (tokenError) {
      return NextResponse.json(
        {
          error: tokenError instanceof Error ? tokenError.message : "Failed to authenticate with Azure AD",
          configError: true,
        },
        { status: 500 }
      )
    }

    // Fetch users from Microsoft Graph API
    const usersResponse = await fetch(
      `${GRAPH_API_URL}/users?$select=id,displayName,mail,userPrincipalName,jobTitle,department`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    )

    if (!usersResponse.ok) {
      const errorData = await usersResponse.json().catch(() => ({}))
      
      if (usersResponse.status === 401 || usersResponse.status === 403) {
        return NextResponse.json(
          {
            error: "Azure AD access denied. Ensure your app registration has the User.Read.All application permission granted with admin consent.",
          },
          { status: 403 }
        )
      }
      
      return NextResponse.json(
        { error: `Failed to fetch users from Azure AD: ${errorData.error?.message || "Unknown error"}` },
        { status: 500 }
      )
    }

    const usersData = await usersResponse.json()
    const azureUsers = usersData.value || []

    // Return simplified user list for preview (no photos yet to speed up response)
    const users = azureUsers.map((u: { id: string; displayName: string; mail: string; userPrincipalName: string }) => ({
      id: u.id,
      displayName: u.displayName,
      mail: u.mail,
      userPrincipalName: u.userPrincipalName,
    }))

    return NextResponse.json({ users })
  } catch (error) {
    console.error("Azure fetch error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch users" },
      { status: 500 }
    )
  }
}

// POST - Import selected Azure AD users
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check if user is authenticated and is an admin
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user has admin role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    // Get selected users from request body
    const body = await request.json().catch(() => ({}))
    const selectedUsers = body.users || []

    if (selectedUsers.length === 0) {
      return NextResponse.json({ error: "No users selected" }, { status: 400 })
    }

    // Get access token using app credentials (Client Credentials Flow)
    let accessToken: string
    try {
      accessToken = await getAzureAccessToken()
    } catch (tokenError) {
      return NextResponse.json(
        {
          error: tokenError instanceof Error ? tokenError.message : "Failed to authenticate with Azure AD",
        },
        { status: 500 }
      )
    }

    let syncedCount = 0
    const errors: string[] = []

    // Process each selected user
    for (const azureUser of selectedUsers) {
      const email = azureUser.mail || azureUser.userPrincipalName
      if (!email) continue

      try {
        // Try to fetch profile photo
        let avatarUrl: string | null = null
        try {
          const photoResponse = await fetch(`${GRAPH_API_URL}/users/${azureUser.id}/photo/$value`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          })

          if (photoResponse.ok) {
            // Convert photo to base64 data URL
            const photoBlob = await photoResponse.blob()
            const arrayBuffer = await photoBlob.arrayBuffer()
            const base64 = Buffer.from(arrayBuffer).toString("base64")
            const mimeType = photoResponse.headers.get("content-type") || "image/jpeg"
            avatarUrl = `data:${mimeType};base64,${base64}`
          }
        } catch (photoError) {
          // Photo fetch failed, continue without avatar
          console.log(`No photo available for ${email}`)
        }

        // Check if profile exists
        const { data: existingProfile } = await supabase
          .from("profiles")
          .select("id")
          .eq("email", email.toLowerCase())
          .single()

        const profileData = {
          email: email.toLowerCase(),
          full_name: azureUser.displayName || null,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        }

        if (existingProfile) {
          // Update existing profile
          await supabase
            .from("profiles")
            .update(profileData)
            .eq("id", existingProfile.id)
        } else {
          // Create new profile with employee role by default
          await supabase.from("profiles").insert({
            ...profileData,
            id: crypto.randomUUID(),
            role: "employee",
          })
        }

        syncedCount++
      } catch (userError) {
        errors.push(`Failed to sync ${email}: ${userError instanceof Error ? userError.message : "Unknown error"}`)
      }
    }

    return NextResponse.json({
      synced: syncedCount,
      total: selectedUsers.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error("Azure sync error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sync users" },
      { status: 500 }
    )
  }
}
