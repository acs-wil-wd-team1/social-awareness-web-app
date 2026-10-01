// Viewer-request function for the SAMPLE frontend distribution only.
// Keep APIs unavailable until a separately reviewed live deployment is ready.
function handler(event) {
  var request = event.request;
  var path = request.uri;
  if (path === '/api' || path.indexOf('/api/') === 0) {
    return {
      statusCode: 503,
      statusDescription: 'Service Unavailable',
      headers: {
        'content-type': { value: 'application/json; charset=utf-8' },
        'cache-control': { value: 'no-store' }
      },
      body: JSON.stringify({ code: 'API_NOT_READY', message: 'This is a frontend preview. The API is not connected.' })
    };
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return { statusCode: 405, statusDescription: 'Method Not Allowed', headers: { allow: { value: 'GET, HEAD' } } };
  }
  // Only application routes get the SPA entry point. Missing assets stay errors.
  var page = /^(?:\/(?:login|register|logout|my-campaigns|my-participation)|\/campaigns\/(?:new|\d+)|\/business\/(?:profile|enquiries|campaigns\/new)|\/admin\/(?:users|campaigns(?:\/\d+)?)|\/my-campaigns\/\d+\/edit)\/?$/;
  if (path === '/' || page.test(path)) request.uri = '/index.html';
  return request;
}
