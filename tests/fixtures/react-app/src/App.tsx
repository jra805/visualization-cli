import { Header } from "./components/Header";
import { UserList } from "./components/UserList";
import { useAuth } from "./hooks/useAuth";

export default function App() {
  const { user, isLoggedIn } = useAuth();

  return (
    <div>
      <Header userName={user?.name} isLoggedIn={isLoggedIn} />
      <UserList currentUserId={user?.id} />
    </div>
  );
}
