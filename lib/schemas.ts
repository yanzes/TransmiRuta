import { z } from "zod";

export const SYSTEMS = ["troncal", "dual", "zonal_urbano", "alimentador", "zonal_complementario", "zonal_especial", "transmicable", "other"] as const;
export type System = (typeof SYSTEMS)[number];

const system = z.enum(SYSTEMS);

export const apiError = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

export const vehiclesPage = z.object({
  as_of: z.string(),
  total: z.number().int(),
  total_pages: z.number().int(),
  vehicles: z.array(
    z.object({
      vehicle_id: z.string().nullable(),
      label: z.string().nullable(),
      license_plate: z.string().nullable(),
      latitude: z.number(),
      longitude: z.number(),
      route_id: z.string().nullable(),
      route_code: z.string().nullable(),
      route_name: z.string().nullable(),
      system: system.nullable(),
      stop_name: z.string().nullable(),
      stop_status: z.string().nullable(),
      reported_at: z.string().nullable(),
    }),
  ),
});

export const stationsPage = z.object({
  as_of: z.string(),
  total: z.number().int(),
  total_pages: z.number().int(),
  stops: z.array(
    z.object({
      stop_id: z.string(),
      name: z.string(),
      latitude: z.number(),
      longitude: z.number(),
      systems: z.array(system),
      route_codes: z.array(z.string()),
    }),
  ),
});

export const arrivalsResult = z.object({
  as_of: z.string(),
  found: z.boolean(),
  stop_id: z.string(),
  stop_name: z.string().nullable(),
  count: z.number().int(),
  arrivals: z.array(
    z.object({
      predicted_at: z.string().nullable(),
      minutes_away: z.number().int().nullable(),
      basis: z.enum(["predicted", "estimated"]),
      delay_seconds: z.number().int().nullable(),
      route_id: z.string().nullable(),
      route_code: z.string().nullable(),
      route_name: z.string().nullable(),
      system: system.nullable(),
      vehicle_label: z.string().nullable(),
      license_plate: z.string().nullable(),
    }),
  ),
});

export const routeResult = z.object({
  as_of: z.string(),
  found: z.boolean(),
  route_id: z.string(),
  route: z
    .object({
      route_id: z.string(),
      short_name: z.string().nullable(),
      long_name: z.string().nullable(),
      system: system,
      patterns: z.array(
        z.object({
          trips_per_week: z.number().int(),
          length_m: z.number().int().nullable(),
          stops: z.array(z.object({ stop_id: z.string(), name: z.string().nullable(), latitude: z.number().nullable(), longitude: z.number().nullable() })),
          geometry: z.object({ type: z.literal("LineString"), coordinates: z.array(z.array(z.number())) }).nullable(),
        }),
      ),
    })
    .nullable(),
});

/** Query params the browser may send, checked before anything reaches the API. */
export const stopIdParam = z.string().regex(/^[A-Za-z0-9_.-]{1,40}$/);
export const routeIdParam = z.string().regex(/^[A-Za-z0-9_.-]{1,40}$/);
