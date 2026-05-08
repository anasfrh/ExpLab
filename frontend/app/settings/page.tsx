"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "../../lib/AuthContext";
import { getUsers, createUser, updateUser, resetUserPassword, deleteUser, updateMyPassword } from "../../lib/api";
import { ConfirmModal, NoticeModal } from "../../components/modals";

type ModalState =
  | { type: "none" }
  | { type: "confirm-password"; currentPassword: string; newPassword: string }
  | { type: "confirm-delete"; userId: string; email: string }
  | { type: "confirm-reset"; userId: string; email: string; newPassword: string }
  | { type: "notice"; title: string; message: string };

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const [users, setUsers] = useState<any[]>([]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [canSimulate, setCanSimulate] = useState(false);
  const [canEditMetrics, setCanEditMetrics] = useState(false);

  const [myCurrentPassword, setMyCurrentPassword] = useState("");
  const [myNewPassword, setMyNewPassword] = useState("");
  const [myConfirmPassword, setMyConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [resetTarget, setResetTarget] = useState<{ id: string; email: string } | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState("");

  const [modal, setModal] = useState<ModalState>({ type: "none" });

  const loadUsers = async () => {
    if (user?.role === "admin") {
      try {
        const data = await getUsers();
        setUsers(data);
      } catch {}
    }
  };

  useEffect(() => {
    if (user) loadUsers();
  }, [user]);

  // ── My password ──────────────────────────────────────────
  const handleUpdateMyPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    if (myNewPassword !== myConfirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }
    if (myNewPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      return;
    }
    setModal({ type: "confirm-password", currentPassword: myCurrentPassword, newPassword: myNewPassword });
  };

  const confirmUpdateMyPassword = async (currentPassword: string, newPassword: string) => {
    setModal({ type: "none" });
    try {
      await updateMyPassword({ current_password: currentPassword, new_password: newPassword });
      setMyCurrentPassword("");
      setMyNewPassword("");
      setMyConfirmPassword("");
      setModal({ type: "notice", title: "Password Updated", message: "Your password has been changed successfully." });
    } catch (err: any) {
      // Parse detail from JSON error body
      let msg = "Failed to update your password.";
      try { msg = JSON.parse(err.message).detail ?? msg; } catch { msg = err.message || msg; }
      setModal({ type: "notice", title: "Error", message: msg });
    }
  };

  // ── Admin: add user ───────────────────────────────────────
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createUser({ email, password, role, can_simulate: canSimulate, can_edit_metrics: canEditMetrics });
      setEmail(""); setPassword(""); setRole("user"); setCanSimulate(false); setCanEditMetrics(false);
      loadUsers();
      setModal({ type: "notice", title: "User Created", message: `Account for ${email} has been created.` });
    } catch (err: any) {
      setModal({ type: "notice", title: "Error", message: err.message || "Failed to create user." });
    }
  };

  // ── Admin: toggle permissions ─────────────────────────────
  const handleToggleSimulate = async (u: any) => {
    try { await updateUser(u.id, { role: u.role, can_simulate: !u.can_simulate, can_edit_metrics: u.can_edit_metrics }); loadUsers(); } catch {}
  };

  const handleToggleEdit = async (u: any) => {
    try { await updateUser(u.id, { role: u.role, can_simulate: u.can_simulate, can_edit_metrics: !u.can_edit_metrics }); loadUsers(); } catch {}
  };

  // ── Admin: delete user ────────────────────────────────────
  const handleDelete = (u: any) => {
    setModal({ type: "confirm-delete", userId: u.id, email: u.email });
  };

  const confirmDelete = async (userId: string) => {
    setModal({ type: "none" });
    try {
      await deleteUser(userId);
      loadUsers();
      setModal({ type: "notice", title: "User Deleted", message: "The user account has been removed." });
    } catch {
      setModal({ type: "notice", title: "Error", message: "Failed to delete user." });
    }
  };

  // ── Admin: reset user password ────────────────────────────
  const handleResetPassword = (u: any) => {
    setResetTarget(u);
    setResetNewPassword("");
  };

  const submitResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setModal({ type: "confirm-reset", userId: resetTarget.id, email: resetTarget.email, newPassword: resetNewPassword });
  };

  const confirmResetPassword = async (userId: string, newPassword: string) => {
    setModal({ type: "none" });
    try {
      await resetUserPassword(userId, { new_password: newPassword });
      setResetTarget(null);
      setResetNewPassword("");
      setModal({ type: "notice", title: "Password Reset", message: "The user's password has been reset successfully." });
    } catch {
      setModal({ type: "notice", title: "Error", message: "Failed to reset the password." });
    }
  };

  if (!user) return null;

  return (
    <div className="console">
      {/* ── Modals ─────────────────────────────────────────── */}
      {modal.type === "confirm-password" && (
        <ConfirmModal
          title="Change Password"
          message="Are you sure you want to update your password? You will stay logged in."
          confirmLabel="Update Password"
          onConfirm={() => confirmUpdateMyPassword(modal.currentPassword, modal.newPassword)}
          onCancel={() => setModal({ type: "none" })}
        />
      )}
      {modal.type === "confirm-delete" && (
        <ConfirmModal
          title="Delete User"
          message={<>Are you sure you want to permanently delete <strong>{modal.email}</strong>? This action cannot be undone.</>}
          confirmLabel="Delete User"
          danger
          onConfirm={() => confirmDelete(modal.userId)}
          onCancel={() => setModal({ type: "none" })}
        />
      )}
      {modal.type === "confirm-reset" && (
        <ConfirmModal
          title="Reset Password"
          message={<>Reset the password for <strong>{modal.email}</strong>? They will need to use the new password immediately.</>}
          confirmLabel="Reset Password"
          onConfirm={() => confirmResetPassword(modal.userId, modal.newPassword)}
          onCancel={() => setModal({ type: "none" })}
        />
      )}
      {modal.type === "notice" && (
        <NoticeModal
          title={modal.title}
          message={modal.message}
          onClose={() => setModal({ type: "none" })}
        />
      )}

      <header className="topbar">
        <div>
          <div className="topbar-kicker">Settings</div>
          <h1 className="topbar-title">Account Settings</h1>
          <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{user.email}</span>
            <span className="section-tag" style={{ color: "var(--cyan)", borderColor: "var(--cyan)" }}>{user.role}</span>
          </div>
        </div>
      </header>

      <div className="panel-grid">
        {/* ── Change My Password ──────────────────────────── */}
        <section className="panel">
          <div className="panel-header">
            <div>
              <div className="section-tag">Security</div>
              <h3>Change My Password</h3>
            </div>
          </div>
          <form onSubmit={handleUpdateMyPassword} style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: "14px", maxWidth: 420 }}>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: "0.9rem" }}>Current Password</label>
              <input
                type="password"
                value={myCurrentPassword}
                onChange={(e) => { setMyCurrentPassword(e.target.value); setPasswordError(""); }}
                required
                style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)" }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: "0.9rem" }}>New Password</label>
              <input
                type="password"
                value={myNewPassword}
                onChange={(e) => { setMyNewPassword(e.target.value); setPasswordError(""); }}
                required
                minLength={6}
                style={{ width: "100%", padding: 8, borderRadius: 4, border: `1px solid ${passwordError ? "var(--danger)" : "var(--border)"}`, background: "var(--bg)" }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: "0.9rem" }}>Confirm New Password</label>
              <input
                type="password"
                value={myConfirmPassword}
                onChange={(e) => { setMyConfirmPassword(e.target.value); setPasswordError(""); }}
                required
                minLength={6}
                style={{ width: "100%", padding: 8, borderRadius: 4, border: `1px solid ${passwordError ? "var(--danger)" : "var(--border)"}`, background: "var(--bg)" }}
              />
            </div>
            {passwordError && (
              <div style={{ fontSize: "0.85rem", color: "var(--danger)", padding: "8px 10px", background: "var(--danger-alpha)", borderRadius: 4 }}>
                {passwordError}
              </div>
            )}
            <div>
              <button className="button button-primary" type="submit" style={{ padding: "8px 20px" }}>Update Password</button>
            </div>
          </form>
        </section>


        {/* ── Admin: User Accounts ────────────────────────── */}
        {user.role === "admin" && (
          <section className="panel" style={{ gridColumn: "1 / -1" }}>
            <div className="panel-header">
              <div>
                <div className="section-tag">Administration</div>
                <h3>User Accounts</h3>
              </div>
            </div>

            <form onSubmit={handleAddUser} style={{ padding: "0 20px 20px", display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ flex: 2, minWidth: 200 }}>
                <label style={{ display: "block", marginBottom: 4, fontSize: "0.9rem" }}>Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)" }} />
              </div>
              <div style={{ flex: 2, minWidth: 200 }}>
                <label style={{ display: "block", marginBottom: 4, fontSize: "0.9rem" }}>Initial Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)" }} />
              </div>
              <div style={{ flex: 1, minWidth: 100 }}>
                <label style={{ display: "block", marginBottom: 4, fontSize: "0.9rem" }}>Role</label>
                <select value={role} onChange={(e) => setRole(e.target.value)} style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)" }}>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, paddingBottom: 8 }}>
                <input type="checkbox" checked={canSimulate} onChange={(e) => setCanSimulate(e.target.checked)} />
                <label style={{ fontSize: "0.9rem" }}>Simulate</label>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, paddingBottom: 8 }}>
                <input type="checkbox" checked={canEditMetrics} onChange={(e) => setCanEditMetrics(e.target.checked)} />
                <label style={{ fontSize: "0.9rem" }}>Edit Metrics</label>
              </div>
              <button className="button button-primary" type="submit" style={{ padding: "8px 16px" }}>Add User</button>
            </form>

            {/* Reset Password Inline Form */}
            {resetTarget && (
              <form onSubmit={submitResetPassword} style={{ padding: "0 20px 16px", display: "flex", gap: "10px", alignItems: "flex-end", background: "var(--surface-2)", borderRadius: 6, margin: "0 20px 16px" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", marginBottom: 4, fontSize: "0.9rem" }}>New password for <strong>{resetTarget.email}</strong></label>
                  <input type="password" value={resetNewPassword} onChange={(e) => setResetNewPassword(e.target.value)} required minLength={6} style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)" }} />
                </div>
                <button className="button button-primary" type="submit" style={{ padding: "8px 16px" }}>Confirm Reset</button>
                <button className="button button-secondary" type="button" onClick={() => setResetTarget(null)} style={{ padding: "8px 16px" }}>Cancel</button>
              </form>
            )}

            <table className="data-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Simulate</th>
                  <th>Edit Metrics</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td><span className="section-tag">{u.role}</span></td>
                    <td><input type="checkbox" checked={u.can_simulate} onChange={() => handleToggleSimulate(u)} disabled={u.role === "admin"} /></td>
                    <td><input type="checkbox" checked={u.can_edit_metrics} onChange={() => handleToggleEdit(u)} disabled={u.role === "admin"} /></td>
                    <td style={{ textAlign: "right" }}>
                      <button className="button" style={{ marginRight: 8, padding: "4px 8px" }} onClick={() => handleResetPassword(u)}>Reset Pass</button>
                      <button className="button button-danger" style={{ padding: "4px 8px" }} onClick={() => handleDelete(u)} disabled={u.id === user.id}>Delete</button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: "center", padding: 20 }}>No users found</td></tr>
                )}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </div>
  );
}
