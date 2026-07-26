import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

function createSupabaseClient(request: Request, response: NextResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.headers
            .get('cookie')
            ?.split(';')
            .map((cookie) => cookie.trim())
            .filter(Boolean)
            .map((cookie) => {
              const [name, ...valueParts] = cookie.split('=')
              return { name, value: valueParts.join('=') }
            }) ?? []
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    },
  )
}

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie)
  })
}

export async function GET(request: Request) {
  try {
    const cookieResponse = NextResponse.next()
    const supabase = createSupabaseClient(request, cookieResponse)
    const { data } = await supabase.auth.getUser()

    if (!data.user) {
      const jsonResponse = NextResponse.json({ user: null })
      copyCookies(cookieResponse, jsonResponse)
      return jsonResponse
    }

    const jsonResponse = NextResponse.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.full_name || data.user.email?.split('@')[0] || '',
      },
    })
    copyCookies(cookieResponse, jsonResponse)
    return jsonResponse
  } catch (error) {
    console.error('Session error:', error)
    return NextResponse.json({ user: null })
  }
}
