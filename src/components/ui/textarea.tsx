import * as React from "react";

import { cn } from "~/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-foreground focus-visible:bg-highlight/25 aria-invalid:border-destructive bg-card placeholder:text-muted-foreground flex field-sizing-content min-h-16 w-full border-2 px-2.5 py-2 font-mono text-base transition-[color,box-shadow] outline-none focus-visible:shadow-[3px_3px_0_0_var(--hard)] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
