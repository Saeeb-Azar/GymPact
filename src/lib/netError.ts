// Verständliche Meldung, wenn der Browser Supabase gar nicht erreicht
// (Safari: "Load failed", Chrome: "Failed to fetch", Firefox: "NetworkError").

const NETWORK_RE = /load failed|failed to fetch|networkerror|network request failed|fetch failed/i;

export function isNetworkError(message: string): boolean {
  return NETWORK_RE.test(message);
}

export function supabaseHost(): string {
  try {
    return new URL(import.meta.env.VITE_SUPABASE_URL as string).host;
  } catch {
    return 'unbekannt';
  }
}

export function friendlyNetworkMessage(message: string): string {
  if (!isNetworkError(message)) return message;
  const host = supabaseHost();
  if (/your-project-ref|mock|localhost/.test(host)) {
    return `Die App ist mit einer Platzhalter-Adresse gebaut (${host}). VITE_SUPABASE_URL beim Build auf die echte Supabase-URL setzen und neu deployen.`;
  }
  return `Server nicht erreichbar (${host}). Meist ist das Supabase-Projekt pausiert – im Supabase-Dashboard „Restore project“ klicken. Sonst Internetverbindung prüfen.`;
}
