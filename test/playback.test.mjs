import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { streamUrl, muxPlayerProps, thumbnailUrl } from '../dist/index.js';

const signed = {
  playbackId: 'playback-id', playbackPolicy: 'signed',
  playbackToken: 'PLAYBACK_TOKEN', storyboardToken: 'STORYBOARD_TOKEN',
  thumbnail: 'https://example.com/poster.jpg',
};

test('streamUrl prefers the API URL and falls back to public or tokenized Mux HLS', () => {
  assert.equal(streamUrl({ playbackId: 'public-id' }), 'https://stream.mux.com/public-id.m3u8');
  assert.ok(streamUrl(signed) === 'https://stream.mux.com/playback-id.m3u8?token=PLAYBACK_TOKEN');
  const apiUrl = 'https://example.com/video.m3u8?token=API_TOKEN&other=value';
  assert.ok(streamUrl({ ...signed, streamUrl: apiUrl }) === apiUrl);
  assert.ok(streamUrl({ streamUrl: apiUrl }) === apiUrl);
  assert.ok(streamUrl({ ...signed, streamUrl: '' }) === streamUrl(signed));
  assert.ok(streamUrl({ ...signed, streamUrl: null }) === streamUrl(signed));
  assert.ok(streamUrl({ ...signed, playbackPolicy: 'public' }) === streamUrl(signed));
  assert.equal(streamUrl({ playbackId: 'id/with?reserved' }),
    'https://stream.mux.com/id%2Fwith%3Freserved.m3u8');
  const escaped = new URL(streamUrl({ playbackId: 'id', playbackToken: 'PLACEHOLDER&? +/=' }));
  assert.equal(escaped.searchParams.size, 1);
  assert.ok(escaped.searchParams.get('token') === 'PLACEHOLDER&? +/=');
});

test('streamUrl carries a throwaway RSA-signed token without inspecting it', () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: 'test-playback-id', aud: 'v', exp: 1 })).toString('base64url');
  const body = `${header}.${payload}`;
  const token = `${body}.${sign('RSA-SHA256', Buffer.from(body), privateKey).toString('base64url')}`;
  const url = new URL(streamUrl({ playbackId: 'test-playback-id', playbackToken: token }));
  assert.ok(url.searchParams.get('token') === token);
});

test('muxPlayerProps keeps public props minimal and projects signed credentials/poster', () => {
  assert.deepEqual(muxPlayerProps({ playbackId: 'public-id', thumbnail: signed.thumbnail }),
    { playbackId: 'public-id' });
  assert.deepEqual(muxPlayerProps(signed), {
    playbackId: 'playback-id',
    tokens: { playback: 'PLAYBACK_TOKEN', storyboard: 'STORYBOARD_TOKEN' },
    poster: signed.thumbnail,
  });
  assert.deepEqual(muxPlayerProps({ playbackId: 'source-id', playbackToken: 'PLAYBACK_TOKEN' }),
    { playbackId: 'source-id', tokens: { playback: 'PLAYBACK_TOKEN' } });
  assert.deepEqual(muxPlayerProps({ ...signed, playbackPolicy: null }), muxPlayerProps(signed));
  assert.deepEqual(muxPlayerProps({ ...signed, playbackPolicy: 'public' }), { playbackId: 'playback-id' });
  assert.deepEqual(muxPlayerProps({ ...signed, storyboardToken: null, thumbnail: '' }),
    { playbackId: 'playback-id', tokens: { playback: 'PLAYBACK_TOKEN' } });
  assert.deepEqual(muxPlayerProps({ ...signed, playbackToken: null }),
    { playbackId: 'playback-id', poster: signed.thumbnail });
  assert.deepEqual(muxPlayerProps({ playbackId: 'id', storyboardToken: 'STORYBOARD_TOKEN' }),
    { playbackId: 'id' });
});

test('thumbnailUrl maps public options, including zero, and ignores them for signed input', () => {
  const options = { width: 640, height: 360, time: 0, fitMode: 'crop' };
  assert.equal(thumbnailUrl({ playbackId: 'public-id' }),
    'https://image.mux.com/public-id/thumbnail.jpg');
  assert.equal(thumbnailUrl({ playbackId: 'public-id' }, options),
    'https://image.mux.com/public-id/thumbnail.jpg?width=640&height=360&time=0&fit_mode=crop');
  assert.equal(thumbnailUrl({ playbackId: 'id/with?reserved' }, { width: 0, height: 0 }),
    'https://image.mux.com/id%2Fwith%3Freserved/thumbnail.jpg?width=0&height=0');
  assert.equal(thumbnailUrl(signed, options), signed.thumbnail);
  assert.equal(thumbnailUrl({ ...signed, playbackId: null }, options), signed.thumbnail);
  assert.equal(thumbnailUrl({ ...signed, playbackPolicy: undefined }, options), signed.thumbnail);
  assert.equal(thumbnailUrl({ ...signed, playbackPolicy: 'public' }, options),
    'https://image.mux.com/playback-id/thumbnail.jpg?width=640&height=360&time=0&fit_mode=crop');
  assert.equal(thumbnailUrl({ ...signed, thumbnail: null }, options), undefined);
  assert.equal(thumbnailUrl({ ...signed, thumbnail: '' }, options), undefined);
  assert.equal(thumbnailUrl({ playbackPolicy: 'signed', thumbnail: signed.thumbnail }), signed.thumbnail);
});

test('missing/null/empty fields do not produce malformed URLs or undefined-valued props', () => {
  for (const source of [{}, { playbackId: null }, { playbackId: '' }, {
    playbackId: null, streamUrl: null, playbackToken: null, storyboardToken: null, thumbnail: null,
  }]) {
    assert.equal(streamUrl(source), undefined);
    assert.equal(thumbnailUrl(source), undefined);
    assert.deepEqual(muxPlayerProps(source), {});
  }
  assert.equal(streamUrl({ playbackId: 'id', playbackPolicy: 'signed' }), 'https://stream.mux.com/id.m3u8');
  assert.equal(thumbnailUrl({ playbackId: 'id', playbackPolicy: 'signed' }), undefined);
  assert.deepEqual(muxPlayerProps({ playbackId: 'id', playbackToken: '', storyboardToken: '' }), { playbackId: 'id' });
  assert.equal(thumbnailUrl({ playbackId: 'id', playbackToken: 'PLAYBACK_TOKEN' }), undefined);
});

test('CommonJS consumers receive the same playback helpers', () => {
  const cjs = createRequire(import.meta.url)('../dist/index.cjs');
  assert.equal(cjs.streamUrl({ playbackId: 'id' }), streamUrl({ playbackId: 'id' }));
  assert.deepEqual(cjs.muxPlayerProps(signed), muxPlayerProps(signed));
  assert.equal(cjs.thumbnailUrl(signed), signed.thumbnail);
});

test('the secure playback README example type-checks against published declarations', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const example = readme.split('### Secure playback')[1]?.match(/```typescript\n([\s\S]*?)```/)?.[1];
  assert.ok(example, 'Secure playback example is present');
  const directory = mkdtempSync(join(tmpdir(), 'bold-playback-'));
  try {
    writeFileSync(join(directory, 'example.ts'), example);
    const fixture = readFileSync(new URL('./playback-types.ts', import.meta.url), 'utf8');
    writeFileSync(join(directory, 'types.ts'), fixture.replace("'../src/index'", "'@boldvideo/bold-js'"));
    writeFileSync(join(directory, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        target: 'es2020', module: 'esnext', moduleResolution: 'bundler', strict: true,
        noEmit: true, exactOptionalPropertyTypes: true,
        paths: { '@boldvideo/bold-js': [fileURLToPath(new URL('../dist/index.d.ts', import.meta.url))] },
      },
      files: ['example.ts', 'types.ts'],
    }));
    execFileSync(process.execPath, [
      fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url)),
      '-p', join(directory, 'tsconfig.json'),
    ], { stdio: 'pipe' });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
