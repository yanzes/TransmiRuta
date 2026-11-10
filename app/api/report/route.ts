import { allow, fileReport, ReportError, reportInput } from "@/lib/report-server";

export const dynamic = "force-dynamic";

const fail = (code: string, message: string, status: number) =>
  Response.json({ ok: false, error: { code, message }, traces: [] }, { status });

/** Same-origin only: a report is a form on this site, not an open endpoint. */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("forbidden", "Ese origen no puede enviar reportes.", 403);

  const body = await request.json().catch(() => null);
  const parsed = reportInput.safeParse(body);
  if (!parsed.success) return fail("invalid_report", "Cuéntanos un poco más: entre 8 y 2000 caracteres.", 400);

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  if (!allow(ip)) return fail("rate_limited", "Ya enviaste varios reportes esta hora. Espera un poco.", 429);

  try {
    const issue = await fileReport(parsed.data);
    return Response.json({ ok: true, data: issue, traces: [] });
  } catch (error) {
    if (error instanceof ReportError) return fail(error.code, error.message, error.status);
    return fail("reports_failed", "No pudimos registrar el reporte.", 502);
  }
}
