import { RootRedirect } from "@/ui/shell/RootRedirect";

/** `/` sends logged-out visitors to /auth and logged-in users to Personal Finance. */
export default function Home() {
  return <RootRedirect />;
}
