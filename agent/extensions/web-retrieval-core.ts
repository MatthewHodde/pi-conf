/**
 * web-retrieval-core.ts — pure retrieval logic behind fetch_content
 *
 * Deliberately narrower than the community providers it replaces:
 *
 * - no child_process, no browser automation, no cookie or credential access
 * - no API key and no model call; pure HTTP plus local HTML extraction
 * - no claim verification. Nothing here asserts that a claim is true.
 *
 * Kept free of Pi imports so it can be unit tested without the extension
 * host resolving @earendil-works/* packages.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_BYTES = 5_000_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 20_000;
export const DEFAULT_MAX_CHARS = 20_000;


/** Hostnames that must never be fetched regardless of DNS outcome. */
const BLOCKED_HOSTNAMES = new Set([
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
]);

/** True for any address that is not a routable public unicast address. */
export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateV4(ip);
  if (version === 6) return isPrivateV6(ip);
  return true;
}

function isPrivateV4(ip: string): boolean {
  const parts = ip.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0) return true; // "this" network
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 169 && b === 254) return true; // link-local, includes 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast and reserved
  return false;
}

function isPrivateV6(ip: string): boolean {
  const address = ip.toLowerCase().split("%")[0];
  if (address === "::" || address === "::1") return true;
  if (address.startsWith("fe80") || address.startsWith("fc") || address.startsWith("fd")) return true;
  // IPv4-mapped and IPv4-compatible forms carry a v4 address we must re-check.
  const mapped = /^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/.exec(address);
  if (mapped) return isPrivateV4(mapped[1]);
  return false;
}

/** Parse and syntax-check a URL. Does not resolve DNS. */
export function parsePublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Not a valid URL: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Only http and https are allowed, got ${url.protocol}`);
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) throw new Error(`URL has no hostname: ${raw}`);
  if (BLOCKED_HOSTNAMES.has(host)) {
    throw new Error(`Refusing to fetch cloud metadata host: ${host}`);
  }
  // URL keeps IPv6 literals bracketed, which isIP() does not accept.
  const bareHost = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (isIP(bareHost) && isPrivateAddress(bareHost)) {
    throw new Error(`Refusing to fetch non-public address: ${bareHost}`);
  }
  return url;
}

/** Parse, then resolve DNS and confirm every answer is publicly routable. */
export async function resolvePublicUrl(raw: string): Promise<URL> {
  const url = parsePublicUrl(raw);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const bareHost = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (isIP(bareHost)) return url;
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch (error) {
    throw new Error(`DNS lookup failed for ${host}: ${(error as Error).message}`);
  }
  if (addresses.length === 0) throw new Error(`DNS lookup returned no addresses for ${host}`);
  const blocked = addresses.filter((entry) => isPrivateAddress(entry.address));
  if (blocked.length > 0) {
    // Report the hostname, not the resolved address, to keep the tool output stable.
    throw new Error(
      `Refusing to fetch ${host}: DNS resolved to a non-public address. ` +
        `This blocks requests to loopback, private, link-local, and cloud metadata targets.`,
    );
  }
  return url;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
  "#x27": "'",
};

function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    const lower = entity.toLowerCase();
    if (ENTITIES[lower]) return ENTITIES[lower];
    if (lower.startsWith("#x")) {
      const code = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
    }
    if (lower.startsWith("#")) {
      const code = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
    }
    return match;
  });
}

/** Block-level tags become newlines so paragraphs stay separable. */
const BLOCK_TAGS = /<\/?(?:p|div|section|article|br|li|ul|ol|tr|table|h[1-6]|header|footer|blockquote|pre)[^>]*>/gi;

/**
 * Extract readable text from HTML without a parser dependency.
 * Deliberately lossy: the consumer is a language model, not a renderer.
 */
export function htmlToText(html: string): string {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim();
  const body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|head)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(BLOCK_TAGS, "\n")
    .replace(/<[^>]+>/g, " ");
  const text = decodeEntities(body)
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return title ? `${title}\n\n${text}` : text;
}

export function truncate(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(0, maxChars), truncated: true };
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Read a response body with a hard byte ceiling, aborting once exceeded. */
async function readCapped(response: Response): Promise<string> {
  const declared = Number.parseInt(response.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    throw new Error(`Response declares ${declared} bytes, over the ${MAX_BYTES} byte limit`);
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        throw new Error(`Response exceeded the ${MAX_BYTES} byte limit`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
}

export interface FetchResult {
  url: string;
  finalUrl: string;
  contentType: string;
  text: string;
  truncated: boolean;
  bytes: number;
}

/** Fetch one public URL, following at most MAX_REDIRECTS hops, re-validating each hop. */
export async function fetchReadableText(
  rawUrl: string,
  options: { maxChars?: number; fetchImpl?: FetchLike } = {},
): Promise<FetchResult> {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const doFetch = options.fetchImpl ?? ((input: string, init?: RequestInit) => fetch(input, init));
  let current = await resolvePublicUrl(rawUrl);
  let response: Response | undefined;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    response = await doFetch(current.href, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.5" },
    });
    const isRedirect = response.status >= 300 && response.status < 400;
    if (!isRedirect) break;
    const location = response.headers.get("location");
    if (!location) throw new Error(`Redirect from ${current.href} had no location header`);
    if (hop === MAX_REDIRECTS) {
      throw new Error(`Exceeded ${MAX_REDIRECTS} redirects starting at ${rawUrl}`);
    }
    // Resolve relative redirects, then re-run the full guard on the new target.
    current = await resolvePublicUrl(new URL(location, current).href);
  }

  if (!response) throw new Error(`No response for ${rawUrl}`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText} for ${current.href}`);
  }

  const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const body = await readCapped(response);
  const isHtml = contentType.includes("html") || (!contentType && /<\s*[a-z!]/i.test(body.slice(0, 512)));
  const text = isHtml ? htmlToText(body) : body;
  const capped = truncate(text, maxChars);

  return {
    url: rawUrl,
    finalUrl: current.href,
    contentType: contentType || "unknown",
    text: capped.text,
    truncated: capped.truncated,
    bytes: body.length,
  };
}

