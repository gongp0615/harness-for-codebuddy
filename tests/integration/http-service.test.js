"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { initProject } = require("../../scripts/harness-engine/state");
const { runProfile } = require("../../scripts/harness-engine/profile-runner");

function tempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "harness-integration-"));
}

test("docker-backed HTTP service is reachable", async () => {
  const baseUrl = process.env.HARNESS_INTEGRATION_BASE_URL;
  assert.match(baseUrl || "", /^http:\/\//);

  const response = await fetch(baseUrl);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(body, /Welcome to nginx!/i);
});

test("runProfile succeeds against a live docker-backed dependency", () => {
  const root = tempProject();
  const baseUrl = process.env.HARNESS_INTEGRATION_BASE_URL;
  assert.match(baseUrl || "", /^http:\/\//);

  initProject(root, { profile: "node" });
  fs.writeFileSync(
    path.join(root, "harness", "profiles", "default.yaml"),
    [
      "name: default",
      "steps:",
      "  - name: live-http-check",
      `    command: node -e \"fetch('${baseUrl}').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(2))\"`,
      "    required: true"
    ].join("\n")
  );

  const result = runProfile(root, { profile: "default" });

  assert.equal(result.ok, true);
  assert.equal(result.evidence.status, "VERIFIED");
  assert.equal(result.evidence.steps[0].name, "live-http-check");
  assert.equal(result.evidence.steps[0].exit_code, 0);
});
