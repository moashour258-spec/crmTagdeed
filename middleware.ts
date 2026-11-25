import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { destination, type Gate } from "@/lib/auth/gates";

type GateRow = {
  status: "active" | "inactive";
  must_change_password: boolean;
  profile_completed: boolean;
  is_super_admin: boolean;
  role: "admin" | "sales" | null;
};

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return redirectTo(request, destination(pathname, null));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: auth } = await supabase.auth.getUser();
  let gate: Gate | null = null;
  if (auth.user) {
    const { data } = await supabase.rpc("session_gate");
    if (data) {
      const row = data as GateRow;
      gate = {
        status: row.status,
        mustChangePassword: row.must_change_password,
        profileCompleted: row.profile_completed,
        isSuperAdmin: row.is_super_admin,
        role: row.role,
      };
    }
  }

  const next = destination(pathname, gate);
  if (!next) return response;
  const redirect = redirectTo(request, next);
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

function redirectTo(request: NextRequest, pathname: string | null) {
  if (!pathname || pathname === request.nextUrl.pathname) {
    return NextResponse.next({ request });
  }
  return NextResponse.redirect(new URL(pathname, request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico)$).*)"],
};
