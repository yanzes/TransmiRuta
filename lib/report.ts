/** What a rider can tell us, in their words. */
export const REPORT_KINDS = {
  time: "Una hora está mal",
  missing: "Falta una ruta o un paradero",
  stop: "Un paradero está mal ubicado",
  idea: "Una idea",
  other: "Otra cosa",
} as const;

export type ReportKind = keyof typeof REPORT_KINDS;

export interface ReportContext {
  stopId?: string;
  stopName?: string;
  routeId?: string;
  routeCode?: string;
}

export interface ReportInput {
  kind: ReportKind;
  message: string;
  context?: ReportContext;
}

export interface ReportResult {
  number: number;
  url: string;
}
