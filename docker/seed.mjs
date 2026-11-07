// Idempotent first-run seed: admin user (password login), workspace with high limits, short domain.
// Runs after every deploy; values come from Coolify env vars only.
import crypto from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const email = process.env.DUB_ADMIN_EMAIL;
const password = process.env.DUB_ADMIN_PASSWORD;
const slug = process.env.DUB_WORKSPACE_SLUG || "stoneandcole";
const short = process.env.DUB_SHORT_DOMAIN;
if (!email || !password) {
  console.log("seed: DUB_ADMIN_EMAIL / DUB_ADMIN_PASSWORD not set, skipping");
  process.exit(0);
}

const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const rid = (prefix) => {
  let s = "";
  for (const b of crypto.randomBytes(26)) s += B32[b % 32];
  if (s[0] === "C") s = "D" + s.slice(1); // upstream guards against "ws_c..."
  return prefix + s;
};

const p = new PrismaClient();
const passwordHash = await bcrypt.hash(password, 12);

let user = await p.user.findUnique({ where: { email } });
if (!user) {
  user = await p.user.create({
    data: { id: rid("user_"), email, name: process.env.DUB_ADMIN_NAME || "Admin", emailVerified: new Date(), passwordHash, defaultWorkspace: slug },
  });
} else {
  await p.user.update({
    where: { id: user.id },
    data: { passwordHash, emailVerified: user.emailVerified ?? new Date(), invalidLoginAttempts: 0, lockedAt: null },
  });
}

const limits = { plan: "business", linksLimit: 1000000, usageLimit: 100000000, domainsLimit: 100, tagsLimit: 1000, foldersLimit: 100, usersLimit: 20 };
let ws = await p.project.findUnique({ where: { slug } });
if (!ws) {
  ws = await p.project.create({
    data: {
      id: rid("ws_"), name: process.env.DUB_WORKSPACE_NAME || "Stone & Cole", slug,
      billingCycleStart: new Date().getDate(), inviteCode: crypto.randomBytes(12).toString("hex"), ...limits,
    },
  });
} else {
  await p.project.update({ where: { id: ws.id }, data: limits });
}

if (!(await p.projectUsers.findFirst({ where: { userId: user.id, projectId: ws.id } }))) {
  await p.projectUsers.create({ data: { userId: user.id, projectId: ws.id, role: "owner" } });
}

// hide dub.sh / chatg.pt / etc. (they don't exist on this instance)
const off = { dubsh: false, chatgpt: false, sptifi: false, gitnew: false, callink: false, amznid: false, ggllink: false, figpage: false, loooooooong: false };
await p.defaultDomains.upsert({ where: { projectId: ws.id }, create: { projectId: ws.id, ...off }, update: off });

if (short) {
  const d = await p.domain.findUnique({ where: { slug: short } });
  if (!d) await p.domain.create({ data: { id: rid("dom_"), slug: short, verified: true, primary: true, projectId: ws.id } });
  else await p.domain.update({ where: { slug: short }, data: { verified: true } });
}

console.log("seed ok", { user: user.id, workspace: ws.slug, shortDomain: short || null });
await p.$disconnect();
