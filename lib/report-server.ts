import "server-only";

import { z } from "zod";

import { REPORT_KINDS, type ReportInput, type ReportResult } from "@/lib/report";

const REPO = process.env.REPORTS_REPO ?? "yanzes/TransmiRuta";
const LABEL = "reporte ciudadano";

const id = z.string().regex(/^[A-Za-z0-9_.-]{1,40}$/);

export const reportInput = z.object({
  kind: z.enum(Object.keys(REPORT_KINDS) as [ReportKind, ...ReportKind[]]),
  message: z.string().trim().min(8).max(2000),
  context: z
    .object({ stopId: id.optional(), stopName: z.string().max(120).optional(), routeId: id.optional(), routeCode: z.string().max(40).optional() })
    .optional(),
});

type ReportKind = keyof typeof REPORT_KINDS;

export class ReportError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Reports are public, so anything that looks like a way to reach a person is removed before it leaves. */
export function scrub(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[correo oculto]")
    .replace(/(\+?57[\s-]?)?(3\d{2}|60\d)[\s-]?\d{3}[\s-]?\d{4}\b/g, "[teléfono oculto]")
    .replace(/\b\d{6,10}\b/g, "[número oculto]");
}

const WINDOW_MS = 60 * 60_000;
const PER_WINDOW = 5;
const recent = new Map<string, number[]>();

/** Five reports an hour per client: enough for a real problem, not enough to flood. */
export function allow(client: string): boolean {
  const now = Date.now();
  const hits = (recent.get(client) ?? []).filter((time) => now - time < WINDOW_MS);
  if (hits.length >= PER_WINDOW) return false;
  recent.set(client, [...hits, now]);
  if (recent.size > 5_000) recent.delete(recent.keys().next().value as string);
  return true;
}

function issueBody(input: ReportInput): string {
  const context = input.context ?? {};
  const rows = [
    ["Tipo", REPORT_KINDS[input.kind]],
    context.stopId && ["Paradero", `${context.stopName ?? ""} \`${context.stopId}\``.trim()],
    context.routeId && ["Ruta", `${context.routeCode ?? ""} \`${context.routeId}\``.trim()],
    ["Origen", "App web, sin cuenta"],
  ].filter(Boolean) as string[][];

  return [
    scrub(input.message)
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n"),
    "",
    "| | |",
    "| --- | --- |",
    ...rows.map(([key, value]) => `| ${key} | ${value} |`),
    "",
    "_Enviado desde TransMiRuta, sin cuenta. Correos y teléfonos se ocultan antes de publicar._",
  ].join("\n");
}

/** Files the report as a GitHub issue, so it is public and someone can answer it. */
export async function fileReport(input: ReportInput): Promise<ReportResult> {
  const token = process.env.GITHUB_REPORTS_TOKEN;
  if (!token) {
    throw new ReportError("reports_unavailable", "Los reportes todavía no están configurados en este despliegue.", 503);
  }

  const first = scrub(input.message).split("\n")[0].slice(0, 70);
  const where = input.context?.routeCode ?? input.context?.stopName;
  const res = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "transmiruta-reports",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ title: `${REPORT_KINDS[input.kind]}${where ? ` · ${where}` : ""}: ${first}`, body: issueBody(input), labels: [LABEL] }),
  });

  if (!res.ok) {
    throw new ReportError("reports_failed", "No pudimos registrar el reporte. Intenta de nuevo en un rato.", 502);
  }
  const issue = (await res.json()) as { number: number; html_url: string };
  return { number: issue.number, url: issue.html_url };
}
