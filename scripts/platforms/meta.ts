/**
 * Meta (Facebook/Instagram) adapter — the reference implementation. It simply
 * wraps the existing, battle-tested Meta data layer so the rest of the app keeps
 * working unchanged while the platform abstraction is introduced around it.
 */
import { fetchCreatives } from '../meta-creative-api/metaApi.js';
import { missingEnv, type PlatformAdapter } from './types.js';

const REQUIRED_ENV = ['ACCESS_TOKEN', 'AD_ACCOUNT_ID'];

export const metaAdapter: PlatformAdapter = {
  id: 'meta',
  label: 'Meta',
  requiredEnv: REQUIRED_ENV,
  isConfigured: () => missingEnv(REQUIRED_ENV).length === 0,
  fetchCreatives,
};
