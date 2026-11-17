/** Supply fetch explicitly; importing this module never enables network access. */
export function createBoundedTransport(fetchImpl, {maxBytes = 5 * 1024 * 1024, timeoutMs = 10000} = {}) {
  if (typeof fetchImpl !== 'function' || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 10 * 1024 * 1024 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new Error('Invalid transport configuration');
  return async function transport(url, options = {}) {
    const target = new URL(url);
    if (target.origin !== 'https://next-api.saturation.io' || !target.pathname.startsWith('/v1/') || target.username || target.password || target.hash || (options.method ?? 'GET') !== 'GET') throw new Error('Unsupported read-only destination');
    const controller = new AbortController();
    const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
    const timer = setTimeout(()=>controller.abort(),timeoutMs);
    let abortListener;
    const aborted = new Promise((_, reject)=>{
      abortListener = ()=>reject(new Error('Saturation request timed out or cancelled'));
      if (signal.aborted) abortListener(); else signal.addEventListener('abort',abortListener,{once:true});
    });
    // Always handle an already-aborted promise, even before the first race.
    aborted.catch(()=>{});
    const bounded = operation => Promise.race([operation,aborted]);
    let reader; let response; let complete = false;
    try {
      if (signal.aborted) throw new Error('Saturation request timed out or cancelled');
      try { response = await bounded(Promise.resolve().then(()=>fetchImpl(target.toString(),{...options,method:'GET',redirect:'error',signal}))); }
      catch { throw new Error(signal.aborted ? 'Saturation request timed out or cancelled' : 'Saturation transport failure'); }
      if (response.redirected || (response.status >= 300 && response.status < 400)) throw new Error('Saturation redirects are not allowed');
      if (!Number.isInteger(response.status) || response.status < 100 || response.status > 599) throw new Error('Invalid HTTP status');
      if (!response.ok) return {ok:false,status:response.status,json:async()=>{throw new Error('Error bodies are not exposed');}};
      const contentType = response.headers?.get('content-type')?.split(';')[0].trim().toLowerCase();
      if (!contentType || !/^application\/(?:json|[a-z0-9.+-]+\+json)$/.test(contentType)) throw new Error('Expected JSON content type');
      const length = response.headers?.get('content-length');
      if (length !== null && length !== undefined && (!/^\d+$/.test(length) || Number(length) > maxBytes)) throw new Error('Response byte limit exceeded');
      if (!response.body || typeof response.body.getReader !== 'function') throw new Error('Missing response stream');
      reader = response.body.getReader();
      const chunks = []; let bytes = 0;
      while (true) {
        let result;
        try { result = await bounded(reader.read()); }
        catch { throw new Error(signal.aborted ? 'Saturation request timed out or cancelled' : 'Saturation response read failure'); }
        if (result.done) { complete = true; break; }
        if (!(result.value instanceof Uint8Array)) throw new Error('Invalid response chunk');
        bytes += result.value.byteLength;
        if (bytes > maxBytes) throw new Error('Response byte limit exceeded');
        chunks.push(result.value);
      }
      const data = new Uint8Array(bytes); let offset = 0;
      for (const chunk of chunks) { data.set(chunk,offset); offset += chunk.byteLength; }
      let body;
      try { body = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data)); } catch { throw new Error('Invalid JSON response'); }
      if (signal.aborted) throw new Error('Saturation request timed out or cancelled');
      return {ok:true,status:response.status,json:async()=>body};
    } finally {
      clearTimeout(timer); signal.removeEventListener('abort',abortListener);
      if (!complete) {
        controller.abort();
        // Cancellation must not block the deadline if a custom stream is broken.
        try { Promise.resolve(reader ? reader.cancel() : response?.body?.cancel()).catch(()=>{}); } catch {}
      }
    }
  };
}
