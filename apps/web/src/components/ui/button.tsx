// Adapted from T3 Code (MIT, (c) 2026 T3 Tools Inc.), trimmed to the
// variants Balcony uses. A shadcn button on Base UI's useRender.
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "focus-visible:ring-ring focus-visible:ring-offset-background relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[var(--control-radius)] border text-base font-medium whitespace-nowrap transition-[box-shadow,scale] outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-64 sm:text-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&:active]:scale-[0.97]",
  {
    defaultVariants: { size: "default", variant: "default" },
    variants: {
      size: {
        default: "h-9 px-[calc(--spacing(3)-1px)] sm:h-8",
        icon: "size-9 sm:size-8",
        lg: "h-10 px-[calc(--spacing(3.5)-1px)] sm:h-9",
      },
      variant: {
        default:
          "border-primary bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs",
        ghost: "text-foreground hover:bg-accent border-transparent",
        outline:
          "border-input bg-card text-foreground hover:bg-accent/50 shadow-xs/5",
      },
    },
  }
);

interface ButtonProps
  extends
    useRender.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {}

export const Button = ({
  className,
  variant,
  size,
  render,
  ...props
}: ButtonProps) => {
  const defaultProps = {
    className: cn(buttonVariants({ className, size, variant })),
    "data-slot": "button",
    type: render === undefined ? ("button" as const) : undefined,
  };

  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(defaultProps, props),
    render,
  });
};
