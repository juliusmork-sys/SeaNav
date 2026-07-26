import { useEffect, useRef, useState } from "react";

/**
 * State som overlever reload via localStorage.
 *
 * Leser og skriver bor i samme kall, slik at de ikke kan komme i utakt — den
 * feilen er lett å gjøre når hver innstilling har en egen initializer og en
 * egen useEffect.
 *
 * All localStorage-tilgang er pakket inn i try/catch. Safari i privat modus,
 * full kvote og nettlesere som blokkerer site-data kaster (SecurityError /
 * QuotaExceededError). Appen har ingen ErrorBoundary, så et kast i en
 * useState-initializer eller useEffect ville ellers gitt hvit skjerm — dårlig
 * nyhet for en navigasjonsapp som brukes offline på sjøen.
 */
export interface SettingCodec<T> {
  decode: (stored: string | null) => T;
  encode: (value: T) => string;
}

export function usePersistedState<T>(key: string, codec: SettingCodec<T>) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return codec.decode(null);
    try {
      return codec.decode(window.localStorage.getItem(key));
    } catch {
      return codec.decode(null);
    }
  });

  // Codec holdes i en ref slik at inline-objekter fra kallstedet ikke trigger
  // en ny skriving på hver render. Ref-en oppdateres i en egen effekt som
  // kjører før skrive-effekten under (effekter kjører i deklarasjonsrekkefølge).
  const encodeRef = useRef(codec.encode);
  useEffect(() => {
    encodeRef.current = codec.encode;
  });

  const hydrated = useRef(false);

  useEffect(() => {
    // Første kjøring speiler bare verdien vi nettopp leste — ingen grunn til å
    // skrive den tilbake, og vi unngår å materialisere defaults i storage for
    // brukere som aldri har rørt innstillingen.
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, encodeRef.current(value));
    } catch {
      // Lagring utilgjengelig — kjør videre uten å persistere.
    }
  }, [key, value]);

  return [value, setValue] as const;
}

/**
 * På/av-innstilling lagret som "on"/"off". Ukjent eller manglende verdi faller
 * tilbake til defaultValue, slik at defaulten står ett sted i stedet for å være
 * kodet inn i valget mellom `!== "off"` og `=== "on"`.
 */
export function booleanSetting(defaultValue: boolean): SettingCodec<boolean> {
  return {
    decode: (stored: string | null) => {
      if (stored === "on") return true;
      if (stored === "off") return false;
      return defaultValue;
    },
    encode: (value: boolean) => (value ? "on" : "off"),
  };
}

/**
 * Enum-innstilling lagret som sin egen streng. Verdier utenfor `allowed` faller
 * tilbake til defaultValue, så en nedgradering eller et fjernet alternativ ikke
 * gir en ugyldig tilstand.
 */
export function enumSetting<T extends string>(
  defaultValue: T,
  allowed: readonly T[],
): SettingCodec<T> {
  return {
    decode: (stored: string | null) =>
      allowed.includes(stored as T) ? (stored as T) : defaultValue,
    encode: (value: T) => value,
  };
}
