import { BaseAuthStore } from 'pocketbase';

export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Lax' | 'Strict' | 'None';
  path: string;
  expires: Date;
}

export class CustomAuthStore extends BaseAuthStore {
  constructor(private cookieName: string) {
    super();
  }

  loadFromCookie(cookieHeader: string) {
    const cookie = cookieHeader
      .split(';')
      .find((c) => c.trim().startsWith(`${this.cookieName}=`));
    if (!cookie) return this.clear();

    try {
      const cookieValue = cookie.substring(cookie.indexOf('=') + 1);
      const { token, model } = JSON.parse(decodeURIComponent(cookieValue));
      this.save(token, model);
    } catch {
      this.clear();
    }
  }

  exportToCookie(options: Partial<CookieOptions> = {}): string {
    if (!this.token)
      return `${this.cookieName}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;

    const opts: CookieOptions = {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      path: '/',
      expires: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
      ...options,
    };

    const value = encodeURIComponent(
      JSON.stringify({ token: this.token, model: this.record }),
    );
    let cookieString = `${this.cookieName}=${value}; Path=${opts.path}; Expires=${opts.expires.toUTCString()}`;

    if (opts.httpOnly) {
      cookieString += `; HttpOnly`;
    }

    cookieString += `; SameSite=${opts.sameSite}`;
    if (opts.secure) {
      cookieString += `; Secure`;
    }

    return cookieString;
  }
}
