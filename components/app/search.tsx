"use client";

import { useDeferredValue, useState } from "react";

import { Bone, Empty, Label, Shell } from "@/components/app/primitives";
import { RouteRow, StopRow } from "@/components/app/rows";
import type { SearchResult } from "@/lib/types";
import { useJson } from "@/lib/use-live";

const SUGGESTIONS = ["B10", "K635", "Portal Norte", "Calle 72"];

export function SearchScreen() {
  const [text, setText] = useState("");
  const query = useDeferredValue(text.trim());
  const { data, loading, error } = useJson<SearchResult>(query.length >= 2 ? `/api/search?q=${encodeURIComponent(query)}` : null, 0);
  const nothing = data !== null && data.routes.length === 0 && data.stops.length === 0;

  return (
    <Shell className="max-w-[760px] py-10">
      <h1 className="text-[23px] font-medium tracking-[-0.02em]">Buscar</h1>

      <input
        autoFocus
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Código de ruta o nombre de paradero"
        aria-label="Buscar rutas y paraderos"
        autoComplete="off"
        spellCheck={false}
        className="mt-5 w-full border-b border-line bg-transparent pb-2 text-[20px] tracking-[-0.01em] outline-none placeholder:text-faint focus:border-foreground"
      />

      <p className="mt-3 flex flex-wrap items-baseline gap-x-2 text-[11px] text-faint">
        <span>Prueba</span>
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => setText(suggestion)}
            className="font-mono text-[11px] text-quiet underline-offset-4 hover:text-foreground hover:underline"
          >
            {suggestion}
          </button>
        ))}
      </p>

      {query.length >= 2 && loading && !data ? (
        <div className="mt-8 space-y-3">
          {Array.from({ length: 5 }, (_, index) => (
            <Bone key={index} className="h-3 w-full" />
          ))}
        </div>
      ) : null}

      {error && !data ? (
        <div className="mt-8">
          <Empty title="No pudimos buscar" body={error} />
        </div>
      ) : null}

      {nothing ? (
        <div className="mt-8">
          <Empty title={`Nada para «${query}»`} body="Prueba con el código tal como lo lleva el bus, o con el nombre completo del paradero." />
        </div>
      ) : null}

      {data && data.routes.length > 0 ? (
        <section className="mt-9">
          <Label>Rutas</Label>
          <ul className="mt-1 divide-y divide-line">
            {data.routes.map((route) => (
              <RouteRow key={route.id} route={route} />
            ))}
          </ul>
        </section>
      ) : null}

      {data && data.stops.length > 0 ? (
        <section className="mt-9">
          <Label>Paraderos</Label>
          <ul className="mt-1 divide-y divide-line">
            {data.stops.map((stop) => (
              <StopRow key={stop.id} stop={stop} />
            ))}
          </ul>
        </section>
      ) : null}

      {query.length < 2 ? (
        <p className="mt-10 max-w-[52ch] text-[11.5px] leading-relaxed text-faint">
          Las rutas del SITP se publican en pareja (HK635). Aquí aparecen con el código que llevan pintado en el bus.
        </p>
      ) : null}
    </Shell>
  );
}
