"use client";
import { useEffect, useState } from "react";

export function usePolling<T>(fetcher: () => Promise<T>, intervalMs = 2000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const v = await fetcher();
        if (!stop) setData(v);
      } catch (e) {
        if (!stop) setError(e as Error);
      } finally {
        if (!stop) setTimeout(tick, intervalMs);
      }
    };
    tick();
    return () => {
      stop = true;
    };
  }, [fetcher, intervalMs]);

  return { data, error };
}
