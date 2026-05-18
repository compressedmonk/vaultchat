import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isRegistrationDisabled } from '@/lib/registration'
import { AUTH_INTENT_COOKIE_NAME, SESSION_COOKIE_NAME } from '@/lib/session-cookie'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value)
  const hasAuthIntent = Boolean(request.cookies.get(AUTH_INTENT_COOKIE_NAME)?.value)

  if (isRegistrationDisabled() && pathname === '/register') {
    const login = new URL('/login', request.url)
    login.searchParams.set('registration', 'closed')
    return NextResponse.redirect(login)
  }

  if (pathname === '/chat' || pathname.startsWith('/chat/')) {
    if (!hasSessionCookie) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    if (!hasAuthIntent) {
      const login = new URL('/login', request.url)
      login.searchParams.set('next', pathname)
      return NextResponse.redirect(login)
    }
  }
}

export const config = {
  matcher: ['/register', '/chat', '/chat/:path*'],
}
