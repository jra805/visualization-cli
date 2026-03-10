import { NavBar } from "./NavBar";
import { UserBadge } from "./UserBadge";

interface HeaderProps {
  userName?: string;
  isLoggedIn: boolean;
}

export function Header({ userName, isLoggedIn }: HeaderProps) {
  return (
    <header>
      <NavBar />
      {isLoggedIn && <UserBadge userName={userName} />}
    </header>
  );
}
