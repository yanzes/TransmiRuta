"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { since } from "@/lib/format";
import type { FeedState } from "@/lib/types";
import { useNow } from "@/lib/use-live";
import { cn } from "@/lib/utils";

/** Light or dark, after mount, so the first paint never guesses wrong. */
export function useDark(): boolean {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return !mounted || resolvedTheme !== "light";
}

/** The measure every page shares: generous margins, one column on phones. */
export function Shell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1120px] px-5 sm:px-8", className)}>{children}</div>;
}

const LINKS = [
  { href: "/", label: "Mapa" },
  { href: "/buscar", label: "Buscar" },
  { href: "/guardados", label: "Guardados" },
  { href: "/acerca", label: "Acerca" },
];

/** A text masthead instead of an app tab bar: the page is a document, not a phone. */
export function TopBar() {
  const path = usePathname();
  return (
    <header className="border-b border-line">
      <Shell className="flex h-14 items-center justify-between gap-4">
        <Link href="/" className="text-[14.5px] font-semibold tracking-[-0.01em]">
          TransMiRuta
        </Link>
        <nav aria-label="Secciones" className="flex items-center gap-4 text-[12px] sm:gap-6 sm:text-[13px]">
          {LINKS.map((link) => {
            const active = link.href === "/" ? path === "/" : path.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "transition-colors",
                  active ? "text-foreground underline decoration-line underline-offset-[6px]" : "text-faint hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </Shell>
    </header>
  );
}

/** Where every time on the page comes from, as one quiet line. */
export function FeedLine({ feed, className }: { feed: FeedState | undefined; className?: string }) {
  const now = useNow();
  if (!feed) return null;
  return (
    <p className={cn("flex items-center gap-2 text-[11px] text-faint", className)}>
      <span className={cn("size-1 rounded-full", feed.live ? "bg-accent" : "bg-faint")} />
      <span>{feed.live ? "en vivo" : "sin datos en vivo"}</span>
      <span aria-hidden>·</span>
      <span className="tabular-nums">{since(feed.asOf, now)}</span>
    </p>
  );
}

export function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("micro", className)}>{children}</p>;
}

/** Route codes are type, not badges: mono, small, always the same width per character. */
export function RouteCode({ code, strong = false, className }: { code: string; strong?: boolean; className?: string }) {
  return <span className={cn("font-mono text-[12px] tabular-nums", strong ? "text-foreground" : "text-quiet", className)}>{code}</span>;
}

export function Rule({ className }: { className?: string }) {
  return <hr className={cn("border-line", className)} />;
}

export function Bone({ className }: { className?: string }) {
  return <span className={cn("block animate-pulse bg-surface", className)} />;
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: { label: string; href: string } }) {
  return (
    <div className="border-t border-line py-6">
      <p className="text-[14px]">{title}</p>
      {body ? <p className="mt-1 max-w-[52ch] text-[12.5px] leading-relaxed text-quiet">{body}</p> : null}
      {action ? (
        <Link href={action.href} className="mt-2 inline-block text-[12px] text-accent underline-offset-4 hover:underline">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

/** A quiet text action; the accent only marks the one that matters. */
export function TextButton({
  children,
  onClick,
  accent = false,
  className,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  accent?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={cn(
        "text-[12px] underline-offset-4 transition-colors hover:underline",
        accent ? "text-accent" : "text-quiet hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function BackLink({ href, children = "Volver" }: { href: string; children?: React.ReactNode }) {
  return (
    <Link href={href} className="text-[12px] text-faint underline-offset-4 transition-colors hover:text-foreground hover:underline">
      ← {children}
    </Link>
  );
}
