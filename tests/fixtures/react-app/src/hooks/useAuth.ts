import { useState, useEffect } from "react";
import type { User } from "../types";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    // Simulate auth check
    const stored = localStorage.getItem("user");
    if (stored) {
      setUser(JSON.parse(stored));
      setIsLoggedIn(true);
    }
  }, []);

  return { user, isLoggedIn };
}
