import type { Metadata } from "next";

import { SavedScreen } from "@/components/app/saved";

export const metadata: Metadata = { title: "Guardados · TransMiRuta" };

export default function Page() {
  return <SavedScreen />;
}
