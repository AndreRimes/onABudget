import * as React from "react";

import { cn } from "~/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "border-foreground focus-visible:bg-highlight/25 aria-invalid:border-destructive bg-card file:text-foreground placeholder:text-muted-foreground h-9 w-full min-w-0 border-2 px-2.5 py-1 font-mono text-base transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:font-mono file:text-xs file:font-bold file:uppercase focus-visible:shadow-[3px_3px_0_0_var(--hard)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
