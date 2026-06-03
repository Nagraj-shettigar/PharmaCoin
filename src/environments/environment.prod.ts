// Production environment — swapped in by the production build (see angular.json
// fileReplacements). Talks to the PROD Cloudflare Worker.
export const environment = {
  production: true,
  apiBaseUrl: 'https://healthpoints-api.healthpoints.workers.dev/api/v1',
};
