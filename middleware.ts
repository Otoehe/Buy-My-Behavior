// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  // 🔐 Ваша логіка авторизації (за потреби):
  // приклад: якщо користувач не авторизований і йде на /profile чи /orders —
  // редірект на /signin
  // const isAuthed = Boolean(req.cookies.get('auth_token'));
  // if (!isAuthed && req.nextUrl.pathname.startsWith('/profile')) {
  //   const url = req.nextUrl.clone();
  //   url.pathname = '/signin';
  //   return NextResponse.redirect(url);
  // }

  return NextResponse.next();
}

// Дуже важливо: не чіпати _next, статичні, маніфест, іконки, sw, api.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|manifest.webmanifest|icons/.*|sw.js|api/.*|assets/.*).*)'
  ],
};
