# Cloud deployment model

**Status:** Historical Stage 2 planning draft, retained as the original planning
record. It is not the current deployment instruction set. The selected live
single-server EC2 model, HTTPS, private API/MySQL, persistent images and backup
procedure are documented in [the EC2 guide](../../infra/ec2/README.md) and
[host package](../../infra/ec2/host/README.md). Use those references for Stage 3.

Meeting 1 recorded AWS as the initial cloud choice.

The Developer/Programmer role requires a cloud deployment model during Stage 2. Actual deployment is listed under Stage 3.

## Proposed IaaS direction

AWS EC2 is the current proposed IaaS option. It remains subject to team review and the required cloud-platform analysis.

## Proposed application parts

- React production build
- Web server for the frontend
- Node.js and Express API
- MySQL database
- Environment configuration
- Security-group and firewall rules
- HTTPS
- Logging and health checks
- Backup and recovery approach

## Decisions still required at the time of this draft

- Final AWS service and EC2 topology
- Whether the frontend and backend share an instance
- Where MySQL runs
- Process-management method
- Domain and HTTPS approach
- Backup procedure
- Rollback procedure
- Whether the mentor expects anything hosted during Stage 2

## Stage 2 output

Stage 2 should document the cloud options considered, selected model, reason for selection, proposed architecture, security considerations and estimated cost within the project's free-tool constraint.

## Stage 3 output

Stage 3 will record the actual deployment commands, configuration, verification, security settings, monitoring, backup and rollback procedure.

No passwords, SSH keys or live credentials should be stored in the repository.
