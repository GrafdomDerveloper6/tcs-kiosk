"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function SiteLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(false);
    try {
      const res = await fetch("/api/site-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError(true);
        setSubmitting(false);
        return;
      }
      const next = searchParams.get("next") || "/";
      // Full navigation, not router.push: the just-set cookie needs to be
      // present on the very next request, and a hard load guarantees that
      // rather than relying on the client router's own cache.
      window.location.href = next;
    } catch {
      setError(true);
      setSubmitting(false);
    }
  };

  return (
    <form className="site-login-card" onSubmit={handleSubmit}>
      <div className="site-login-mark">TCS</div>
      <h1 className="site-login-title">This site is private</h1>
      <p className="site-login-sub">Enter the access password to continue.</p>
      <input
        className={`site-login-input ${error ? "error" : ""}`}
        type="password"
        placeholder="Password"
        autoFocus
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          setError(false);
        }}
      />
      {error && <div className="site-login-error">That password isn&apos;t correct.</div>}
      <button className="site-login-btn" type="submit" disabled={submitting || !password}>
        {submitting ? "Checking…" : "Enter"}
      </button>
    </form>
  );
}

export default function SiteLoginPage() {
  return (
    <div className="site-login-bg">
      <Suspense fallback={null}>
        <SiteLoginForm />
      </Suspense>
    </div>
  );
}
