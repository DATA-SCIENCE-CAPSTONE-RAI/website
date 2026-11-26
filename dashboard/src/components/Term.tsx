"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { entry, SECTIONS, type TermId } from "@/lib/glossary";

type TermProps = {
  id: TermId;
  /** The words to underline. Without them, a small "i" button is shown instead. */
  children?: ReactNode;
  /** A line shown before the standard text (for example the note for this particular result). */
  extra?: string;
  className?: string;
};

const WIDTH = 320;
const GAP = 6;
const MARGIN = 12;

/**
 * Hover text for a term: opens on hover, on keyboard focus and on tap; Escape closes it. The panel is
 * drawn at the top of the page (a portal), so cards that clip their content don't cut it off.
 */
export function Term({ id, children, extra, className = "" }: TermProps) {
  const item = entry(id);
  const panelId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [place, setPlace] = useState<{ top: number; left: number; width: number } | null>(null);

  const cancelClose = () => {
    if (closing.current) clearTimeout(closing.current);
    closing.current = null;
  };
  const show = () => {
    cancelClose();
    setOpen(true);
  };
  const hide = useCallback(() => {
    cancelClose();
    closing.current = setTimeout(() => {
      setOpen(false);
      setPinned(false);
    }, 120);
  }, []);

  const measure = useCallback(() => {
    const box = trigger.current?.getBoundingClientRect();
    if (!box) return;
    const width = Math.min(WIDTH, window.innerWidth - 2 * MARGIN);
    const left = Math.min(Math.max(MARGIN, box.left), window.innerWidth - width - MARGIN);
    const height = panel.current?.offsetHeight ?? 0;
    const below = box.bottom + GAP;
    const top = below + height > window.innerHeight - MARGIN && box.top - GAP - height > MARGIN ? box.top - GAP - height : below;
    setPlace({ top, left, width });
  }, []);

  useLayoutEffect(() => {
    if (open) measure();
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setPinned(false);
      }
    };
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !panel.current?.contains(target)) {
        setOpen(false);
        setPinned(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open, measure]);

  useEffect(() => cancelClose, []);

  const section = SECTIONS.find((s) => s.id === item.more);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={children ? undefined : `About: ${item.term}`}
        aria-describedby={open ? panelId : undefined}
        aria-expanded={open}
        data-term={id}
        onMouseEnter={show}
        onMouseLeave={() => (pinned ? null : hide())}
        onFocus={show}
        onBlur={(event) => {
          if (!panel.current?.contains(event.relatedTarget as Node)) hide();
        }}
        onClick={(event) => {
          // inside a <label>, a click would also tick its checkbox or radio
          event.preventDefault();
          event.stopPropagation();
          cancelClose();
          const close = open && pinned;       // a tap opens it and keeps it open; a second tap closes it
          setOpen(!close);
          setPinned(!close);
        }}
        className={
          children
            ? `cursor-help text-left underline decoration-[#8aa3bb] decoration-dotted decoration-1 underline-offset-[3px] hover:decoration-ink focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0B5CAB] ${className}`
            : `ml-1 inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full border border-[#8aa3bb] align-[-2px] text-[10px] font-semibold leading-none text-muted hover:border-ink hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0B5CAB] ${className}`
        }
      >
        {children ?? "i"}
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panel}
              id={panelId}
              role="tooltip"
              onMouseEnter={show}
              onMouseLeave={() => (pinned ? null : hide())}
              style={{
                position: "fixed",
                top: place?.top ?? -9999,
                left: place?.left ?? -9999,
                width: place?.width ?? WIDTH,
                visibility: place ? "visible" : "hidden",
              }}
              className="z-50 rounded-xl border border-line bg-white p-3 text-left text-sm font-normal normal-case leading-6 tracking-normal text-ink shadow-lg"
            >
              <p className="font-semibold">{item.term}</p>
              {extra ? <p className="mt-1">{extra}</p> : null}
              <p className="mt-1 text-muted">{item.text}</p>
              {item.tbd ? (
                <p className="mt-1 font-medium text-[#b42318]">
                  <span className="mr-1 rounded bg-[#fde8e7] px-1 py-0.5 text-xs">Not decided</span>
                  {item.tbd}
                </p>
              ) : null}
              {section ? (
                <Link
                  href={`/methodology#${section.id}`}
                  className="mt-2 inline-block text-sm font-medium text-[#0B5CAB] underline underline-offset-4"
                  onBlur={hide}
                >
                  Learn more: {section.title}
                </Link>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
