"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";

const noopSubscribe = () => () => {};

/**
 * Renders its children inside a `.print-root` element directly under <body>. The
 * print stylesheet in globals.css prints only that element while it exists, so the
 * app shell never ends up on paper. Mount at most one per page.
 */
export function PrintPortal({ children }: { children: React.ReactNode }) {
  // true on the client, false during SSR — portals need `document`
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  return isClient ? createPortal(<div className="print-root">{children}</div>, document.body) : null;
}

/** Opens the browser's print dialog, where "Save as PDF" is one of the destinations. */
export function printDocument(fileName: string) {
  const previousTitle = document.title;
  // Browsers use the page title as the default PDF file name.
  document.title = fileName;
  const restore = () => {
    document.title = previousTitle;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  window.print();
}

export function DocumentPreviewDialog({
  open,
  onClose,
  title,
  fileName,
  children,
  portal = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  fileName: string;
  children: React.ReactNode;
  /** false when the page already keeps its own PrintPortal mounted */
  portal?: boolean;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  // Callers pass inline closures; keep the latest without re-running the open effect
  // (which would re-steal focus on every parent render).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-8" onMouseDown={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="w-full max-w-4xl overflow-hidden rounded-2xl bg-card shadow-soft"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
            <div>
              <h2 id={titleId} className="font-heading text-sm font-semibold text-foreground">
                {title}
              </h2>
              <p className="text-[11px] text-muted-foreground">To get a PDF, choose “Save as PDF” as the printer.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" className="rounded-full" onClick={() => printDocument(fileName)}>
                Print / Save as PDF
              </Button>
              <Button ref={closeRef} type="button" variant="outline" className="rounded-full" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
          <div className="bg-muted/60 p-3 sm:p-6">
            <div className="overflow-hidden rounded-lg shadow-soft-sm ring-1 ring-black/5">{children}</div>
          </div>
        </div>
      </div>
      {portal && <PrintPortal>{children}</PrintPortal>}
    </>
  );
}

/** Preview + Print buttons for a saved document; Cmd/Ctrl+P on the page prints the document too. */
export function DocumentPrintActions({
  title,
  fileName,
  children,
}: {
  title: string;
  fileName: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" className="rounded-full" onClick={() => setOpen(true)}>
        Preview
      </Button>
      <Button type="button" variant="outline" className="rounded-full" onClick={() => printDocument(fileName)}>
        Print / PDF
      </Button>
      <PrintPortal>{children}</PrintPortal>
      <DocumentPreviewDialog open={open} onClose={() => setOpen(false)} title={title} fileName={fileName} portal={false}>
        {children}
      </DocumentPreviewDialog>
    </div>
  );
}
