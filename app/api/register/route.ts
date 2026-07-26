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

export async function POST(request: Request) {
  try {
    const { email, password, name } = await request.json()

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'Email, password, and name are required' },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      )
    }

    const cookieResponse = NextResponse.next()
    const supabase = createSupabaseClient(request, cookieResponse)

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
        },
      },
    })

    if (error || !data.user) {
      return NextResponse.json(
        { error: error?.message || 'Unable to register user' },
        { status: 400 }
      )
    }

    const jsonResponse = NextResponse.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.full_name || name,
      },
    })
    copyCookies(cookieResponse, jsonResponse)
    return jsonResponse
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
