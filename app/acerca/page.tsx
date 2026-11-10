import type { Metadata } from "next";

import { AboutScreen } from "@/components/app/about";

export const metadata: Metadata = { title: "Acerca de TransMiRuta" };

export default function Page() {
  return <AboutScreen />;
}
