"use client"

import { useMemo } from "react"
import { useSession } from "@clerk/nextjs"
import { createClient } from "@supabase/supabase-js"
import { supabasePublishableKey, supabaseUrl } from "./config"

export function useSupabase() {
  const { session } = useSession()

  return useMemo(
    () =>
      createClient(supabaseUrl!, supabasePublishableKey!, {
        accessToken: async () => (await session?.getToken()) ?? null,
      }),
    [session],
  )
}
