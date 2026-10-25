/**
 * Checks the CompreFace connection and shows the head-pose (yaw) it reads from photos - used once after installing
 * CompreFace, and to set FACE_YAW_SIGN.
 *
 *   npm run face:check -- straight.jpg left.jpg
 *
 * straight.jpg: someone looking straight at the camera; left.jpg (optional): the same person with the head turned
 * to THEIR left, taken with the phone's rear camera. Nothing is saved - the temporary subject is deleted at the end.
 */
import fs from "node:fs";
import { addExample, deleteSubject, verifyAgainst } from "../src/services/compreface";
import { env } from "../src/config/env";

async function main() {
  const [straight, left] = process.argv.slice(2);
  if (!straight) {
    console.log("Usage: npm run face:check -- straight.jpg [left.jpg]");
    process.exit(1);
  }
  console.log(`CompreFace: ${env.COMPREFACE_URL}  key set: ${env.COMPREFACE_API_KEY ? "yes" : "NO"}`);
  const subject = `__selftest__${Date.now()}`;
  try {
    const id = await addExample(subject, fs.readFileSync(straight));
    const a = await verifyAgainst(id, fs.readFileSync(straight));
    console.log(`straight: faces=${a.length} similarity=${a[0]?.similarity} yaw=${a[0]?.yaw}`);
    if (a[0]?.yaw == null) console.log("!! No pose in the reply - the 'pose' face plugin is not enabled in compreface-core.");
    if (left) {
      const b = await verifyAgainst(id, fs.readFileSync(left));
      console.log(`left:     faces=${b.length} similarity=${b[0]?.similarity} yaw=${b[0]?.yaw}`);
      const d = (b[0]?.yaw ?? 0) - (a[0]?.yaw ?? 0);
      console.log(`yaw change for a LEFT turn = ${d.toFixed(1)}  ->  set FACE_YAW_SIGN=${d >= 0 ? 1 : -1} in .env`);
    }
  } finally {
    await deleteSubject(subject);
  }
}

main().catch((err) => {
  console.error("Failed:", err?.message ?? err);
  process.exit(1);
});
