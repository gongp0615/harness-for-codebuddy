"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_SHELL_POLICY = {
  block: [
    { pattern: "git\\s+reset\\s+--hard", reason: "git reset --hard can discard local work." },
    { pattern: "git\\s+clean\\s+-fdx", reason: "git clean -fdx can delete untracked work." },
    { pattern: "rm\\s+-rf\\s+/(?:\\s|$)", reason: "root-level rm -rf is destructive." },
    { pattern: "mkfs\\.", reason: "filesystem formatting commands are blocked." },
    { pattern: "\\bdd\\s+if=", reason: "raw disk copy commands are blocked." },
    { pattern: "\\bdrop\\s+database\\b", reason: "destructive database commands are blocked." },
    { pattern: "\\btruncate\\s+table\\b", reason: "destructive database commands are blocked." }
  ],
  warn: [
    { pattern: "git\\s+push\\b", reason: "pushing changes has remote side effects." }
  ],
  approval: [
    { pattern: "npm\\s+publish\\b", reason: "package publishing requires explicit approval." },
    { pattern: "\\bdeploy\\b", reason: "production deployment requires explicit approval." },
    { pattern: "kubectl\\s+delete\\b", reason: "cluster deletion requires explicit approval." }
  ]
};

const DEFAULT_APPROVAL_POLICY = {
  require_approval: ["approval"]
};

const DEFAULT_FILE_SCOPE = {
  allowed_roots: ["."],
  blocked_roots: ["/etc", "/bin", "/sbin", "/usr", "/var", "/System", "C:\\Windows"]
};

function defaultProfile(profile = "generic") {
  if (profile === "node") {
    return [
      "name: default",
      "steps:",
      "  - name: test",
      "    command: npm test",
      "    required: true"
    ].join("\n");
  }
  return [
    "name: default",
    "steps: []"
  ].join("\n");
}

function fastProfile() {
  return [
    "name: fast",
    "steps: []"
  ].join("\n");
}

function ciProfile() {
  return [
    "name: ci",
    "steps:",
    "  - name: default",
    "    command: npm run harness -- verify --profile default --json",
    "    required: true"
  ].join("\n");
}

function ensureHarnessConfig(projectRoot, options = {}) {
  const profile = options.profile || "generic";
  writeIfMissing(path.join(projectRoot, "harness", "profiles", "default.yaml"), defaultProfile(profile));
  writeIfMissing(path.join(projectRoot, "harness", "profiles", "fast.yaml"), fastProfile());
  writeIfMissing(path.join(projectRoot, "harness", "profiles", "ci.yaml"), ciProfile());
  writeYamlObject(path.join(projectRoot, "harness", "policies", "shell-policy.yaml"), DEFAULT_SHELL_POLICY);
  writeYamlObject(path.join(projectRoot, "harness", "policies", "approval.yaml"), DEFAULT_APPROVAL_POLICY);
  writeYamlObject(path.join(projectRoot, "harness", "policies", "file-scope.yaml"), DEFAULT_FILE_SCOPE);
  writeIfMissing(path.join(projectRoot, "harness", "templates", "plan.md"), "# Plan\n\n## Task\n\n## Steps\n\n## Verification\n");
  writeIfMissing(path.join(projectRoot, "harness", "templates", "evidence.md"), "# Evidence\n\n## Verification\n\n## Risks\n");
  writeIfMissing(path.join(projectRoot, "harness", "templates", "risk.md"), "# Risks\n\n- None recorded.\n");
}

function writeIfMissing(filePath, content) {
  if (fs.existsSync(filePath)) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${content.trimEnd()}\n`);
}

function writeYamlObject(filePath, value) {
  if (fs.existsSync(filePath)) return;
  const lines = [];
  for (const [key, item] of Object.entries(value)) {
    if (Array.isArray(item)) {
      lines.push(`${key}:`);
      for (const entry of item) {
        if (typeof entry === "string") {
          lines.push(`  - ${entry}`);
        } else {
          const entries = Object.entries(entry);
          lines.push(`  - ${entries[0][0]}: ${quoteYaml(entries[0][1])}`);
          for (const [childKey, childValue] of entries.slice(1)) {
            lines.push(`    ${childKey}: ${quoteYaml(childValue)}`);
          }
        }
      }
    } else if (item && typeof item === "object") {
      lines.push(`${key}:`);
      for (const [childKey, childValue] of Object.entries(item)) {
        lines.push(`  ${childKey}: ${quoteYaml(childValue)}`);
      }
    } else {
      lines.push(`${key}: ${quoteYaml(item)}`);
    }
  }
  writeIfMissing(filePath, lines.join("\n"));
}

function quoteYaml(value) {
  const text = String(value);
  return /[:#{}\[\],&*?|\-<>=!%@`\\]/.test(text) ? JSON.stringify(text) : text;
}

module.exports = {
  DEFAULT_APPROVAL_POLICY,
  DEFAULT_FILE_SCOPE,
  DEFAULT_SHELL_POLICY,
  ensureHarnessConfig
};
