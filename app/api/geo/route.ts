import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Best-effort country of the visitor, read from the edge headers Cloudflare (or
 * a similar proxy) puts on the request. Used only to preselect the country in
 * onboarding — never to restrict anything, so an empty answer is fine.
 */
export async function GET(request: Request) {
  const headers = request.headers
  const raw =
    headers.get('cf-ipcountry') ||
    headers.get('x-vercel-ip-country') ||
    headers.get('x-country-code') ||
    ''

  const country = /^[A-Za-z]{2}$/.test(raw) ? raw.toUpperCase() : null
  // Cloudflare sends XX for unknown and T1 for Tor exits.
  const resolved = country === 'XX' || country === 'T1' ? null : country

  return NextResponse.json(
    { country: resolved },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
