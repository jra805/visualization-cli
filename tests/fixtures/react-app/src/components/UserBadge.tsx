interface UserBadgeProps {
  userName?: string;
}

export function UserBadge({ userName }: UserBadgeProps) {
  return <span className="badge">{userName ?? "Guest"}</span>;
}
