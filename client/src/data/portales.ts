/**
 * Puntos de referencia de la troncal, para orientarse cuando el mapa abre.
 * Coordenadas aproximadas (centro del portal); no son paraderos oficiales.
 */
export interface Portal {
  name: string;
  lat: number;
  lon: number;
}

export const PORTALES: Portal[] = [
  { name: "Portal Norte", lat: 4.7536, lon: -74.0456 },
  { name: "Portal Suba", lat: 4.7476, lon: -74.091 },
  { name: "Portal de la 80", lat: 4.699, lon: -74.0906 },
  { name: "Portal El Dorado", lat: 4.7003, lon: -74.145 },
  { name: "Portal Américas", lat: 4.6306, lon: -74.156 },
  { name: "Portal Sur", lat: 4.5893, lon: -74.164 },
  { name: "Portal Tunal", lat: 4.5762, lon: -74.132 },
  { name: "Portal Usme", lat: 4.531, lon: -74.115 },
  { name: "Portal 20 de Julio", lat: 4.576, lon: -74.094 },
];

/** Centro de la operación troncal. */
export const BOGOTA_CENTER: [number, number] = [4.6483, -74.0836];
export const CITY_ZOOM = 12;
