// Global type declarations.
//
// Only add module declarations here for libraries that genuinely ship no types.
// Do NOT stub third-party libraries as `unknown` — that overrides their real
// typings and silently breaks every downstream consumer. If a library has a
// DefinitelyTyped package (@types/foo) installed, trust it.

declare module '@tanstack/react-query' {
  export * from 'react-query';
}

// Tell TypeScript to ignore these transitive `@types` packages that don't
// need to participate in the project's type graph. Empty `declare module`
// body is a supported way to suppress "missing type declaration" errors
// without pretending the module has a specific shape.
declare module 'babel__core' {}
declare module 'babel__generator' {}
declare module 'babel__template' {}
declare module 'babel__traverse' {}
declare module 'd3-array' {}
declare module 'd3-color' {}
declare module 'd3-ease' {}
declare module 'd3-interpolate' {}
declare module 'd3-path' {}
declare module 'd3-scale' {}
declare module 'd3-shape' {}
declare module 'd3-time' {}
declare module 'd3-timer' {}
declare module 'draco3d' {}
declare module 'history' {}
declare module 'istanbul-lib-coverage' {}
declare module 'istanbul-lib-report' {}
declare module 'istanbul-reports' {}
declare module 'json5' {}
declare module 'offscreencanvas' {}
declare module 'phoenix' {}
declare module 'prop-types' {}
declare module 'react-reconciler' {}
declare module 'stack-utils' {}
declare module 'stats.js' {}
declare module 'use-sync-external-store' {}
declare module 'webxr' {}
declare module 'yargs-parser' {}
