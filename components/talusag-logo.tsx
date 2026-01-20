import Link from "next/link"


interface TalusAgLogoProps {
  variant?: "light" | "dark"
  className?: string
  width?: number
  height?: number
}

export function TalusAgLogo({ variant = "dark", className = "", width = 150, height = 40 }: TalusAgLogoProps) {
  return (
    <Link href="/">
      <div className={`flex items-center gap-2 ${className}`}>
        <img src="https://cdn.prod.website-files.com/63e9d2dd3264854461e894e8/63e9d2dd3264850372e89569_Favicon.png" alt="Talus Favicon" />
        <span className={`font-bold text-xl tracking-tight ${variant === "dark" ? "text-foreground" : "text-white"}`}>
          Talus Sign In
        </span>
      </div>
    </Link>
  )
}
