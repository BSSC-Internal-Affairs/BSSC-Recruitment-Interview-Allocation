"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/services/api";
import type { ParticipantAccess } from "@/types";
export function useInvitation() {
  const [token, setToken] = useState(""),
    [access, setAccess] = useState<ParticipantAccess | null>(null),
    [checking, setChecking] = useState(true),
    [error, setError] = useState("");
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    const value =
      new URLSearchParams(window.location.hash.slice(1)).get("invite") || "";
    setToken(value);
    setAccess(null);
    setError("");
    setChecking(!!value);
    if (!value) return;
    try {
      const result = await api.verifyInvitation(value);
      if (request === sequence.current) setAccess(result);
    } catch (e) {
      if (request === sequence.current) setError((e as Error).message);
    } finally {
      if (request === sequence.current) setChecking(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const change = () => void refresh();
    window.addEventListener("hashchange", change);
    return () => {
      sequence.current++;
      window.removeEventListener("hashchange", change);
    };
  }, [refresh]);
  return { token, access, checking, error, refresh };
}
