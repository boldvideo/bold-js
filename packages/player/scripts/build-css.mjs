// dist/styles.css = the Video.js skin this version was built against, plus
// the player's own defaults. One stylesheet for apps to import, and the skin
// can never drift from the JavaScript that renders it.
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const skin = await readFile(require.resolve("@videojs/react/video/skin.css"), "utf8");
const own = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
await writeFile(new URL("../dist/styles.css", import.meta.url), `${skin}\n${own}`);
