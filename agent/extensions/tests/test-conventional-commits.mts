import { validate } from "../conventional-commits.ts";
const cases: [string,string][] = [
  ["clean subject only", "fix: stop push in sandbox"],
  ["good why body", "feat: add csv export\n\nLarge exports were unreadable uncompressed."],
  ["coauthor claude", "chore: update deps\n\nCo-Authored-By: Claude <noreply@anthropic.com>"],
  ["gpt mention", "refactor: swap lib\n\nZero API cost. Reviewed with GPT-5."],
  ["anthropic word", "docs: note\n\nPer Anthropic guidance we dropped it."],
  ["21 body lines", "feat: x\n\n" + Array.from({length:21},(_,i)=>"line "+i).join("\n")],
  ["20 body lines", "feat: x\n\n" + Array.from({length:20},(_,i)=>"line "+i).join("\n")],
  ["ai word in subject ok", "feat: add ai-assisted triage"],
  ["plain inventory", "chore: bump\n\n- a.ts changed\n- b.ts changed"],
  ["existing good commit", "feat(smolvm): block git push in sandbox, only host can push\n\nAgent inside smolvm sandbox should not push to git remotes.\nAdds tool-level blocker with tight regex and prompt instruction."],
];
for (const [n,m] of cases) console.log(n, "=>", JSON.stringify(validate(m)));
