import re
import subprocess
import unittest
from pathlib import Path


HOST = Path(__file__).resolve().parents[1] / 'host'


class UploadHostTests(unittest.TestCase):
    def test_shell_scripts_parse(self):
        for name in ['configure-uploads.sh', 'update-host.sh', 'prune-images.sh', 'backup.sh', 'deploy.sh']:
            subprocess.run(['bash', '-n', str(HOST / name)], check=True, capture_output=True)

    def test_only_upload_directory_is_writable(self):
        service = (HOST / 'causeconnect.service').read_text()
        self.assertIn('ProtectSystem=strict', service)
        self.assertEqual(re.findall(r'^ReadWritePaths=(.+)$', service, re.M), ['/srv/causeconnect/shared/uploads'])
        self.assertIn('UMask=0077', service)
        configure = (HOST / 'configure-uploads.sh').read_text()
        self.assertIn('install -d -m 0700 -o causeconnect', configure)
        self.assertIn("'CAMPAIGN_UPLOAD_MAX_BYTES': '536870912'", configure)
        self.assertIn("'CAMPAIGN_UPLOAD_MIN_FREE_BYTES': '2147483648'", configure)
        self.assertIn('os.replace(temporary, path)', configure)
        self.assertIn('Existing upload directory differs', configure)

    def test_upload_limit_is_narrow_and_signed_urls_are_not_logged(self):
        nginx = (HOST / 'nginx-https.conf').read_text()
        self.assertIn('client_max_body_size 1m;', nginx)
        self.assertEqual(nginx.count('client_max_body_size 6m;'), 1)
        self.assertIn('zone=causeconnect_upload:1m rate=3r/m', nginx)
        self.assertIn('limit_req zone=causeconnect_upload burst=4 nodelay;', nginx)
        content = nginx.split('location ~* ^/api/campaign-images/ {', 1)[1].split('}', 1)[0]
        self.assertIn('access_log off;', content)
        self.assertIn('error_log /dev/null crit;', content)
        self.assertNotIn('alias ', content.replace('# No direct alias to uploads:', ''))
        log_format = next(line for line in nginx.splitlines() if line.startswith('log_format '))
        for private in ['$request ', '$request_uri', '$args', '$query_string', '$http_authorization', '$http_referer']:
            self.assertNotIn(private, log_format)

    def test_native_dependencies_checked_before_backup_and_migration(self):
        deploy = (HOST / 'deploy.sh').read_text()
        self.assertIn('npm ci --include=dev --include=optional --ignore-scripts', deploy)
        self.assertLess(deploy.index('check-images.cjs'), deploy.index('/opt/causeconnect-host/backup.sh'))
        self.assertLess(deploy.index('/opt/causeconnect-host/backup.sh'), deploy.index('db:migrate'))
        self.assertLess(deploy.index('verify-release.py'), deploy.index('configure-uploads.sh'))

    def test_backup_pairs_database_and_uploads_and_restores_service_on_failure(self):
        backup = (HOST / 'backup.sh').read_text()
        self.assertIn('trap finish_backup EXIT', backup)
        self.assertLess(backup.index('systemctl stop causeconnect.service'), backup.index('mysqldump --'))
        self.assertIn('-C "$backup_work" database.sql.gz -C /srv/causeconnect/shared uploads', backup)
        self.assertIn('systemctl start causeconnect.service', backup)
        self.assertIn('causeconnect-backup.lock', backup)
        self.assertIn('tail -n +8', backup)
        self.assertNotIn("-name 'causeconnect-*.sql.gz'", backup)

    def test_cleanup_is_bounded_and_runs_with_private_runtime_environment(self):
        runner = (HOST / 'prune-images.sh').read_text()
        self.assertIn('causeconnect-deploy.lock', runner)
        self.assertIn('causeconnect-backup.lock', runner)
        self.assertIn('--uid=causeconnect', runner)
        self.assertIn('EnvironmentFile=/etc/causeconnect/app.env', runner)
        self.assertIn('ReadWritePaths=/srv/causeconnect/shared/uploads', runner)
        self.assertIn('pruneExpiredImages(100)', (HOST / 'prune-images.cjs').read_text())
        self.assertIn('OnCalendar=hourly', (HOST / 'causeconnect-image-cleanup.timer').read_text())

    def test_existing_host_update_preserves_resource_and_release_guards(self):
        update = (HOST / 'update-host.sh').read_text()
        self.assertLess(update.index('verify-release.py --directory'), update.index('install -m 0755'))
        self.assertIn('Address or existing site shape differs', update)
        self.assertIn('if ! nginx -t;', update)
        for forbidden in ['apt-get', 'certbot ', 'create-admin.sh --', 'db:migrate', 'systemctl restart mysql', 'bootstrap.sh"']:
            self.assertNotIn(forbidden, update)

    def test_packager_explicitly_includes_only_the_image_maintenance_script(self):
        package = (HOST.parent / 'package-release.mjs').read_text()
        self.assertIn(r'scripts\/prune-campaign-images\.js$', package)
        self.assertNotIn(r'|scripts\/|', package)


if __name__ == '__main__':
    unittest.main()
