import type { Metadata } from "next";

import { RouteScreen } from "@/components/app/route";

export const metadata: Metadata = { title: "Ruta · TransMiRuta" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RouteScreen id={id} />;
}
