import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SESSION_COOKIE, isValidSession } from '@/lib/session'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isLoginPage = pathname === '/login'
  const isAuthApi = pathname.startsWith('/api/auth')

  if (isAuthApi) {
    return NextResponse.next()
  }

  const isAuthenticated = await isValidSession(request.cookies.get(SESSION_COOKIE)?.value)

  if (!isAuthenticated && !isLoginPage) {
    // API calls get a 401 instead of a redirect to the login page.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (isAuthenticated && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
