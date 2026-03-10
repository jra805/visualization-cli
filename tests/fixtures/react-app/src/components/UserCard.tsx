import type { User } from "../types";

interface UserCardProps {
  user: User;
  isCurrentUser: boolean;
}

export function UserCard({ user, isCurrentUser }: UserCardProps) {
  return (
    <div className={isCurrentUser ? "card current" : "card"}>
      <h3>{user.name}</h3>
      <p>{user.email}</p>
    </div>
  );
}
