// Creates a fresh, disposable App Router consumer of npm pack's output, not workspace source.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const [major, archive, destination] = process.argv.slice(2);
if (!["18", "19"].includes(major) || !archive || !destination) throw new Error("Usage: node packed-app.mjs 18|19 archive.tgz fresh-directory");
const directory = resolve(destination);
mkdirSync(directory, { recursive: true });
function file(name, content) {
  const path = resolve(directory, name);
  mkdirSync(resolve(path, ".."), { recursive: true }); writeFileSync(path, content);
}
file("package.json", JSON.stringify({ name: `assistant-packed-react-${major}`, private: true, scripts: { build: `next build${major === "19" ? " --webpack" : ""}`, start: "next start" } }, null, 2));
file("next.config.mjs", "export default { experimental: { cpus: 2 } };\n");
// Next 14 generates the legacy resolver; package exports require bundler resolution.
file("tsconfig.json", JSON.stringify({ compilerOptions: { target: "ES2020", lib: ["dom", "dom.iterable", "esnext"],
  strict: true, noEmit: true, esModuleInterop: true, module: "esnext", moduleResolution: "bundler",
  jsx: "preserve", resolveJsonModule: true, isolatedModules: true, skipLibCheck: true },
  include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"], exclude: ["node_modules"] }, null, 2));
file("app/layout.tsx", `import '@boldvideo/assistant/styles.css';
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}`);
file("app/page.tsx", `import { Consumer } from './consumer';
export default function Page() { return <><h1>Packed assistant React ${major}</h1><Consumer /></>; }
`);
file("app/consumer.tsx", `"use client";
import { useEffect, useState } from 'react';
import { AssistantProvider, AssistantPanel, useAssistantVideo } from '@boldvideo/assistant';
function Video() {
  const player = useAssistantVideo({ id: 'video-1', title: 'Paper craft video 1' });
  return <video muted {...player.props} ref={player.ref} />;
}
export function Consumer() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return <AssistantProvider endpoint="/api/assistant" viewerKey="packed-viewer">
    <div data-hydrated={hydrated}><Video /><div style={{ height: 650, maxWidth: 420 }}>
      <AssistantPanel videoHref={(id, at) => '/watch/' + id + '?t=' + at} />
    </div></div>
  </AssistantProvider>;
}
`);
file("app/api/assistant/route.ts", `import { createAssistantHandler } from '@boldvideo/assistant/server';
import { createFakeBold, syntheticAnswer } from '@boldvideo/assistant/testing';
const handler = createAssistantHandler({ bold: createFakeBold({ answer: syntheticAnswer }),
  authorize: () => ({ viewer: 'packed-viewer', access: { answer: ['paper-craft'] } }) });
export const GET = handler;
export const POST = handler;
`);
const react = major === "19" ? "19.3.1" : "18.3.1";
const next = major === "19" ? "16.4.6" : "14.2.35";
console.log(`Installing actual tarball in fresh Next ${next} / React ${react} App Router app.`);
execFileSync("npm", ["install", resolve(archive), `next@${next}`, `react@${react}`, `react-dom@${react}`,
  "typescript@5.9.3", `@types/react@${major}`, `@types/react-dom@${major}`, "@types/node@22"], { cwd: directory, stdio: "inherit" });
execFileSync("npm", ["run", "build"], { cwd: directory, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" }, stdio: "inherit" });
