import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { TopBar } from "@/components/app/primitives";
import { ThemeProvider } from "@/components/theme-provider";

import "./globals.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const title = "TransMiRuta · Todos los buses de Bogotá, en vivo";
const description =
  "Mira los buses de TransMilenio y el SITP moviéndose ahora mismo, los próximos en tu paradero y el recorrido de cada ruta. Sin cuenta y sin publicidad.";
const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://transmiruta.vercel.app";
const image = { url: "/og.jpg", width: 1200, height: 630, alt: "Los buses de Bogotá en el mapa, en vivo" };

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title,
  description,
  applicationName: "TransMiRuta",
  openGraph: { title, description, siteName: "TransMiRuta", locale: "es_CO", type: "website", images: [image] },
  twitter: { card: "summary_large_image", title, description, images: [image] },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0e0b" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <script
          // Applies the saved contrast before the first paint, so nothing flashes.
          dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem("transmiruta.contrast.v1")==="high")document.documentElement.dataset.contrast="high"}catch(e){}` }}
        />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TopBar />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
