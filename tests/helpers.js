import {createBoundedTransport} from '../src/transport.js';

/** Test-only helper: bounded transport backed by a synthetic fetch handler. */
export function syntheticTransport(handler) {
  return createBoundedTransport(async (url, options) => {
    const outcome = await handler(url, options);
    if (outcome instanceof Response) return outcome;
    const status = outcome.status ?? 200;
    if (outcome.ok === false || status < 200 || status >= 300) {
      return new Response('{}', {status, headers: {'content-type': 'application/json'}});
    }
    return new Response(JSON.stringify(outcome.body ?? outcome), {headers: {'content-type': 'application/json'}});
  });
}