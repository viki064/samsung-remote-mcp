#!/usr/bin/env node
import crypto from 'node:crypto';
import http from 'node:http';
import readline from 'node:readline';
import {
  KEY_ALIASES,
  KNOWN_TV_APPS,
  SAMSUNG_KEYS,
  buildInstalledAppsPayload,
  buildLaunchAppPayload,
  buildLegacyPackets,
  buildRemoteKeyPayload,
  buildSendTextPayload,
  buildTouchpadClickPayload,
  buildTouchpadMovePayload,
  discoverSamsungTvs,
  executeTizenWebSocketSession,
  fetchTvDeviceInfo,
  getStateFilePath,
  httpRequest,
  loadSavedTvState,
  loadSessionTvRecord,
  normalizeSessionId,
  parseDialAppState,
  resolveAppId,
  resolveDialAppName,
  resolveKeyCode,
  resolveTargetTv,
  saveTvState,
  sendLegacyTcpKeys,
  sendWakeOnLan,
} from './protocol.mjs';

const SERVER_INFO = {
  name: 'samsung-remote-mcp',
  version: '2.0.0'
};

const SESSION_ID_PROP = {
  session_id: {
    type: 'string',
    description:
      'Optional session identifier for isolating saved TVs per client/user session (automatically populated from Mcp-Session-Id header or SSE sessionId when omitted).'
  }
};

export const TOOLS = [
  {
    name: 'discover_tvs',
    description:
      'Discover Samsung Smart TVs on the local Wi-Fi/LAN via SSDP multicast (M-SEARCH) and query http://<ip>:8001/api/v2/ for model, friendly name, MAC address, and token auth support (matches the device discovery screen in Remote for Samsung id1455009028).',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...SESSION_ID_PROP,
        timeout_ms: {
          type: 'integer',
          description: 'Discovery listen window in milliseconds (default: 3000).',
          minimum: 500,
          maximum: 15000
        },
        auto_save_first: {
          type: 'boolean',
          description: 'Automatically save the first discovered TV to the current session (default: true).'
        }
      }
    }
  },
  {
    name: 'connect_tv',
    description:
      'Connect and pair with a Samsung Smart TV over WebSocket (wss://:8002 or ws://:8001) or Legacy TCP (:55000), capture the pairing token when authorized on the TV screen, and auto-save the TV profile in the current session (matches the Auto-Save feature in id1455009028).',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['host'],
      properties: {
        ...SESSION_ID_PROP,
        host: {
          type: 'string',
          description: 'IPv4 address or hostname of the Samsung TV (e.g. "192.168.1.102").'
        },
        port: {
          type: 'integer',
          description: 'Port number: 8002 for TLS WebSocket (2016+ Tizen TVs, default), 8001 for plain WebSocket, or 55000 for pre-2016 Legacy TCP.',
          enum: [8001, 8002, 55000]
        },
        mac: {
          type: 'string',
          description: 'Optional TV Wi-Fi/Ethernet MAC address for Wake-on-LAN (auto-detected from /api/v2/ when available).'
        },
        remote_name: {
          type: 'string',
          description: 'Display name shown on the TV pairing prompt (default: "Remote for Samsung MCP").'
        },
        token: {
          type: 'string',
          description: 'Existing pairing token if already paired.'
        },
        timeout_ms: {
          type: 'integer',
          description: 'Connection/pairing timeout in milliseconds (default: 10000).'
        },
        save_only: {
          type: 'boolean',
          description: 'When true, save the TV profile to the current session without opening a live socket.'
        }
      }
    }
  },
  {
    name: 'get_saved_tv',
    description:
      'Return the active auto-saved Samsung TV profile and all saved TVs for the current session (host, port, protocol, MAC, pairing token).',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...SESSION_ID_PROP
      }
    }
  },
  {
    name: 'get_tv_status',
    description:
      'Query a Samsung Smart TV HTTP REST endpoint (http://<host>:8001/api/v2/) for live device metadata, model name, Wi-Fi MAC, OS version, token auth support, and voice support.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...SESSION_ID_PROP,
        host: {
          type: 'string',
          description: 'TV IPv4 address. Defaults to the current session saved TV host.'
        },
        timeout_ms: {
          type: 'integer',
          description: 'HTTP timeout in milliseconds (default: 3000).'
        }
      }
    }
  },
  {
    name: 'wake_tv',
    description:
      'Power on a sleeping Samsung Smart TV using Wake-on-LAN (UDP magic packet to the TV MAC address), with optional dry-run inspection.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...SESSION_ID_PROP,
        mac: {
          type: 'string',
          description: 'TV MAC address (e.g. "AA:BB:CC:DD:EE:FF"). Defaults to the current session saved TV MAC.'
        },
        broadcast_address: {
          type: 'string',
          description: 'UDP broadcast address (default: "255.255.255.255").'
        },
        port: {
          type: 'integer',
          description: 'UDP Wake-on-LAN port (default: 9).'
        },
        dry_run: {
          type: 'boolean',
          description: 'When true, validate and return the magic packet details without sending UDP traffic.'
        }
      }
    }
  },
  {
    name: 'send_key',
    description:
      'Press a remote button on the Samsung TV. Supports friendly names from the Remote for Samsung UI (power, source, 0-9, pre-ch, vol+, vol-, mute, ch+, ch-, up, down, left, right, select, back, home, play, pause, rewind, fast_forward, previous, next, menu, guide, info, exit, ambient) and all 245+ raw KEY_* codes.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['key'],
      properties: {
        ...SESSION_ID_PROP,
        key: {
          type: 'string',
          description: 'Button alias (e.g. "vol+", "mute", "home", "select", "power") or Samsung key code (e.g. "KEY_VOLUP").'
        },
        action: {
          type: 'string',
          description: 'Key press mode for Tizen WebSocket: "Click" (default), "Press" (hold down), or "Release".',
          enum: ['Click', 'Press', 'Release']
        },
        host: {
          type: 'string',
          description: 'TV IPv4 address. Defaults to the current session saved TV.'
        },
        port: {
          type: 'integer',
          description: 'TV port (8002, 8001, or 55000). Defaults to the current session saved TV.'
        },
        token: {
          type: 'string',
          description: 'Pairing token override.'
        },
        dry_run: {
          type: 'boolean',
          description: 'When true, return the exact WebSocket JSON frame and Legacy TCP packet without opening a network socket.'
        }
      }
    }
  },
  {
    name: 'send_keys',
    description:
      'Send an ordered sequence of remote control button presses (e.g. ["1", "2", "5", "enter"] to change channels or navigate menus) with a configurable delay between keys.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['keys'],
      properties: {
        ...SESSION_ID_PROP,
        keys: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 50,
          description: 'Ordered list of button aliases or KEY_* codes to send.'
        },
        delay_ms: {
          type: 'integer',
          description: 'Delay between keys in milliseconds (default: 250).',
          minimum: 50,
          maximum: 5000
        },
        host: {
          type: 'string',
          description: 'TV IPv4 address. Defaults to the current session saved TV.'
        },
        port: {
          type: 'integer',
          description: 'TV port (8002, 8001, or 55000). Defaults to the current session saved TV.'
        },
        token: {
          type: 'string',
          description: 'Pairing token override.'
        },
        dry_run: {
          type: 'boolean',
          description: 'When true, return the resolved key sequence and wire payloads without network I/O.'
        }
      }
    }
  },
  {
    name: 'send_text',
    description:
      'Send keyboard text input to the active search/input field on the Samsung Smart TV via base64 SendInputString (matches the Keyboard feature in Remote for Samsung id1455009028).',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['text'],
      properties: {
        ...SESSION_ID_PROP,
        text: {
          type: 'string',
          description: 'UTF-8 text string to type into the active TV input field.'
        },
        submit: {
          type: 'boolean',
          description: 'When true, also send KEY_ENTER after the text payload.'
        },
        host: {
          type: 'string',
          description: 'TV IPv4 address. Defaults to the current session saved TV.'
        },
        port: {
          type: 'integer',
          description: 'TV port (8002 or 8001). Defaults to the current session saved TV.'
        },
        token: {
          type: 'string',
          description: 'Pairing token override.'
        },
        dry_run: {
          type: 'boolean',
          description: 'When true, return the exact WebSocket JSON frame(s) without network I/O.'
        }
      }
    }
  },
  {
    name: 'touchpad_control',
    description:
      'Control the Samsung TV on-screen pointer/touchpad via relative movement (dx, dy), directional swipe (up/down/left/right), or click (LeftClick/RightClick), matching the Touchpad feature in Remote for Samsung id1455009028.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['mode'],
      properties: {
        ...SESSION_ID_PROP,
        mode: {
          type: 'string',
          enum: ['move', 'swipe', 'click'],
          description: 'Touchpad operation: "move" (relative delta), "swipe" (directional gesture), or "click".'
        },
        dx: {
          type: 'number',
          description: 'Horizontal delta for mode="move" (negative = left, positive = right).'
        },
        dy: {
          type: 'number',
          description: 'Vertical delta for mode="move" (negative = up, positive = down).'
        },
        direction: {
          type: 'string',
          enum: ['up', 'down', 'left', 'right'],
          description: 'Swipe direction when mode="swipe".'
        },
        distance: {
          type: 'number',
          description: 'Swipe distance in pixels when mode="swipe" (default: 180).'
        },
        button: {
          type: 'string',
          enum: ['LeftClick', 'RightClick'],
          description: 'Mouse button when mode="click" (default: "LeftClick").'
        },
        host: {
          type: 'string',
          description: 'TV IPv4 address. Defaults to the current session saved TV.'
        },
        port: {
          type: 'integer',
          description: 'TV port (8002 or 8001). Defaults to the current session saved TV.'
        },
        token: {
          type: 'string',
          description: 'Pairing token override.'
        },
        dry_run: {
          type: 'boolean',
          description: 'When true, return the generated ProcessMouseDevice WebSocket frame without network I/O.'
        }
      }
    }
  },
  {
    name: 'list_tv_apps',
    description:
      'List known Samsung Smart TV apps (from the Apps tab in id1455009028: Prime Video, Apple TV, Netflix, Spotify, YouTube, Disney+, BeanBrowser, Gallery, etc.) and optionally query live installed apps from the TV via ed.installedApp.get.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...SESSION_ID_PROP,
        query_live_tv: {
          type: 'boolean',
          description: 'When true, query the connected Samsung TV over WebSocket (ed.installedApp.get) in addition to returning the built-in catalog.'
        },
        search: {
          type: 'string',
          description: 'Optional substring filter by app name or appId.'
        },
        host: {
          type: 'string',
          description: 'TV IPv4 address when query_live_tv=true.'
        },
        port: {
          type: 'integer',
          description: 'TV port when query_live_tv=true.'
        },
        token: {
          type: 'string',
          description: 'Pairing token override.'
        }
      }
    }
  },
  {
    name: 'launch_tv_app',
    description:
      'Launch an application on the Samsung Smart TV by friendly name (e.g. "Netflix", "YouTube", "Prime Video", "Apple TV", "Spotify", "Disney+", "Internet") or Tizen appId (matches the One-Touch Apps tab in id1455009028).',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['app'],
      properties: {
        ...SESSION_ID_PROP,
        app: {
          type: 'string',
          description: 'App name (e.g. "Netflix", "YouTube", "Prime Video") or Tizen appId (e.g. "11101200001").'
        },
        method: {
          type: 'string',
          enum: ['rest', 'websocket'],
          description: 'Launch transport: "rest" (POST http://<host>:8001/api/v2/applications/<appId>, default) or "websocket" (ed.apps.launch).'
        },
        action_type: {
          type: 'string',
          enum: ['NATIVE_LAUNCH', 'DEEP_LINK'],
          description: 'Action type for websocket launch (default: "NATIVE_LAUNCH").'
        },
        meta_tag: {
          type: 'string',
          description: 'Optional deep-link parameter / metaTag passed to the app.'
        },
        host: {
          type: 'string',
          description: 'TV IPv4 address. Defaults to the current session saved TV.'
        },
        port: {
          type: 'integer',
          description: 'TV port (8002 or 8001). Defaults to the current session saved TV.'
        },
        token: {
          type: 'string',
          description: 'Pairing token override.'
        },
        dry_run: {
          type: 'boolean',
          description: 'When true, return the resolved appId, REST endpoint, and WebSocket payload without network I/O.'
        }
      }
    }
  },
  {
    name: 'dial_app',
    description:
      'Launch, check, or stop an app on the Samsung TV via DIAL (Discovery and Launch, http://<host>:8080/ws/apps/<App>). Use this when launch_tv_app fails: e.g. Netflix on the TU7000, whose Tizen appId 11101200001 returns 404 on POST /api/v2/applications, while DIAL POST /ws/apps/Netflix returns 201 and the app opens. Unlike the websocket launch (which reports ok as soon as the frame is sent), this verifies the result by re-reading the app state (stopped/running). DIAL app names are case-sensitive: Netflix, YouTube, Spotify.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['app'],
      properties: {
        ...SESSION_ID_PROP,
        app: {
          type: 'string',
          description: 'DIAL app name, e.g. "Netflix", "YouTube", "Spotify".'
        },
        action: {
          type: 'string',
          enum: ['launch', 'status', 'stop'],
          description: 'Action to perform (default: "launch").'
        },
        payload: {
          type: 'string',
          description: 'Optional DIAL launch payload sent as the POST body (e.g. a YouTube video id). Empty by default.'
        },
        host: {
          type: 'string',
          description: 'TV IPv4 address. Defaults to the current session saved TV.'
        },
        port: {
          type: 'integer',
          description: 'DIAL port (default: 8080).'
        },
        dry_run: {
          type: 'boolean',
          description: 'When true, return the resolved DIAL app name and URL without network I/O.'
        }
      }
    }
  },
  {
    name: 'cast_media_url',

    description:
      'Cast a YouTube video link (via DIAL POST http://<host>:8080/ws/apps/YouTube) or open a web/media URL in the Samsung TV browser (org.tizen.browser), matching the Cast to TV feature in id1455009028.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['url'],
      properties: {
        ...SESSION_ID_PROP,
        url: {
          type: 'string',
          description: 'YouTube video URL or HTTP(S) media/web URL to open on the TV.'
        },
        host: {
          type: 'string',
          description: 'TV IPv4 address. Defaults to the current session saved TV.'
        },
        port: {
          type: 'integer',
          description: 'TV WebSocket port when launching browser (default: 8002).'
        },
        token: {
          type: 'string',
          description: 'Pairing token override.'
        },
        dry_run: {
          type: 'boolean',
          description: 'When true, return the cast request details without sending network traffic.'
        }
      }
    }
  },
  {
    name: 'list_supported_keys',
    description:
      'List all friendly remote button aliases mapped from the Remote for Samsung UI (id1455009028) and the full catalog of 245+ Samsung KEY_* codes.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        filter: {
          type: 'string',
          description: 'Optional case-insensitive substring filter.'
        }
      }
    }
  }
];

function extractYouTubeVideoId(url) {
  const match = String(url).match(/.*(?:youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|shorts\/)([^#&?]*).*/);
  return match && match[1] && match[1].length >= 6 ? match[1] : null;
}

export async function handleToolCall(name, args = {}, transportSessionId = 'default') {
  const sessionId = normalizeSessionId(args.session_id || transportSessionId);

  switch (name) {
    case 'discover_tvs': {
      const timeoutMs = Number(args.timeout_ms || 3000);
      const autoSaveFirst = args.auto_save_first !== false;
      const tvs = await discoverSamsungTvs({ timeoutMs });
      let savedProfile = null;
      if (autoSaveFirst && tvs.length > 0) {
        const first = tvs[0];
        savedProfile = await saveTvState(
          {
            host: first.ip,
            port: first.tokenAuthSupport === false ? 8001 : 8002,
            protocol: first.tokenAuthSupport === false ? 'ws' : 'wss',
            mac: first.wifiMac || '',
            tvName: first.name || 'Samsung TV',
            modelName: first.modelName || null
          },
          sessionId
        );
      }
      return {
        session_id: sessionId,
        discovered_count: tvs.length,
        tvs,
        auto_saved_profile: savedProfile
      };
    }

    case 'connect_tv': {
      const host = args.host;
      let deviceInfo = null;
      if (!args.save_only) {
        try {
          deviceInfo = await fetchTvDeviceInfo(host, 2500);
        } catch {
          // TV may be legacy (:55000) or HTTP info endpoint may be unreachable
        }
      }

      const port = Number(
        args.port || (deviceInfo?.tokenAuthSupport === false ? 8001 : 8002)
      );
      const remoteName = args.remote_name || 'Remote for Samsung MCP';
      const existingToken = args.token || '';
      const mac = args.mac || deviceInfo?.wifiMac || '';
      const timeoutMs = Number(args.timeout_ms || 10000);

      if (args.save_only || port === 55000) {
        const saved = await saveTvState(
          {
            host,
            port,
            protocol: port === 55000 ? 'legacy' : port === 8001 ? 'ws' : 'wss',
            mac,
            name: remoteName,
            token: existingToken,
            tvName: deviceInfo?.name || 'Samsung TV',
            modelName: deviceInfo?.modelName || null
          },
          sessionId
        );
        return {
          session_id: sessionId,
          connected: !args.save_only,
          saved_only: Boolean(args.save_only),
          protocol: saved.protocol,
          device_info: deviceInfo,
          saved_profile: saved
        };
      }

      const session = await executeTizenWebSocketSession({
        host,
        port,
        name: remoteName,
        token: existingToken,
        messages: [],
        timeoutMs
      });

      const saved = await saveTvState(
        {
          host,
          port,
          protocol: port === 8002 ? 'wss' : 'ws',
          mac,
          name: remoteName,
          token: session.token || existingToken || '',
          tvName: deviceInfo?.name || 'Samsung Smart TV',
          modelName: deviceInfo?.modelName || null
        },
        sessionId
      );

      return {
        session_id: sessionId,
        connected: true,
        protocol: session.protocol,
        token_received: Boolean(session.token),
        device_info: deviceInfo,
        saved_profile: saved
      };
    }

    case 'get_saved_tv': {
      const record = await loadSessionTvRecord(sessionId);
      return {
        session_id: sessionId,
        state_file: getStateFilePath(),
        has_saved_tv: Boolean(record?.activeTv),
        active_tv: record?.activeTv || null,
        saved_tvs: record?.tvs || []
      };
    }

    case 'get_tv_status': {
      const target = await resolveTargetTv(args, sessionId);
      const info = await fetchTvDeviceInfo(target.host, Number(args.timeout_ms || 3000));
      return {
        session_id: sessionId,
        online: true,
        target_host: target.host,
        device: info
      };
    }

    case 'wake_tv': {
      const saved = await loadSavedTvState(sessionId);
      const mac = args.mac || saved?.mac || process.env.SAMSUNG_TV_MAC;
      if (!mac) {
        throw new Error(
          `No MAC address provided and none found in saved TV profile for session "${sessionId}". Pass \`mac\` (e.g. "AA:BB:CC:DD:EE:FF").`
        );
      }
      const broadcastAddress = args.broadcast_address || '255.255.255.255';
      const port = Number(args.port || 9);
      if (args.dry_run) {
        const cleaned = mac.replace(/[^0-9a-fA-F]/g, '');
        if (cleaned.length !== 12) {
          throw new Error(`Invalid MAC address "${mac}".`);
        }
        return {
          dry_run: true,
          session_id: sessionId,
          action: 'wake_tv',
          mac,
          broadcast_address: broadcastAddress,
          port,
          magic_packet_bytes: 102
        };
      }
      const res = await sendWakeOnLan(mac, { broadcastAddress, port });
      return { session_id: sessionId, ...res };
    }

    case 'send_key': {
      const resolvedKey = resolveKeyCode(args.key);
      const action = args.action || 'Click';
      const wsPayload = buildRemoteKeyPayload(resolvedKey, action);

      if (args.dry_run) {
        const saved = await loadSavedTvState(sessionId);
        const legacy = buildLegacyPackets({ key: resolvedKey });
        return {
          dry_run: true,
          session_id: sessionId,
          target_host: args.host || saved?.host || null,
          requested_key: args.key,
          resolved_key: resolvedKey,
          action,
          tizen_websocket_frame: wsPayload,
          legacy_tcp_55000_hex: {
            handshake: legacy.handshakePacket.toString('hex'),
            command: legacy.keyPacket.toString('hex')
          }
        };
      }

      const target = await resolveTargetTv(args, sessionId);
      if (target.port === 55000 || target.protocol === 'legacy') {
        const res = await sendLegacyTcpKeys({
          host: target.host,
          port: 55000,
          keys: [resolvedKey],
          remoteName: target.name
        });
        return {
          ok: true,
          session_id: sessionId,
          requested_key: args.key,
          resolved_key: resolvedKey,
          ...res
        };
      }

      const session = await executeTizenWebSocketSession({
        host: target.host,
        port: target.port,
        name: target.name,
        token: target.token,
        messages: [wsPayload]
      });

      if (session.token && session.token !== target.token) {
        await saveTvState({ host: target.host, port: target.port, token: session.token }, sessionId);
      }

      return {
        ok: true,
        session_id: sessionId,
        requested_key: args.key,
        resolved_key: resolvedKey,
        action,
        host: target.host,
        port: target.port,
        protocol: session.protocol
      };
    }

    case 'send_keys': {
      const resolvedKeys = (args.keys || []).map((k) => resolveKeyCode(k));
      const delayMs = Number(args.delay_ms || 250);
      const wsPayloads = resolvedKeys.map((k) => buildRemoteKeyPayload(k, 'Click'));

      if (args.dry_run) {
        const saved = await loadSavedTvState(sessionId);
        return {
          dry_run: true,
          session_id: sessionId,
          target_host: args.host || saved?.host || null,
          requested_keys: args.keys,
          resolved_keys: resolvedKeys,
          delay_ms: delayMs,
          tizen_websocket_frames: wsPayloads
        };
      }

      const target = await resolveTargetTv(args, sessionId);
      if (target.port === 55000 || target.protocol === 'legacy') {
        const res = await sendLegacyTcpKeys({
          host: target.host,
          port: 55000,
          keys: resolvedKeys,
          remoteName: target.name,
          interKeyDelayMs: delayMs
        });
        return { session_id: sessionId, ...res };
      }

      const session = await executeTizenWebSocketSession({
        host: target.host,
        port: target.port,
        name: target.name,
        token: target.token,
        messages: wsPayloads,
        interMessageDelayMs: delayMs
      });

      if (session.token && session.token !== target.token) {
        await saveTvState({ host: target.host, port: target.port, token: session.token }, sessionId);
      }

      return {
        ok: true,
        session_id: sessionId,
        resolved_keys: resolvedKeys,
        count: resolvedKeys.length,
        host: target.host,
        port: target.port,
        protocol: session.protocol
      };
    }

    case 'send_text': {
      const textPayload = buildSendTextPayload(args.text);
      const messages = [textPayload];
      if (args.submit) {
        messages.push(buildRemoteKeyPayload('KEY_ENTER', 'Click'));
      }

      if (args.dry_run) {
        const saved = await loadSavedTvState(sessionId);
        return {
          dry_run: true,
          session_id: sessionId,
          target_host: args.host || saved?.host || null,
          text: args.text,
          submit: Boolean(args.submit),
          tizen_websocket_frames: messages
        };
      }

      const target = await resolveTargetTv(args, sessionId);
      if (target.port === 55000 || target.protocol === 'legacy') {
        throw new Error('Legacy TCP port 55000 does not support SendInputString text input; use Tizen WebSocket port 8001 or 8002.');
      }

      const session = await executeTizenWebSocketSession({
        host: target.host,
        port: target.port,
        name: target.name,
        token: target.token,
        messages
      });

      return {
        ok: true,
        session_id: sessionId,
        text_length: String(args.text).length,
        submitted: Boolean(args.submit),
        host: target.host,
        port: target.port,
        protocol: session.protocol
      };
    }

    case 'touchpad_control': {
      const mode = args.mode;
      let payload;
      if (mode === 'click') {
        payload = buildTouchpadClickPayload(args.button || 'LeftClick');
      } else if (mode === 'swipe') {
        const dist = Number(args.distance || 180);
        const dir = args.direction || 'up';
        const deltas = {
          up: { dx: 0, dy: -dist },
          down: { dx: 0, dy: dist },
          left: { dx: -dist, dy: 0 },
          right: { dx: dist, dy: 0 }
        }[dir];
        if (!deltas) {
          throw new Error(`Invalid swipe direction "${dir}". Expected up, down, left, or right.`);
        }
        payload = buildTouchpadMovePayload({ dx: deltas.dx, dy: deltas.dy, time: 1 });
      } else if (mode === 'move') {
        payload = buildTouchpadMovePayload({
          dx: Number(args.dx || 0),
          dy: Number(args.dy || 0),
          time: 1
        });
      } else {
        throw new Error(`Unsupported touchpad mode "${mode}".`);
      }

      if (args.dry_run) {
        const saved = await loadSavedTvState(sessionId);
        return {
          dry_run: true,
          session_id: sessionId,
          target_host: args.host || saved?.host || null,
          mode,
          tizen_websocket_frame: payload
        };
      }

      const target = await resolveTargetTv(args, sessionId);
      const session = await executeTizenWebSocketSession({
        host: target.host,
        port: target.port,
        name: target.name,
        token: target.token,
        messages: [payload]
      });

      return {
        ok: true,
        session_id: sessionId,
        mode,
        host: target.host,
        port: target.port,
        protocol: session.protocol,
        sent_frame: payload
      };
    }

    case 'list_tv_apps': {
      const searchFilter = args.search ? args.search.toLowerCase().trim() : null;
      const catalog = Object.entries(KNOWN_TV_APPS)
        .map(([name, appId]) => ({ name, appId }))
        .filter(
          (entry) =>
            !searchFilter ||
            entry.name.toLowerCase().includes(searchFilter) ||
            entry.appId.toLowerCase().includes(searchFilter)
        );

      let liveApps = null;
      let liveError = null;
      if (args.query_live_tv) {
        try {
          const target = await resolveTargetTv(args, sessionId);
          const session = await executeTizenWebSocketSession({
            host: target.host,
            port: target.port,
            name: target.name,
            token: target.token,
            messages: [buildInstalledAppsPayload()],
            waitForEvent: 'ed.installedApp.get',
            timeoutMs: 6000
          });
          const rawApps = session.responseEvent?.data?.data || [];
          liveApps = rawApps.filter(
            (a) =>
              !searchFilter ||
              String(a.name || '').toLowerCase().includes(searchFilter) ||
              String(a.appId || '').toLowerCase().includes(searchFilter)
          );
        } catch (err) {
          liveError = err instanceof Error ? err.message : String(err);
        }
      }

      return {
        session_id: sessionId,
        catalog_count: catalog.length,
        known_apps: catalog,
        live_tv_apps: liveApps,
        live_tv_error: liveError
      };
    }

    case 'launch_tv_app': {
      const { appId, matchedName } = resolveAppId(args.app);
      const method = args.method || 'rest';
      const actionType = args.action_type || 'NATIVE_LAUNCH';
      const metaTag = args.meta_tag || '';
      const wsPayload = buildLaunchAppPayload(appId, actionType, metaTag);

      if (args.dry_run) {
        const saved = await loadSavedTvState(sessionId);
        return {
          dry_run: true,
          session_id: sessionId,
          target_host: args.host || saved?.host || null,
          requested_app: args.app,
          resolved_app_id: appId,
          matched_catalog_name: matchedName,
          method,
          rest_endpoint_template: `POST http://<host>:8001/api/v2/applications/${appId}`,
          tizen_websocket_frame: wsPayload
        };
      }

      const target = await resolveTargetTv(args, sessionId);
      if (method === 'rest') {
        const url = `http://${target.host}:8001/api/v2/applications/${encodeURIComponent(appId)}`;
        const res = await httpRequest(url, { method: 'POST', timeoutMs: 4000 });
        return {
          ok: res.statusCode >= 200 && res.statusCode < 300,
          session_id: sessionId,
          method: 'rest',
          url,
          status_code: res.statusCode,
          resolved_app_id: appId,
          matched_catalog_name: matchedName,
          response_body: res.body
        };
      }

      const session = await executeTizenWebSocketSession({
        host: target.host,
        port: target.port,
        name: target.name,
        token: target.token,
        messages: [wsPayload]
      });

      return {
        ok: true,
        session_id: sessionId,
        method: 'websocket',
        resolved_app_id: appId,
        matched_catalog_name: matchedName,
        host: target.host,
        port: target.port,
        protocol: session.protocol
      };
    }

    case 'dial_app': {
      const dialName = resolveDialAppName(args.app);
      const action = args.action || 'launch';
      const target = await resolveTargetTv({ ...args, port: args.port || 8080 }, sessionId);
      const dialUrl = `http://${target.host}:${target.port}/ws/apps/${encodeURIComponent(dialName)}`;

      if (args.dry_run) {
        return {
          dry_run: true,
          session_id: sessionId,
          requested_app: args.app,
          dial_app: dialName,
          action,
          dial_url: dialUrl,
          target_host: target.host
        };
      }

      const readState = async () => {
        try {
          const r = await httpRequest(dialUrl, { method: 'GET', timeoutMs: 6000 });
          return { status_code: r.statusCode, ...parseDialAppState(r.body) };
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      };

      if (action === 'status') {
        const state = await readState();
        return {
          ok: typeof state.status_code === 'number' && state.status_code >= 200 && state.status_code < 300,
          session_id: sessionId,
          dial_app: dialName,
          action,
          dial_url: dialUrl,
          ...state
        };
      }

      if (action === 'stop') {
        const res = await httpRequest(dialUrl, {
          method: 'DELETE',
          headers: { 'Content-Length': '0' },
          timeoutMs: 6000
        });
        const after = await readState();
        return {
          ok: res.statusCode >= 200 && res.statusCode < 300,
          session_id: sessionId,
          dial_app: dialName,
          action,
          dial_url: dialUrl,
          status_code: res.statusCode,
          state_after: after.state ?? null
        };
      }

      const before = await readState();
      const payload = args.payload ?? '';
      const res = await httpRequest(dialUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          'Content-Length': String(Buffer.byteLength(payload))
        },
        body: payload,
        timeoutMs: 6000
      });
      const after = await readState();
      return {
        ok: res.statusCode >= 200 && res.statusCode < 300,
        session_id: sessionId,
        dial_app: dialName,
        action: 'launch',
        dial_url: dialUrl,
        status_code: res.statusCode,
        state_before: before.state ?? null,
        state_after: after.state ?? null,
        response_body: res.body || null
      };
    }

    case 'cast_media_url': {

      const url = args.url;
      const ytVideoId = extractYouTubeVideoId(url);
      const browserFrame = buildLaunchAppPayload('org.tizen.browser', 'NATIVE_LAUNCH', url);

      if (args.dry_run) {
        const saved = await loadSavedTvState(sessionId);
        return {
          dry_run: true,
          session_id: sessionId,
          target_host: args.host || saved?.host || null,
          url,
          detected_type: ytVideoId ? 'youtube_dial' : 'tizen_browser_url',
          youtube_video_id: ytVideoId,
          dial_endpoint_template: ytVideoId ? 'POST http://<host>:8080/ws/apps/YouTube' : null,
          tizen_browser_frame: browserFrame
        };
      }

      const target = await resolveTargetTv(args, sessionId);
      if (ytVideoId) {
        const dialUrl = `http://${target.host}:8080/ws/apps/YouTube`;
        const res = await httpRequest(dialUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain',
            'Content-Length': String(Buffer.byteLength(ytVideoId))
          },
          body: ytVideoId,
          timeoutMs: 6000
        });
        return {
          ok: res.statusCode >= 200 && res.statusCode < 300,
          session_id: sessionId,
          cast_method: 'youtube_dial',
          youtube_video_id: ytVideoId,
          dial_url: dialUrl,
          status_code: res.statusCode
        };
      }

      const session = await executeTizenWebSocketSession({
        host: target.host,
        port: target.port,
        name: target.name,
        token: target.token,
        messages: [browserFrame]
      });

      return {
        ok: true,
        session_id: sessionId,
        cast_method: 'tizen_browser_launch',
        url,
        host: target.host,
        port: target.port,
        protocol: session.protocol
      };
    }

    case 'list_supported_keys': {
      const filter = args.filter ? args.filter.toLowerCase().trim() : null;
      const aliases = Object.fromEntries(
        Object.entries(KEY_ALIASES).filter(
          ([alias, code]) =>
            !filter || alias.toLowerCase().includes(filter) || code.toLowerCase().includes(filter)
        )
      );
      const keys = SAMSUNG_KEYS.filter((k) => !filter || k.toLowerCase().includes(filter));
      return {
        alias_count: Object.keys(aliases).length,
        key_code_count: keys.length,
        ui_button_aliases: aliases,
        samsung_key_codes: keys
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export async function processJsonRpcRequest(msg, sessionId = 'default') {
  if (!msg || typeof msg !== 'object') return null;
  const { id, method, params } = msg;

  try {
    if (method === 'initialize') {
      const clientProtocol = params?.protocolVersion || '2024-11-05';
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: clientProtocol,
          capabilities: {
            tools: { listChanged: false }
          },
          serverInfo: SERVER_INFO,
          sessionId
        }
      };
    }

    if (method === 'notifications/initialized' || method === 'initialized') {
      return null;
    }

    if (method === 'ping') {
      return { jsonrpc: '2.0', id, result: {} };
    }

    if (method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: TOOLS
        }
      };
    }

    if (method === 'tools/call') {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};
      try {
        const output = await handleToolCall(toolName, toolArgs, sessionId);
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(output, null, 2)
              }
            ],
            isError: false
          }
        };
      } catch (toolErr) {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    error: toolErr instanceof Error ? toolErr.message : String(toolErr),
                    tool: toolName,
                    session_id: sessionId
                  },
                  null,
                  2
                )
              }
            ],
            isError: true
          }
        };
      }
    }

    if (id !== undefined) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: `Method not found: ${method}`
        }
      };
    }
    return null;
  } catch (err) {
    if (id !== undefined) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : String(err)
        }
      };
    }
    return null;
  }
}

/**
 * Public Hosted HTTP MCP Server (no Bearer token required):
 * - POST /mcp (Streamable HTTP JSON-RPC; issues & honors `Mcp-Session-Id` header or `?sessionId=`)
 * - GET /sse & POST /messages?sessionId=<id> (HTTP+SSE transport with automatic session isolation)
 * - GET /health (Deployment healthcheck)
 */
export function startHttpMcpServer({ host = '0.0.0.0', port = 3000 } = {}) {
  const sseClients = new Map();

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id');
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          healthy: true,
          public: true,
          auth_enabled: false,
          session_scoped_tvs: true,
          server: SERVER_INFO,
          transport: 'streamable-http+sse',
          tool_count: TOOLS.length
        })
      );
      return;
    }

    // Legacy SSE endpoint (`GET /sse`)
    if (req.method === 'GET' && url.pathname === '/sse') {
      const sessionId = normalizeSessionId(url.searchParams.get('sessionId') || crypto.randomUUID());
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Mcp-Session-Id': sessionId
      });
      sseClients.set(sessionId, res);
      res.write(`event: endpoint\ndata: /messages?sessionId=${encodeURIComponent(sessionId)}\n\n`);
      req.on('close', () => {
        sseClients.delete(sessionId);
      });
      return;
    }

    // Streamable HTTP (`POST /mcp`) or SSE message endpoint (`POST /messages`)
    if (req.method === 'POST' && (url.pathname === '/mcp' || url.pathname === '/messages')) {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const rawBody = Buffer.concat(chunks).toString('utf8');
      let parsed;
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }));
        return;
      }

      const headerSessionId = req.headers['mcp-session-id'];
      const querySessionId = url.searchParams.get('sessionId') || url.searchParams.get('session_id');
      const isInit =
        (!Array.isArray(parsed) && parsed?.method === 'initialize') ||
        (Array.isArray(parsed) && parsed.some((m) => m?.method === 'initialize'));

      const sessionId = normalizeSessionId(
        headerSessionId || querySessionId || (isInit ? crypto.randomUUID() : 'default')
      );
      res.setHeader('Mcp-Session-Id', sessionId);

      const responses = Array.isArray(parsed)
        ? (await Promise.all(parsed.map((item) => processJsonRpcRequest(item, sessionId)))).filter(Boolean)
        : [await processJsonRpcRequest(parsed, sessionId)].filter(Boolean);

      if (url.pathname === '/messages' && sseClients.has(sessionId)) {
        const sseRes = sseClients.get(sessionId);
        for (const r of responses) {
          sseRes.write(`event: message\ndata: ${JSON.stringify(r)}\n\n`);
        }
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ accepted: true, sessionId }));
        return;
      }

      if (responses.length === 0) {
        res.writeHead(202);
        res.end();
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(Array.isArray(parsed) ? responses : responses[0]));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'Not found',
        endpoints: {
          mcp_streamable_http: 'POST /mcp',
          mcp_sse: 'GET /sse',
          mcp_sse_messages: 'POST /messages',
          health: 'GET /health'
        }
      })
    );
  });

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      resolve(server);
    });
  });
}

async function main() {
  if (process.argv.includes('--doctor')) {
    console.log(
      JSON.stringify(
        {
          healthy: true,
          public: true,
          auth_enabled: false,
          session_scoped_tvs: true,
          server: SERVER_INFO,
          tool_count: TOOLS.length,
          tools: TOOLS.map((t) => t.name),
          transports: ['stdio', 'streamable-http (/mcp)', 'sse (/sse)'],
          state_file: getStateFilePath()
        },
        null,
        2
      )
    );
    return;
  }

  const useHttp =
    process.argv.includes('--http') ||
    process.env.MCP_TRANSPORT === 'http' ||
    Boolean(process.env.PORT && !process.stdin.isTTY === false);

  if (useHttp) {
    const portIndex = process.argv.indexOf('--port');
    const port = Number(
      (portIndex !== -1 && process.argv[portIndex + 1]) || process.env.PORT || 3000
    );
    const host = process.env.HOST || '0.0.0.0';
    const server = await startHttpMcpServer({ host, port });
    const addr = server.address();
    console.error(
      JSON.stringify({
        status: 'listening',
        public: true,
        server: SERVER_INFO,
        url: `http://${host === '0.0.0.0' ? 'localhost' : host}:${addr.port}/mcp`,
        sse_url: `http://${host === '0.0.0.0' ? 'localhost' : host}:${addr.port}/sse`,
        health_url: `http://${host === '0.0.0.0' ? 'localhost' : host}:${addr.port}/health`
      })
    );
    return;
  }

  const stdioSessionId = normalizeSessionId(process.env.MCP_SESSION_ID || 'default');
  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false
  });

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      process.stdout.write(
        `${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`
      );
      return;
    }
    const response = await processJsonRpcRequest(parsed, stdioSessionId);
    if (response) {
      process.stdout.write(`${JSON.stringify(response)}\n`);
    }
  });
}

main();
