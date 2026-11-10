import type { System } from "@/lib/schemas";

/**
 * How each part of the network is named and marked. The dot is the only place
 * a system gets a colour of its own: red for troncal, blue for zonal, green for
 * alimentador, and so on, so a list of routes still reads as one product.
 */
export const SYSTEMS: Record<System, { label: string; dot: string; dark: string }> = {
  troncal: { label: "TransMilenio", dot: "#BE4A3C", dark: "#E4796B" },
  dual: { label: "Dual", dot: "#C2703A", dark: "#E09563" },
  zonal_urbano: { label: "SITP zonal", dot: "#3D63A8", dark: "#7D9FE0" },
  alimentador: { label: "Alimentador", dot: "#4B8A5A", dark: "#7CBE8C" },
  zonal_complementario: { label: "Complementario", dot: "#A98A2C", dark: "#D6B45E" },
  zonal_especial: { label: "Especial", dot: "#7A5EA8", dark: "#AE92DB" },
  transmicable: { label: "TransMiCable", dot: "#2C8880", dark: "#63BDB4" },
  other: { label: "Otro", dot: "#8A8F84", dark: "#A9AFA2" },
};

export function systemColor(system: System, dark: boolean): string {
  return dark ? SYSTEMS[system].dark : SYSTEMS[system].dot;
}

export function systemLabel(system: System): string {
  return SYSTEMS[system].label;
}
