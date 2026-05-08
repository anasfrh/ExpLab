
"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { getMe } from "./api";
import { useRouter, usePathname } from "next/navigation";

export type User = {
  id: string;
  email: string;
  role: string;
  can_simulate: boolean;
  can_edit_metrics: boolean;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  loginState: (token: string, userData: User) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const token = localStorage.getItem("explab_token");
    if (token) {
      getMe()
        .then((u) => setUser(u))
        .catch(() => {
          localStorage.removeItem("explab_token");
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && !user && pathname !== "/login") {
      router.push("/login");
    }
  }, [user, loading, pathname, router]);

  const loginState = (token: string, userData: User) => {
    localStorage.setItem("explab_token", token);
    setUser(userData);
    router.push("/");
  };

  const logout = () => {
    localStorage.removeItem("explab_token");
    setUser(null);
    router.push("/login");
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginState, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
