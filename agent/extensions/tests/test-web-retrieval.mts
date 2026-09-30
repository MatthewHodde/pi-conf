import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fetchReadableText,
  htmlToText,
  isPrivateAddress,
  parsePublicUrl,
  resolvePublicUrl,
  truncate,
} from "../lib/web-retrieval-core.ts";

test("isPrivateAddress covers loopback, private, link-local, and metadata", () => {
  for (const blocked of [
    "127.0.0.1",
    "127.1.2.3",
    "10.0.0.5",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // cloud metadata
    "100.64.0.1", // CGNAT
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "fe80::1",
    "fd00::1",
    "::ffff:127.0.0.1",
    "::ffff:169.254.169.254",
    "not-an-ip",
  ]) {
    assert.equal(isPrivateAddress(blocked), true, `${blocked} must be private`);
  }
});

test("isPrivateAddress allows routable public addresses", () => {
  for (const allowed of ["1.1.1.1", "8.8.8.8", "93.184.216.34", "172.32.0.1", "2606:4700::1111"]) {
    assert.equal(isPrivateAddress(allowed), false, `${allowed} must be public`);
  }
});

test("parsePublicUrl rejects non-http schemes", () => {
  for (const raw of ["file:///etc/passwd", "ftp://example.com", "gopher://example.com", "data:text/html,x"]) {
    assert.throws(() => parsePublicUrl(raw), /Only http and https/);
  }
});

test("parsePublicUrl rejects literal private targets and metadata hostnames", () => {
  assert.throws(() => parsePublicUrl("http://127.0.0.1:8080/admin"), /non-public address/);
  assert.throws(() => parsePublicUrl("http://169.254.169.254/latest/meta-data/"), /non-public address/);
  assert.throws(() => parsePublicUrl("http://[::1]/"), /non-public address/);
  assert.throws(() => parsePublicUrl("http://metadata.google.internal/"), /cloud metadata host/);
});

test("resolvePublicUrl rejects a public hostname that resolves inward", async () => {
  // localhost resolves to loopback, so the DNS step must catch what the syntax check cannot.
  await assert.rejects(() => resolvePublicUrl("http://localhost:3000/"), /non-public address/);
});

test("htmlToText drops script and style, keeps text, decodes entities", () => {
  const html = `<html><head><title>Doc Title</title><style>.a{color:red}</style></head>
    <body><script>alert('x')</script><h1>Heading</h1><p>Hello &amp; welcome</p>
    <p>Second&nbsp;para</p></body></html>`;
  const text = htmlToText(html);
  assert.match(text, /^Doc Title/);
  assert.match(text, /Heading/);
  assert.match(text, /Hello & welcome/);
  assert.match(text, /Second para/);
  assert.doesNotMatch(text, /alert/);
  assert.doesNotMatch(text, /color:red/);
});

test("truncate caps length and reports it", () => {
  assert.deepEqual(truncate("short", 100), { text: "short", truncated: false });
  const capped = truncate("x".repeat(50), 10);
  assert.equal(capped.text.length, 10);
  assert.equal(capped.truncated, true);
});

test("fetchReadableText extracts readable text from a live public page", async () => {
  const result = await fetchReadableText("https://example.com/", { maxChars: 4000 });
  assert.equal(result.finalUrl, "https://example.com/");
  assert.match(result.contentType, /text\/html/);
  assert.ok(result.bytes > 0);
  assert.match(result.text, /Example Domain/i);
  assert.equal(result.truncated, false);
});

test("fetchReadableText surfaces HTTP errors instead of returning a body", async () => {
  await assert.rejects(
    () => fetchReadableText("https://example.com/definitely-not-a-real-path-404"),
    /HTTP 404/,
  );
});

// Cap tests use an injected transport: the SSRF guard blocks a local test
// server, and weakening it to allow one would defeat the point of the guard.
function stubFetch(handler: (url: string, hop: number) => Response) {
  const seen: string[] = [];
  const impl = async (url: string) => {
    seen.push(url);
    return handler(url, seen.length - 1);
  };
  return { impl, seen };
}

test("redirect chain is capped at MAX_REDIRECTS hops", async () => {
  const { impl, seen } = stubFetch((_url, hop) =>
    new Response(null, { status: 302, headers: { location: `https://example.com/hop${hop + 1}` } }),
  );
  await assert.rejects(
    () => fetchReadableText("https://example.com/start", { fetchImpl: impl }),
    /Exceeded 3 redirects/,
  );
  assert.equal(seen.length, 4, "initial request plus three redirect hops");
});

test("redirect to a blocked target is refused, not followed", async () => {
  const { impl, seen } = stubFetch(() =>
    new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } }),
  );
  await assert.rejects(
    () => fetchReadableText("https://example.com/start", { fetchImpl: impl }),
    /non-public address/,
  );
  assert.equal(seen.length, 1, "must not issue a request to the redirect target");
});

test("oversized content-length is refused before the body is read", async () => {
  const { impl } = stubFetch(
    () => new Response("small", { status: 200, headers: { "content-length": "9000000" } }),
  );
  await assert.rejects(
    () => fetchReadableText("https://example.com/big", { fetchImpl: impl }),
    /over the 5000000 byte limit/,
  );
});

test("body streaming past the byte ceiling aborts the read", async () => {
  const chunk = new Uint8Array(1_000_000);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < 8; i++) controller.enqueue(chunk);
      controller.close();
    },
  });
  const { impl } = stubFetch(() => new Response(stream, { status: 200 }));
  await assert.rejects(() => fetchReadableText("https://example.com/huge", { fetchImpl: impl }), /exceeded the 5000000 byte limit/);
});

test("non-HTML content is returned as-is rather than run through the HTML extractor", async () => {
  const { impl } = stubFetch(
    () => new Response('{"answer":42}', { status: 200, headers: { "content-type": "application/json" } }),
  );
  const result = await fetchReadableText("https://example.com/data.json", { fetchImpl: impl });
  assert.equal(result.contentType, "application/json");
  assert.match(result.text, /"answer":42/);
});

// Pi loads every direct extensions/*.ts file as an extension, and fails the
// whole load for a file without a default factory. Keep helper modules out of
// the top level, and catch it here if one gets moved back.
test("no top-level extension file lacks a default factory export", async () => {
  const { readdir, readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const path = await import("node:path");
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const offenders: string[] = [];
  for (const name of await readdir(dir)) {
    if (!name.endsWith(".ts")) continue;
    const source = await readFile(path.join(dir, name), "utf8");
    if (!/export\s+default\s+function/.test(source)) offenders.push(name);
  }
  assert.deepEqual(offenders, [], `move these out of extensions/ or add a default export: ${offenders.join(", ")}`);
});
