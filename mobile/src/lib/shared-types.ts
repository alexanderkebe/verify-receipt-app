// Runtime-empty shim standing in for the web app's `@/types` module.
//
// The shared receipt-parsing module imports only `type Provider` from
// `@/types`, which TypeScript erases at build time — but Metro still has to
// resolve the specifier. Pointing `@/types` here (see metro.config.js) keeps
// the shared module loadable without dragging in the web app's Next.js and
// NextAuth type surface.
export type Provider = 'CBE' | 'TELEBIRR' | 'DASHEN' | 'ABYSSINIA' | 'CBE_BIRR' | 'MPESA';
