// middleware.ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// регулярка: будь-який файл типу /file.ext
const PUBLIC_FILE = /\.(.*)$/;

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1) Пропускаємо службові та публічні ресурси
  if (
    pathname.startsWith('/_next') ||             // статичні Next
    pathname.startsWith('/static') ||            // якщо є
    pathname === '/favicon.ico' ||
    pathname === '/site.webmanifest' ||          // іноді так називають
    pathname === '/manifest.webmanifest' ||
    pathname === '/manifest.json' ||
    pathname.startsWith('/icons') ||             // /icons/* з public
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname === '/sw.js' ||                     // ваш service worker в public
    PUBLIC_FILE.test(pathname)                   // будь-який інший *.ext з public
  ) {
    return NextResponse.next();
  }

  // 2) (Необов’язково) тут можуть бути ваші перевірки авторизації для закритих сторінок
  // приклад:
  // const token = req.cookies.get('token')?.value;
  // if (!token && pathname.startsWith('/profile')) {
  //   return NextResponse.redirect(new URL('/signin', req.url));
  // }

  return NextResponse.next();
}

// Вказуємо, що middleware застосовується до сторінок, але не до /api
export const config = {
  matcher: ['/((?!api/).* )'], // якщо у вас є /api — не чіпаємо
};
