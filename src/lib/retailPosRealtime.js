import { RETAIL_POS_REALTIME_TABLES } from './retailPosControl';

const subscriptions = new WeakMap();
let channelSequence = 0;

function removeChannel(client, channel) {
  if (!channel) return;
  // Realtime cleanup is asynchronous and must not reject into React's effect cleanup.
  try {
    Promise.resolve(client.removeChannel(channel)).catch((error) => {
      console.error('[Retail POS] Realtime cleanup failed', error);
    });
  } catch (error) {
    console.error('[Retail POS] Realtime cleanup failed', error);
  }
}

/**
 * Owner workspace tabs stay mounted when hidden. They share one tenant channel;
 * adding a page must never append Postgres bindings to an already joined channel.
 */
export function subscribeRetailPosRealtime({ client, queryClient, restaurantId, onChange }) {
  let tenants = subscriptions.get(client);
  if (!tenants) {
    tenants = new Map();
    subscriptions.set(client, tenants);
  }

  let entry = tenants.get(restaurantId);
  const isNew = !entry;
  if (!entry) {
    entry = {
      consumers: new Set(),
      state: { status: 'CONNECTING', lastEventAt: null },
      channel: null,
      refreshTimer: null,
      stopped: false,
    };
    tenants.set(restaurantId, entry);
  }

  const consumer = { queryClient, onChange };
  entry.consumers.add(consumer);
  onChange(entry.state);

  if (isNew) {
    const notify = (patch) => {
      if (entry.stopped) return;
      entry.state = { ...entry.state, ...patch };
      entry.consumers.forEach((subscriber) => subscriber.onChange(entry.state));
    };
    const queueRefresh = () => {
      if (entry.stopped) return;
      notify({ lastEventAt: new Date() });
      if (entry.refreshTimer !== null) return;
      entry.refreshTimer = setTimeout(() => {
        entry.refreshTimer = null;
        if (entry.stopped) return;
        const queryClients = new Set([...entry.consumers].map((subscriber) => subscriber.queryClient));
        queryClients.forEach((cache) => {
          cache.invalidateQueries({ queryKey: ['retail-pos-control', restaurantId], exact: false });
        });
      }, 600);
    };

    try {
      // A fresh lifetime needs a fresh topic: the SDK can still hold a channel
      // while the preceding effect's asynchronous unsubscribe is in flight.
      entry.channel = client.channel(`retail-pos-control-${restaurantId}-${++channelSequence}`);
      RETAIL_POS_REALTIME_TABLES.forEach((table) => {
        entry.channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter: `restaurant_id=eq.${restaurantId}` },
          queueRefresh,
        );
      });
      entry.channel.subscribe((status) => notify({ status }));
    } catch (error) {
      notify({ status: 'CHANNEL_ERROR' });
      removeChannel(client, entry.channel);
      entry.channel = null;
      // The snapshot and periodic polling remain available if realtime cannot start.
      console.error('[Retail POS] Realtime subscription failed', error);
    }
  }

  return () => {
    if (!entry.consumers.delete(consumer) || entry.consumers.size) return;
    entry.stopped = true;
    tenants.delete(restaurantId);
    if (entry.refreshTimer !== null) clearTimeout(entry.refreshTimer);
    removeChannel(client, entry.channel);
  };
}
