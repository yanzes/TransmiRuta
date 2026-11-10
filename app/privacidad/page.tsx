import type { Metadata } from "next";

import { BackLink, Shell } from "@/components/app/primitives";

export const metadata: Metadata = { title: "Privacidad · TransMiRuta" };

const SECTIONS: [string, string][] = [
  ["Sin cuenta", "No hay registro, ni correo, ni contraseña. Abres la página y ya."],
  ["Tu ubicación no se guarda", "Se pide solo al tocar el botón de ubicación, ordena los paraderos por cercanía y se descarta. No viaja al servidor."],
  ["Lo guardado vive en tu navegador", "Los paraderos y rutas que marcas con la estrella quedan en el almacenamiento local de este navegador. Puedes borrarlos desde el mismo navegador."],
  ["Los reportes son públicos", "Si envías un reporte, se publica como un issue en el repositorio del proyecto. Antes de publicarlo se ocultan correos y teléfonos."],
  ["Sin publicidad ni rastreo", "No hay anuncios, ni analítica de terceros, ni cookies de seguimiento. El mapa usa teselas de CARTO sobre OpenStreetMap."],
];

export default function Page() {
  return (
    <Shell className="max-w-[720px] py-10">
      <BackLink href="/acerca">Acerca</BackLink>
      <h1 className="mt-6 text-[23px] font-medium tracking-[-0.02em]">Privacidad</h1>
      <p className="mt-2 text-[12.5px] text-quiet">Lo que la página hace con tus datos, en cinco frases.</p>

      <dl className="mt-8 divide-y divide-line border-t border-line">
        {SECTIONS.map(([title, body]) => (
          <div key={title} className="py-4">
            <dt className="text-[13px]">{title}</dt>
            <dd className="mt-1 max-w-[56ch] text-[12.5px] leading-relaxed text-quiet">{body}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-8 text-[10.5px] leading-relaxed text-faint">
        No es una app oficial del Distrito. Datos abiertos de TransMilenio S.A. · Mapa © CARTO, © OpenStreetMap.
      </p>
    </Shell>
  );
}
