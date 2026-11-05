import Image from "next/image";

import { ThemeToggle } from "@/components/theme-toggle";

export const REPO_URL = "https://github.com/croma-labs/transmilenio-live";
export const DOCS_URL = "https://docs.usecroma.com/guides/colombia/transmilenio";

// Ruled header: full-height cells separated by hairlines, part of the page
// grid rather than a floating bar.
export function SiteHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="relative z-30 border-b border-line bg-background">
      <div className="flex h-14 w-full items-stretch justify-between">
        <a className="flex items-center gap-3 border-r border-line px-5 transition-colors hover:bg-secondary/40" href="https://usecroma.com" rel="noopener noreferrer" target="_blank">
          <Image alt="Croma" className="h-4.5 w-auto dark:invert" height={24} priority src="/croma_brand_black.svg" width={150} />
          <span className="eyebrow-sm mt-0.5 hidden sm:block">TransMilenio&nbsp;en&nbsp;vivo</span>
        </a>
        <div className="flex items-stretch">
          {children}
          <a
            aria-label="Código en GitHub"
            className="flex items-center border-l border-line px-3.5 text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground"
            href={REPO_URL}
            rel="noopener noreferrer"
            target="_blank"
          >
            <svg aria-hidden className="size-4 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
            </svg>
          </a>
          <a
            className="hidden items-center border-l border-line px-4 font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase transition-colors hover:bg-secondary/40 hover:text-foreground md:flex"
            href={DOCS_URL}
            rel="noopener noreferrer"
            target="_blank"
          >
            Docs
          </a>
          <a
            className="flex items-center border-l border-line bg-foreground px-4 font-mono text-[10px] tracking-[0.18em] text-background uppercase transition-colors hover:bg-foreground/85"
            href="https://platform.usecroma.com/sign-up"
            rel="noopener noreferrer"
            target="_blank"
          >
            API&nbsp;key
          </a>
          <div className="flex items-center border-l border-line px-2">
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
