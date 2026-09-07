type LiveEvent = { type: string; at: string; payload?: Record<string, unknown> };

const globalBus = globalThis as unknown as { quercusListeners?: Set<(event: LiveEvent) => void> };
const listeners = globalBus.quercusListeners ?? new Set<(event: LiveEvent) => void>();
globalBus.quercusListeners = listeners;

export function publishEvent(type: string, payload?: Record<string, unknown>) {
  const event = { type, payload, at: new Date().toISOString() };
  for (const listener of listeners) listener(event);
}

export function subscribe(listener: (event: LiveEvent) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
