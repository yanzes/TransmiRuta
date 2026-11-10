import type { Metadata } from "next";

import { SearchScreen } from "@/components/app/search";

export const metadata: Metadata = { title: "Buscar rutas y paraderos · TransMiRuta" };

export default function Page() {
  return <SearchScreen />;
}
