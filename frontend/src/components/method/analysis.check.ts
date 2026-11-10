// Self-check: `npx esbuild src/components/method/analysis.check.ts --bundle --platform=node | node`
// The browser port must find the same key as the backend's frequency attack on every archive message
// (backend/test_algorithms.py: all 20 are recovered), and brute-force numbering must match 26 + 26² + ...
import msgs from "../../../../backend/app/data/messages.json";
import { bruteKey, bruteTotal, frequencyStory, ioc, lettersOf, shift } from "./analysis";

const fail = (m: string) => {
  throw new Error(m);
};
for (const m of msgs as { id: string; key: string; ciphertext: string; plaintext: string }[]) {
  const s = frequencyStory(m.ciphertext);
  if (s.key !== m.key) fail(`${m.id}: found ${s.key} (L=${s.L}), true key ${m.key}`);
  if (shift(lettersOf(m.plaintext), m.key, 1) !== s.cipher) fail(`${m.id}: letters-only Vigenère differs from the backend`);
}
if (bruteTotal(4) !== 475254) fail("cap 4 must be 475,254 keys");
const order = [[1, "A"], [26, "Z"], [27, "AA"], [702, "ZZ"], [703, "AAA"], [475254, "ZZZZ"]] as const;
for (const [n, k] of order) if (bruteKey(n) !== k) fail(`bruteKey(${n}) = ${bruteKey(n)}, want ${k}`);
if (Math.abs(ioc("AAAA") - 1) > 1e-9) fail("ioc");
console.log(`OK: frequency port matches the true key on ${msgs.length} messages; brute-force numbering`);
