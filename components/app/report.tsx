"use client";

import Link from "next/link";
import { useState } from "react";

import { BackLink, Shell } from "@/components/app/primitives";
import { REPORT_KINDS, type ReportContext, type ReportKind, type ReportResult } from "@/lib/report";
import { cn } from "@/lib/utils";

const MIN = 8;
const MAX = 2000;

export function ReportScreen({ context }: { context: ReportContext }) {
  const [kind, setKind] = useState<ReportKind>(context.stopId || context.routeId ? "time" : "idea");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ReportResult | null>(null);

  const about = context.routeCode
    ? `Sobre la ruta ${context.routeCode}`
    : context.stopName
      ? `Sobre ${context.stopName}`
      : "Sobre los datos o la app";
  const short = message.trim().length < MIN;

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ kind, message: message.trim(), context }),
      });
      const json = (await res.json()) as { ok: boolean; data?: ReportResult; error?: { message: string } };
      if (json.ok && json.data) setDone(json.data);
      else setError(json.error?.message ?? "No pudimos enviar el reporte.");
    } catch {
      setError("Sin conexión con el servidor.");
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <Shell className="max-w-[720px] py-10">
        <BackLink href="/">Inicio</BackLink>
        <h1 className="mt-6 text-[23px] font-medium tracking-[-0.02em]">Gracias por contarnos</h1>
        <p className="mt-3 max-w-[52ch] text-[13px] leading-relaxed text-quiet">
          Quedó como el reporte <span className="font-mono">#{done.number}</span>. Es público: cualquiera puede ver qué reportaste y qué se hizo.
        </p>
        <p className="mt-4 flex flex-col gap-2 text-[12.5px]">
          <a href={done.url} target="_blank" rel="noreferrer" className="text-accent underline-offset-4 hover:underline">
            Ver el reporte en GitHub
          </a>
          <Link href="/" className="text-quiet underline-offset-4 hover:underline">
            Volver al inicio
          </Link>
        </p>
      </Shell>
    );
  }

  return (
    <Shell className="max-w-[720px] py-10">
      <BackLink href="/">Inicio</BackLink>

      <h1 className="mt-6 text-[23px] font-medium tracking-[-0.02em]">Reportar</h1>
      <p className="mt-2 max-w-[52ch] text-[12.5px] leading-relaxed text-quiet">{about}. Sin cuenta: correos y teléfonos se ocultan antes de publicar.</p>

      <fieldset className="mt-8">
        <legend className="micro">Qué quieres contar</legend>
        <div className="mt-2 space-y-2">
          {(Object.keys(REPORT_KINDS) as ReportKind[]).map((option) => (
            <label key={option} className="flex items-baseline gap-2.5 text-[13px]">
              <input type="radio" name="kind" checked={kind === option} onChange={() => setKind(option)} className="accent-[var(--accent)]" />
              {REPORT_KINDS[option]}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="mt-7 block">
        <span className="micro">Qué pasó</span>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={6}
          maxLength={MAX}
          placeholder={kind === "idea" ? "Una idea para mejorar la app…" : "Cuéntanos con tus palabras qué viste o qué no cuadra…"}
          className="mt-2 w-full resize-y border border-line bg-transparent p-3 text-[13.5px] leading-relaxed outline-none placeholder:text-faint focus:border-foreground"
        />
      </label>

      <div className="mt-1 flex items-baseline justify-between text-[10.5px] text-faint">
        <span>{short ? `Mínimo ${MIN} caracteres` : "Gracias, así se puede revisar"}</span>
        <span className="font-mono tabular-nums">
          {message.length}/{MAX}
        </span>
      </div>

      {error ? (
        <p role="alert" className="mt-5 border-l-2 border-accent pl-3 text-[12.5px] leading-relaxed text-quiet">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={send}
        disabled={short || sending}
        className={cn("mt-6 px-5 py-2.5 text-[13px] font-medium transition-opacity", short || sending ? "bg-surface text-faint" : "bg-ink text-on-ink")}
      >
        {sending ? "Enviando…" : "Enviar reporte"}
      </button>

      <p className="mt-4 max-w-[52ch] text-[10.5px] leading-relaxed text-faint">
        El reporte se publica como un issue en el repositorio del proyecto. No pedimos nombre, correo ni ubicación.
      </p>
    </Shell>
  );
}
