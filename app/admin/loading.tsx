export default function AdminLoading() {
    return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 min-h-[60vh]">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground animate-pulse">
                Loading dashboard...
            </p>
        </div>
    )
}
