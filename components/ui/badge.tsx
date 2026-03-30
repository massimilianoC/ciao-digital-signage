import * as React from "react";

import { cn } from "@/lib/utils";

type Variant = "default" | "outline" | "secondary";

const variantClasses: Record<Variant, string> = {
  default: "bg-foreground text-background",
  outline: "border border-border bg-transparent text-foreground",
  secondary: "bg-muted text-foreground",
};

type BadgeProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: Variant;
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
