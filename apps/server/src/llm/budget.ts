/** A spend cap beyond the global daily one, e.g. one room's or one player's. */
export interface BudgetScope {
  kind: 'room' | 'player';
  id: string;
  capUsd: number;
}

export interface Reservation {
  keys: string[];
  amountUsd: number;
}

export interface BudgetLedger {
  /** Holds `amountUsd` against the daily cap and every scope, or returns null if any would be exceeded. */
  reserve(scopes: BudgetScope[], amountUsd: number): Reservation | null;
  /** Releases the hold and charges the actual cost. */
  settle(reservation: Reservation, costUsd: number): void;
  spentUsd(key: 'daily' | `${BudgetScope['kind']}:${string}`): number;
}

interface Entry {
  spentUsd: number;
  reservedUsd: number;
}

/**
 * In memory: a restart resets every cap. Each call reserves its worst case before it starts and settles
 * afterwards, so concurrent calls cannot pass a cap on reservations alone.
 */
export function createBudgetLedger(options: { dailyUsd: number; now?: () => number }): BudgetLedger {
  const now = options.now ?? Date.now;
  const entries = new Map<string, Entry>();
  let day = '';

  function entry(key: string): Entry {
    let found = entries.get(key);
    if (!found) {
      found = { spentUsd: 0, reservedUsd: 0 };
      entries.set(key, found);
    }
    return found;
  }

  function rollDay(): void {
    const today = new Date(now()).toISOString().slice(0, 10);
    if (today !== day) {
      day = today;
      entry('daily').spentUsd = 0;
    }
  }

  return {
    reserve(scopes, amountUsd) {
      rollDay();
      const caps = [
        { key: 'daily', capUsd: options.dailyUsd },
        ...scopes.map((scope) => ({ key: `${scope.kind}:${scope.id}`, capUsd: scope.capUsd })),
      ];
      for (const { key, capUsd } of caps) {
        const current = entry(key);
        if (current.spentUsd + current.reservedUsd + amountUsd > capUsd) {
          return null;
        }
      }
      for (const { key } of caps) {
        entry(key).reservedUsd += amountUsd;
      }
      return { keys: caps.map(({ key }) => key), amountUsd };
    },

    settle(reservation, costUsd) {
      rollDay();
      for (const key of reservation.keys) {
        const current = entry(key);
        current.reservedUsd = Math.max(0, current.reservedUsd - reservation.amountUsd);
        current.spentUsd += costUsd;
      }
    },

    spentUsd(key) {
      return entries.get(key)?.spentUsd ?? 0;
    },
  };
}
