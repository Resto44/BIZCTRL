// A fixed topic is shared and bound exactly once before subscribe(). Deferred
// cleanup absorbs React StrictMode/cached-workspace navigation without reusing
// an already-subscribed channel and adding callbacks to it.
const registries = new WeakMap();
export function subscribeCashierBroadcast(client, topic, listener) {
  let registry = registries.get(client);
  if (!registry) { registry = new Map(); registries.set(client, registry); }
  let entry = registry.get(topic);
  if (!entry) { entry = { listeners: new Set(), channel: null, timer: null, closing: null }; registry.set(topic, entry); }
  clearTimeout(entry.timer);
  entry.listeners.add(listener);
  const start = () => {
    if (!entry.listeners.size || entry.channel || entry.closing) return;
    entry.channel = client.channel(topic, { config: { private: false } });
    entry.channel.on('broadcast', { event: 'changed' }, () => {
      // The public message is an untrusted invalidation hint, never sale data.
      for (const fn of entry.listeners) fn('changed');
    }).subscribe(status => { for (const fn of entry.listeners) fn(status); });
  };
  if (entry.closing) entry.closing.finally(start); else start();
  return () => {
    entry.listeners.delete(listener);
    if (entry.listeners.size) return;
    entry.timer = setTimeout(() => {
      if (entry.listeners.size || !entry.channel) return;
      const channel = entry.channel; entry.channel = null;
      entry.closing = Promise.resolve(client.removeChannel(channel)).catch(() => {}).finally(() => {
        entry.closing = null;
        if (entry.listeners.size) start(); else if (registry.get(topic) === entry) registry.delete(topic);
      });
    }, 100);
  };
}
