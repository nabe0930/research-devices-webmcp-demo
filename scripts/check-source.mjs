import { readdir, readFile, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCandidateData } from "./validate-data.mjs";
import {
  sha256,
  validateIntegrityEnvelope,
  validateIntegrityManifest,
  validateVerifiedEvidenceCounts,
  validateVerifiedSourceTransition,
} from "./integrity.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const expectedPublicIdentity = Object.freeze({
  demoUrl: "https://research-devices-webmcp-demo.vercel.app/",
  repositoryUrl: "https://github.com/nabe0930/research-devices-webmcp-demo",
  copyrightHolder: "Research-Devices",
  copyrightYear: 2026,
});
const ccByLicenseUrl = "https://creativecommons.org/licenses/by/4.0/";
const textExtensions = new Set([".css", ".html", ".js", ".json", ".md", ".mjs"]);
const ignoredNames = new Set([".git", "dist", "node_modules"]);
const forbidden = [
  /research-devices\.com/i,
  /QuantStudio/i,
  /Thermo\s*Fisher/i,
  /Applied\s*Biosystems/i,
  /Bioanalyzer/i,
  /NanoDrop/i,
  /Agilent/i,
  /Illumina/i,
  /Bio-Rad/i,
  /Beckman/i,
  /Eppendorf/i,
  /QIAGEN/i,
  /\bRoche\b/i,
  /\bPubMed\b/i,
  /\bPMC\b/i,
  /\bNCBI\b/i,
  /catalog\.public\.json/i,
  /prices\.public\.json/i,
  /literature\.public\.json/i,
  /production_public_top_100_only/i,
  /public_top_100_signal/i,
  /manufacturer_list_price/i,
  /public_award_observation/i,
  /\/Users\//,
  /file:\/\//i,
  /safe-fix/i,
  /SAKURA_PASS/,
  /firebase/i,
  /localStorage\s*\./,
  /indexedDB\s*\./,
  /document\.cookie/,
  /\.innerHTML\b/,
  /\.outerHTML\b/,
  /insertAdjacentHTML/,
  /document\.write\s*\(/,
  /from\s+["']https?:\/\//,
];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function listFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignoredNames.has(entry.name) || entry.name.includes(".bak-")) continue;
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symbolic links are forbidden: ${relative(root, path)}`);
    if (entry.isDirectory()) files.push(...(await listFiles(path)));
    else if (entry.isFile()) files.push(path);
    else throw new Error(`Special files are forbidden: ${relative(root, path)}`);
  }
  return files;
}

const data = await validateCandidateData();
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const licensePath = resolve(root, "LICENSE");
let releaseManifest;
if (data.profile.licenseStatus === "pending_explicit_approval") {
  if (packageJson.license !== "UNLICENSED" || packageJson.private !== true) {
    throw new Error("The local review candidate must remain private and UNLICENSED.");
  }
  try {
    await stat(licensePath);
    throw new Error("LICENSE must remain absent until explicit publication approval.");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await validateIntegrityManifest({
    root,
    manifestPath: "review-manifest.json",
    expectedKind: "synthetic_local_review_candidate",
    expectedDatasetVersion: data.datasetVersion,
    expectedLicenseStatus: "pending_explicit_approval",
  });
} else if (data.profile.licenseStatus === "applied") {
  if (packageJson.license !== "MIT" || packageJson.private !== true) {
    throw new Error("The public release must remain private as an npm package and use MIT code licensing.");
  }
  releaseManifest = JSON.parse(await readFile(resolve(root, "release-manifest.json"), "utf8"));
  const demoUrl = new URL(releaseManifest.demoUrl);
  const repositoryUrl = new URL(releaseManifest.repositoryUrl);
  const repositoryParts = repositoryUrl.pathname.split("/").filter(Boolean);
  const baseManifestKeys = [
    "approvedReviewCandidateSha256",
    "artifactState",
    "codeLicense",
    "copyrightHolder",
    "copyrightYear",
    "dataLicense",
    "datasetVersion",
    "demoUrl",
    "liveVerification",
    "repositoryUrl",
    "schemaVersion",
  ];
  const isReadyState =
    releaseManifest.artifactState === "public_ready" &&
    releaseManifest.liveVerification === "not_performed" &&
    JSON.stringify(Object.keys(releaseManifest).sort()) ===
      JSON.stringify(baseManifestKeys.sort());
  const repositoryVerification = releaseManifest.repositoryVerification;
  const deploymentVerification = releaseManifest.deploymentVerification;
  const verifiedManifestKeys = [
    ...baseManifestKeys,
    "deploymentVerification",
    "finalizedFromReleaseSha256",
    "repositoryVerification",
  ];
  const repositoryVerificationKeys = ["candidateCommitSha", "filesMatched", "url", "verifiedAt"];
  const deploymentVerificationKeys = [
    "distSha256",
    "httpFilesMatched",
    "url",
    "verifiedAt",
    "webmcpDiscovered",
    "webmcpExecuted",
  ];
  const isCanonicalIso = (value) =>
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    new Date(value).toISOString() === value;
  const isVerifiedState =
    releaseManifest.artifactState === "public_verified" &&
    releaseManifest.liveVerification === "verified" &&
    JSON.stringify(Object.keys(releaseManifest).sort()) ===
      JSON.stringify(verifiedManifestKeys.sort()) &&
    /^[a-f0-9]{64}$/.test(releaseManifest.finalizedFromReleaseSha256 ?? "") &&
    repositoryVerification?.url === releaseManifest.repositoryUrl &&
    /^[a-f0-9]{40}$/.test(repositoryVerification?.candidateCommitSha ?? "") &&
    isCanonicalIso(repositoryVerification?.verifiedAt) &&
    Number.isInteger(repositoryVerification?.filesMatched) &&
    repositoryVerification.filesMatched > 0 &&
    JSON.stringify(Object.keys(repositoryVerification ?? {}).sort()) ===
      JSON.stringify(repositoryVerificationKeys.sort()) &&
    deploymentVerification?.url === releaseManifest.demoUrl &&
    /^[a-f0-9]{64}$/.test(deploymentVerification?.distSha256 ?? "") &&
    isCanonicalIso(deploymentVerification?.verifiedAt) &&
    deploymentVerification.verifiedAt === repositoryVerification.verifiedAt &&
    Number.isInteger(deploymentVerification?.httpFilesMatched) &&
    deploymentVerification.httpFilesMatched > 0 &&
    deploymentVerification?.webmcpDiscovered === 4 &&
    deploymentVerification?.webmcpExecuted === 4 &&
    JSON.stringify(Object.keys(deploymentVerification ?? {}).sort()) ===
      JSON.stringify(deploymentVerificationKeys.sort());
  if (
    releaseManifest.schemaVersion !== 1 ||
    (!isReadyState && !isVerifiedState) ||
    releaseManifest.datasetVersion !== data.datasetVersion ||
    releaseManifest.codeLicense !== "MIT" ||
    releaseManifest.dataLicense !== "CC-BY-4.0" ||
    releaseManifest.demoUrl !== expectedPublicIdentity.demoUrl ||
    releaseManifest.repositoryUrl !== expectedPublicIdentity.repositoryUrl ||
    releaseManifest.copyrightHolder !== expectedPublicIdentity.copyrightHolder ||
    releaseManifest.copyrightYear !== expectedPublicIdentity.copyrightYear ||
    !/^[a-f0-9]{64}$/.test(releaseManifest.approvedReviewCandidateSha256 ?? "") ||
    !Number.isInteger(releaseManifest.copyrightYear) ||
    typeof releaseManifest.copyrightHolder !== "string" ||
    !/^[\p{L}\p{N}][\p{L}\p{N} .()'&-]{0,99}$/u.test(releaseManifest.copyrightHolder) ||
    demoUrl.protocol !== "https:" ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$/.test(demoUrl.hostname) ||
    demoUrl.port ||
    demoUrl.pathname !== "/" ||
    demoUrl.username ||
    demoUrl.password ||
    demoUrl.search ||
    demoUrl.hash ||
    repositoryUrl.protocol !== "https:" ||
    repositoryUrl.hostname !== "github.com" ||
    repositoryUrl.port ||
    repositoryParts.length !== 2 ||
    !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(repositoryParts[0]) ||
    !/^(?!\.{1,2}$)[A-Za-z0-9._-]{1,100}$/.test(repositoryParts[1]) ||
    repositoryUrl.username ||
    repositoryUrl.password ||
    repositoryUrl.search ||
    repositoryUrl.hash
  ) {
    throw new Error("The public release manifest is invalid.");
  }
  const expectedLicense = `MIT License

Copyright (c) ${releaseManifest.copyrightYear} ${releaseManifest.copyrightHolder}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
  const licenseText = await readFile(licensePath, "utf8");
  if (licenseText !== expectedLicense) {
    throw new Error("The public release has a non-canonical MIT LICENSE file.");
  }
  const approvedReview = JSON.parse(
    await readFile(resolve(root, "approved-review-manifest.json"), "utf8"),
  );
  validateIntegrityEnvelope({
    manifest: approvedReview,
    expectedKind: "synthetic_local_review_candidate",
    expectedDatasetVersion: data.datasetVersion,
    expectedLicenseStatus: "pending_explicit_approval",
    label: "approved review manifest",
  });
  if (
    approvedReview.approvalSha256 !== releaseManifest.approvedReviewCandidateSha256
  ) {
    throw new Error("The approved review manifest does not match the release manifest.");
  }
  const releaseIntegrity = await validateIntegrityManifest({
    root,
    manifestPath: "release-integrity-manifest.json",
    expectedKind: isVerifiedState
      ? "synthetic_public_verified_candidate"
      : "synthetic_public_release_candidate",
    expectedDatasetVersion: data.datasetVersion,
    expectedLicenseStatus: "applied",
    // A public Git clone intentionally omits generated dist/. `npm run verify`
    // rebuilds it and runs this check again, while any existing dist remains
    // subject to the sealed byte-for-byte integrity check here.
    allowMissingDist: true,
  });
  if (isVerifiedState) {
    const approvedReleaseBytes = await readFile(
      resolve(root, "approved-release-integrity-manifest.json"),
    );
    const approvedRelease = JSON.parse(approvedReleaseBytes.toString("utf8"));
    validateIntegrityEnvelope({
      manifest: approvedRelease,
      expectedKind: "synthetic_public_release_candidate",
      expectedDatasetVersion: data.datasetVersion,
      expectedLicenseStatus: "applied",
      label: "approved public-release integrity manifest",
    });
    validateVerifiedEvidenceCounts({
      approvedRelease,
      repositoryVerification,
      deploymentVerification,
    });
    validateVerifiedSourceTransition({
      approvedRelease,
      verifiedRelease: releaseIntegrity,
      approvedReleaseIntegrityRecord: {
        path: "approved-release-integrity-manifest.json",
        bytes: approvedReleaseBytes.byteLength,
        sha256: sha256(approvedReleaseBytes),
      },
    });
    if (
      approvedRelease.approvalSha256 !== releaseManifest.finalizedFromReleaseSha256 ||
      approvedRelease.distSha256 !== deploymentVerification.distSha256 ||
      approvedRelease.distFileCount !== deploymentVerification.httpFilesMatched ||
      deploymentVerification.distSha256 !== releaseIntegrity.distSha256 ||
      deploymentVerification.httpFilesMatched !== releaseIntegrity.distFileCount
    ) {
      throw new Error("Verified release evidence does not match the approved and finalized integrity manifests.");
    }
  }
} else {
  throw new Error("Unsupported license state.");
}

for (const path of await listFiles(root)) {
  if (!textExtensions.has(extname(path))) continue;
  if (relative(root, path) === "scripts/check-source.mjs") continue;
  const text = await readFile(path, "utf8");
  for (const pattern of forbidden) {
    if (pattern.test(text)) {
      throw new Error(`Forbidden content ${pattern} in ${relative(root, path)}.`);
    }
  }
  if (path.endsWith(".html") && /\{\{[A-Z0-9_]+\}\}/.test(text)) {
    throw new Error(`Unresolved template placeholder in ${relative(root, path)}.`);
  }
  if (releaseManifest) {
    const name = relative(root, path);
    const publicReleaseText =
      name === "README.md" ||
      name === "DATA-NOTICE.md" ||
      name === "docs/TESTING.md" ||
      name.endsWith(".html") ||
      name.startsWith("data/");
    if (
      publicReleaseText &&
      /pending explicit approval|明示承認待ち|not yet licensed|Public repository creation is pending|release review|local review candidate|pre-publication candidate|after explicit approval|intended license|intended for release|generated review candidate|UNLICENSED|公開を想定|公開することを想定|想定しています|\[LIVE_DEMO_URL\]|\[PUBLIC_REPOSITORY_URL\]/i.test(text)
    ) {
      throw new Error(`Public release text still contains a pending-review marker: ${name}.`);
    }
  }
}

if (releaseManifest) {
  const readme = await readFile(resolve(root, "README.md"), "utf8");
  const testing = await readFile(resolve(root, "docs", "TESTING.md"), "utf8");
  const notice = await readFile(resolve(root, "DATA-NOTICE.md"), "utf8");
  const noticeHtml = await readFile(resolve(root, "data-notice/index.html"), "utf8");
  const copyright = `© ${releaseManifest.copyrightYear} ${releaseManifest.copyrightHolder}`;
  const htmlCopyright = `© ${releaseManifest.copyrightYear} ${escapeHtml(releaseManifest.copyrightHolder)}`;
  if (!readme.includes(releaseManifest.demoUrl) || !readme.includes(releaseManifest.repositoryUrl)) {
    throw new Error("README does not contain the approved public URLs.");
  }
  if (!testing.includes(releaseManifest.demoUrl) || !testing.includes(releaseManifest.repositoryUrl)) {
    throw new Error("Testing instructions do not contain the approved public URLs.");
  }
  if (!notice.includes(copyright) || !noticeHtml.includes(htmlCopyright)) {
    throw new Error("Synthetic data notices do not match the approved copyright holder and year.");
  }
  if (!notice.includes(ccByLicenseUrl) || !noticeHtml.includes(ccByLicenseUrl)) {
    throw new Error("Synthetic data notices do not link to the canonical CC BY 4.0 terms.");
  }
  if (
    releaseManifest.artifactState === "public_verified" &&
    /Planned live|Planned public|not yet verified|has not been published|not_performed|\[LIVE_DEMO_URL\]|\[PUBLIC_REPOSITORY_URL\]/i.test(
      `${readme}\n${testing}\n${notice}`,
    )
  ) {
    throw new Error("Verified public documentation still contains an unverified-release marker.");
  }
}

console.log("synthetic candidate source: PASS");
