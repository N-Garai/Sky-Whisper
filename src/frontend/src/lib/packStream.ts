/**
 * Server-sent pack pipeline. Streams real stage events from
 * GET /api/packs/stream and resolves with the finished pack —
 * replacing the old timer-driven ritual with the server's truth.
 *
 * Throws on any transport or server error so the caller can fall back
 * to POST /api/packs (same pack, no progress events).
 */

export interface PackParams {
  lat: number;
  lon: number;
  timestamp: string;
  duration: number;
}

/** Server stage -> ritual label shown in PrepareCard. */
export function stageLabel(stage: string): string | null {
  switch (stage) {
    case 'snapshot':
      return 'Reading the Stars';
    case 'narration':
      return 'Writing the Guide';
    case 'audio':
      return 'Recording the Voice';
    case 'done':
      return 'Sealing the Pack';
    default:
      return null;
  }
}

export function streamPack(
  params: PackParams,
  onStage: (label: string) => void,
  timeoutMs = 120000,
): Promise<any> {
  return new Promise((resolve, reject) => {
    if (typeof EventSource === 'undefined') {
      reject(new Error('event source unsupported'));
      return;
    }
    const query = new URLSearchParams({
      latitude: String(params.lat),
      longitude: String(params.lon),
      timestamp: params.timestamp,
      duration_seconds: String(params.duration),
      timezone: 'UTC',
      elevation_meters: '0',
    });
    const es = new EventSource(`/api/packs/stream?${query.toString()}`);
    let settled = false;
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        es.close();
        reject(new Error('stream timed out'));
      }
    }, timeoutMs);

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      es.close();
      reject(err);
    };

    (['snapshot', 'narration', 'audio'] as const).forEach((stage) => {
      es.addEventListener(stage, () => {
        const label = stageLabel(stage);
        if (label) onStage(label);
      });
    });
    es.addEventListener('done', (e) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      es.close();
      try {
        resolve(JSON.parse((e as MessageEvent).data));
      } catch {
        fail(new Error('bad pack payload'));
      }
    });
    es.addEventListener('error', () => {
      fail(new Error('server error event'));
    });
    es.onerror = () => {
      // Transport failure (server down, proxy cut). Fall back to POST.
      fail(new Error('stream transport failed'));
    };
  });
}
