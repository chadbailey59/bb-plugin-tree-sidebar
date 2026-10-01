import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "bb-plugin-tree-sidebar:collapsed";

function readStored(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    // A corrupt or unavailable store is not worth a broken sidebar; the tree
    // opens fully expanded instead.
    return [];
  }
}

/**
 * Which nodes are folded shut, remembered per client.
 *
 * Collapsed rather than expanded is what gets stored, so a project added while
 * bb is closed shows up open — the tree's default is to show you everything,
 * and folding is the deliberate act.
 */
export function useCollapsed(): {
  isCollapsed: (key: string) => boolean;
  toggle: (key: string) => void;
  reveal: (keys: readonly string[]) => void;
} {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(readStored()),
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsed]));
    } catch {
      // Persistence is a convenience; losing it must not break the session.
    }
  }, [collapsed]);

  const toggle = useCallback((key: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }, []);

  const reveal = useCallback((keys: readonly string[]) => {
    setCollapsed((current) => {
      if (!keys.some((key) => current.has(key))) return current;
      const next = new Set(current);
      for (const key of keys) next.delete(key);
      return next;
    });
  }, []);

  const isCollapsed = useCallback(
    (key: string) => collapsed.has(key),
    [collapsed],
  );

  return useMemo(
    () => ({ isCollapsed, toggle, reveal }),
    [isCollapsed, reveal, toggle],
  );
}
