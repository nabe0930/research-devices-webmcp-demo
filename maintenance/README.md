# Ongoing security maintenance

## Run the checks

Use Node.js 22 or 24 from the repository root:

```sh
node --test maintenance/verify.test.mjs
node maintenance/verify.mjs
```

The application has no declared npm dependencies and these checks do not install
packages. The optional browser evaluation command in the historical package file
downloads an external evaluator; it is not run by this verification.

## Preserve the original evidence

The Challenge source at commit
`18dc41c222afc41d1cfb6230175bc6eac6fa279a` was sealed as an exact file set.
Its release manifests and deployment statements remain unchanged. The original
`npm run verify` command expects that sealed file set, so it must be run in the
snapshot prepared by the maintenance verifier, not at this expanded repository root.

The new verifier checks the historical manifest against a pinned SHA-256 and
requires the current historical files to match their recorded bytes. It allows
only the six explicitly named maintenance files alongside that source. It copies
the validated historical files from the current checkout into a temporary
directory, then runs the original source checks, 45 regression tests, build,
26-file distribution parity check, and final source check there. Temporary files
are removed when the process finishes. Existing root `dist`, `node_modules`, and
Git metadata are outside the source verification; only the newly built temporary
distribution is checked.

This arrangement supports adding governance and CI without changing an old
approval or pretending that a new commit was deployed in August. A future change
to application code requires a separately reviewed maintenance/release transition;
the historical hashes must not be silently replaced to make checks pass.

## Automated review

The workflow uses read-only repository permissions, full commit pins for its
Actions, no persisted checkout credentials, and a timeout. It runs on pull requests,
pushes to `main`, and manual dispatch. It has no deployment step and uses no project
credentials. A green run proves the checks for that run's commit and environment.
The workflow is not a required merge check until a repository rule is configured.

Dependabot proposes weekly updates to the GitHub Actions references. Each proposal
requires review and successful checks. There is no npm dependency-update target
because the application declares no dependencies. The external optional evaluator
and any separately vendored code need their own review when used or updated.

## Evidence to retain after each real change

- A concrete issue description, affected commit, scope, and reproduction.
- A focused change and a regression test when behavior changes.
- The resulting commit or PR and successful check-run links for the same commit.
- The actual release/deployment verification if a hosted service was changed.
- A public advisory only when a real vulnerability and coordinated disclosure warrant one.

Do not label planned checks as executed, local changes as published, or copied
internal code as independent third-party adoption. Maintainer work, external use,
CVE credit, and program acceptance are separate facts.
