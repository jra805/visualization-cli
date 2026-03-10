import { Sidebar } from "../components/Sidebar";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <Sidebar />
        <main>{children}</main>
      </body>
    </html>
  );
}
