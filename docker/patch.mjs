// Self-host patches for dubinc/dub (pinned commit). Each patch must match exactly once,
// otherwise the build fails loudly (so an upstream change can't silently break routing/auth).
import fs from "node:fs";

const APP = process.env.APP_HOST;     // e.g. qr.stoneandcole.com
const SHORT = process.env.SHORT_HOST; // e.g. go.stoneandcole.com
if (!APP || !SHORT) throw new Error("APP_HOST and SHORT_HOST are required");

function patch(file, find, replace) {
  const src = fs.readFileSync(file, "utf8");
  const isRe = find instanceof RegExp;
  const count = isRe ? (src.match(new RegExp(find.source, "g")) || []).length : src.split(find).length - 1;
  if (count !== 1) throw new Error(`patch ${file}: expected 1 match, got ${count} for ${String(find).slice(0, 80)}`);
  fs.writeFileSync(file, src.replace(find, replace));
  console.log("patched", file);
}

// 1. Domains: our app host + short domain instead of dub.co / dub.sh
{
  const f = "packages/utils/src/constants/main.ts";
  const src = fs.readFileSync(f, "utf8");
  const i = src.indexOf("export const DUB_LOGO =");
  if (i < 0) throw new Error("main.ts anchor missing");
  // Guard: the block we overwrite (everything before DUB_LOGO) may only export the known names.
  const EXPECTED = ["SHORT_DOMAIN","API_HOSTNAMES","API_DOMAIN","APP_DOMAIN","APP_DOMAIN_WITH_NGROK","isAppHostname"];
  const found = [...src.slice(0, i).matchAll(/^export\s+(?:const|let|var|function|class|type|interface|enum)\s+([A-Za-z0-9_$]+)/gm)].map((m) => m[1]);
  const unexpected = found.filter((n) => !EXPECTED.includes(n));
  const missing = EXPECTED.filter((n) => !found.includes(n));
  const otherExports = (src.slice(0, i).match(/^export\b/gm) || []).length !== found.length;
  if (unexpected.length || missing.length || otherExports)
    throw new Error(`main.ts: replaced block changed upstream (unexpected: [${unexpected}], missing: [${missing}], unparsed export forms: ${otherExports}). Review before patching.`);
  const head = `export const SHORT_DOMAIN = "${SHORT}";

export const API_HOSTNAMES = new Set(["api.${APP}", "api.localhost:8888", "api.localhost"]);

export const API_DOMAIN = "https://${APP}/api";

export const APP_DOMAIN = "https://${APP}";

export const APP_DOMAIN_WITH_NGROK = "https://${APP}";

export const isAppHostname = (hostname: string) => {
  return new Set(["${APP}", "localhost:8888", "localhost"]).has(hostname);
};

`;
  if (!src.slice(0, i).includes("isAppHostname")) throw new Error("main.ts layout changed");
  fs.writeFileSync(f, head + src.slice(i));
  console.log("patched", f);
}

// 2. Auth cookie: use __Secure- cookie whenever NEXTAUTH_URL is https (fixes login loop off Vercel)
patch("apps/web/lib/auth/options.ts",
  "const VERCEL_DEPLOYMENT = !!process.env.VERCEL_URL;",
  'const VERCEL_DEPLOYMENT = !!process.env.VERCEL_URL;\nconst USE_SECURE_COOKIES = VERCEL_DEPLOYMENT || (process.env.NEXTAUTH_URL ?? "").startsWith("https://");');
patch("apps/web/lib/auth/options.ts",
  '`${VERCEL_DEPLOYMENT ? "__Secure-" : ""}next-auth.session-token`',
  '`${USE_SECURE_COOKIES ? "__Secure-" : ""}next-auth.session-token`');
patch("apps/web/lib/auth/options.ts", "secure: VERCEL_DEPLOYMENT,", "secure: USE_SECURE_COOKIES,");

// 3. Tinybird optional: no-op client + skip click ingestion when no key (click counts still go to MySQL via Redis streams)
fs.writeFileSync("apps/web/lib/tinybird/client.ts", `import { NoopTinybird, Tinybird } from "@chronark/zod-bird";

export const tb = process.env.TINYBIRD_API_KEY
  ? new Tinybird({
      token: process.env.TINYBIRD_API_KEY as string,
      baseUrl: process.env.TINYBIRD_API_URL as string,
    })
  : new NoopTinybird();
`);
console.log("patched apps/web/lib/tinybird/client.ts");
patch("apps/web/lib/tinybird/record-click.ts",
  /fetchWithRetry\(\s*`\$\{process\.env\.TINYBIRD_API_URL\}\/v0\/events\?name=dub_click_events/,
  '(process.env.TINYBIRD_API_KEY ? fetchWithRetry : async (..._args: any[]) => new Response("{}"))(\n          `${process.env.TINYBIRD_API_URL}/v0/events?name=dub_click_events');

// 4. Real visitor IP behind Cloudflare tunnel (for click de-duplication)
patch("apps/web/lib/middleware/utils/get-identity-hash.ts",
  "const ip = ipAddress(req) || LOCALHOST_IP;",
  'const ip = req.headers.get("cf-connecting-ip") || ipAddress(req) || LOCALHOST_IP;');

// 5. Cron endpoints: always require Bearer CRON_SECRET; fail closed (500) if it is unset.
// Upstream skips all checks off Vercel. Only skip in local development.
patch("apps/web/lib/cron/verify-vercel.ts",
  'if (process.env.VERCEL !== "1") {',
  'if (process.env.NODE_ENV === "development") {');

// 6. Domains: no Vercel domain API; treat custom domains as configured (DNS is managed in Cloudflare)
patch("apps/web/lib/api/domains/utils.ts",
  'return ["go.zillow.com"].includes(domain);',
  'return process.env.VERCEL !== "1" || ["go.zillow.com"].includes(domain);');

// 7. next.config: don't redirect /api on non-dub.co hosts; skip lint during build (TS checks stay on)
patch("apps/web/next.config.js", 'value: ".*(\\\\.dub\\\\.co|localhost)",', 'value: ".*",');
// TypeScript checking stays ON (no ignoreBuildErrors). Only lint is skipped; known upstream TS noise is
// filtered in typecheck.mjs (allowlist), which fails on any other error.
patch("apps/web/next.config.js", "reactStrictMode: false,",
  "reactStrictMode: false,\n  eslint: { ignoreDuringBuilds: true },");

// 8. Login page: email + password only (no Google/GitHub/SAML apps configured)
patch("apps/web/app/app.dub.co/(auth-marketing)/login/page.tsx", "<LoginForm />", '<LoginForm methods={["email"]} />');

console.log("all patches applied");
