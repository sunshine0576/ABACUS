/**
 * 一键运行全部测试。任一测试失败 → 整体 exit 1。
 * 默认跑：calc / display / script / integration。
 *   --quiet    仅输出标题与 PASS / FAIL，不打印各测试自身的统计输出
 */
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const TESTS = [
  { name: "calc-planner", file: "test-calc-planner.js" },
  { name: "display-planner", file: "test-display-planner.js" },
  { name: "script-builder", file: "test-script-builder.js" },
  { name: "integration", file: "test-integration.js" }
];

const args = new Set(process.argv.slice(2));
const quiet = args.has("--quiet") || args.has("-q");

let failures = 0;
const start = Date.now();

for (const t of TESTS) {
  const head = `── ${t.name} ──`;
  process.stdout.write(`\n${head}\n`);
  const res = spawnSync(process.execPath, [path.join(__dirname, t.file)], {
    stdio: quiet ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: "utf8"
  });
  if (res.status === 0) {
    if (quiet) process.stdout.write("(output suppressed)\n");
    process.stdout.write(`PASS ${t.name}\n`);
  } else {
    failures += 1;
    if (quiet) {
      process.stderr.write(res.stdout || "");
      process.stderr.write(res.stderr || "");
    }
    process.stdout.write(`FAIL ${t.name} (exit ${res.status})\n`);
  }
}

const elapsed = Date.now() - start;
process.stdout.write(`\n========================================\n`);
process.stdout.write(`Total: ${TESTS.length}, Failed: ${failures}, Elapsed: ${elapsed}ms\n`);
process.exit(failures === 0 ? 0 : 1);
