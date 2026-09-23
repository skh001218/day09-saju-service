"use client";

import { useEffect, useRef, useState } from "react";
import { createClient, isSupabaseConfigured } from "../lib/supabase/client";

export type AuthUser = { id: string; email?: string };

type AuthControlsProps = {
  onAuthChange: (user: AuthUser | null) => void;
  initialUser?: AuthUser | null;
};

export default function AuthControls({ onAuthChange, initialUser = null }: AuthControlsProps) {
  const [user, setUser] = useState<AuthUser | null>(initialUser);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const onAuthChangeRef = useRef(onAuthChange);
  onAuthChangeRef.current = onAuthChange;

  useEffect(() => {
    const authError = new URLSearchParams(window.location.search).get("auth_error");
    if (authError) {
      setError(authError === "cancelled"
        ? "로그인이 취소되었습니다. 다시 시도할 수 있어요."
        : "로그인을 완료하지 못했습니다. 다시 시도해 주세요.");
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("auth_error");
      window.history.replaceState(null, "", cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
    }

    if (!isSupabaseConfigured()) {
      setError("Google 로그인 설정이 필요합니다. 서비스 관리자에게 문의해 주세요.");
      setUser(null);
      onAuthChangeRef.current(null);
      setLoading(false);
      return;
    }

    const supabase = createClient();
    let active = true;
    let revision = 0;
    async function refreshUser() {
      const current = ++revision;
      try {
        const { data, error: authError } = await supabase.auth.getUser();
        if (!active || current !== revision) return;
        const nextUser = !authError && data.user
          ? { id: data.user.id, email: data.user.email }
          : null;
        setUser(nextUser);
        onAuthChangeRef.current(nextUser);
      } catch {
        if (!active || current !== revision) return;
        setUser(null);
        onAuthChangeRef.current(null);
      } finally {
        if (active && current === revision) setLoading(false);
      }
    }

    void refreshUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        revision++;
        setUser(null);
        onAuthChangeRef.current(null);
        setLoading(false);
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        // Avoid calling Auth APIs synchronously inside the Auth event callback.
        window.setTimeout(() => { if (active) void refreshUser(); }, 0);
      }
    });

    return () => {
      active = false;
      revision++;
      subscription.unsubscribe();
    };
  }, []);

  async function handleLogin() {
    if (busy || loading || !isSupabaseConfigured()) return;
    setBusy(true);
    setError("");
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (authError) {
        setError("Google 로그인을 시작하지 못했습니다. 설정을 확인한 뒤 다시 시도해 주세요.");
      }
    } catch {
      setError("Google 로그인을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    if (busy || loading || !isSupabaseConfigured()) return;
    setBusy(true);
    setError("");
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signOut({ scope: "local" });
      if (authError) {
        setError("로그아웃하지 못했습니다. 다시 시도해 주세요.");
      } else {
        setUser(null);
        onAuthChangeRef.current(null);
      }
    } catch {
      setError("로그아웃하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-controls" aria-label="Google 계정 로그인">
      {loading ? (
        <p>로그인 상태를 확인하는 중입니다.</p>
      ) : user ? (
        <>
          <p>{user.email ? `${user.email} 계정으로 로그인했습니다.` : "로그인했습니다."}</p>
          <button type="button" onClick={handleLogout} disabled={busy}>
            {busy ? "로그아웃 중..." : "로그아웃"}
          </button>
        </>
      ) : (
        <>
          <p>자세한 해석과 새 결과 저장은 로그인 후 가능합니다.</p>
          <button type="button" onClick={handleLogin} disabled={busy || !isSupabaseConfigured()}>
            {busy ? "로그인 화면으로 이동 중..." : "Google로 로그인"}
          </button>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
