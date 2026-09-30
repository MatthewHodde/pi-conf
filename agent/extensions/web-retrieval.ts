/**
 * web-retrieval.ts — registers the fetch_content and get_search_content tools
 *
 * Replaces the two retrieval tools that pi-subagents' researcher and
 * evidence-auditor profiles expect but that no installed package registers.
 * get_search_content replays or pages content this session already fetched,
 * so a follow-up read costs no second live request.
 *
 * Retrieval only. Neither tool judges whether content supports a claim.
 */

import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DEFAULT_MAX_CHARS, fetchReadableText, type FetchResult } from "./lib/web-retrieval-core.ts";

const CACHE_LIMIT = 20;

const fetchContentTool = defineTool({
  name: "fetch_content",
  label: "Fetch Content",
  description:
    "Retrieve one public http(s) URL and return its readable text. Use after web_search to read a " +
    "result beyond its snippet. Refuses loopback, private, link-local, and cloud metadata targets. " +
    "Returns text only; it does not judge whether the content supports any claim.",
  parameters: Type.Object({
    url: Type.String({ description: "Public http(s) URL to retrieve" }),
    maxChars: Type.Optional(
      Type.Number({ description: `Maximum characters to return (default ${DEFAULT_MAX_CHARS})` }),
    ),
  }),
  async execute(_toolCallId, params, signal) {
    const result = await fetchReadableText(params.url, { maxChars: params.maxChars });
    record(result);
    const header = [
      `URL: ${result.finalUrl}`,
      `Content-Type: ${result.contentType}`,
      `Bytes read: ${result.bytes}`,
      result.truncated ? `Truncated to ${result.text.length} characters.` : "",
    ]
      .filter(Boolean)
      .join("\n");
    return {
      content: [{ type: "text", text: `${header}\n\n${result.text}` }],
      details: {
        url: result.finalUrl,
        contentType: result.contentType,
        bytes: result.bytes,
        truncated: result.truncated,
      },
    };
  },
});

const getSearchContentTool = defineTool({
  name: "get_search_content",
  label: "Get Search Content",
  description:
    "Return fuller content for URLs, reusing anything this session already fetched so a repeat read " +
    "costs no new request. With no urls, page the session's retrieval history. This is retrieval " +
    "only: it never verifies a claim.",
  parameters: Type.Object({
    urls: Type.Optional(
      Type.Array(Type.String(), {
        description: "URLs to return content for. Omit to page retrieval history instead.",
        maxItems: 10,
      }),
    ),
    offset: Type.Optional(Type.Number({ description: "History offset for paging (default 0)" })),
    limit: Type.Optional(Type.Number({ description: "Max entries to return (default 5)" })),
  }),
  async execute(_toolCallId, params) {
    if (params.urls && params.urls.length > 0) {
      const sections: string[] = [];
      for (const url of params.urls) {
        const cached = cache.get(normalize(url));
        if (cached) {
          sections.push(formatCached(cached));
          continue;
        }
        try {
          const result = await fetchReadableText(url);
          record(result);
          sections.push(
            `URL: ${result.finalUrl}\nContent-Type: ${result.contentType}\n` +
              `Bytes read: ${result.bytes}${result.truncated ? "\n(truncated)" : ""}\n\n${result.text}`,
          );
        } catch (error) {
          sections.push(`URL: ${url}\nFAILED: ${(error as Error).message}`);
        }
      }
      return {
        content: [{ type: "text", text: sections.join("\n\n---\n\n") }],
        details: { requested: params.urls.length },
      };
    }

    const offset = Math.max(0, Math.trunc(params.offset ?? 0));
    const limit = Math.min(Math.max(1, Math.trunc(params.limit ?? 5)), CACHE_LIMIT);
    const page = history.slice(offset, offset + limit);
    if (page.length === 0) {
      return {
        content: [
          {
            type: "text",
            text:
              `No retrieved content in this session at offset ${offset}. ` +
              "Use web_search to find sources, then fetch_content to read one.",
          },
        ],
        details: { offset, returned: 0, total: history.length },
      };
    }
    const header =
      `Retrieval history ${offset}-${offset + page.length - 1} of ${history.length} ` +
      `(cached; pass urls to read full text).`;
    return {
      content: [
        {
          type: "text",
          text:
            `${header}\n\n` +
            page
              .map(
                (entry, index) =>
                  `${offset + index}. ${entry.url}\n   ${entry.contentType}, ${entry.text.length} chars, ${entry.fetchedAt}`,
              )
              .join("\n"),
        },
      ],
      details: { offset, returned: page.length, total: history.length },
    };
  },
});

// Session-scoped retrieval history. Lives for the process, never written to disk.
const cache = new Map<string, CacheEntry>();
const history: CacheEntry[] = [];

function normalize(url: string): string {
  try {
    return new URL(url).href;
  } catch {
    return url;
  }
}

function record(result: FetchResult): void {
  const entry: CacheEntry = {
    url: result.finalUrl,
    finalUrl: result.finalUrl,
    contentType: result.contentType,
    text: result.text,
    truncated: result.truncated,
    fetchedAt: new Date().toISOString(),
  };
  const key = normalize(result.finalUrl);
  if (!cache.has(key) && cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, entry);
  const existing = history.findIndex((item) => normalize(item.url) === key);
  if (existing >= 0) history.splice(existing, 1);
  history.push(entry);
}

function formatCached(entry: CacheEntry): string {
  return (
    `URL: ${entry.finalUrl} (cached ${entry.fetchedAt})\nContent-Type: ${entry.contentType}` +
    `${entry.truncated ? "\n(truncated)" : ""}\n\n${entry.text}`
  );
}

export default function (pi: ExtensionAPI) {
  pi.registerTool(fetchContentTool);
  pi.registerTool(getSearchContentTool);
}
