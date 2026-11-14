"use client";

import { useEffect, type ReactNode } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { firebaseAuth, registerLeaderboardUser } from "@/lib/firebase";

export function AuthGate({ children }: { children: ReactNode }) {
  useEffect(() => onAuthStateChanged(firebaseAuth, (user) => {
    if (user) {
      // Registration never blocks access; the leaderboard retries on open.
      void registerLeaderboardUser(user).catch(() => {});
    }
  }), []);

  return <>{children}</>;
}
