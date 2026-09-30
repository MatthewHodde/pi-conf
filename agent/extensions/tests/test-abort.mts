import abortExtension from "../abort.ts";

type Notify = [string, string | undefined];
const registered: Record<string, any> = {};
const fakePi: any = { registerCommand: (name: string, opts: any) => (registered[name] = opts) };

abortExtension(fakePi);

let failed = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) console.log(`ok   ${name}`);
  else {
    failed++;
    console.log(`FAIL ${name}${got === undefined ? "" : ` got ${JSON.stringify(got)}`}`);
  }
}

function makeCtx(idle: boolean) {
  const notes: Notify[] = [];
  let aborted = 0;
  const ctx = {
    isIdle: () => idle,
    abort: () => aborted++,
    ui: { notify: (m: string, t?: string) => notes.push([m, t]) },
  };
  return { ctx, notes, aborts: () => aborted };
}

check("registers command", "abort" in registered);
check("has description", typeof registered.abort?.description === "string" && registered.abort.description.length > 0);
check("handler is async fn", typeof registered.abort?.handler === "function");

{
  const { ctx, notes, aborts } = makeCtx(true);
  await registered.abort.handler("", ctx);
  check("idle: no abort", aborts() === 0, aborts());
  check("idle: notify info", JSON.stringify(notes) === JSON.stringify([["Nothing running", "info"]]), notes);
}

{
  const { ctx, notes, aborts } = makeCtx(false);
  await registered.abort.handler("", ctx);
  check("running: abort called once", aborts() === 1, aborts());
  check("running: notify warning", JSON.stringify(notes) === JSON.stringify([["Aborted", "warning"]]), notes);
}

process.exit(failed ? 1 : 0);
