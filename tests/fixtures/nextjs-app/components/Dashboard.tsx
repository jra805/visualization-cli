import { StatsCard } from "./StatsCard";

export function Dashboard() {
  return (
    <div>
      <h1>Dashboard</h1>
      <StatsCard title="Users" value={42} />
      <StatsCard title="Revenue" value={1337} />
    </div>
  );
}
