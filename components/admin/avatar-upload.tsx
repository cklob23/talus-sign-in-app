"use client"

import React from "react"

import { useState, useRef } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Camera, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface AvatarUploadProps {
  profileId: string
  currentUrl?: string | null
  name?: string
  onUploadComplete?: (url: string) => void
  size?: "sm" | "md" | "lg"
}

export function AvatarUpload({ 
  profileId, 
  currentUrl, 
  name, 
  onUploadComplete,
  size = "lg"
}: AvatarUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const sizeClasses = {
    sm: "h-10 w-10",
    md: "h-16 w-16",
    lg: "h-24 w-24"
  }

  const iconSizeClasses = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6"
  }

  const initials = name
    ?.split(" ")
    .map(n => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?"

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Show preview immediately
    const reader = new FileReader()
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string)
    }
    reader.readAsDataURL(file)

    setIsUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("profileId", profileId)

      const response = await fetch("/api/admin/upload-avatar", {
        method: "POST",
        body: formData,
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Upload failed")
      }

      onUploadComplete?.(result.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
      setPreviewUrl(null)
    } finally {
      setIsUploading(false)
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const displayUrl = previewUrl || currentUrl

  return (
    <div className="flex flex-col items-center gap-2">
      <div 
        className="relative group cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
      >
        <Avatar className={cn(sizeClasses[size], "border-2 border-muted")}>
          {displayUrl ? (
            <AvatarImage src={displayUrl || "/placeholder.svg"} alt={name || "Avatar"} />
          ) : null}
          <AvatarFallback className="text-lg font-medium bg-muted">
            {initials}
          </AvatarFallback>
        </Avatar>
        
        {/* Hover overlay */}
        <div className={cn(
          "absolute inset-0 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity",
          isUploading && "opacity-100"
        )}>
          {isUploading ? (
            <Loader2 className={cn(iconSizeClasses[size], "text-white animate-spin")} />
          ) : (
            <Camera className={cn(iconSizeClasses[size], "text-white")} />
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={handleFileChange}
          className="hidden"
          disabled={isUploading}
        />
      </div>

      {error && (
        <p className="text-xs text-destructive text-center max-w-[200px]">{error}</p>
      )}
      
      <p className="text-xs text-muted-foreground">Click to upload photo</p>
    </div>
  )
}
