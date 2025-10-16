// src/lib/cookies.ts
export function setCookie(name: string, value: string, maxAgeSec = 300) {
  document.cookie =
    `${encodeURIComponent(name)}=${encodeURIComponent(value)};` +
    `Path=/; Max-Age=${maxAgeSec}; Secure; SameSite=Lax`;
}

export function getCookie(name: string): string | null {
  const m = document.cookie.match(
    new RegExp("(^|;\\s*)" + encodeURIComponent(name) + "\\s*=\\s*([^;]+)")
  );
  return m ? decodeURIComponent(m[2]) : null;
}

export function delCookie(name: string) {
  document.cookie =
    `${encodeURIComponent(name)}=; Path=/; Max-Age=0; Secure; SameSite=Lax`;
}

