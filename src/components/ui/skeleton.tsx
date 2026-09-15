import { cn } from "~/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "border-foreground bg-muted animate-pulse border-2",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
