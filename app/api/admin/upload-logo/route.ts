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
        error: "Server configuration error: SUPABASE_SERVICE_ROLE_KEY is not set." 
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
    const type = formData.get("type") as string // "full" or "small"

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    if (!type || !["full", "small"].includes(type)) {
      return NextResponse.json({ error: "Invalid logo type. Must be 'full' or 'small'." }, { status: 400 })
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/svg+xml", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type. Please upload a JPEG, PNG, SVG, or WebP image." }, { status: 400 })
    }

    // Validate file size (max 2MB for logos)
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large. Maximum size is 2MB." }, { status: 400 })
    }

    // Generate filename - use fixed names so they're always overwritten
    const fileExt = file.name.split(".").pop()
    const fileName = type === "full" ? `company-logo.${fileExt}` : `company-logo-small.${fileExt}`
    const filePath = `logos/${fileName}`

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = new Uint8Array(arrayBuffer)

    // Check if bucket exists, create if not
    const { data: buckets, error: listError } = await adminClient.storage.listBuckets()
    
    if (listError) {
      console.error("Error listing buckets:", listError)
      return NextResponse.json({ 
        error: `Storage access error: ${listError.message}` 
      }, { status: 500 })
    }

    const avatarsBucketExists = buckets?.some(b => b.name === "avatars")
    
    if (!avatarsBucketExists) {
      // Try to create the bucket
      const { error: createError } = await adminClient.storage.createBucket("avatars", {
        public: true,
        fileSizeLimit: 5 * 1024 * 1024,
        allowedMimeTypes: ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"]
      })
      
      if (createError && !createError.message.includes("already exists")) {
        console.error("Bucket creation error:", createError)
        return NextResponse.json({ 
          error: `Please create an 'avatars' storage bucket in your Supabase dashboard` 
        }, { status: 500 })
      }
    }

    // Upload to Supabase Storage in logos folder within avatars bucket
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

    return NextResponse.json({ url: publicUrl })
  } catch (error) {
    console.error("Logo upload error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload logo" },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
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

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }

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

    const { type } = await request.json()

    if (!type || !["full", "small"].includes(type)) {
      return NextResponse.json({ error: "Invalid logo type" }, { status: 400 })
    }

    // List files in logos folder to find the one to delete
    const { data: files } = await adminClient.storage
      .from("avatars")
      .list("logos")

    if (files) {
      const prefix = type === "full" ? "company-logo." : "company-logo-small."
      const fileToDelete = files.find(f => f.name.startsWith(prefix))
      
      if (fileToDelete) {
        await adminClient.storage
          .from("avatars")
          .remove([`logos/${fileToDelete.name}`])
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Logo delete error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete logo" },
      { status: 500 }
    )
  }
}
