import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

async function createClientForRequest() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error("Supabase public environment variables are not configured.");
  }

  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot always write cookies. Session refresh will
          // be added through proxy.ts when authentication is implemented.
        }
      },
    },
  });
}

// A single authenticated render can resolve identity, feature flags, role
// context, and page data through the same cookie-bound Supabase client. React's
// cache is discarded after the server request, so no session or tenant data is
// shared with a later request or another user.
export const createClient = cache(createClientForRequest);
