/**
 * Zernio client shim.
 *
 * The implementation now lives in `_shared/zernio.ts` so the messaging functions
 * (WhatsApp) and the social functions share one client. This file re-exports it
 * to keep the existing `./zernio.ts` import paths in zernio-api/* working.
 */
export * from '../_shared/zernio.ts';
