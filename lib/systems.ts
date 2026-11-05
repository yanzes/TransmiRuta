import type { System } from "@/lib/schemas";

/** How the map and the legend name and paint each part of the network. */
export const SYSTEM_STYLE: Record<System, { label: string; dark: string; light: string; order: number }> = {
  troncal: { label: "Troncal", dark: "#8b95f5", light: "#5967e8", order: 0 },
  dual: { label: "Dual", dark: "#c3c8ff", light: "#3a45b8", order: 1 },
  zonal_urbano: { label: "Zonal", dark: "#f2f2f2", light: "#171717", order: 2 },
  alimentador: { label: "Alimentador", dark: "#8f8f8f", light: "#6b6b6b", order: 3 },
  zonal_complementario: { label: "Complementario", dark: "#a9a9a9", light: "#8a8a8a", order: 4 },
  zonal_especial: { label: "Especial", dark: "#a9a9a9", light: "#8a8a8a", order: 5 },
  transmicable: { label: "TransMiCable", dark: "#5fd39b", light: "#1f9d63", order: 6 },
  other: { label: "Otros", dark: "#6b6b6b", light: "#a3a3a3", order: 7 },
};

export function systemColor(system: System, dark: boolean): string {
  return dark ? SYSTEM_STYLE[system].dark : SYSTEM_STYLE[system].light;
}
