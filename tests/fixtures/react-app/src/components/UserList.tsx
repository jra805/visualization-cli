import { useState, useEffect } from "react";
import { UserCard } from "./UserCard";
import { fetchUsers } from "../utils/api";
import type { User } from "../types";

interface UserListProps {
  currentUserId?: string;
}

export function UserList({ currentUserId }: UserListProps) {
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    fetchUsers().then(setUsers);
  }, []);

  return (
    <div>
      {users.map((user) => (
        <UserCard
          key={user.id}
          user={user}
          isCurrentUser={user.id === currentUserId}
        />
      ))}
    </div>
  );
}
