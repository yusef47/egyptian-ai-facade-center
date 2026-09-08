"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getQattanCopy, getQattanDirection, type QattanCopy, type QattanDirection, type QattanLocale } from "./qattan-content";

export type QattanContextValue = {
  locale: QattanLocale;
  direction: QattanDirection;
  copy: QattanCopy;
  setLocale: (locale: QattanLocale) => void;
};

const QattanContext = createContext<QattanContextValue | null>(null);

export function QattanProviders({
  locale: initialLocale,
  children,
}: {
  locale: QattanLocale;
  children: ReactNode;
}) {
  const [locale, setLocale] = useState<QattanLocale>(initialLocale);
  const value = useMemo<QattanContextValue>(() => ({
    locale,
    direction: getQattanDirection(locale),
    copy: getQattanCopy(locale),
    setLocale,
  }), [locale]);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    root.dir = value.direction;
    root.dataset.qattanLocale = locale;
    try {
      window.localStorage.setItem("qattan-locale", locale);
    } catch {
      // Storage is optional; the current route remains the source of truth.
    }
  }, [locale, value.direction]);

  return <QattanContext.Provider value={value}>{children}</QattanContext.Provider>;
}

export function useQattan(): QattanContextValue {
  const context = useContext(QattanContext);
  if (!context) {
    throw new Error("useQattan must be used inside QattanProviders");
  }
  return context;
}

export function qattanLocaleHref(locale: QattanLocale, href = "/"): string {
  if (href.startsWith("http") || href.startsWith("#")) return href;
  if (href === "/studio" || href.startsWith("/studio?")) return href;
  const path = href === "/" ? "" : href.replace(/^\//, "");
  return `/${locale}${path ? `/${path}` : ""}`;
}
