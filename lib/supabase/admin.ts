import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("데이터베이스 관리자 설정이 없습니다.");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
