import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "../../lib/utils.js";
import { composeBaseClassName } from "./base-class-name.js";

type DialogContentProps = DialogPrimitive.Popup.Props & {
  overlayClassName?: DialogPrimitive.Backdrop.Props["className"];
  portalProps?: DialogPrimitive.Portal.Props;
  showCloseButton?: boolean;
};

function Dialog(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger(props: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal(props: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose(props: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={composeBaseClassName("desktop-ui-dialog-overlay", className)}
      {...props}
    />
  );
}

function DialogContent({
  children,
  className,
  overlayClassName,
  portalProps,
  showCloseButton = true,
  ...props
}: DialogContentProps) {
  return (
    <DialogPortal {...portalProps}>
      <DialogOverlay className={overlayClassName} />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={composeBaseClassName("desktop-ui-dialog-content", className)}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <DialogClose className="desktop-ui-dialog-close" aria-label="Close dialog">
            <X aria-hidden="true" />
          </DialogClose>
        ) : null}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("desktop-ui-dialog-header", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("desktop-ui-dialog-footer", className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={composeBaseClassName("desktop-ui-dialog-title", className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={composeBaseClassName("desktop-ui-dialog-description", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
