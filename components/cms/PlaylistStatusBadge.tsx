import { Badge } from "@/components/ui/badge";

interface PlaylistStatusBadgeProps {
  status: "active" | "suspended";
}

export function PlaylistStatusBadge({ status }: PlaylistStatusBadgeProps) {
  if (status === "suspended") {
    return (
      <Badge variant="secondary" className="bg-amber-100 text-amber-900">
        Suspended
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className="bg-emerald-100 text-emerald-900">
      Active
    </Badge>
  );
}