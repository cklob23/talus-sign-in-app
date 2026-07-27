/**
 * Visitor badge number format: a "V" followed by exactly five digits (0-9),
 * with no separator — e.g. `V04821`, `V99013`.
 *
 * Digits are zero-padded rather than drawn from the 10000-99999 range so the
 * full 100,000-value space is usable and every badge is the same width, which
 * keeps printed badges and CSV exports aligned.
 */
export const BADGE_NUMBER_RE = /^V\d{5}$/

/**
 * Accepts the current format plus the legacy `V-1234` badges issued before it.
 *
 * Visitors already on site when this format changed still hold printed legacy
 * badges, and refusing them at the sign-out step would leave them stuck as
 * "on site" — which corrupts evacuation roll-calls. Use this for validating
 * visitor input; use `BADGE_NUMBER_RE` when checking newly generated numbers.
 */
export const BADGE_NUMBER_INPUT_RE = /^V-?\d{4,5}$/

/** Generate a badge number. Uniqueness is not guaranteed — see `generateUniqueBadgeNumber`. */
export function generateBadgeNumber(): string {
    return `V${Math.floor(Math.random() * 100_000)
        .toString()
        .padStart(5, "0")}`
}

/**
 * Generate a badge number that no visitor currently on site is using.
 *
 * With only 100,000 possible values, birthday-paradox collisions are realistic
 * once a site has a few hundred active visitors, and a duplicate badge would
 * make two people indistinguishable during an evacuation roll-call. Only active
 * (not signed-out) records are considered, so numbers are free to be reused
 * across days.
 *
 * Falls back to an unchecked number after `attempts` tries so a transient
 * database problem can never block someone from signing in.
 */
export async function generateUniqueBadgeNumber(
    isTaken: (badgeNumber: string) => Promise<boolean>,
    attempts = 8,
): Promise<string> {
    for (let i = 0; i < attempts; i++) {
        const candidate = generateBadgeNumber()
        try {
            if (!(await isTaken(candidate))) return candidate
        } catch {
            return candidate
        }
    }
    return generateBadgeNumber()
}
