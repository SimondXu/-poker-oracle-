// Socket.io passes whatever the client sent as the last argument; only call it when it is a function.
export function toAck<T>(ack: unknown): (result: T) => void {
  return typeof ack === 'function' ? (ack as (result: T) => void) : () => {};
}
