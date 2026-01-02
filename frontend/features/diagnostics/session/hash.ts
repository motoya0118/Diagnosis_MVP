const HEX_TABLE = Array.from({ length: 256 }, (_, index) => index.toString(16).padStart(2, "0"));

const toHexString = (buffer: ArrayBuffer): string => {
  const view = new Uint8Array(buffer);
  let result = "";
  for (let i = 0; i < view.length; i += 1) {
    result += HEX_TABLE[view[i]];
  }
  return result;
};

async function digestSha256(payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);

  const cryptoObject = globalThis.crypto as Crypto | undefined;
  if (!cryptoObject?.subtle) {
    throw new Error("Web Crypto API is unavailable in this environment.");
  }

  const hashBuffer = await cryptoObject.subtle.digest("SHA-256", data);
  return toHexString(hashBuffer);
}

export async function computeVersionOptionsHash(
  versionId: number,
  optionIds: readonly number[],
): Promise<string> {
  const sorted = optionIds.map((id) => String(id)).sort();
  const payload = `v${versionId}:${sorted.join(",")}`;
  return digestSha256(payload);
}

export type ComputeVersionOptionsHash = typeof computeVersionOptionsHash;
