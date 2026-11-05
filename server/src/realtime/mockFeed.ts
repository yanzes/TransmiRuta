import GtfsRealtimeBindings from "gtfs-realtime-bindings";

/**
 * Mock feed: builds a real GTFS-Realtime FeedMessage and encodes it to protobuf,
 * so FEED_SOURCE=mock exercises exactly the same decode path as production.
 * Buses crawl along the actual troncal corridors of Bogotá.
 */
type Path = [number, number][];

interface MockBus {
  id: string;
  label: string;
  plate: string;
  code: string;
  path: Path;
  /** 0..1 progress along the whole path. */
  progress: number;
  speedKmh: number;
  direction: 1 | -1;
}

function path(...points: Path): Path {
  return points;
}

const CORRIDORS: { code: string; name: string; path: Path; buses: number }[] = [
  {
    code: "F23",
    name: "Portal Norte - Portal Tunal (Caracas)",
    path: path(
      [4.7536, -74.0456],
      [4.7209, -74.0562],
      [4.6931, -74.0721],
      [4.6483, -74.0836],
      [4.6035, -74.0921],
      [4.5762, -74.132],
    ),
    buses: 4,
  },
  {
    code: "B12",
    name: "Portal Suba - Portal 20 de Julio",
    path: path(
      [4.7476, -74.091],
      [4.7261, -74.0891],
      [4.699, -74.0906],
      [4.6768, -74.0887],
      [4.6305, -74.0815],
      [4.586, -74.094],
    ),
    buses: 4,
  },
  {
    code: "K43",
    name: "Portal El Dorado - Portal Américas",
    path: path(
      [4.7003, -74.145],
      [4.6891, -74.1521],
      [4.6652, -74.1578],
      [4.6306, -74.156],
    ),
    buses: 3,
  },
  {
    code: "L18",
    name: "Portal Usme - Portal Norte",
    path: path(
      [4.531, -74.115],
      [4.5762, -74.132],
      [4.6134, -74.1012],
      [4.6483, -74.0836],
      [4.7104, -74.0608],
      [4.7536, -74.0456],
    ),
    buses: 3,
  },
  {
    code: "J70",
    name: "Portal 80 - Portal Sur",
    path: path(
      [4.699, -74.0906],
      [4.6701, -74.1092],
      [4.6289, -74.155],
      [4.5893, -74.164],
    ),
    buses: 3,
  },
];

function bearing(from: [number, number], to: [number, number]): number {
  const toRad = Math.PI / 180;
  const dLon = (to[1] - from[1]) * toRad;
  const y = Math.sin(dLon) * Math.cos(to[0] * toRad);
  const x =
    Math.cos(from[0] * toRad) * Math.sin(to[0] * toRad) -
    Math.sin(from[0] * toRad) * Math.cos(to[0] * toRad) * Math.cos(dLon);
  return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
}

function at(path: Path, progress: number): { lat: number; lon: number; heading: number } {
  const clamped = Math.min(1, Math.max(0, progress));
  const segments = path.length - 1;
  const scaled = clamped * segments;
  const index = Math.min(segments - 1, Math.floor(scaled));
  const t = scaled - index;
  const from = path[index]!;
  const to = path[index + 1] ?? from;
  return {
    lat: from[0] + (to[0] - from[0]) * t,
    lon: from[1] + (to[1] - from[1]) * t,
    heading: bearing(from, to),
  };
}

export class MockFeed {
  private readonly buses: MockBus[] = [];
  private lastTick = Date.now();

  constructor() {
    for (const corridor of CORRIDORS) {
      for (let index = 0; index < corridor.buses; index++) {
        const slot = index / corridor.buses;
        this.buses.push({
          id: `${corridor.code}-${index + 1}`,
          label: `${corridor.code}${String(index + 1).padStart(2, "0")}`,
          plate: `MOCK${String(index + 1).padStart(3, "0")}`,
          code: corridor.code,
          path: corridor.path,
          progress: (slot + 0.03) % 1,
          speedKmh: 18 + Math.round(Math.random() * 14),
          direction: 1,
        });
      }
    }
  }

  /** Moves every bus by the elapsed time, then returns encoded protobuf. */
  fetch(): Uint8Array {
    const now = Date.now();
    const elapsedHours = (now - this.lastTick) / 3_600_000;
    this.lastTick = now;

    const feedMessage = GtfsRealtimeBindings.transit_realtime.FeedMessage.create({
      header: {
        gtfsRealtimeVersion: "2.0",
        incrementality: GtfsRealtimeBindings.transit_realtime.FeedHeader.Incrementality.FULL_DATASET,
        timestamp: Math.floor(now / 1000),
      },
      entity: this.buses.map((bus) => {
        // ~12 km corridor, so speed/12000 of the path per hour.
        bus.progress += (bus.speedKmh * elapsedHours) / 12;
        if (bus.progress > 1) {
          bus.progress = 1;
          bus.direction = -1;
        } else if (bus.progress < 0) {
          bus.progress = 0;
          bus.direction = 1;
        }
        const point = at(bus.path, bus.progress);
        return {
          id: `${bus.id}-${Math.floor(now / 1000)}`,
          vehicle: {
            trip: { tripId: `${bus.code}-mock`, routeId: bus.code },
            position: {
              latitude: point.lat,
              longitude: point.lon,
              bearing: bus.direction === 1 ? point.heading : (point.heading + 180) % 360,
              speed: bus.speedKmh / 3.6,
            },
            vehicle: { id: bus.id, label: bus.label, licensePlate: bus.plate },
            timestamp: Math.floor(now / 1000),
            currentStatus: 2,
          },
        };
      }),
    });

    return GtfsRealtimeBindings.transit_realtime.FeedMessage.encode(feedMessage).finish();
  }
}
