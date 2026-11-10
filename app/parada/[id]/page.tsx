import type { Metadata } from "next";

import { StopScreen } from "@/components/app/stop";

export const metadata: Metadata = { title: "Paradero · TransMiRuta" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StopScreen id={id} />;
}
