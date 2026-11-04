import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, sep } from "node:path";
test("archived official skill files match the pinned manifest and stay outside automatic skill discovery", () => {
    const root = resolve("research/codex-skills/vendor"), manifest = JSON.parse(readFileSync("research/codex-skills/manifest.json", "utf8"));
    assert.match(manifest.revision, /^[a-f0-9]{40}$/);
    assert.equal(manifest.skills.length, 10);
    assert.ok(!root.startsWith(resolve(".agents/skills") + sep));
    const expected = new Set<string>();
    for (const skill of manifest.skills)
        for (const file of skill.files) {
            const path = resolve(root, skill.name, file.path);
            assert.ok(path.startsWith(root + sep));
            expected.add(path);
            assert.equal(createHash("sha256").update(readFileSync(path)).digest("hex"), file.sha256, `Pinned skill integrity changed: ${skill.name}/${file.path}`);
        }
    const files = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const path = resolve(directory, entry.name);
        assert.ok(!entry.isSymbolicLink(), "Archived skills must not contain symlinks");
        return entry.isDirectory() ? files(path) : [path];
    });
    assert.deepEqual(new Set(files(root)), expected, "Archived skill inventory must match the manifest");
    const active = readFileSync(".agents/skills/exter-kernel-task/SKILL.md", "utf8");
    assert.ok(active.length < 2200);
    assert.ok(readFileSync("AGENTS.md", "utf8").trim().split("\n").length < 120);
});
