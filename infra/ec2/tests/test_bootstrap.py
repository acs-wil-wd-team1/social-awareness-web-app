"""Check the rendered cloud-init script and its SDK download without contacting AWS."""
import json
from pathlib import Path
import re
import subprocess
import sys
import types
import unittest
from unittest.mock import MagicMock, patch


class BootstrapTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        stack = json.loads((Path(__file__).parents[1] / 'stack.json').read_text())
        cls.script = stack['Resources']['Server']['Properties']['UserData']['Fn::Base64']['Fn::Sub']
        cls.values = {
            'ReleaseBucket': 'causeconnect-test-bucket',
            'ReleaseKey': 'live-releases/test-release.tar.gz',
            'AWS::Region': 'ap-southeast-2',
            'ReleaseSha256': 'a' * 64,
            'ReleaseId': 'test-release',
        }
        for name, value in cls.values.items():
            cls.script = cls.script.replace('${' + name + '}', value)

    def test_rendered_bootstrap_is_valid_bash(self):
        subprocess.run(['bash', '-n'], input=self.script, text=True, check=True)
        self.assertNotIn('${', self.script)

    def test_download_uses_exact_release_and_instance_credentials(self):
        source = re.search(r"python3 - .*<<'PY'\n(.*?)\nPY\n", self.script, re.S).group(1)
        sdk = types.ModuleType('boto3')
        sdk.client = MagicMock()
        arguments = ['-', self.values['ReleaseBucket'], self.values['ReleaseKey'], self.values['AWS::Region']]
        with patch.dict(sys.modules, {'boto3': sdk}), patch.object(sys, 'argv', arguments):
            exec(compile(source, '<cloud-init SDK download>', 'exec'), {})
        # No access key/secret or alternative bucket/prefix is supplied by bootstrap.
        sdk.client.assert_called_once_with('s3', region_name='ap-southeast-2')
        sdk.client.return_value.download_file.assert_called_once_with(
            'causeconnect-test-bucket', 'live-releases/test-release.tar.gz',
            '/opt/causeconnect/bootstrap/app.tar.gz',
        )

    def test_integrity_precedes_extraction_and_database(self):
        self.assertLess(self.script.index('sha256sum --check --status'), self.script.index('tar -xOf'))
        self.assertLess(self.script.index('--archive /opt/causeconnect/bootstrap/app.tar.gz'), self.script.index('tar -xzf'))
        self.assertLess(self.script.index('tar -xzf'), self.script.index('/host/bootstrap.sh'))
        deploy = (Path(__file__).parents[1] / 'host/deploy.sh').read_text()
        self.assertLess(deploy.index('verify-release.py'), deploy.index('/opt/causeconnect-host/init-database.sh'))


if __name__ == '__main__':
    unittest.main()
