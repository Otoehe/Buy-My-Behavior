// No-op shim to keep legacy import working on Vercel build.
// Реальна логіка конекту гаманця перенесена в providerBridge.ts

export type ShimOptions = {
  /** Напр., '0x38' для BSC */
  chainIdHex?: string;
  /** Чи перемикатися на потрібний ланцюг автоматично */
  autoEnsureBSC?: boolean;
};

export async function installProviderConnectShim(
  _opts: ShimOptions = {},
): Promise<void> {
  // нічого не робимо — заглушка для сумісності
}

export default {};
