"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

/**
 * El juego sigue cambiando mientras la pantalla está abierta: este hook calcula la antigüedad de los datos
 * («hace 40 s»), ofrece `reload` y los vuelve a leer solo al volver a esta pestaña si pasaron más de 15 s.
 */
export function useFreshness(generatedAt: string) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();

  const [now, setNow] = useState(() => Date.parse(generatedAt));
  const generatedAtRef = useRef(Date.parse(generatedAt));
  useEffect(() => {
    generatedAtRef.current = Date.parse(generatedAt);
  }, [generatedAt]);
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(tick);
  }, []);

  const reload = useCallback(() => startRefresh(() => router.refresh()), [router]);
  useEffect(() => {
    const onBack = () => {
      if (document.visibilityState === "visible" && Date.now() - generatedAtRef.current > 15_000) reload();
    };
    window.addEventListener("focus", onBack);
    document.addEventListener("visibilitychange", onBack);
    return () => {
      window.removeEventListener("focus", onBack);
      document.removeEventListener("visibilitychange", onBack);
    };
  }, [reload]);

  const seconds = Math.max(0, Math.round((now - Date.parse(generatedAt)) / 1000));
  const age = seconds < 60 ? (seconds < 5 ? "ahora mismo" : `hace ${seconds} s`) : `hace ${Math.round(seconds / 60)} min`;
  return { age, reload, refreshing };
}
