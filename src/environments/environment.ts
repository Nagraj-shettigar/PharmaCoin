// Default (development) environment — used by `ng serve` and the dev build.
// Talks to the DEV Cloudflare Worker (which allow-lists http://localhost:4200).
export const environment = {
  production: false,
  apiBaseUrl: 'https://healthpoints-api-dev.healthpoints.workers.dev/api/v1',
};
