"use client";
import { signOut } from "@/lib/auth/auth-client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function LogoutButton() {
  const router = useRouter();
  const handleLogout = async () => {
    await signOut();
    router.push("/login");
    router.refresh();
  };
  return (
    <Button onClick={handleLogout} variant="secondary" size="sm">
      Sign out
    </Button>
  );
}
