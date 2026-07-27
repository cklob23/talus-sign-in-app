"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Loader2 } from "lucide-react"

interface Vendor {
    id: string
    name: string
}

/** Only search once the visitor has typed enough to narrow the vendor list. */
const MIN_QUERY = 2
const DEBOUNCE_MS = 250

/**
 * Company field with vendor autocomplete, matching the kiosk sign-in behaviour.
 *
 * Suggestions come from the approved vendor list once at least two characters
 * are typed. A free-typed value is still accepted so a legitimate visitor from
 * an unlisted company is never blocked at the door.
 */
export function CompanyAutocomplete({
    id,
    value,
    onChange,
    required,
    describedBy,
}: {
    id: string
    value: string
    onChange: (value: string) => void
    required?: boolean
    describedBy?: string
}) {
    const [results, setResults] = useState<Vendor[]>([])
    const [open, setOpen] = useState(false)
    const [searching, setSearching] = useState(false)
    /** Set when a suggestion is chosen, so we don't immediately re-query for it. */
    const justPickedRef = useRef(false)
    const abortRef = useRef<AbortController | null>(null)

    const query = value.trim()

    useEffect(() => {
        if (justPickedRef.current) {
            justPickedRef.current = false
            return
        }
        if (query.length < MIN_QUERY) {
            setResults([])
            setSearching(false)
            return
        }

        // Debounce so typing a company name doesn't fire a request per keystroke.
        const timer = window.setTimeout(async () => {
            abortRef.current?.abort()
            const controller = new AbortController()
            abortRef.current = controller
            setSearching(true)
            try {
                const res = await fetch(
                    `/api/vendors?active_only=true&limit=10&q=${encodeURIComponent(query)}`,
                    { signal: controller.signal },
                )
                if (res.ok) {
                    const { vendors } = await res.json()
                    setResults(Array.isArray(vendors) ? vendors : [])
                } else {
                    setResults([])
                }
            } catch {
                // Aborted or offline: fall back to free text, no error shown.
            } finally {
                if (!controller.signal.aborted) setSearching(false)
            }
        }, DEBOUNCE_MS)

        return () => window.clearTimeout(timer)
    }, [query])

    useEffect(() => () => abortRef.current?.abort(), [])

    const pick = useCallback(
        (name: string) => {
            justPickedRef.current = true
            onChange(name)
            setOpen(false)
            setResults([])
        },
        [onChange],
    )

    const showList = open && query.length >= MIN_QUERY

    return (
        <div className="relative">
            <Input
                id={id}
                value={value}
                required={required}
                autoComplete="off"
                role="combobox"
                aria-expanded={showList}
                aria-autocomplete="list"
                aria-controls={`${id}-listbox`}
                aria-describedby={describedBy}
                placeholder="Start typing to search companies"
                onChange={(e) => {
                    onChange(e.target.value)
                    setOpen(true)
                }}
                onFocus={() => setOpen(true)}
                // Delay so a tap on a suggestion registers before the list unmounts.
                onBlur={() => window.setTimeout(() => setOpen(false), 150)}
            />

            {showList ? (
                <div
                    id={`${id}-listbox`}
                    role="listbox"
                    className="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-md border bg-popover shadow-lg"
                >
                    {searching ? (
                        <p className="flex items-center justify-center gap-2 p-3 text-sm text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Searching
                        </p>
                    ) : results.length > 0 ? (
                        results.map((vendor) => (
                            <button
                                key={vendor.id}
                                type="button"
                                role="option"
                                aria-selected={vendor.name === value}
                                className="w-full px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted focus:bg-muted focus:outline-none"
                                // onMouseDown fires before blur, so the pick isn't lost.
                                onMouseDown={(e) => {
                                    e.preventDefault()
                                    pick(vendor.name)
                                }}
                            >
                                {vendor.name}
                            </button>
                        ))
                    ) : (
                        <p className="p-3 text-center text-sm text-muted-foreground">
                            No matching companies. You can enter it manually.
                        </p>
                    )}
                </div>
            ) : null}
        </div>
    )
}
