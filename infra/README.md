# CauseConnect deployment

The frontend can be hosted on AWS before the remaining APIs are finished. Use a **demo build** for that first preview: it displays sample data, makes no real submissions and stays visibly labelled as a preview. Use the live build once the backend is available.

These files prepare deployment; they do not create AWS resources or deploy automatically.

## Hosting plan

Use Nginx on the project's EC2 server to serve the built React frontend. It can serve the frontend now and forward `/api` to Express later, keeping the same website address. This follows the project's IaaS direction. EC2 is [AWS virtual server hosting](https://docs.aws.amazon.com/whitepapers/latest/aws-overview/compute-services.html).

The separate [sample frontend preview](https://d10e86f5qx46up.cloudfront.net) is hosted on private S3 with CloudFront HTTPS. It uses disposable browser data and deliberately returns `503` for real API requests. Its setup is documented in [the preview guide](cloudfront/README.md). S3 alone serves static files and its website endpoint does not provide HTTPS; see [AWS static website guidance](https://docs.aws.amazon.com/AmazonS3/latest/userguide/WebsiteHosting.html). This preview does not complete the application, database and API deployment described below.

The optional [private S3 and CloudFront preview setup](cloudfront/README.md) includes tested SPA routing and an explicit unavailable-API response. Its creation requires account-owner approval; no resources are created by these files.

Before creating resources, select the project AWS account, region, server and individual deployment access. The account owner must check applicable credits and running costs. These files do not assume free hosting or access to another project's resources.

## Build a frontend release

Use Node.js 22.12+ and install frontend dependencies once:

```sh
npm ci --prefix frontend
```

From the repository root, build a sample-data preview:

```sh
node infra/package-frontend.mjs --mode demo
```

The script builds the site, copies it into a new folder under `infra/dist/`, adds `release.json` and creates a `.zip` if the `zip` command is available. It prints the exact paths. Without `zip`, compress the contents of the printed `site` folder with your file manager; `index.html` must be at the archive root.

When the API is ready on the same domain:

```sh
node infra/package-frontend.mjs --mode live
```

For an API on a different HTTPS domain:

```sh
node infra/package-frontend.mjs --mode live --api-base-url https://api.example.com/api
```

Replace the example with the actual API address. `VITE_API_BASE_URL` includes `/api`; an empty value uses `/api` on the website's domain. `VITE_DEMO_MODE=true` selects the demo build. Both are fixed at build time and are public configuration, so never put passwords, signing secrets or AWS keys in them. A different API domain also requires the backend to allow the frontend's HTTPS origin through CORS.

## First frontend preview on EC2

Start with an existing project EC2 Linux server with Nginx installed and an agreed HTTPS address. Use the team's individual deployment access through Systems Manager or SSH. Keep API and database ports private; the browser uses the website's HTTPS address.

1. Copy the generated archive to the server.
2. Extract into a **new release folder**, such as `/var/www/causeconnect/releases/2026-09-30-demo`. Give Nginx read access and retain previous releases for rollback.
3. Make `/var/www/causeconnect/current` a symlink to that release folder.
4. Install `nginx/causeconnect.conf` as the site's Nginx configuration. It serves the SPA on direct links and refreshes.
5. Install `nginx/api-unavailable.conf` at `/etc/nginx/causeconnect-api.conf`. API requests return JSON with HTTP `503`, rather than the React entry page or a false successful submission.
6. Configure TLS for the agreed domain at Nginx or the team's HTTPS proxy. The supplied port-80 origin template does not install a certificate. Real authentication and personal data must use HTTPS.
7. Run `sudo nginx -t`. If it succeeds, run `sudo systemctl reload nginx`.
8. Open the site and check the preview label, sample roles, mobile layout and direct page refreshes. Run the hosting checks below too.

The preview demonstrates screens and interactions. Database writes, real permissions, uploads and backend validation still need integration testing.

Use a separate preview address from the live application. Sample sessions belong only to the preview; do not reuse them for real API testing. If an existing preview address is converted into the live site, clear that site's sample/browser session data and sign in with a real test account.

## Connect the backend later

1. Deploy Express with server-only environment variables and a private database connection. Apply reviewed migrations to the cloud database. Configure storage for campaign images; browser image previews are not stored uploads.
2. Verify the API on the server, including authentication, submission, moderation and public visibility.
3. Replace `/etc/nginx/causeconnect-api.conf` with `nginx/api-proxy.conf`. Its upstream is `127.0.0.1:3000`; change it only if the API uses a different private address.
4. Package a **live** frontend and install as a new release. With same-origin `/api`, no browser API address needs changing.
5. Run `sudo nginx -t`, reload and verify the full browser flows against the cloud database.

The backend must trust only the actual reverse proxy where proxy trust is needed. It must verify sessions, roles, campaign ownership and status; frontend state cannot grant permissions.

## Release checks and rollback

For the same-origin preview with the supplied unavailable-API configuration:

```sh
node infra/verify-frontend.mjs https://YOUR-SITE --api unavailable
```

For a live release:

```sh
node infra/verify-frontend.mjs https://YOUR-SITE --api available
```

For a separate API domain, add `--api-base-url https://YOUR-API/api` using the same prefix as the build. The check requests SPA routes, JavaScript/CSS and the public campaign endpoint. It performs no writes. Browser checks for login/logout, permissions, uploads and approval decisions are still required.

For rollback, point `current` to the previous release. If API routing changed, restore the matching saved configuration, run `nginx -t` and reload. Database changes need their own reviewed recovery plan; a frontend rollback does not undo them.

## Files

- `package-frontend.mjs`: creates a local demo or live frontend release.
- `verify-frontend.mjs`: checks deployed hosting without changing data.
- `nginx/causeconnect.conf`: static SPA hosting and routing.
- `nginx/api-unavailable.conf`: explicit response while the API is absent.
- `nginx/api-proxy.conf`: forwards requests when the API is ready.

Never commit private keys, credentials, `.env` files, database copies or generated archives.
