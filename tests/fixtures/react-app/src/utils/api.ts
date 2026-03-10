import type { User } from "../types";

export async function fetchUsers(): Promise<User[]> {
  const response = await fetch("/api/users");
  return response.json();
}

export async function fetchUser(id: string): Promise<User> {
  const response = await fetch(`/api/users/${id}`);
  return response.json();
}
