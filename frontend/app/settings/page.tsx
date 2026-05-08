"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "../../lib/AuthContext";
import { createDataSource, createUser, deleteUser, getUsers, listDataSources, resetUserPassword, syncDataSource, testDataSourceConnection, updateMyPassword, updateUser } from "../../lib/api";
import { ConfirmModal, NoticeModal } from "../../components/modals";
import { DataSourceSummary } from "../../lib/types";

type ModalState =
  | { type: "none" }
  | { type: "confirm-password"; currentPassword: string; newPassword: string }
  | { type: "confirm-delete"; userId: string; email: string }
  | { type: "confirm-reset"; userId: string; email: string; newPassword: string }
  | { type: "notice"; title: string; message: string };

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [dataSources, setDataSources] = useState<DataSourceSummary[]>([]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [canSimulate, setCanSimulate] = useState(false);
  const [canEditMetrics, setCanEditMetrics] = useState(false);
  const [creatingSource, setCreatingSource] = useState(false);
  const [testingSourceConnection, setTestingSourceConnection] = useState(false);
  const [syncingSourceId, setSyncingSourceId] = useState<string | null>(null);
  const [showAddSourceForm, setShowAddSourceForm] = useState(false);
  const [sourceConnectionStatus, setSourceConnectionStatus] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [sourceForm, setSourceForm] = useState({
    name: "",
    source_type: "postgresql" as const,
    host: "",
    port: "5432",
    database_name: "",
    username: "",
    password: "",
    schema_name: "public",
    experiments_table: "experiments",
    metrics_table: "metrics",
    conversion_events_table: "conversion_events",
    dimensions_table: "dimensions",
  });

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

  const loadDataSources = async () => {
    if (user?.role === "admin") {
      try {
        const data = await listDataSources();
        setDataSources(data);
      } catch {}
    }
  };

  useEffect(() => {
    if (user) {
      loadUsers();
      loadDataSources();
    }
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

  const handleCreateSource = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingSource(true);
    setSourceConnectionStatus(null);
    try {
      const response = await createDataSource({
        ...sourceForm,
        port: Number(sourceForm.port),
      });
      setSourceForm({
        name: "",
        source_type: "postgresql",
        host: "",
        port: "5432",
        database_name: "",
        username: "",
        password: "",
        schema_name: "public",
        experiments_table: "experiments",
        metrics_table: "metrics",
        conversion_events_table: "conversion_events",
        dimensions_table: "dimensions",
      });
      await loadDataSources();
      setShowAddSourceForm(false);
      setModal({
        type: "notice",
        title: "Source Saved",
        message: `${response.source.name} is ready. Use Import Data to pull experiments into ExpLab.`,
      });
    } catch (err: any) {
      setModal({ type: "notice", title: "Source Error", message: err.message || "Failed to connect the data source." });
    } finally {
      setCreatingSource(false);
    }
  };

  const handleTestSourceConnection = async () => {
    setTestingSourceConnection(true);
    setSourceConnectionStatus(null);
    try {
      const response = await testDataSourceConnection({
        ...sourceForm,
        port: Number(sourceForm.port),
      });
      setSourceConnectionStatus({ tone: "success", message: response.message });
    } catch (err: any) {
      setSourceConnectionStatus({ tone: "error", message: err.message || "Connection test failed." });
    } finally {
      setTestingSourceConnection(false);
    }
  };

  const handleSyncSource = async (sourceId: string) => {
    setSyncingSourceId(sourceId);
    try {
      const response = await syncDataSource(sourceId);
      await loadDataSources();
      setModal({
        type: "notice",
        title: "Source Synced",
        message: `Refreshed ${response.source.name} with ${response.sync_summary.imported_experiment_count} experiments.`,
      });
    } catch (err: any) {
      setModal({ type: "notice", title: "Sync Error", message: err.message || "Failed to sync the data source." });
    } finally {
      setSyncingSourceId(null);
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

        {user.role === "admin" && (
          <section className="panel" style={{ gridColumn: "1 / -1" }}>
            <div className="panel-header">
              <div>
                <div className="section-tag">Administration</div>
                <h3>Connected Data Sources</h3>
              </div>
              <div className="panel-caption">
                Admins can register Postgres warehouses that follow the ExpLab schema. Imported experiments keep their source tag in the registry.
              </div>
            </div>

            <div style={{ padding: "0 20px 20px", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
                Save a source first, test that credentials can connect, then import the experiment data when you are ready.
              </div>
              <button
                className="button button-primary"
                type="button"
                onClick={() => {
                  setShowAddSourceForm((current) => !current);
                  setSourceConnectionStatus(null);
                }}
                style={{ padding: "8px 16px" }}
              >
                {showAddSourceForm ? "Hide Source Form" : "Add Source"}
              </button>
            </div>

            {showAddSourceForm ? (
              <form onSubmit={handleCreateSource} style={{ padding: "0 20px 20px", display: "grid", gap: 14 }}>
                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
                  <div>
                    <label style={{ display: "block", marginBottom: 4, fontSize: "0.9rem" }}>Source Name</label>
                    <input value={sourceForm.name} onChange={(e) => setSourceForm((current) => ({ ...current, name: e.target.value }))} required style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: 4, fontSize: "0.9rem" }}>Database Type</label>
                    <select value={sourceForm.source_type} disabled style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)" }}>
                      <option value="postgresql">PostgreSQL</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: 4, fontSize: "0.9rem" }}>Host</label>
                    <input value={sourceForm.host} onChange={(e) => setSourceForm((current) => ({ ...current, host: e.target.value }))} required style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: 4, fontSize: "0.9rem" }}>Port</label>
                    <input value={sourceForm.port} onChange={(e) => setSourceForm((current) => ({ ...current, port: e.target.value }))} required inputMode="numeric" style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)" }} />
                  </div>
                </div>

                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
                  <div>
                    <label style={{ display: "block", marginBottom: 4, fontSize: "0.9rem" }}>Database Name</label>
                    <input value={sourceForm.database_name} onChange={(e) => setSourceForm((current) => ({ ...current, database_name: e.target.value }))} required style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: 4, fontSize: "0.9rem" }}>Username</label>
                    <input value={sourceForm.username} onChange={(e) => setSourceForm((current) => ({ ...current, username: e.target.value }))} required style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: 4, fontSize: "0.9rem" }}>Password</label>
                    <input type="password" value={sourceForm.password} onChange={(e) => setSourceForm((current) => ({ ...current, password: e.target.value }))} required style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: 4, fontSize: "0.9rem" }}>Schema</label>
                    <input value={sourceForm.schema_name} onChange={(e) => setSourceForm((current) => ({ ...current, schema_name: e.target.value }))} required style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)" }} />
                  </div>
                </div>

                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
                  <div>
                    <label style={{ display: "block", marginBottom: 4, fontSize: "0.9rem" }}>Experiments Table</label>
                    <input value={sourceForm.experiments_table} onChange={(e) => setSourceForm((current) => ({ ...current, experiments_table: e.target.value }))} required style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: 4, fontSize: "0.9rem" }}>Metrics Table</label>
                    <input value={sourceForm.metrics_table} onChange={(e) => setSourceForm((current) => ({ ...current, metrics_table: e.target.value }))} required style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: 4, fontSize: "0.9rem" }}>Conversion Events Table</label>
                    <input value={sourceForm.conversion_events_table} onChange={(e) => setSourceForm((current) => ({ ...current, conversion_events_table: e.target.value }))} required style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: 4, fontSize: "0.9rem" }}>Dimensions Table</label>
                    <input value={sourceForm.dimensions_table} onChange={(e) => setSourceForm((current) => ({ ...current, dimensions_table: e.target.value }))} required style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)" }} />
                  </div>
                </div>

                {sourceConnectionStatus ? (
                  <div
                    style={{
                      fontSize: "0.9rem",
                      color: sourceConnectionStatus.tone === "success" ? "var(--success, #8ad48a)" : "var(--danger)",
                      padding: "10px 12px",
                      background: sourceConnectionStatus.tone === "success" ? "rgba(76, 175, 80, 0.12)" : "var(--danger-alpha)",
                      borderRadius: 6,
                    }}
                  >
                    {sourceConnectionStatus.message}
                  </div>
                ) : null}

                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
                    Test Connection only verifies that ExpLab can reach the database. Import happens later from the source list.
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button className="button button-secondary" type="button" disabled={testingSourceConnection} onClick={handleTestSourceConnection} style={{ padding: "8px 16px" }}>
                      {testingSourceConnection ? "Testing..." : "Test Connection"}
                    </button>
                    <button className="button button-primary" type="submit" disabled={creatingSource} style={{ padding: "8px 16px" }}>
                      {creatingSource ? "Saving..." : "Save Source"}
                    </button>
                  </div>
                </div>
              </form>
            ) : null}

            <table className="data-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Database</th>
                  <th>Status</th>
                  <th>Imported</th>
                  <th>Last Sync</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {dataSources.map((source) => (
                  <tr key={source.id}>
                    <td>
                      <div style={{ display: "grid", gap: 4 }}>
                        <strong>{source.name}</strong>
                        <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{source.host}:{source.port}/{source.database_name}</span>
                      </div>
                    </td>
                    <td>{source.username}@{source.schema_name}</td>
                    <td>
                      <span className="section-tag">{source.status}</span>
                      {source.last_error ? <div style={{ marginTop: 6, color: "var(--danger)", fontSize: "0.8rem", maxWidth: 320 }}>{source.last_error}</div> : null}
                    </td>
                    <td>{source.imported_experiment_count} exp / {source.imported_user_count} users</td>
                    <td>{source.last_synced_at ? new Date(source.last_synced_at).toLocaleString() : "Never"}</td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        className="button button-secondary"
                        style={{ padding: "4px 8px" }}
                        disabled={syncingSourceId === source.id}
                        onClick={() => handleSyncSource(source.id)}
                      >
                        {syncingSourceId === source.id ? "Importing..." : "Import Data"}
                      </button>
                    </td>
                  </tr>
                ))}
                {dataSources.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: "center", padding: 20 }}>No external sources configured yet.</td></tr>
                )}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </div>
  );
}
