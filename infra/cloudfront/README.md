# Optional AWS frontend preview

This is a separate **sample-only** hosting option, not the final IaaS/backend/database deployment. The EC2/Nginx plan remains in [the deployment guide](../README.md).

Before creating resources, obtain approval for the exact account, a dedicated private S3 bucket, a CloudFront distribution on the **Free flat-rate plan**, and the frontend upload. Do not select a paid plan or change another application's resources. CloudFront advertises no plan overages; S3 requests and services outside the plan can still incur charges. Check the account's actual eligibility and credits, not just its current $0 balance. See [AWS plan details](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html).

1. Package with `node infra/package-frontend.mjs --mode demo`. Use only the generated `site/` contents; never upload the repository, environment files, credentials or database data.
2. Create a project-only S3 Standard bucket in the agreed region. Keep Block Public Access on, ACLs disabled and default encryption enabled. Do not enable S3 website hosting or public object access.
3. Create a CloudFront Free-plan distribution using that bucket's REST origin. Use Origin Access Control, limited to read access from this one distribution. Use its default HTTPS hostname; no domain purchase is needed.
4. Upload the packaged site with correct content types. `index.html` and `release.json` should revalidate; hashed assets may have long immutable caching. Do not reuse a live application's hostname for sample accounts.
5. Attach `preview-routing.js` as the viewer-request CloudFront Function. It rewrites known application routes, preserves missing-asset errors and returns JSON `503` for `/api`. This code is **preview-only**; do not retain the API block on a live backend distribution. Select the AWS-managed security-header policy and redirect HTTP to HTTPS.
6. Wait for deployment, then run `node infra/verify-frontend.mjs https://PREVIEW-HOST --api unavailable` and browser-test the role journeys, direct links and mobile layout. Confirm the bucket cannot be read publicly without CloudFront.
7. Record the resource names, release archive hash and verified URL in the private project handoff. Review usage after deployment; a billing alert is not a hard spending cap.

Local routing tests: `node --test infra/cloudfront/preview-routing.test.mjs`.

## Uploading the first release

`deploy-preview.mjs` applies steps 4–5 to an already-created, approved Sydney bucket/distribution pair. The distribution origin must point to the bucket's REST endpoint with origin path `/site`, and have no existing functions, extra behaviours or custom error rewrites. Keep `preview-routing.js` beside the script.

Run it in AWS CloudShell using the approved account's existing sign-in. Upload only the two scripts and the reviewed demo ZIP, not the repository or environment files:

```sh
node deploy-preview.mjs ACCOUNT_ID BUCKET_NAME DISTRIBUTION_ID \
  /path/to/causeconnect-frontend.zip EXPECTED_SHA256 \
  causeconnect-preview-routing-UNIQUE_SUFFIX --apply
```

The script verifies the account, archive hash, demo release, private-bucket settings and distribution-specific origin access before uploading. It adds HTTPS redirect, the AWS-managed security-header policy and the sample-only routing function. It does not change the pricing plan, create credentials, delete objects or modify unrelated resources.

The output records the release hash and a temporary receipt directory containing the previous distribution configuration. Preserve that receipt if a rollback is needed. If an error occurs after upload or function creation, inspect the current state before continuing: the script intentionally refuses to replace an existing function, so it is not a blind retry or future-release updater. Keep earlier release ZIPs for rollback; do not delete the bucket or its contents to recover from a failed deployment.

Switching to the real application requires a separate live build, verified backend/cloud database/image storage and an approved routing change. No real authentication or server data is provided by this preview.
