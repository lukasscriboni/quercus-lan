"use client";

import { useEffect } from "react";

export function CanonicalLocalHost() {
  useEffect(() => {
    if (window.location.hostname !== "localhost") return;
    const canonical = new URL(window.location.href);
    canonical.hostname = "127.0.0.1";
    window.location.replace(canonical.toString());
  }, []);
  return null;
}
