"""Opt-in syntax check in the already-installed Nginx container; no network."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

HOST = Path(__file__).resolve().parents[1] / 'host'


@unittest.skipUnless(os.environ.get('CAUSECONNECT_NGINX_CONTAINER_TEST') == '1', 'Opt-in disposable Nginx container check')
class NginxUploadRuntimeTests(unittest.TestCase):
    def test_nginx_accepts_upload_and_signed_content_configuration(self):
        with tempfile.TemporaryDirectory(prefix='causeconnect-nginx-test-') as temporary:
            base = Path(temporary)
            site = base / 'site.conf'
            site.write_text((HOST / 'nginx-https.conf').read_text().replace('__PUBLIC_IP__', '192.0.2.1'))
            cert = base / 'cert'
            cert.mkdir()
            subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=192.0.2.1', '-keyout', str(cert / 'privkey.pem'), '-out', str(cert / 'fullchain.pem')], check=True, capture_output=True)
            result = subprocess.run(['docker', 'run', '--rm', '--network', 'none',
                                     '-v', f'{site}:/etc/nginx/conf.d/default.conf:ro',
                                     '-v', f'{HOST / "nginx-proxy.conf"}:/etc/nginx/causeconnect-proxy.conf:ro',
                                     '-v', f'{cert}:/etc/letsencrypt/live/causeconnect-ip:ro',
                                     'nginx:1.27-alpine', 'nginx', '-t'], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == '__main__':
    unittest.main()
