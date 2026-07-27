import { useEffect, useRef, useState } from "react";

/**
 * Holder et element montert litt lenger enn `open` er sant, slik at det får
 * spille en exit-animasjon før React river det ut av treet.
 *
 * Bakgrunn: alt som vises betinget (`{open && <Modal />}`) forsvinner momentant
 * uten et slikt opphold. Enter-animasjonen kan ligge rett på elementets egen
 * `animation`-regel — den starter av seg selv når noden settes inn — men exit
 * krever at noden fortsatt finnes. Derfor returnerer hooken både `mounted` og
 * et flagg som kallstedet legger på som klasse (`is-exiting`).
 *
 * Bruk:
 *   const seaMarks = usePresence(seaMarksOpen);
 *   {seaMarks.mounted && <div className={`sea-marks-modal ${seaMarks.className}`} />}
 *
 * `durationMs` må matche exit-animasjonen i CSS. Ved
 * `prefers-reduced-motion: reduce` faller ventetiden til 0 slik at UI-et svarer
 * umiddelbart — samme grunn som at CSS-en der slår av animasjonene helt.
 */
export const MOTION_EXIT_MS = 160;

function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export interface Presence {
  /** Skal elementet ligge i DOM-en? Sant mens det åpner, står åpent og lukker. */
  mounted: boolean;
  /** Sant kun i lukkevinduet. */
  exiting: boolean;
  /** `"is-exiting"` mens det lukkes, ellers tom streng. Klar for className. */
  className: string;
}

export function usePresence(open: boolean, durationMs = MOTION_EXIT_MS): Presence {
  const [mounted, setMounted] = useState(open);
  const [exiting, setExiting] = useState(false);
  // Speiler `mounted` synkront. Effekten må vite om elementet faktisk står i
  // DOM-en nå, og state-verdien den fanget kan være en render bak.
  const mountedRef = useRef(open);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (open) {
      // Åpner igjen midt i en lukking: avbryt exit og la elementet stå.
      mountedRef.current = true;
      setMounted(true);
      setExiting(false);
      return;
    }

    if (!mountedRef.current) return;

    if (prefersReducedMotion() || durationMs <= 0) {
      mountedRef.current = false;
      setMounted(false);
      setExiting(false);
      return;
    }

    setExiting(true);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      mountedRef.current = false;
      setMounted(false);
      setExiting(false);
    }, durationMs);
  }, [open, durationMs]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  return { mounted, exiting, className: exiting ? "is-exiting" : "" };
}
