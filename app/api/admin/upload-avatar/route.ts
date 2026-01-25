import { createClient } from "@/lib/supabase/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser()
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

    // Check if service role key is available
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      return NextResponse.json({ 
        error: "Server configuration error: SUPABASE_SERVICE_ROLE_KEY is not set. Please add it to your environment variables." 
      }, { status: 500 })
    }

    // Create admin client with service role key to bypass RLS for storage
    const adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const formData = await request.formData()
    const file = formData.get("file") as File
    const profileId = formData.get("profileId") as string

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    if (!profileId) {
      return NextResponse.json({ error: "No profile ID provided" }, { status: 400 })
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type. Please upload a JPEG, PNG, GIF, or WebP image." }, { status: 400 })
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large. Maximum size is 5MB." }, { status: 400 })
    }

    // Generate unique filename (no nested folder since bucket is already 'avatars')
    const fileExt = file.name.split(".").pop()
    const fileName = `${profileId}-${Date.now()}.${fileExt}`
    const filePath = fileName

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = new Uint8Array(arrayBuffer)

    // Check if bucket exists, create if not
    const { data: buckets, error: listError } = await adminClient.storage.listBuckets()
    
    if (listError) {
      console.error("Error listing buckets:", listError)
      return NextResponse.json({ 
        error: `Storage access error: ${listError.message}. Ensure SUPABASE_SERVICE_ROLE_KEY is correct.` 
      }, { status: 500 })
    }

    const avatarsBucketExists = buckets?.some(b => b.name === "avatars")
    
    if (!avatarsBucketExists) {
      // Try to create the bucket
      const { error: createError } = await adminClient.storage.createBucket("avatars", {
        public: true,
        fileSizeLimit: 5 * 1024 * 1024,
        allowedMimeTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"]
      })
      
      if (createError && !createError.message.includes("already exists")) {
        console.error("Bucket creation error:", createError)
        return NextResponse.json({ 
          error: `Please create an 'avatars' storage bucket in your Supabase dashboard (Storage > New bucket > name: avatars, public: true)` 
        }, { status: 500 })
      }
    }

    // Upload to Supabase Storage using admin client to bypass RLS
    const { error: uploadError } = await adminClient.storage
      .from("avatars")
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) {
      console.error("Upload error:", uploadError)
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
    }

    // Get public URL
    const { data: { publicUrl } } = adminClient.storage
      .from("avatars")
      .getPublicUrl(filePath)

    // Update profile with new avatar URL using admin client
    const { error: updateError } = await adminClient
      .from("profiles")
      .update({ avatar_url: publicUrl })
      .eq("id", profileId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ url: publicUrl })
  } catch (error) {
    console.error("Avatar upload error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload avatar" },
      { status: 500 }
    )
  }
}
