import type { Metadata } from "next";

import { ReportScreen } from "@/components/app/report";

export const metadata: Metadata = { title: "Reportar · TransMiRuta" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ stopId?: string; stopName?: string; routeId?: string; routeCode?: string }>;
}) {
  const params = await searchParams;
  return (
    <ReportScreen
      context={{
        stopId: params.stopId,
        stopName: params.stopName,
        routeId: params.routeId,
        routeCode: params.routeCode,
      }}
    />
  );
}
