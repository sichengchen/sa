import { X } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "../../lib/utils.js";
import { composeBaseClassName } from "./base-class-name.js";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./dialog.js";

type SheetContentProps = ComponentProps<typeof DialogContent> & {
  side?: "bottom" | "left" | "right" | "top";
};

function Sheet(props: ComponentProps<typeof Dialog>) {
  return <Dialog data-slot="sheet" {...props} />;
}

function SheetTrigger(props: ComponentProps<typeof DialogTrigger>) {
  return <DialogTrigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose(props: ComponentProps<typeof DialogClose>) {
  return <DialogClose data-slot="sheet-close" {...props} />;
}

function SheetContent({
  children,
  className,
  overlayClassName,
  side = "right",
  showCloseButton = true,
  ...props
}: SheetContentProps) {
  return (
    <DialogContent
      data-side={side}
      data-slot="sheet-content"
      className={composeBaseClassName("desktop-ui-sheet-content", className)}
      overlayClassName={composeBaseClassName("desktop-ui-sheet-overlay", overlayClassName)}
      showCloseButton={false}
      {...props}
    >
      {children}
      {showCloseButton ? (
        <SheetClose className="desktop-ui-sheet-close" aria-label="Close sheet">
          <X aria-hidden="true" />
        </SheetClose>
      ) : null}
    </DialogContent>
  );
}

function SheetHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div data-slot="sheet-header" className={cn("desktop-ui-sheet-header", className)} {...props} />
  );
}

function SheetFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div data-slot="sheet-footer" className={cn("desktop-ui-sheet-footer", className)} {...props} />
  );
}

function SheetTitle(props: ComponentProps<typeof DialogTitle>) {
  return <DialogTitle data-slot="sheet-title" {...props} />;
}

function SheetDescription(props: ComponentProps<typeof DialogDescription>) {
  return <DialogDescription data-slot="sheet-description" {...props} />;
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
};
