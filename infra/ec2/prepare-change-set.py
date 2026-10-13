#!/usr/bin/env python3
"""Upload an exact release and prepare, but never execute, its AWS change set."""
import argparse
import hashlib
import json
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

parser = argparse.ArgumentParser()
parser.add_argument('--expected-account', required=True)
parser.add_argument('--bucket', required=True)
parser.add_argument('--email', required=True)
parser.add_argument('--subnet', required=True)
parser.add_argument('--image', required=True)
parser.add_argument('--stack-name', default='causeconnect-assessment')
args = parser.parse_args()
region = 'ap-southeast-2'
base = Path(__file__).resolve().parent
release = json.loads((base / 'deployment.json').read_text())
archive = base / Path(release['archive']).name
if hashlib.sha256(archive.read_bytes()).hexdigest() != release['sha256']:
    raise SystemExit('Release hash mismatch; nothing uploaded.')
session = boto3.Session(region_name=region)
actual_account = session.client('sts').get_caller_identity()['Account']
if actual_account != args.expected_account:
    raise SystemExit('Wrong AWS account; nothing uploaded.')
plan = session.client('freetier', region_name='us-east-1').get_account_plan_state()
credits = plan.get('accountPlanRemainingCredits', {})
if credits.get('unit') != 'USD' or float(credits.get('amount', 0)) < 40:
    raise SystemExit('Remaining credits are below the preflight reserve; review billing first.')
ec2 = session.client('ec2')
subnet = ec2.describe_subnets(SubnetIds=[args.subnet])['Subnets'][0]
if subnet['State'] != 'available':
    raise SystemExit('Subnet is not available.')
vpc_id = subnet['VpcId']
for attribute in ['enableDnsSupport', 'enableDnsHostnames']:
    value = ec2.describe_vpc_attribute(VpcId=vpc_id, Attribute=attribute)
    if not value[attribute[0].upper() + attribute[1:]]['Value']:
        raise SystemExit(f'VPC {attribute} must be enabled; no settings changed.')
route_tables = ec2.describe_route_tables(Filters=[{'Name': 'vpc-id', 'Values': [vpc_id]}])['RouteTables']
explicit = [table for table in route_tables if any(a.get('SubnetId') == args.subnet for a in table['Associations'])]
selected = explicit or [table for table in route_tables if any(a.get('Main') for a in table['Associations'])]
gateways = ec2.describe_internet_gateways(Filters=[{'Name': 'attachment.vpc-id', 'Values': [vpc_id]}])['InternetGateways']
gateway_ids = {g['InternetGatewayId'] for g in gateways if any(a['VpcId'] == vpc_id and a['State'] == 'available' for a in g['Attachments'])}
if len(selected) != 1 or not any(r.get('DestinationCidrBlock') == '0.0.0.0/0' and r.get('State') == 'active' and r.get('GatewayId') in gateway_ids for r in selected[0]['Routes']):
    raise SystemExit('Subnet needs an active default route to its VPC internet gateway; nothing uploaded.')
image = ec2.describe_images(ImageIds=[args.image])['Images'][0]
if (image['OwnerId'] != '099720109477' or image['Architecture'] != 'x86_64'
        or not image['Name'].startswith('ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-')
        or image.get('ProductCodes') or image.get('RootDeviceName') != '/dev/sda1'):
    raise SystemExit('Image is not the approved free Canonical Ubuntu 24.04 image.')
template = (base / 'stack.json').read_text()
cfn = session.client('cloudformation')
cfn.validate_template(TemplateBody=template)
existing = ec2.describe_instances(Filters=[
    {'Name': 'tag:Name', 'Values': ['causeconnect-assessment']},
    {'Name': 'instance-state-name', 'Values': ['pending', 'running', 'stopping', 'stopped']},
])
if any(item['Instances'] for item in existing['Reservations']):
    raise SystemExit('CauseConnect instance already exists; use an incremental release, not another server.')
s3 = session.client('s3')
if s3.get_bucket_location(Bucket=args.bucket).get('LocationConstraint') != region:
    raise SystemExit('Release bucket is not in the approved Sydney region.')
key = release['key']
if not key.startswith('live-releases/') or '/' in key[len('live-releases/'):]:
    raise SystemExit('Invalid release key.')
try:
    previous = s3.head_object(Bucket=args.bucket, Key=key)
except ClientError as error:
    if error.response['ResponseMetadata']['HTTPStatusCode'] != 404:
        raise
else:
    if previous.get('Metadata', {}).get('sha256') != release['sha256']:
        raise SystemExit('Release key already contains different bytes; refusing overwrite.')
s3.upload_file(str(archive), args.bucket, key, ExtraArgs={
    'ServerSideEncryption': 'AES256', 'ContentType': 'application/gzip',
    'Metadata': {'sha256': release['sha256'], 'commit': release['commit']},
})
values = {
    'VpcId': subnet['VpcId'], 'SubnetId': args.subnet, 'ImageId': args.image,
    'ReleaseBucket': args.bucket, 'ReleaseKey': key, 'ReleaseSha256': release['sha256'],
    'ReleaseId': release['releaseId'], 'BudgetEmail': args.email,
}
change = cfn.create_change_set(
    StackName=args.stack_name, ChangeSetName=f"release-{release['releaseId']}",
    ChangeSetType='CREATE', TemplateBody=template, Capabilities=['CAPABILITY_IAM'],
    Parameters=[{'ParameterKey': k, 'ParameterValue': v} for k, v in values.items()],
    Tags=[{'Key': 'Project', 'Value': 'CauseConnect'}],
    Description='Prepared release; server/IAM/public-access creation still requires execution approval.',
)
print(json.dumps({'changeSet': change['Id'], 'stack': change['StackId'],
                  'commit': release['commit'], 'sha256': release['sha256'],
                  'credits': credits, 'executed': False}, indent=2))
print('Prepared only. No instance or IAM role was created. Inspect the change set before execution.')
