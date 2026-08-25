import { getStore } from "@netlify/blobs";
import { defaultRolesConfig } from "./_shared/roles.mjs";
import { json } from "./_shared/http.mjs";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(length = 5) {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const store = getStore("rooms");

  let code = randomCode();
  for (let attempts = 0; attempts < 10; attempts++) {
    const existing = await store.get(code, { type: "json" });
    if (!existing) break;
    code = randomCode();
  }

  const hostToken = crypto.randomUUID();
  const room = {
    code,
    hostToken,
    status: "open",
    createdAt: Date.now(),
    roles: defaultRolesConfig(),
    players: [],
  };

  await store.setJSON(code, room);

  return json({ code, hostToken });
};

export const config = { path: "/api/create-room" };
