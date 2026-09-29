import test from "node:test";
import assert from "node:assert/strict";
import { deriveBranchName, deriveSlug, SLUG_MAX_WORDS, SLUG_MAX_BYTES, BRANCH_MAX_BYTES } from "./branch-name.mjs";

test("derives the worked example from the spec", () => {
  assert.equal(
    deriveBranchName({ taskId: "PI-026", title: "Define and enforce worktree branch naming convention" }),
    "pi/PI-026-define-enforce-worktree-branch-naming",
  );
});

test("strips type/scope noise prefixes", () => {
  assert.equal(deriveBranchName({ taskId: "PI-024", title: "Dig: Status bar widgets not rendering" }), "pi/PI-024-status-bar-widgets-rendering");
  assert.equal(deriveBranchName({ taskId: "PI-001", title: "bug: crash on empty list" }), "pi/PI-001-crash-empty-list");
  assert.equal(deriveBranchName({ taskId: "PI-002", title: "[pi] add backlog extension" }), "pi/PI-002-add-backlog-extension");
});

test("removes URLs before slugging", () => {
  assert.equal(
    deriveBranchName({
      taskId: "PI-007",
      title: "explore adding https://ahmedelgabri.github.io/tmux-agent-panel/ to pi if it will still work when pi is run in a microvm",
    }),
    "pi/PI-007-explore-adding-tmux-agent-panel",
  );
  assert.equal(deriveBranchName({ taskId: "PI-008", title: "fix www.example.com redirect loop" }), "pi/PI-008-fix-redirect-loop");
});

test("falls back to wip when no task id is given", () => {
  assert.equal(deriveBranchName({ title: "scratch reproduction of dns flake" }), "pi/wip-scratch-reproduction-dns-flake");
});

test("does not pad short titles to the word cap", () => {
  assert.equal(deriveSlug("dns flake"), "dns-flake");
});

test("keeps the id case and never truncates it", () => {
  const name = deriveBranchName({ taskId: "PiAbC-123", title: "x" });
  assert.ok(name.startsWith("pi/PiAbC-123-"), name);
});

test("honours a custom prefix", () => {
  assert.equal(deriveBranchName({ taskId: "PI-026", title: "dns flake", prefix: "wip/bt/" }), "wip/bt/PI-026-dns-flake");
});

test("rejects a prefix that is not a valid git namespace", () => {
  assert.throws(() => deriveBranchName({ taskId: "PI-026", title: "x", prefix: "pi//" }), /branch prefix/);
  assert.throws(() => deriveBranchName({ taskId: "PI-026", title: "x", prefix: "" }), /branch prefix/);
});

test("truncates at the word cap", () => {
  const slug = deriveSlug("one two three four five six seven");
  assert.equal(slug, "one-two-three-four-five");
  assert.equal(slug.split("-").length, SLUG_MAX_WORDS);
});

test("truncates at the byte cap on a word boundary when possible", () => {
  const slug = deriveSlug("aaaaaaaaaa bbbbbbbbbb cccccccccc dddddddddd");
  assert.ok(Buffer.byteLength(slug) <= SLUG_MAX_BYTES, slug);
  assert.ok(!slug.endsWith("-"), slug);
  assert.equal(slug, "aaaaaaaaaa-bbbbbbbbbb-cccccccccc");
});

test("mid-word cut only when a single word exceeds the byte cap", () => {
  const slug = deriveSlug("z".repeat(60));
  assert.equal(slug.length, SLUG_MAX_BYTES);
  assert.equal(deriveBranchName({ taskId: "PI-026", title: "z".repeat(60) }), `pi/PI-026-${"z".repeat(SLUG_MAX_BYTES)}`);
});

test("empty or noise-only titles fall back to 'task'", () => {
  assert.equal(deriveSlug(""), "task");
  assert.equal(deriveSlug("https://example.com"), "task");
  assert.equal(deriveSlug("!!! ???"), "task");
  assert.equal(deriveBranchName({ taskId: "PI-026", title: "" }), "pi/PI-026-task");
});

test("strips leading and trailing separators and stop words", () => {
  const slug = deriveSlug("  --leading and trailing--  ");
  assert.equal(slug, "leading-trailing");
});

test("falls back to the raw words when every word is a stop word", () => {
  assert.equal(deriveSlug("it"), "it");
  assert.equal(deriveSlug("the and of"), "the-and-of");
});

test("total branch length stays within the cap, id preserved", () => {
  const longTitle = "supercalifragilistic ".repeat(6).trim();
  const name = deriveBranchName({ taskId: "PI-999", title: longTitle });
  assert.ok(Buffer.byteLength(name) <= BRANCH_MAX_BYTES, name);
  assert.ok(name.startsWith("pi/PI-999-"), name);
});

test("generated names are valid git refs", () => {
  const cases = [
    deriveBranchName({ taskId: "PI-026", title: "Define and enforce worktree branch naming convention" }),
    deriveBranchName({ title: "scratch reproduction of dns flake" }),
    deriveBranchName({ taskId: "PI-026", title: "z".repeat(60) }),
    deriveBranchName({ taskId: "PI-026", title: "50% done?! (really)" }),
  ];
  for (const name of cases) {
    assert.match(name, /^[A-Za-z0-9._\-/]+$/, name);
    assert.ok(!name.includes("//"), name);
    assert.ok(!name.endsWith(".") && !name.endsWith("/"), name);
  }
});
