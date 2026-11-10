import crypto from 'node:crypto';
import dgram from 'node:dgram';
import fs from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';

/**
 * Friendly button aliases mapped from the observed UI surfaces of
 * "Remote for Samsung" (App Store id1455009028 / com.osfunapps.tv-samsung-remote-ios)
 * and standard Samsung Tizen / Legacy key codes.
 */
export const KEY_ALIASES = Object.freeze({
  // Screen 3: Number pad & core controls
  power: 'KEY_POWER',
  poweroff: 'KEY_POWEROFF',
  poweron: 'KEY_POWERON',
  source: 'KEY_SOURCE',
  '0': 'KEY_0',
  '1': 'KEY_1',
  '2': 'KEY_2',
  '3': 'KEY_3',
  '4': 'KEY_4',
  '5': 'KEY_5',
  '6': 'KEY_6',
  '7': 'KEY_7',
  '8': 'KEY_8',
  '9': 'KEY_9',
  '-': 'KEY_MINUS',
  dash: 'KEY_MINUS',
  minus: 'KEY_MINUS',
  'pre-ch': 'KEY_PRECH',
  prech: 'KEY_PRECH',
  previous_channel: 'KEY_PRECH',
  'vol+': 'KEY_VOLUP',
  volup: 'KEY_VOLUP',
  volume_up: 'KEY_VOLUP',
  'vol-': 'KEY_VOLDOWN',
  voldown: 'KEY_VOLDOWN',
  volume_down: 'KEY_VOLDOWN',
  mute: 'KEY_MUTE',
  'ch+': 'KEY_CHUP',
  chup: 'KEY_CHUP',
  channel_up: 'KEY_CHUP',
  'ch-': 'KEY_CHDOWN',
  chdown: 'KEY_CHDOWN',
  channel_down: 'KEY_CHDOWN',
  ch_list: 'KEY_CH_LIST',

  // Screen 7: Navigation D-Pad & Media Player
  up: 'KEY_UP',
  down: 'KEY_DOWN',
  left: 'KEY_LEFT',
  right: 'KEY_RIGHT',
  select: 'KEY_ENTER',
  enter: 'KEY_ENTER',
  ok: 'KEY_ENTER',
  back: 'KEY_RETURN',
  return: 'KEY_RETURN',
  exit: 'KEY_EXIT',
  home: 'KEY_HOME',
  menu: 'KEY_MENU',
  tools: 'KEY_TOOLS',
  info: 'KEY_INFO',
  guide: 'KEY_GUIDE',
  ambient: 'KEY_AMBIENT',
  play: 'KEY_PLAY',
  pause: 'KEY_PAUSE',
  stop: 'KEY_STOP',
  rewind: 'KEY_REWIND',
  '<<': 'KEY_REWIND',
  fast_forward: 'KEY_FF',
  ff: 'KEY_FF',
  '>>': 'KEY_FF',
  previous: 'KEY_REWIND_',
  '|<<': 'KEY_REWIND_',
  next: 'KEY_FF_',
  '>>|': 'KEY_FF_',
  record: 'KEY_REC',

  // Color & HDMI shortcuts
  red: 'KEY_RED',
  green: 'KEY_GREEN',
  yellow: 'KEY_YELLOW',
  blue: 'KEY_CYAN',
  cyan: 'KEY_CYAN',
  hdmi: 'KEY_HDMI',
  hdmi1: 'KEY_HDMI1',
  hdmi2: 'KEY_HDMI2',
  hdmi3: 'KEY_HDMI3',
  hdmi4: 'KEY_HDMI4'
});

/**
 * Complete Samsung KEY_* code set observed in samsung-tv-control/lib/keys.js
 * and samsungctl.
 */
export const SAMSUNG_KEYS = Object.freeze([
  'KEY_0', 'KEY_1', 'KEY_2', 'KEY_3', 'KEY_4', 'KEY_5', 'KEY_6', 'KEY_7', 'KEY_8', 'KEY_9',
  'KEY_11', 'KEY_12', 'KEY_16_9', 'KEY_4_3', 'KEY_3SPEED', 'KEY_AD', 'KEY_ADDDEL',
  'KEY_ALT_MHP', 'KEY_AMBIENT', 'KEY_ANGLE', 'KEY_ANTENA', 'KEY_ANYNET', 'KEY_ANYVIEW',
  'KEY_APP_LIST', 'KEY_ASPECT', 'KEY_AV1', 'KEY_AV2', 'KEY_AV3', 'KEY_BACK_MHP',
  'KEY_BOOKMARK', 'KEY_CALLER_ID', 'KEY_CAPTION', 'KEY_CATV_MODE', 'KEY_CH_LIST',
  'KEY_CHDOWN', 'KEY_CHUP', 'KEY_CLEAR', 'KEY_CLOCK_DISPLAY', 'KEY_COMPONENT1',
  'KEY_COMPONENT2', 'KEY_CONTENTS', 'KEY_CONVERGENCE', 'KEY_CONVERT_AUDIO_MAINSUB',
  'KEY_CUSTOM', 'KEY_CYAN', 'KEY_DEVICE_CONNECT', 'KEY_DISC_MENU', 'KEY_DMA', 'KEY_DNET',
  'KEY_DNIe', 'KEY_DNSe', 'KEY_DOOR', 'KEY_DOWN', 'KEY_DSS_MODE', 'KEY_DTV', 'KEY_DTV_LINK',
  'KEY_DTV_SIGNAL', 'KEY_DVD_MODE', 'KEY_DVI', 'KEY_DVR', 'KEY_DVR_MENU', 'KEY_DYNAMIC',
  'KEY_ENTER', 'KEY_ENTERTAINMENT', 'KEY_ESAVING', 'KEY_EXIT', 'KEY_FACTORY', 'KEY_FAVCH',
  'KEY_FF', 'KEY_FF_', 'KEY_FM_RADIO', 'KEY_GAME', 'KEY_GREEN', 'KEY_GUIDE', 'KEY_HDMI',
  'KEY_HDMI1', 'KEY_HDMI2', 'KEY_HDMI3', 'KEY_HDMI4', 'KEY_HELP', 'KEY_HOME',
  'KEY_ID_INPUT', 'KEY_ID_SETUP', 'KEY_INFO', 'KEY_INSTANT_REPLAY', 'KEY_LEFT', 'KEY_LINK',
  'KEY_LIVE', 'KEY_MAGIC_BRIGHT', 'KEY_MAGIC_CHANNEL', 'KEY_MDC', 'KEY_MENU', 'KEY_MIC',
  'KEY_MINUS', 'KEY_MORE', 'KEY_MOVIE1', 'KEY_MS', 'KEY_MTS', 'KEY_MULTI_VIEW', 'KEY_MUTE',
  'KEY_NINE_SEPERATE', 'KEY_OPEN', 'KEY_PANNEL_CHDOWN', 'KEY_PANNEL_CHUP',
  'KEY_PANNEL_ENTER', 'KEY_PANNEL_MENU', 'KEY_PANNEL_POWER', 'KEY_PANNEL_SOURCE',
  'KEY_PANNEL_VOLDOW', 'KEY_PANNEL_VOLUP', 'KEY_PANORAMA', 'KEY_PAUSE', 'KEY_PCMODE',
  'KEY_PERPECT_FOCUS', 'KEY_PICTURE_SIZE', 'KEY_PIP_CHDOWN', 'KEY_PIP_CHUP',
  'KEY_PIP_ONOFF', 'KEY_PIP_SCAN', 'KEY_PIP_SIZE', 'KEY_PIP_SWAP', 'KEY_PLAY',
  'KEY_PLUS100', 'KEY_PMODE', 'KEY_POWER', 'KEY_POWEROFF', 'KEY_POWERON', 'KEY_PRECH',
  'KEY_PRINT', 'KEY_PROGRAM', 'KEY_QUICK_REPLAY', 'KEY_REC', 'KEY_RED', 'KEY_REPEAT',
  'KEY_RESERVED1', 'KEY_RETURN', 'KEY_REWIND', 'KEY_REWIND_', 'KEY_RIGHT', 'KEY_RSS',
  'KEY_RSURF', 'KEY_SCALE', 'KEY_SEFFECT', 'KEY_SETUP_CLOCK_TIMER', 'KEY_SLEEP',
  'KEY_SOURCE', 'KEY_SRS', 'KEY_STANDARD', 'KEY_STB_MODE', 'KEY_STILL_PICTURE', 'KEY_STOP',
  'KEY_SUB_TITLE', 'KEY_SVIDEO1', 'KEY_SVIDEO2', 'KEY_SVIDEO3', 'KEY_TOOLS', 'KEY_TOPMENU',
  'KEY_TTX_MIX', 'KEY_TTX_SUBFACE', 'KEY_TURBO', 'KEY_TV', 'KEY_TV_MODE', 'KEY_UP',
  'KEY_VCHIP', 'KEY_VCR_MODE', 'KEY_VOLDOWN', 'KEY_VOLUP', 'KEY_W_LINK', 'KEY_WHEEL_LEFT',
  'KEY_WHEEL_RIGHT', 'KEY_YELLOW', 'KEY_ZOOM_IN', 'KEY_ZOOM_MOVE', 'KEY_ZOOM_OUT',
  'KEY_ZOOM1', 'KEY_ZOOM2'
]);

/**
 * Known Samsung Tizen TV App IDs observed in App Store Screen 5 of id1455009028
 * and samsung-tv-control/lib/apps.js.
 */
export const KNOWN_TV_APPS = Object.freeze({
  'Amazon Prime Video': '3201512006785',
  'Prime Video': '3201512006785',
  'Apple TV': '3201807016597',
  'BeanBrowser': 'org.tizen.browser',
  'Internet': 'org.tizen.browser',
  'Google Chrome': 'org.tizen.browser',
  'Netflix': '11101200001',
  'Spotify': '3201606009684',
  'YouTube': '111299001912',
  'Disney+': '3201901017640',
  'Gallery': '3201710015037',
  'SmartThings': '3201710015016',
  'Universal Guide': '3201710015067',
  'Steam Link': '3201702011851',
  'HBO GO': '3201706012478',
  'Google Play Movies': '3201601007250',
  'Rakuten TV': '3201511006428',
  'BBC iPlayer': '3201601007670',
  'All 4': '111299002148',
  'ITV Hub': '121299000089',
  'My5': '121299000612',
  'NOW TV': '3201603008746',
  'Facebook Watch': '11091000000'
});

export function resolveKeyCode(inputKey) {
  if (!inputKey || typeof inputKey !== 'string') {
    throw new Error('Key name must be a non-empty string.');
  }
  const trimmed = inputKey.trim();
  const lower = trimmed.toLowerCase();
  if (KEY_ALIASES[lower]) {
    return KEY_ALIASES[lower];
  }
  const upper = trimmed.toUpperCase();
  if (upper.startsWith('KEY_')) {
    return upper;
  }
  const prefixed = `KEY_${upper}`;
  if (SAMSUNG_KEYS.includes(prefixed)) {
    return prefixed;
  }
  return upper;
}

export function resolveAppId(appIdOrName) {
  if (!appIdOrName || typeof appIdOrName !== 'string') {
    throw new Error('App name or ID must be a non-empty string.');
  }
  const trimmed = appIdOrName.trim();
  const lower = trimmed.toLowerCase();
  for (const [name, id] of Object.entries(KNOWN_TV_APPS)) {
    if (name.toLowerCase() === lower) {
      return { appId: id, matchedName: name };
    }
  }
  return { appId: trimmed, matchedName: null };
}

/**
 * Session-scoped persistent state storage for the "Auto-Save last remote" feature of id1455009028.
 * Each MCP session (`Mcp-Session-Id`, SSE `sessionId`, or tool `session_id`) maintains its own
 * saved TV list and active TV profile without colliding with other public sessions.
 */
const memorySessionStore = new Map();

export function normalizeSessionId(sessionId) {
  const cleaned = typeof sessionId === 'string' ? sessionId.trim() : '';
  return cleaned || 'default';
}

export function getStateFilePath() {
  if (process.env.SAMSUNG_REMOTE_STATE_FILE) {
    return process.env.SAMSUNG_REMOTE_STATE_FILE;
  }
  return path.join(os.homedir(), '.samsung-remote-mcp', 'saved-tv.json');
}

async function readStoreFile() {
  const filePath = getStateFilePath();
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.sessions && typeof parsed.sessions === 'object') {
      return parsed;
    }
    // Migrate legacy single-TV state into the 'default' session
    if (parsed && typeof parsed === 'object' && parsed.host) {
      return {
        version: 2,
        sessions: {
          default: {
            activeTv: parsed,
            tvs: [parsed]
          }
        }
      };
    }
  } catch {
    // ignore missing or invalid file
  }
  return { version: 2, sessions: {} };
}

async function writeStoreFile(store) {
  const filePath = getStateFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(store, null, 2), 'utf8');
}

export async function loadSessionTvRecord(sessionId = 'default') {
  const sid = normalizeSessionId(sessionId);
  const store = await readStoreFile();
  const diskRecord = store.sessions[sid] || null;
  if (diskRecord) {
    memorySessionStore.set(sid, diskRecord);
    return diskRecord;
  }
  return memorySessionStore.get(sid) || null;
}

export async function loadSavedTvState(sessionId = 'default') {
  const record = await loadSessionTvRecord(sessionId);
  return record?.activeTv || null;
}

export async function saveTvState(stateUpdate, sessionId = 'default') {
  const sid = normalizeSessionId(sessionId);
  const store = await readStoreFile();
  const existingRecord = store.sessions[sid] || memorySessionStore.get(sid) || { activeTv: null, tvs: [] };
  const currentActive = existingRecord.activeTv || {};

  const isSameTv =
    !stateUpdate.host ||
    !currentActive.host ||
    stateUpdate.host === currentActive.host;

  const mergedTv = {
    ...(isSameTv ? currentActive : {}),
    ...stateUpdate,
    sessionId: sid,
    updatedAt: new Date().toISOString()
  };

  const updatedList = Array.isArray(existingRecord.tvs) ? [...existingRecord.tvs] : [];
  const matchIdx = updatedList.findIndex(
    (item) =>
      (mergedTv.host && item.host === mergedTv.host) ||
      (mergedTv.smartThingsDeviceId && item.smartThingsDeviceId === mergedTv.smartThingsDeviceId)
  );
  if (matchIdx >= 0) {
    updatedList[matchIdx] = { ...updatedList[matchIdx], ...mergedTv };
  } else {
    updatedList.push(mergedTv);
  }

  const nextRecord = {
    sessionId: sid,
    activeTv: mergedTv,
    tvs: updatedList,
    updatedAt: mergedTv.updatedAt
  };

  memorySessionStore.set(sid, nextRecord);
  store.sessions[sid] = nextRecord;
  await writeStoreFile(store);
  return mergedTv;
}

export async function resolveTargetTv(args = {}, sessionId = 'default') {
  const sid = normalizeSessionId(args.session_id || sessionId);
  const record = await loadSessionTvRecord(sid);
  let saved = record?.activeTv || null;

  // Allow selecting a specific saved TV in this session by host or tvName
  if (args.host && Array.isArray(record?.tvs)) {
    const matched = record.tvs.find((t) => t.host === args.host);
    if (matched) {
      saved = matched;
    }
  }

  const host = args.host || args.ip || saved?.host || process.env.SAMSUNG_TV_HOST || null;
  if (!host) {
    throw new Error(
      `No Samsung TV host IP specified and no saved TV found for session "${sid}". Provide \`host\` (e.g., "192.168.1.102") or run \`discover_tvs\` / \`connect_tv\` first.`
    );
  }
  const port = Number(args.port || saved?.port || process.env.SAMSUNG_TV_PORT || 8002);
  const protocol =
    args.protocol ||
    (port === 55000 ? 'legacy' : port === 8001 ? 'ws' : 'wss');
  const name = args.remote_name || saved?.name || process.env.SAMSUNG_REMOTE_NAME || 'Remote for Samsung MCP';
  const token = args.token ?? saved?.token ?? process.env.SAMSUNG_TV_TOKEN ?? '';
  const mac = args.mac || saved?.mac || process.env.SAMSUNG_TV_MAC || '';

  return { sessionId: sid, host, port, protocol, name, token, mac };
}

/**
 * Simple HTTP/HTTPS request helper using Node built-ins.
 */
export function httpRequest(urlString, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
    const req = lib.request(
      url,
      {
        method: options.method || 'GET',
        headers: options.headers || {},
        timeout: options.timeoutMs ?? 4000,
        rejectUnauthorized: false
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          resolve({
            statusCode: res.statusCode ?? 0,
            headers: res.headers,
            body
          });
        });
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error(`HTTP timeout after ${options.timeoutMs ?? 4000}ms for ${urlString}`));
    });
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

/**
 * Queries Samsung Smart TV HTTP REST endpoint (`http://<host>:8001/api/v2/`).
 */
export async function fetchTvDeviceInfo(host, timeoutMs = 3000) {
  const res = await httpRequest(`http://${host}:8001/api/v2/`, { timeoutMs });
  if (res.statusCode !== 200) {
    throw new Error(`HTTP ${res.statusCode} from http://${host}:8001/api/v2/`);
  }
  const parsed = JSON.parse(res.body);
  return {
    ip: parsed?.device?.ip || host,
    name: parsed?.device?.name || parsed?.name || 'Samsung TV',
    modelName: parsed?.device?.modelName || null,
    model: parsed?.device?.model || null,
    wifiMac: parsed?.device?.wifiMac || null,
    id: parsed?.id || parsed?.device?.id || null,
    tokenAuthSupport: parsed?.device?.TokenAuthSupport === 'true' || parsed?.device?.TokenAuthSupport === true,
    voiceSupport: parsed?.device?.VoiceSupport === 'true' || parsed?.device?.VoiceSupport === true,
    os: parsed?.device?.OS || null,
    resolution: parsed?.device?.resolution || null,
    raw: parsed
  };
}

/**
 * SSDP (Simple Service Discovery Protocol) local network discovery for Samsung TVs.
 */
export async function discoverSamsungTvs({ timeoutMs = 3000 } = {}) {
  const discoveredIps = new Map();
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

  const searchTargets = [
    'urn:samsung.com:device:RemoteControlReceiver:1',
    'urn:dial-multiscreen-org:service:dial:1',
    'urn:schemas-upnp-org:device:MediaRenderer:1'
  ];

  await new Promise((resolve) => {
    socket.on('message', (msg, rinfo) => {
      const text = msg.toString('utf8');
      const lower = text.toLowerCase();
      if (
        lower.includes('samsung') ||
        lower.includes('tizen') ||
        lower.includes('remotecontrolreceiver') ||
        lower.includes('dmr')
      ) {
        const locationMatch = text.match(/^LOCATION:\s*(.+)$/im);
        const stMatch = text.match(/^ST:\s*(.+)$/im);
        const serverMatch = text.match(/^SERVER:\s*(.+)$/im);
        discoveredIps.set(rinfo.address, {
          ip: rinfo.address,
          location: locationMatch ? locationMatch[1].trim() : null,
          st: stMatch ? stMatch[1].trim() : null,
          server: serverMatch ? serverMatch[1].trim() : null
        });
      }
    });

    socket.on('error', () => {
      resolve();
    });

    socket.bind(0, () => {
      for (const st of searchTargets) {
        const packet = Buffer.from(
          [
            'M-SEARCH * HTTP/1.1',
            'HOST: 239.255.255.250:1900',
            'MAN: "ssdp:discover"',
            'MX: 2',
            `ST: ${st}`,
            '',
            ''
          ].join('\r\n'),
          'utf8'
        );
        socket.send(packet, 0, packet.length, 1900, '239.255.255.250');
      }
      setTimeout(resolve, timeoutMs);
    });
  });

  try {
    socket.close();
  } catch {
    // ignore close error
  }

  const results = [];
  for (const [ip, ssdpInfo] of discoveredIps.entries()) {
    try {
      const info = await fetchTvDeviceInfo(ip, 2000);
      results.push({ ...ssdpInfo, ...info });
    } catch {
      results.push(ssdpInfo);
    }
  }
  return results;
}

/**
 * Wake-on-LAN magic packet sender (UDP broadcast).
 */
export async function sendWakeOnLan(macAddress, { broadcastAddress = '255.255.255.255', port = 9 } = {}) {
  const cleaned = macAddress.replace(/[^0-9a-fA-F]/g, '');
  if (cleaned.length !== 12) {
    throw new Error(`Invalid MAC address "${macAddress}". Expected 6 hex octets (e.g., "AA:BB:CC:DD:EE:FF").`);
  }
  const macBytes = Buffer.from(cleaned, 'hex');
  const magicPacket = Buffer.alloc(6 + 16 * 6, 0xff);
  for (let i = 0; i < 16; i++) {
    macBytes.copy(magicPacket, 6 + i * 6);
  }

  const sock = dgram.createSocket('udp4');
  await new Promise((resolve, reject) => {
    sock.once('error', reject);
    sock.bind(0, () => {
      sock.setBroadcast(true);
      sock.send(magicPacket, 0, magicPacket.length, port, broadcastAddress, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
  sock.close();
  return { ok: true, mac: macAddress, broadcastAddress, port, bytesSent: magicPacket.length };
}

/**
 * Minimal RFC 6455 WebSocket client built on Node's native `net` and `tls`
 * so `wss://<tv-ip>:8002` works with Samsung's self-signed TV certificates
 * without requiring third-party npm packages.
 */
function encodeWsFrame(textPayload) {
  const payload = Buffer.from(textPayload, 'utf8');
  const maskKey = crypto.randomBytes(4);
  let header;
  if (payload.length < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + text frame
    header[1] = 0x80 | payload.length; // Masked
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) {
    masked[i] = payload[i] ^ maskKey[i % 4];
  }
  return Buffer.concat([header, maskKey, masked]);
}

function tryReadWsFrame(buffer) {
  if (buffer.length < 2) return null;
  const opcode = buffer[0] & 0x0f;
  const isMasked = (buffer[1] & 0x80) !== 0;
  let payloadLen = buffer[1] & 0x7f;
  let offset = 2;

  if (payloadLen === 126) {
    if (buffer.length < 4) return null;
    payloadLen = buffer.readUInt16BE(2);
    offset = 4;
  } else if (payloadLen === 127) {
    if (buffer.length < 10) return null;
    payloadLen = Number(buffer.readBigUInt64BE(2));
    offset = 10;
  }

  const maskLen = isMasked ? 4 : 0;
  if (buffer.length < offset + maskLen + payloadLen) {
    return null;
  }

  let payload = buffer.subarray(offset + maskLen, offset + maskLen + payloadLen);
  if (isMasked) {
    const mask = buffer.subarray(offset, offset + 4);
    const unmasked = Buffer.alloc(payloadLen);
    for (let i = 0; i < payloadLen; i++) {
      unmasked[i] = payload[i] ^ mask[i % 4];
    }
    payload = unmasked;
  }

  return {
    opcode,
    payload,
    rest: buffer.subarray(offset + maskLen + payloadLen)
  };
}

/**
 * Connects to a Samsung Tizen TV WebSocket endpoint (`/api/v2/channels/samsung.remote.control`),
 * completes the channel handshake (`ms.channel.connect`), optionally sends one or more JSON
 * payloads, and returns the received event/token.
 */
export async function executeTizenWebSocketSession({
  host,
  port = 8002,
  name = 'Remote for Samsung MCP',
  token = '',
  messages = [],
  waitForEvent = null,
  interMessageDelayMs = 200,
  timeoutMs = 8000
}) {
  const encodedName = Buffer.from(name, 'utf8').toString('base64');
  const pathWithQuery = `/api/v2/channels/samsung.remote.control?name=${encodeURIComponent(encodedName)}${
    token ? `&token=${encodeURIComponent(token)}` : ''
  }`;
  const isSecure = port === 8002;

  return new Promise((resolve, reject) => {
    const secKey = crypto.randomBytes(16).toString('base64');
    const socket = isSecure
      ? tls.connect({ host, port, rejectUnauthorized: false, servername: host })
      : net.connect({ host, port });

    let upgraded = false;
    let buffer = Buffer.alloc(0);
    let connectEvent = null;
    let matchedResponseEvent = null;
    let settled = false;

    const finish = (err, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      if (err) reject(err);
      else resolve(result);
    };

    const timer = setTimeout(() => {
      finish(
        new Error(
          `Timed out after ${timeoutMs}ms waiting for Samsung TV at ${
            isSecure ? 'wss' : 'ws'
          }://${host}:${port}${pathWithQuery}`
        )
      );
    }, timeoutMs);

    const onConnectedSocket = () => {
      const upgradeReq = [
        `GET ${pathWithQuery} HTTP/1.1`,
        `Host: ${host}:${port}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${secKey}`,
        'Sec-WebSocket-Version: 13',
        '',
        ''
      ].join('\r\n');
      socket.write(upgradeReq);
    };

    if (isSecure) {
      socket.once('secureConnect', onConnectedSocket);
    } else {
      socket.once('connect', onConnectedSocket);
    }

    socket.on('error', (err) => finish(err));

    const sendQueuedMessages = async () => {
      for (let i = 0; i < messages.length; i++) {
        const msg = typeof messages[i] === 'string' ? messages[i] : JSON.stringify(messages[i]);
        socket.write(encodeWsFrame(msg));
        if (i + 1 < messages.length && interMessageDelayMs > 0) {
          await new Promise((r) => setTimeout(r, interMessageDelayMs));
        }
      }
      if (!waitForEvent) {
        setTimeout(() => {
          finish(null, {
            protocol: isSecure ? 'wss' : 'ws',
            url: `${isSecure ? 'wss' : 'ws'}://${host}:${port}${pathWithQuery}`,
            connectEvent,
            token: connectEvent?.data?.token || token || null,
            messagesSent: messages.length
          });
        }, 180);
      }
    };

    const processFrames = () => {
      while (true) {
        const frame = tryReadWsFrame(buffer);
        if (!frame) break;
        buffer = frame.rest;

        if (frame.opcode === 0x08) {
          // Close frame
          finish(null, {
            protocol: isSecure ? 'wss' : 'ws',
            url: `${isSecure ? 'wss' : 'ws'}://${host}:${port}${pathWithQuery}`,
            connectEvent,
            responseEvent: matchedResponseEvent,
            token: connectEvent?.data?.token || token || null,
            messagesSent: messages.length
          });
          return;
        }

        if (frame.opcode === 0x09) {
          // Ping -> Pong
          const pong = Buffer.concat([Buffer.from([0x8a, 0x80]), crypto.randomBytes(4)]);
          socket.write(pong);
          continue;
        }

        if (frame.opcode === 0x01) {
          const text = frame.payload.toString('utf8');
          let parsed;
          try {
            parsed = JSON.parse(text);
          } catch {
            continue;
          }

          if (parsed.event === 'ms.channel.connect' && !connectEvent) {
            connectEvent = parsed;
            sendQueuedMessages().catch((e) => finish(e));
          } else if (
            parsed.event === 'ms.channel.unauthorized' ||
            parsed.event === 'ms.channel.timeOut'
          ) {
            finish(
              new Error(
                `Samsung TV rejected or timed out pairing authorization (${parsed.event}). Accept the connection prompt on the TV screen.`
              )
            );
            return;
          } else if (waitForEvent && parsed.event === waitForEvent) {
            matchedResponseEvent = parsed;
            finish(null, {
              protocol: isSecure ? 'wss' : 'ws',
              url: `${isSecure ? 'wss' : 'ws'}://${host}:${port}${pathWithQuery}`,
              connectEvent,
              responseEvent: matchedResponseEvent,
              token: connectEvent?.data?.token || token || null,
              messagesSent: messages.length
            });
            return;
          }
        }
      }
    };

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!upgraded) {
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;
        const headerText = buffer.subarray(0, headerEnd).toString('utf8');
        if (!headerText.startsWith('HTTP/1.1 101')) {
          finish(new Error(`WebSocket upgrade failed: ${headerText.split('\r\n')[0]}`));
          return;
        }
        upgraded = true;
        buffer = buffer.subarray(headerEnd + 4);
      }
      processFrames();
    });
  });
}

/**
 * Legacy Samsung TCP port 55000 binary framing protocol (pre-2016 D/E/F/H series TVs),
 * matching Oz Shabbatth's `remote_legacy.py` and `samsung-tv-control/lib/samsung.js`.
 */
function serializeLegacyField(value, raw = false) {
  const encoded = raw
    ? Buffer.isBuffer(value)
      ? value
      : Buffer.from(String(value), 'utf8')
    : Buffer.from(Buffer.from(String(value), 'utf8').toString('base64'), 'utf8');
  const lenHeader = Buffer.alloc(2);
  lenHeader.writeUInt16LE(encoded.length, 0);
  return Buffer.concat([lenHeader, encoded]);
}

export function buildLegacyPackets({
  clientIp = '127.0.0.1',
  clientId = 'samsung-remote-mcp',
  remoteName = 'Remote for Samsung MCP',
  appString = 'iphone..iapp.samsung',
  tvAppString = 'iphone.UE40NU7400.iapp.samsung',
  key
}) {
  const handshakePayload = Buffer.concat([
    Buffer.from([0x64, 0x00]),
    serializeLegacyField(clientIp),
    serializeLegacyField(clientId),
    serializeLegacyField(remoteName)
  ]);
  const appField = serializeLegacyField(appString, true);
  const handshakePacket = Buffer.concat([
    Buffer.from([0x00]),
    appField,
    serializeLegacyField(handshakePayload, true)
  ]);

  const keyPayload = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00]),
    serializeLegacyField(key)
  ]);
  const tvAppField = serializeLegacyField(tvAppString, true);
  const keyPacket = Buffer.concat([
    Buffer.from([0x00]),
    tvAppField,
    serializeLegacyField(keyPayload, true)
  ]);

  return { handshakePacket, keyPacket };
}

export async function sendLegacyTcpKeys({
  host,
  port = 55000,
  keys = [],
  remoteName = 'Remote for Samsung MCP',
  interKeyDelayMs = 200,
  timeoutMs = 4000
}) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    socket.setTimeout(timeoutMs);

    socket.once('connect', async () => {
      try {
        for (let i = 0; i < keys.length; i++) {
          const { handshakePacket, keyPacket } = buildLegacyPackets({
            remoteName,
            key: keys[i]
          });
          if (i === 0) {
            socket.write(handshakePacket);
          }
          socket.write(keyPacket);
          if (i + 1 < keys.length && interKeyDelayMs > 0) {
            await new Promise((r) => setTimeout(r, interKeyDelayMs));
          }
        }
        socket.end();
        resolve({
          protocol: 'legacy',
          host,
          port,
          keysSent: keys
        });
      } catch (err) {
        socket.destroy();
        reject(err);
      }
    });

    socket.once('timeout', () => {
      socket.destroy();
      reject(new Error(`Legacy TCP timeout connecting to ${host}:${port}`));
    });

    socket.once('error', (err) => {
      socket.destroy();
      reject(err);
    });
  });
}

/**
 * Builders for Samsung Tizen WebSocket JSON command frames.
 */
export function buildRemoteKeyPayload(key, cmd = 'Click') {
  return {
    method: 'ms.remote.control',
    params: {
      Cmd: cmd,
      DataOfCmd: key,
      Option: 'false',
      TypeOfRemote: 'SendRemoteKey'
    }
  };
}

export function buildSendTextPayload(text) {
  return {
    method: 'ms.remote.control',
    params: {
      Cmd: Buffer.from(String(text), 'utf8').toString('base64'),
      DataOfCmd: 'base64',
      TypeOfRemote: 'SendInputString'
    }
  };
}

export function buildTouchpadMovePayload({ dx = 0, dy = 0, time = 1 }) {
  return {
    method: 'ms.remote.control',
    params: {
      Cmd: 'Move',
      Position: {
        x: Number(dx),
        y: Number(dy),
        Time: String(time)
      },
      TypeOfRemote: 'ProcessMouseDevice'
    }
  };
}

export function buildTouchpadClickPayload(button = 'LeftClick') {
  return {
    method: 'ms.remote.control',
    params: {
      Cmd: button,
      TypeOfRemote: 'ProcessMouseDevice'
    }
  };
}

export function buildInstalledAppsPayload() {
  return {
    method: 'ms.channel.emit',
    params: {
      data: '',
      event: 'ed.installedApp.get',
      to: 'host'
    }
  };
}

export function buildLaunchAppPayload(appId, actionType = 'NATIVE_LAUNCH', metaTag = '') {
  return {
    method: 'ms.channel.emit',
    params: {
      data: {
        action_type: actionType,
        appId: String(appId),
        metaTag: String(metaTag)
      },
      event: 'ed.apps.launch',
      to: 'host'
    }
  };
}

/**
 * Samsung SmartThings Cloud API (`https://api.smartthings.com/v1`) support
 * for cloud-hosted deployments where the MCP server is not on the TV's local LAN.
 */
export async function smartThingsRequest(endpointPath, { token, method = 'GET', body = null, timeoutMs = 8000 } = {}) {
  const apiToken = token || process.env.SMARTTHINGS_TOKEN;
  if (!apiToken) {
    throw new Error(
      'Missing SmartThings Personal Access Token. Pass `smartthings_token` or set SMARTTHINGS_TOKEN (create one at https://account.smartthings.com/tokens).'
    );
  }
  const url = `https://api.smartthings.com/v1${endpointPath}`;
  const payload = body ? JSON.stringify(body) : null;
  const res = await httpRequest(url, {
    method,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      Accept: 'application/json',
      ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(payload)) } : {})
    },
    body: payload,
    timeoutMs
  });
  let parsed = null;
  try {
    parsed = res.body ? JSON.parse(res.body) : null;
  } catch {
    parsed = { raw: res.body };
  }
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`SmartThings API HTTP ${res.statusCode}: ${res.body}`);
  }
  return parsed;
}

export async function listSmartThingsTvs({ token } = {}) {
  const data = await smartThingsRequest('/devices', { token });
  const items = Array.isArray(data?.items) ? data.items : [];
  return items
    .filter((d) => {
      const text = JSON.stringify(d).toLowerCase();
      return text.includes('television') || text.includes('samsungvd') || text.includes('tv');
    })
    .map((d) => ({
      deviceId: d.deviceId,
      name: d.name,
      label: d.label,
      manufacturerName: d.manufacturerName,
      Type: d.type
    }));
}

export function buildSmartThingsCommandPayload({ capability, command, args = [], component = 'main' }) {
  return {
    commands: [
      {
        component,
        capability,
        command,
        arguments: args
      }
    ]
  };
}

