export interface HealthStatus {
  service: 'aipoker-server';
  nowMs: number;
  ok: true;
}

export function createHealthStatus(nowMs: number): HealthStatus {
  return {
    service: 'aipoker-server',
    nowMs,
    ok: true
  };
}
