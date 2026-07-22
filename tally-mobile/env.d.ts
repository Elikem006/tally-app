// Types for EXPO_PUBLIC_* env vars (loaded by Expo from .env.local /
// .env.production). Optional on purpose: services/api.ts checks at runtime
// and throws a clear error when unset.
declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_API_URL?: string;
  }
}
