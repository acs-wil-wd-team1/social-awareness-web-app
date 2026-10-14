# CauseConnect live test server

This deployment runs the reviewed frontend, Express API and MySQL database on one Ubuntu 24.04 server in AWS Sydney. The existing CloudFront sample preview keeps its separate address and sample data.

## Resources and cost

`stack.json` specifies one Linux `t3.small` in Standard CPU-credit mode, one encrypted 20 GiB gp3 root disk, one Elastic IP, a website security group and a dedicated instance role. It uses an existing default VPC/public subnet. There is no public SSH, Node or MySQL port and no load balancer, NAT gateway, RDS instance or paid CloudFront change.

At the rates checked on 13 October 2026, the baseline is US$24.53 per 30 days. It excludes excess traffic, backup storage, taxes and unrelated account activity. AWS credits can cover eligible usage but do not cap the Paid account's bill. The two account-wide budgets alert on gross monthly usage ($15/$24/$30, excluding credits) and a positive net charge (including credits and tax); they do not automatically stop resources. They cover the whole account because all projects share the credit balance.

The instance role permits Systems Manager session/command communication and read-only downloads from the selected bucket's `live-releases/` prefix. It cannot read Parameter Store secrets or write/delete bucket contents. Deployment uses the account owner's authenticated AWS session; no long-lived AWS access key belongs in the app.

The server downloads its release with Ubuntu's `python3-boto3` package and the instance role. It does not depend on an AWS CLI package being available in Ubuntu 24.04. The downloaded archive's SHA256 is checked before extraction or execution.

The packager suppresses macOS resource-fork files and checks the actual archive against `release.json`, not just the source folder. Extra/missing files, changed hashes, links and `.DS_Store`/`._*` metadata are refused. The server repeats archive verification before full extraction and extracted-file verification before database initialization or migrations. Never bypass a failed integrity check with an unverified package.

## Prepare and launch

1. Run the backend, frontend and disposable-MySQL checks. Commit the reviewed release, then run `node infra/ec2/package-release.mjs`. It refuses dirty source and builds live mode with same-origin `/api`.
2. Upload the generated `causeconnect-launch-*.zip` to the intended account's CloudShell and extract it into a fresh project folder. The kit contains the archive, `deployment.json`, `stack.json` and `prepare-change-set.py` together; none contains credentials.
3. From that folder, run `python3 prepare-change-set.py --expected-account ACCOUNT_ID --bucket EXISTING_PRIVATE_BUCKET --email OWNER_EMAIL --subnet PUBLIC_SUBNET_ID --image CANONICAL_AMI_ID`. It checks the account, credit reserve, official image, DNS and internet route, uploads the exact archive and prepares a CloudFormation CREATE change set. It never executes the change set. Inspect its resources before launch. IAM/public-access changes require the owner's action-time confirmation when operated through the browser.
4. After that confirmation, execute the change set. The server downloads the exact archive, checks its hash, installs its runtime and applies migrations. HTTP returns unavailable until HTTPS is activated. Do not share a stack's Website output as a ready URL yet.
5. Through Systems Manager, activate the free IP certificate using the installed host script after approval of the certificate subscriber agreement. Verify HTTPS, the renewal dry-run and reload hook. Create controlled test/admin accounts with fresh credentials; never run the demo seeder in AWS.
6. Verify the actual implemented flows against the cloud database before sharing the address. Missing business-profile, photo and other API groups remain separate work and must not be presented as complete.

## Release and recovery

The host scripts retain previous code releases, apply incremental migrations and keep database credentials outside the archive. The ordinary app database user has data permissions only; a separate migration account changes schema. A code rollback does not undo database migrations.

Local database backups protect against mistakes but not loss of the server/disk. Copy a verified encrypted recovery backup off the server before any destructive maintenance. Do not include real user data or credentials in GitHub or shared project notes.

Review hosting around 15 November 2026 after the mentor's assessment. The tag is a review date, not an automatic shutdown. Stopping the instance leaves disk and Elastic IP charges, approximately US$5.52 per 30 days at these rates. The template retains the server/disk, IP and management-access resources on stack deletion or rollback and enables instance termination protection. This preserves recovery access but also keeps charges running; deleting the stack is not cleanup. After a verified recovery backup and explicit retirement approval, remove termination protection, terminate the exact server, release its IP, delete its retained disk, and remove the now-unused dedicated security group, instance profile and role. Check for retained resources after a failed launch as well. Do not touch other projects or the existing sample preview.

## Release checks

- Valid HTTPS certificate with the correct IP address; HTTP exposes only ACME and HTTPS redirection.
- Direct page refresh, live-mode assets, API JSON errors and no sample role switcher.
- Registration validation, duplicate email, correct/incorrect login and logout invalidating the token.
- Text campaign submission, owner isolation, pending campaign privacy, admin approval/rejection, stale-write conflict and approved public visibility.
- MySQL and API unavailable publicly; IMDSv2 required; no demo accounts/default passwords.
- Restart persistence, bounded logs/backups and successful certificate renewal/reload.

### Core HTTP acceptance

`node infra/ec2/acceptance-live.mjs https://HOST` shows the plan without sending requests. After approving the exact live origin and temporary QA records, add `--allow-qa-writes --expected-commit FULL_COMMIT_SHA`. Do not run it against the sample CloudFront preview.

The script creates two temporary community accounts and one text-only pending campaign, checks login/errors/ownership/public privacy, then revokes its sessions. It generates passwords in memory and never prints them or tokens. Authentication checks are paced for the server's limits; allow about two minutes. Unconfirmed writes are never retried automatically.

The output contains a QA run identifier and fixture IDs for controlled follow-up. No approval/publication/deletion requests are sent, so records remain for admin readback and later cleanup. With the controlled admin account, check that this exact pending campaign appears in the queue/detail and has the expected owner. **Do not approve the QA campaign.** Admin approval/rejection/concurrency, actual browser journeys, restart persistence, certificate renewal and recovery still require their separate checks.

Sources: [AWS Sydney price list](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/ap-southeast-2/index.csv), [IPv4 pricing](https://aws.amazon.com/vpc/pricing/), [Budgets limits](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html), [IP certificates](https://letsencrypt.org/2026/03/11/shorter-certs-certbot).
