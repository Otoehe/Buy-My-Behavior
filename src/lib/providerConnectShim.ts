// src/lib/providerConnectShim.ts
/**
 * No-op shim to keep legacy import working on Vercel build.
 * Реальна логіка конекту гаманця тепер в providerBridge.ts.
 */

export type ShimOptions = {
  chainIdHex?: string;
  autoEnsureBSC?: boolean;
};

export async function installProviderConnectShim(_opts: ShimOptions = {}): Promise<void> {
  // навмисно порожньо
}

export default {};
