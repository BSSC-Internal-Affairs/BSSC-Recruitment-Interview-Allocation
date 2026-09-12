"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { Brand } from "../brand";
import { request } from "@/services/api";
export function LoginForm() {
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await request("admin/login", "POST", { username, password });
      router.push("/admin");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-shell">
      <Brand />
      <main className="login-card">
        <span className="login-icon">
          <LockKeyhole size={25} />
        </span>
        <div className="eyebrow">COMMITTEE SPACE</div>
        <h1>Welcome back.</h1>
        <p className="muted">Sign in to keep the next chapter moving.</p>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
          <button className="btn primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
            <ArrowRight size={17} />
          </button>
        </form>
      </main>
    </div>
  );
}
