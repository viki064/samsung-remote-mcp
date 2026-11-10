# Samsung Remote MCP Server (`samsung-remote-mcp`)

An MCP server exposing the remote control, touchpad, keyboard, app launcher, and media casting actions of **Remote for Samsung** ([App Store `id1455009028`](https://apps.apple.com/us/app/remote-for-samsung/id1455009028), bundle ID `com.osfunapps.tv-samsung-remote-ios`, publisher Oz Shabbatth / `osfunapps`).

## Provenance & Evidence Boundary

### 1. Observed Facts (Public Artifacts & REA Inspection)
- **Apple App Store Metadata (`itunes.apple.com/lookup?id=1455009028`)**:
  - Bundle ID: `com.osfunapps.tv-samsung-remote-ios`, Version `18.5`, Publisher: Oz Shabbatth (`osfunapps`, `https://www.osfunapps.com`).
  - Advertised capabilities: Auto-save of last connected remote, fast touchpad & keyboard for quick swipes, App Bar launcher, Cast to TV, and light/dark remote themes.
  - Official UI Screenshots (`screen_1.png`–`screen_10.png`):
    - **Screen 3 (Keypad Remote)**: `POWER`, `SOURCE`, `0`–`9`, `-` (dash), `PRE-CH`, `VOL +`/`-`, `MUTE`, `CH ^`/`v`, Keyboard (`⌨️`), and Cast/Connect (`->📺`).
    - **Screen 4 & 6 (Cast & Voice)**: Cast to TV (`Slideshow`, `Gallery`, `Files`) and Voice command sheet.
    - **Screen 5 (Apps Tab)**: One-touch app launcher with search (`Amazon Prime Video`, `Apple TV`, `BeanBrowser`, `Bluetooth Audio`, `Cellcom TV`, `Google Chrome`, `Netflix`, `Spotify`, `Skype`).
    - **Screen 7 (Navigation & Media)**: Circular D-Pad (`UP`, `DOWN`, `LEFT`, `RIGHT`, `SELECT`), `BACK`, `VOL`, `HOME`, and transport controls (`|<<`, `<<`, `||`, `>>`, `>>|`).
    - **Screen 10 (Discovery/Connection)**: Connects to `[TV]SAMSUNG LED40` over local IPv4.
- **Publisher's Public Repositories (`github.com/osfunapps`)**:
  - `osfunapps/samsungCTLOriginal`: Contains Python 2.7 bytecode (`remote_websocket.pyc`, SHA-256 `a5d83c7eea76dc2f904f478d6ba4d1da62f7f2bcf2af3d13abd58e395bd43ca7`, magic `62211` observed via REA `inspect_python_pyc`) and source implementing Tizen WebSocket (`ws://<host>:8001/api/v2/channels/samsung.remote.control?name=<base64>`) and Legacy TCP (`:55000`, `0x64 0x00` handshake + `0x00 0x00 0x00` key frames).
  - `osfunapps/remotes-list-config` (`remotes-list/remotes_list.xml`): Maps `com.osfunapps.remoteforsamsung` remote profiles (`samsung_1`..`tv_samsung_18`).
  - `osfunapps/Connect-SDK-iOS-Core` & `Connect-SDK-iOS-Lite`: iOS Connect SDK fork for SSDP discovery and DLNA/DIAL casting.
- **Reference Package (`samsung-tv-control@1.14.0`)**:
  - Inspected with REA (`open_binary` / `inspect_artifact`, Evidence ID `ev_8797ef57a8da09f2adb41f008465eeed947f704531cf4ab4439a48b7f3c9d78c` on `lib/samsung.js`, SHA-256 `9110938f8265e68cbe28aa582d98dc493ed74c3cf92a614184d964dcdcabbf4e`), providing 245+ `KEY_*` constants, Tizen `wss://:8002` token auth, `SendInputString` base64 keyboard input, `ed.installedApp.get` / `ed.apps.launch`, SSDP `urn:samsung.com:device`, YouTube DIAL `:8080/ws/apps/YouTube`, and Wake-on-LAN.

### 2. Unknowns & Limitations
- Apple does not provide unauthenticated `.ipa` downloads from `apps.apple.com` without an Apple account/device, and App Store `.ipa` binaries are protected by Apple FairPlay DRM (which REA does not bypass per `CONTRIBUTING.md`). Therefore, the closed-source Mach-O binary inside `com.osfunapps.tv-samsung-remote-ios` was not decompiled.

## Exposed MCP Tools (12 Tools)

| Tool | App Feature (`id1455009028`) | Protocol / Mechanism |
|---|---|---|
| `discover_tvs` | Screen 10 (TV Discovery) | SSDP `M-SEARCH` (`239.255.255.250:1900`) + `GET http://<ip>:8001/api/v2/` |
| `connect_tv` | Auto-Save Last Remote & Pairing | `wss://<ip>:8002/api/v2/channels/samsung.remote.control`, saves token to `~/.samsung-remote-mcp/saved-tv.json` |
| `get_saved_tv` | Auto-Save Last Remote | Reads `~/.samsung-remote-mcp/saved-tv.json` |
| `get_tv_status` | Connection Status | `GET http://<ip>:8001/api/v2/` |
| `wake_tv` | Power On (Standby Wake) | UDP Wake-on-LAN 102-byte magic packet to TV MAC |
| `send_key` | Screen 3 & 7 Remote Buttons | Tizen `ms.remote.control` (`SendRemoteKey`) or Legacy TCP `:55000` |
| `send_keys` | Multi-key Channel / Menu Macros | Sequential `SendRemoteKey` or Legacy TCP `:55000` |
| `send_text` | Screen 3 & 5 Built-in Keyboard (`⌨️`) | Tizen `ms.remote.control` (`SendInputString`, base64 UTF-8) |
| `touchpad_control` | Touchpad Swipe & Click | Tizen `ms.remote.control` (`ProcessMouseDevice`, `Move` / `LeftClick` / `RightClick`) |
| `list_tv_apps` | Screen 5 Apps Tab | Built-in Tizen app catalog + live `ms.channel.emit` (`ed.installedApp.get`) |
| `launch_tv_app` | Screen 5 One-Touch App Launch | `POST http://<ip>:8001/api/v2/applications/<appId>` or WebSocket `ed.apps.launch` |
| `cast_media_url` | Screen 4 & 6 Cast to TV | YouTube DIAL (`POST http://<ip>:8080/ws/apps/YouTube`) or `org.tizen.browser` deep-link |
| `list_supported_keys` | Button & Key Catalog | 50+ UI button aliases + 245+ Samsung `KEY_*` codes |
