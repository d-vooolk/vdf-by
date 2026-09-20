import { NextResponse, type NextRequest } from "next/server";

/**
 * Быстрая отсечка неавторизованных на подступах к админке.
 *
 * В Next 16 это то, что раньше называлось middleware. Работает до рендера, на
 * каждый запрос, поэтому здесь только проверка наличия куки — без обращений к
 * базе. Настоящая проверка сессии живёт в requireAdmin() и вызывается внутри
 * каждой страницы, каждого действия и каждого route handler'а: этот файл —
 * удобство (не рисовать интерфейс тому, кто всё равно не войдёт), а не рубеж
 * безопасности.
 */

const COOKIE = "vdf_admin";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const signedIn = Boolean(request.cookies.get(COOKIE)?.value);
  const isLogin = pathname.startsWith("/admin/login");

  if (!signedIn && !isLogin) {
    const url = new URL("/admin/login/", request.url);
    // Куда возвращаться после входа: если человек открыл ссылку на конкретный
    // товар, после логина он должен попасть туда, а не на главную админки.
    if (pathname !== "/admin" && pathname !== "/admin/") {
      url.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(url);
  }

  if (signedIn && isLogin) {
    return NextResponse.redirect(new URL("/admin/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Только админка. Витрина обязана оставаться быстрой и кешируемой, а любой
  // proxy на её маршрутах делает страницы динамическими.
  matcher: ["/admin/:path*"],
};
