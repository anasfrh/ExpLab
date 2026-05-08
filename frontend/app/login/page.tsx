"use client";

import React, { useEffect, useState } from "react";
import { getSetupStatus, login, setupAdmin, getMe } from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";

export default function LoginPage() {
  const [needsSetup, setNeedsSetup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { loginState } = useAuth();

  useEffect(() => {
    getSetupStatus()
      .then((res) => {
        setNeedsSetup(res.needs_setup);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to connect to server");
        setLoading(false);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      if (needsSetup) {
        await setupAdmin({ email, password });
        const loginRes = await login(email, password);
        loginState(loginRes.access_token, { id: "temp", email, role: "admin", can_simulate: true, can_edit_metrics: true });
      } else {
        const loginRes = await login(email, password);
        localStorage.setItem("explab_token", loginRes.access_token);
        const me = await getMe();
        loginState(loginRes.access_token, me);
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    }
  };

  if (loading) return <div style={{ padding: 40 }}>Loading...</div>;

  return (
    <div style={{ maxWidth: 400, margin: "100px auto", padding: 20, background: "var(--surface)", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
      <h1 style={{ marginBottom: 8, fontSize: "1.5rem" }}>
        {needsSetup ? "Welcome to ExpLab" : "Sign in to ExpLab"}
      </h1>
      <p style={{ marginBottom: 24, color: "var(--muted)" }}>
        {needsSetup ? "Create the initial admin account to get started." : "Enter your credentials to access the platform."}
      </p>

      {error && (
        <div style={{ padding: 12, background: "var(--danger-alpha)", color: "var(--danger)", borderRadius: 4, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={{ display: "block", marginBottom: 4, fontSize: "0.9rem" }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)" }}
          />
        </div>
        <div>
          <label style={{ display: "block", marginBottom: 4, fontSize: "0.9rem" }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)" }}
          />
        </div>
        <button
          type="submit"
          className="button button-primary"
          style={{ padding: 12, fontSize: "1rem", marginTop: 8 }}
        >
          {needsSetup ? "Create Admin Account" : "Sign In"}
        </button>
      </form>
    </div>
  );
}
