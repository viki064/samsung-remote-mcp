import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverScript = path.resolve(__dirname, '../src/mcp-server.mjs');
const tempStateFile = path.resolve(__dirname, '../.test-saved-tv.json');

async function main() {
  const child = spawn(process.execPath, [serverScript], {
    env: {
      ...process.env,
      SAMSUNG_REMOTE_STATE_FILE: tempStateFile
    },
    stdio: ['pipe', 'pipe', 'inherit']
  });

  const rl = readline.createInterface({ input: child.stdout, terminal: false });
  const pending = new Map();
  let nextId = 1;

  rl.on('line', (line) => {
    const msg = JSON.parse(line);
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  });

  const rpc = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });

  const callTool = async (name, args = {}) => {
    const res = await rpc('tools/call', { name, arguments: args });
    assert.equal(res.isError, false, `Tool ${name} returned error: ${res.content?.[0]?.text}`);
    return JSON.parse(res.content[0].text);
  };

  try {
    // 1. Initialize
    const initRes = await rpc('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'verify-mcp', version: '1.0.0' }
    });
    assert.equal(initRes.serverInfo.name, 'samsung-remote-mcp');
    assert.equal(initRes.serverInfo.version, '1.0.0');

    // 2. List tools (14 tools)
    const listRes = await rpc('tools/list');
    assert.equal(listRes.tools.length, 14);

    // 3. Session Isolation Test: Session Alice vs Session Bob saving different TVs
    await callTool('connect_tv', {
      session_id: 'session-alice',
      host: '192.168.1.50',
      port: 8002,
      mac: 'AA:BB:CC:11:22:33',
      token: 'alice-token-111',
      save_only: true
    });

    await callTool('connect_tv', {
      session_id: 'session-bob',
      host: '192.168.1.99',
      port: 8001,
      mac: 'DD:EE:FF:44:55:66',
      token: 'bob-token-222',
      save_only: true
    });

    const aliceSaved = await callTool('get_saved_tv', { session_id: 'session-alice' });
    assert.equal(aliceSaved.active_tv.host, '192.168.1.50');
    assert.equal(aliceSaved.active_tv.token, 'alice-token-111');

    const bobSaved = await callTool('get_saved_tv', { session_id: 'session-bob' });
    assert.equal(bobSaved.active_tv.host, '192.168.1.99');
    assert.equal(bobSaved.active_tv.token, 'bob-token-222');

    // 4. Verify each session's send_key automatically targets its own saved TV
    const aliceKey = await callTool('send_key', {
      session_id: 'session-alice',
      key: 'vol+',
      dry_run: true
    });
    assert.equal(aliceKey.target_host, '192.168.1.50');
    assert.equal(aliceKey.resolved_key, 'KEY_VOLUP');

    const bobKey = await callTool('send_key', {
      session_id: 'session-bob',
      key: 'mute',
      dry_run: true
    });
    assert.equal(bobKey.target_host, '192.168.1.99');
    assert.equal(bobKey.resolved_key, 'KEY_MUTE');

    // 5. Dry-run text input (Keyboard feature)
    const textRes = await callTool('send_text', {
      session_id: 'session-alice',
      text: 'YouTube',
      submit: true,
      dry_run: true
    });
    assert.equal(textRes.target_host, '192.168.1.50');
    assert.equal(textRes.tizen_websocket_frames.length, 2);

    // 6. Dry-run touchpad swipe (Touchpad feature)
    const touchRes = await callTool('touchpad_control', {
      session_id: 'session-bob',
      mode: 'swipe',
      direction: 'up',
      distance: 150,
      dry_run: true
    });
    assert.equal(touchRes.target_host, '192.168.1.99');
    assert.equal(touchRes.tizen_websocket_frame.params.TypeOfRemote, 'ProcessMouseDevice');

    // 7. Dry-run app launch (One-touch Apps tab feature)
    const appRes = await callTool('launch_tv_app', {
      session_id: 'session-alice',
      app: 'Netflix',
      dry_run: true
    });
    assert.equal(appRes.target_host, '192.168.1.50');
    assert.equal(appRes.resolved_app_id, '11101200001');

    // 8. Dry-run Cast to TV (YouTube DIAL cast)
    const castRes = await callTool('cast_media_url', {
      session_id: 'session-bob',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      dry_run: true
    });
    assert.equal(castRes.target_host, '192.168.1.99');
    assert.equal(castRes.youtube_video_id, 'dQw4w9WgXcQ');

    console.log(
      JSON.stringify({
        ok: true,
        version: initRes.serverInfo.version,
        toolsVerified: listRes.tools.length,
        sessionsIsolated: ['session-alice', 'session-bob']
      })
    );
  } finally {
    child.kill();
    await import('node:fs/promises').then((fs) => fs.rm(tempStateFile, { force: true })).catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
