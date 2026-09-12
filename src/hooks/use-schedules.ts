"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/services/api";
import type { InterviewDate } from "@/types";
export function useSchedules() {
  const [dates, setDates] = useState<InterviewDate[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      setDates(await api.schedules());
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, 10000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [refresh]);
  return { dates, setDates, error, loading, refresh };
}
