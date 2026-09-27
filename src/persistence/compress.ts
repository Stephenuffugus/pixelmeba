/** gzip via the standard CompressionStream (browsers, workers, Android WebView, Node ≥ 18). */

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const out = new Blob([copy]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function gzipText(text: string): Promise<Uint8Array> {
  return pipe(new TextEncoder().encode(text), new CompressionStream('gzip'));
}

export async function gunzipText(data: Uint8Array): Promise<string> {
  return new TextDecoder().decode(await pipe(data, new DecompressionStream('gzip')));
}
