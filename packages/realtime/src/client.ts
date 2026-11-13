/**
 * The browser side of the real-time hints (ADR 0043).
 *
 * `onChange` runs on every hint and on every (re)connection: the stream carries
 * no content, so whatever changed while the browser was disconnected is caught
 * up by the read `onChange` performs. `EventSource` reconnects by itself; when
 * the server refuses the stream (signed out), `connected()` stays false and the
 * caller keeps polling.
 */
export interface LiveStream {
  close(): void
  connected(): boolean
}

export function openLiveStream(url: string, onChange: () => void): LiveStream {
  if (typeof EventSource === "undefined") {
    return { close() {}, connected: () => false }
  }
  const source = new EventSource(url)
  source.onopen = () => onChange()
  source.onmessage = () => onChange()
  return {
    close: () => source.close(),
    connected: () => source.readyState === EventSource.OPEN,
  }
}
