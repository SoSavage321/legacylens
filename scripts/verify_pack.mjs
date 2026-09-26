// Usage: node scripts/verify_pack.mjs ../skateshop
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const repo = process.argv[2] ?? "../skateshop";
const dir = "onboarding-pack";
const need = {
    overview: ["meta", "repo", "oneLine", "stack", "entryPoints", "keyFacts"],
    architecture: ["meta", "layers", "edges", "mermaid"],
    workflows: ["meta", "workflows"],
    "reading-order": ["meta", "steps"],
    quiz: ["meta", "questions", "readiness"],
    tasks: ["meta", "candidates", "selectedId", "blastRadius"],
};
const problems = [];
const pack = {};
for (const [name, keys] of Object.entries(need)) {
    try { pack[name] = JSON.parse(readFileSync(join(dir, name + ".json"), "utf8")); }
    catch (e) { problems.push(`${name}.json: cannot parse (${e.message})`); continue; }
    for (const k of keys) if (!(k in pack[name])) problems.push(`${name}.json: missing key "${k}"`);
    if (pack[name].meta?.mock) problems.push(`${name}.json: still MOCK data`);
}
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }

const steps = new Set(pack["reading-order"].steps.map((s) => s.id));
for (const q of pack.quiz.questions) {
    if (!q.options.some((o) => o.id === q.answerId)) problems.push(`quiz ${q.id}: answerId not in options`);
    if (!steps.has(q.readingStepId)) problems.push(`quiz ${q.id}: readingStepId "${q.readingStepId}" not in reading-order`);
}
if (!pack.tasks.candidates.some((c) => c.id === pack.tasks.selectedId)) problems.push("tasks: selectedId not in candidates");

const commit = pack.overview.meta.repoCommit;
const refs = [];
const walk = (node, where) => {
    if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${where}[${i}]`));
    if (!node || typeof node !== "object") return;
    if (typeof node.path === "string") refs.push({ path: node.path, lines: node.lines, where });
    for (const k of ["paths", "files", "changedFiles"])
        if (Array.isArray(node[k])) node[k].forEach((p, i) => typeof p === "string" && refs.push({ path: p, where: `${where}.${k}[${i}]` }));
    for (const [k, v] of Object.entries(node)) walk(v, `${where}.${k}`);
};
for (const name of Object.keys(need)) walk(pack[name], name);

const failures = [];
for (const r of refs) {
    let text;
    try {
        text = execFileSync("git", ["-C", repo, "show", `${commit}:${r.path.replace(/\/$/, "")}`],
            { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 26 });
    } catch { failures.push({ ...r, reason: "not found at commit" }); continue; }
    if (r.lines) {
        const n = text.split("\n").length;
        const [a, b] = r.lines;
        if (!(a >= 1 && b >= a && b <= n)) failures.push({ ...r, reason: `lines ${a}-${b} outside 1-${n}` });
    }
}
const resolved = refs.length - failures.length;
writeFileSync(join(dir, "verification.json"), JSON.stringify(
    { checkedAt: new Date().toISOString(), repoCommit: commit, total: refs.length, resolved, failures, schemaProblems: problems }, null, 2) + "\n");
for (const f of failures) console.error(`FAIL ${f.where}: ${f.path} (${f.reason})`);
for (const p of problems) console.error(`SCHEMA ${p}`);
console.log(`Evidence verified: ${resolved}/${refs.length} references resolve (skateshop @ ${commit.slice(0, 7)})`);
process.exit(failures.length || problems.length ? 1 : 0);