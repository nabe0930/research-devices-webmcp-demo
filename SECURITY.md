# Security policy

## Maintainer and scope

Yu Nabeshima ([nabe0930](https://github.com/nabe0930)) maintains the public
Research-Devices WebMCP synthetic demo and its security checks in this repository.
This scope covers the demo source, its local preview server, build tools, and
repository verification. The dataset contains fictional examples.

Reports should identify the affected commit. The current `main` branch is the
maintenance baseline; older snapshots are not separate supported release lines.
The August 2026 Challenge integrity and deployment records describe that historical
release. They are not an attestation of a later deployment or a security certification.

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/nabe0930/research-devices-webmcp-demo/security/advisories/new).
Include the affected commit, a minimal reproduction using synthetic data, the
expected and observed behavior, and the impact and required access.

Do not put exploit details or sensitive information in public issues. Never include
credentials, personal information, or another person's data in a report. Use a
local copy for reproduction. This policy does not authorize testing infrastructure
or services operated by others.

This is an individually maintained project. There is no guaranteed response time
or paid bounty. Reports are assessed privately; any public advisory or attribution
will be coordinated with the reporter after impact and remediation are understood.

## Verification and limitations

Run `node maintenance/verify.mjs` and
`node --test maintenance/verify.test.mjs` from the repository root. See
[maintenance verification](maintenance/README.md) for the scope and evidence rules.
Passing automated checks is evidence of those checks only, not proof that the
software contains no vulnerabilities or that the hosted demo matches this checkout.
