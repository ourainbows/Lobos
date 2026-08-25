import { getStore } from "@netlify/blobs";

// "strong" consistency avoids a read-after-write race: without it, a get-room
// call right after create-room/join-room can hit a replica that hasn't seen
// the write yet and wrongly report the room as missing.
export function getRoomsStore() {
  return getStore({ name: "rooms", consistency: "strong" });
}
