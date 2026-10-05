# Twitch Chat Widget — Implementation Plan

## Goal

New SealHUD widget `twitchChat` that shows live chat of a configurable Twitch channel.

- Looks like other widgets (dark panel, orange accent bar, Roboto Condensed).
- Draggable, and zoomable with the mouse wheel like every other widget (Shift+wheel = coarse step).
- Turned on/off by the standard widget checkbox in Settings (the config flag). **Off by default.**
- Channel name set in Settings and saved in `localStorage`. **One global channel for all layouts.**
- Read-only connection to Twitch's public anonymous IRC-over-WebSocket. No OAuth, no client-id, no backend.
- Messages from known bots (Nightbot, StreamElements, …) are hidden by default.
- The header shows the live viewer count: `0` when the channel is offline, otherwise the number.
- Only native Twitch emotes. BTTV/7TV/FFZ are out of scope.

## How the repo works (what the plan builds on)

| Concern | Where | Notes |
|---|---|---|
| Widget settings shape | `src/components/app/app.tsx:79` `IWidgetSetting` | `enabled`, `zoom`, `position`, `subSettings`, `name()` |
| Default settings | `app.tsx:273` `defaultsettings` **and** `app.tsx:1007` `settings` | Two identical copies. New widget must go in **both** (reset reads `defaultsettings`, `app.tsx:2010`) |
| Persistence | `saveSettings()` `app.tsx:2412`, `recoverSettings()` `app.tsx:2433` | Saved per layout (`appSettings`, `appSettings2`, `appSettings3`). Recovery keeps only keys that exist in the defaults, so adding a widget is safe for old saves |
| Drag / zoom | `onMouseDown` `app.tsx:2298`, `onWheel` `app.tsx:2370` | Zoom is clamped to 0.1–3 and saved. Widgets get it for free via `widgetSettings(props)` (`src/lib/utils.ts:425`), which sets `data-id`, the handlers, and `transform: scale(zoom)` + top/left |
| Mounting a widget | e.g. CrewChief `app.tsx:3351` | `{this.settings.X.enabled && <X onMouseDown onWheel settings />}` |
| Settings UI | `getWidgetSetting` `app.tsx:4258` | Header checkbox = enable flag; body renders subSettings (generic checkboxes, or a custom renderer per widget) |
| Text input pattern | TV Tower logo URL: `renderTvTowerSettings` `app.tsx:4069`, `changeLogoUrl` `app.tsx:2513`, Enter handling `app.tsx:2255` + `app.tsx:1989` | Value kept in its own `localStorage` key, outside `appSettings` |
| WebSocket helper | `src/lib/reconnecting-websocket.ts` | Already used by CrewChief (`crewChief.tsx:44`) |
| Visual reference | `src/components/crewChief/crewChief.{tsx,scss}` | `rgba(0,0,0,0.9)` panel, `#ff4d06` accent-bar gradient |
| Translations | `src/translations.ts` | Per-locale key→string maps (de, en, fr, pt, it, …) |
| Runtime | The in-game browser is old Chromium 64 (`eIsIngameBrowser`, `app.tsx:117`); TS target is ES6 | Use no APIs newer than Chrome 64. WebSocket, `Map` and flexbox are all fine |

## Twitch connection (public, anonymous)

The endpoint is `wss://irc-ws.chat.twitch.tv:443` (TLS, so it works from `https://sealhud.github.io`).

When the socket opens, send:
```
CAP REQ :twitch.tv/tags twitch.tv/commands
PASS SCHMOOPIIE
NICK justinfan<random 5 digits>
JOIN #<channel lowercase>
```
- The `justinfanNNNNN` nick is Twitch's anonymous read-only login. No token is needed.
- When the server sends `PING :tmi.twitch.tv`, reply `PONG :tmi.twitch.tv`. If you don't, Twitch drops the socket after about 5 minutes.
- Parse `PRIVMSG` lines. One frame can hold several lines split by `\r\n`. Line format:
  `@tags :nick!nick@nick.tmi.twitch.tv PRIVMSG #chan :message`
  - Tags to use: `display-name`, `color`, `emotes` (`id:start-end,start-end/id2:...`), `badges`, `id`.
- Also handle:
  - `CLEARCHAT`: remove that user's messages, or all messages if no user is given.
  - `CLEARMSG`: remove the message with the given `target-msg-id`.
  - `RECONNECT`: close and reconnect.
  - `NOTICE` and `:tmi.twitch.tv 001`: log only.
- Emotes are images from `https://static-cdn.jtvnw.net/emoticons/v2/<id>/default/dark/1.0`.
  - The `start-end` offsets count UTF-16 code points, so split with `Array.from(text)`. Plain `.substr` breaks on emoji.

Reconnect with `ReconnectingWebSocket` and `reconnectInterval = 5000`. Re-send the login lines on every `onopen`.

## Bot filtering

- Hidden by default via subSetting `hideBots` (enabled: true).
- **The user can edit the bot list** (decided, in v1):
  - Settings shows a text input, `editBotList` subSetting, using the same click-to-edit + Enter pattern as the channel input.
  - It takes a comma- or space-separated list of logins.
  - Stored globally in `localStorage.twitchBotList`. An empty value means the default list. A "Reset" of the widget restores the default list.
  - The list is parsed by `parseBotList(text): string[]` (lowercase, trim, dedupe, valid logins only).
- Compare the lowercase login from the IRC prefix (`nick!…`) against the bot `Set`. The default list, `DEFAULT_BOT_LOGINS` in `src/lib/twitchChat.ts`, is:
  `nightbot, streamelements, streamlabs, moobot, fossabot, wizebot, sery_bot, botrixoficial, soundalerts, kofistreambot, blerp, streamstickers, own3d, pokemoncommunitygame, commanderroot, frostytoolsdotcom`.
- Also hide a message when its `badges` tag contains `bot-badge/`.
- Drop filtered messages in the client before they reach the buffer, so they cost no render.
- `isBot(login, badges): boolean` is exported so it can be tested.

## Viewer count

IRC chat doesn't carry the viewer count, so it needs an HTTP poll. On 2026-10-05 I checked the options from origin `https://sealhud.github.io`:

| Option | Auth | CORS | Result |
|---|---|---|---|
| Twitch Helix `GET /helix/streams?user_login=` | OAuth app token + Client-ID **required** | – | `401 OAuth token is missing`. Can't be used without shipping a secret or running a backend |
| **DecAPI** `GET https://decapi.me/twitch/viewercount/<channel>` | none | `Access-Control-Allow-Origin: *` | Plain-text body: the number (e.g. `38085`) when live, `<channel> is offline` when not. **Chosen.** |
| Twitch GQL `POST https://gql.twitch.tv/gql` with the public web Client-ID | none, but unofficial | `*` | `{user(login){stream{viewersCount}}}` works. It is undocumented and Twitch may block it at any time. **Fallback only**, not in v1 |

Implementation:
- `fetchViewerCount(channel): Promise<number>` in `src/lib/twitchChat.ts`:
  - `fetch("https://decapi.me/twitch/viewercount/" + encodeURIComponent(channel))`, then `text()`, then `trim()`.
  - If the result matches `/^\d+$/`, return `parseInt`. Otherwise return `0`. That covers offline, an unknown channel and error text.
  - A network error or non-200 status also returns `0` (as the user asked: "0 or number").
  - It is a simple GET with no custom headers, so the browser sends no CORS preflight. Works in Chromium 64. No need for the corsfix proxy, but `https://proxy.corsfix.com/?<url>` (already used in `src/lib/utils.ts:144`) is a drop-in fallback if DecAPI ever drops CORS.
- Poll every **60 s**. DecAPI caches upstream, so polling faster gains nothing. Fetch once right after mount and again when the channel changes. Clear the interval on unmount.
- Skip polling when `document.hidden` is set, or when the `showViewers` subSetting is off.
- Render it in the header: `src/img/icons/eye.svg` (already in the repo) followed by the number, formatted with thousands separators via `toLocaleString()`.

## Files

### New

1. **`src/lib/twitchChat.ts`**: client with no React code.
   - `class TwitchChatClient { constructor(channel, onMessage, onClear); connect(); close(); }`
   - Handles the socket, login, PING/PONG, line splitting and parsing, and reconnects.
   - `parseIrcLine(line): { tags, prefix, command, params }`. Export it so it can be tested on its own.
   - `buildFragments(text, emotesTag): Array<{type:'text', text} | {type:'emote', id, alt}>`.
   - Sanitize the channel name: trim, strip a leading `#`, lowercase, and allow only `^[a-z0-9_]{3,25}$`. If it is invalid, don't connect.
   - `BOT_LOGINS` set + `isBot(login, badges)` (see Bot filtering). The client takes a `hideBots` flag.
   - `fetchViewerCount(channel): Promise<number>` (see Viewer count).
2. **`src/components/twitchChat/twitchChat.tsx`**: MobX observer component, written like `crewChief.tsx`.
   - Props: `IWidgetSetting` settings, `channel: string`, `onMouseDown`, `onWheel`.
   - `@observable accessor messages: ChatMsg[]` (ring buffer, max `MAX_MESSAGES = 30`, or 15 when `lowPerformanceMode`).
   - Batch incoming messages in a plain array. Flush them into the observable on a timer, 250 ms by default and 500 ms in low-performance mode. This keeps busy channels from re-rendering the HUD on every message.
   - `@observable accessor viewers = 0`.
   - `componentDidMount`: connect, fetch the viewer count, start the 60 s viewer interval.
   - `componentDidUpdate`: if the `channel` prop changed, close and reconnect, reset `viewers = 0` and refetch. If `hideBots` changed, update the client flag.
   - `componentWillUnmount`: close the socket and clear both timers.
   - Optional fade-out: when `subSettings.fadeOld` is on, hide messages older than 60 s.
   - Render: `<div {...widgetSettings(this.props)} className="twitchChat">` containing:
     - `.accentBar`
     - `.chatHeader`: Twitch glyph, `#channel`, a connection dot (green when connected, grey otherwise), and, aligned right, `.viewers` (eye icon + count, shown when `showViewers` is on)
     - `.chatBody`: messages, newest at the bottom, `overflow:hidden`
   - Edge cases:
     - No channel set: show the placeholder "Set Twitch channel in Settings".
     - `showAllMode` (layout edit mode): show 3 fake messages and a fake count of `1234`, the way CrewChief uses `'S. BELLOF'`.
3. **`src/components/twitchChat/twitchChat.scss`**
   - Default position, absolute, about `left: 1500px; top: 600px` (on the 1920×1080 canvas).
   - Fixed `width: 360px; height: 260px` at zoom 1. The size grows and shrinks only through the existing `scale(zoom)`, which keeps it consistent with the other widgets.
   - Panel `rgba(0,0,0,0.85)` (0.9 when `darkBackground` is on). Font 14 px, line-height 1.3, word-break.
   - Username uses the Twitch `color` tag. Fall back to `#ff4d06` when the tag is empty, and lighten colors that are too dark to read on black.
   - Emote `img { height: 1.6em; vertical-align: middle; }`.
   - `.chatBody { display:flex; flex-direction:column; justify-content:flex-end; }`, so new messages push older ones off the top.
   - Add `pointer-events:auto` only if needed. Drag works through `onMouseDown` on the root.

### Modified

4. **`src/components/app/app.tsx`**
   - Import `TwitchChat`.
   - Add a `twitchChat` entry to **both** `defaultsettings` and `settings`:
     ```ts
     twitchChat: {
       id: "twitchChat",
       enabled: false,          // config flag, off by default
       resetIt: false,
       volume: 0,
       duration: 0,
       zoom: 1,
       name: __("Twitch Chat"),
       subSettings: {
         twitchChannel: { text: __("Change Twitch Channel"), enabled: false }, // opens text input
         showViewers:   { text: __("Show Viewer Count"),     enabled: true  },
         hideBots:      { text: __("Hide Bot Messages"),     enabled: true  },
         editBotList:   { text: __("Edit Bot List"),         enabled: false }, // opens text input
         showBadges:    { text: __("Show Badges"),           enabled: false },
         showEmotes:    { text: __("Show Emotes"),           enabled: true  },
         fadeOld:       { text: __("Hide Old Messages"),     enabled: false },
         darkBackground:{ text: __("Dark Background"),       enabled: false },
       },
       position: { x: INVALID, y: INVALID },
     },
     ```
   - Channel storage: add `@observable accessor twitchChannel = localStorage.twitchChannel || ""` and `@observable accessor twitchChannelEdit = false`.
     - The channel is **global for all layouts** (decided). Store it in one `localStorage.twitchChannel` key, unlike the per-layout `currentLogo`/`currentLogo2`/`currentLogo3`. Layout switches (`toggleLayout1/2/3`) must not touch it. It stays outside `appSettings`, so the clipboard export/import of layout settings is unchanged.
   - Handlers, modeled on the logo-URL ones:
     - `changeTwitchChannel(e)`: sanitize, store in `localStorage.twitchChannel`, update the observable.
     - `editTwitchChannel()`: set `twitchChannelEdit = true`.
     - In `onKeyPress` (`app.tsx:2255`): when focus is on an input and Enter is pressed while `twitchChannelEdit`, close the editor (set `twitchChannelEdit=false` and `subSettings.twitchChannel.enabled=false`) and save.
   - Settings UI: add `renderTwitchChatSettings(subSettings)` and route it in `getWidgetSetting` (`app.tsx:4291`). Add `widgetId !== "twitchChat"` to the generic-renderer exclusion list.
     - When `twitchChannel` is checked, render `<input type="text" className="urlInput">`. Its value is the current channel, or the placeholder "Click here to change".
     - Render the other subSettings with the same JSX as `renderGenericSubSettings`.
   - Reset: in the `eResetId` block (`app.tsx:2009`), when `eResetId === "twitchChat"`, also close the input editor. **Keep the channel** (reset only restores position, zoom and toggles). Say so in the changelog.
   - Mount it next to CrewChief (`app.tsx:3351`):
     ```tsx
     {this.settings.twitchChat.enabled && (
       <TwitchChat
         onMouseDown={this.onMouseDown}
         onWheel={this.onWheel}
         settings={this.settings.twitchChat}
         channel={this.twitchChannel}
       />
     )}
     ```
     - Unlike CrewChief, don't gate it on `playerIsFocus` or replay. Streamers want chat visible in replays too.
     - Do respect the global `hide` flag the way other widgets do.
5. **`src/translations.ts`**: add these keys to every locale:
   - "Twitch Chat"
   - "Change Twitch Channel"
   - "Show Badges"
   - "Show Emotes"
   - "Show Viewer Count"
   - "Hide Bot Messages"
   - "Edit Bot List"
   - "Current Bots:"
   - "Hide Old Messages"
   - "Set Twitch channel in Settings"
   - "Current Channel:"
   - "Connecting…"

   Use English text where no translation exists, the way existing entries do (e.g. "Crew Chief").
6. **`app.tsx` `getChangelog()`, `Changelog.md`, `README.md`**: add a note about the new widget. Bump `currentVersion` only if the maintainers want it.

## Zoom behaviour

- The mouse wheel over the widget calls `onWheel`, which steps zoom by ±0.01, or ±0.2 with Shift. The range is 0.1–3 and the value is saved per layout. This needs no new code once `widgetSettings(props)` is spread on the root element.
- Because the wheel zooms, the chat body **does not scroll**. It shows only the newest N messages, which suits a HUD.
- **`+`/`−` buttons** in the chat header (decided, in v1):
  - The wheel step math moves into a new public `App.adjustZoom(widgetId, diff)`. It clamps to 0.1–3 and saves; `onWheel` calls it too.
  - Each button click calls `hudApp.adjustZoom("twitchChat", ±0.05)`, or ±0.2 with Shift.
  - The buttons call `stopPropagation()` on `mousedown`, so clicking them doesn't start a drag.
  - They are hidden when `lockHud` is on and show only while the mouse is over the widget (CSS `:hover`), so they don't clutter the stream.

## Performance / safety

- Never use `dangerouslySetInnerHTML`. Render text fragments as React text nodes, so chat content can't inject HTML.
- Emote `<img>` URLs are built only from numeric or alphanumeric emote IDs. Validate with `^[A-Za-z0-9_]+$`.
- Batch flushes (250 ms) and cap the ring buffer at 30 messages so a busy channel can't hurt the HUD's frame rate.
- Open the socket only while the widget is enabled and mounted. Disabling the widget unmounts it and closes the connection.
- The viewer poll is 1 request per 60 s, only while the widget is mounted. DecAPI is a free community service, so keep the rate low and send no custom headers.
- Old Chromium: avoid `String.prototype.replaceAll`, `Array.prototype.at`, `structuredClone`, and CSS `gap` on flex containers (flex `gap` arrived in Chrome 84). Use margins.

## Testing

The repo has no test framework yet.
- **Minimal:** pure functions `parseIrcLine`, `buildFragments` and `sanitizeChannel` in `src/lib/twitchChat.ts`. If the maintainers accept a dev dependency, add `vitest` with `src/lib/twitchChat.test.ts`. Cover:
  - a tagged PRIVMSG
  - several lines in one frame
  - PING
  - emotes in a string that also contains emoji (UTF-16 offsets)
  - CLEARCHAT / CLEARMSG
  - invalid channel names
  - `isBot`: a listed login, `bot-badge`, and a normal user
  - viewer-count parsing: `"38085"` → 38085, `"foo is offline"` → 0, `""`/HTML error → 0 (factor out `parseViewerCount(text)` so it can be tested without network)
- **Manual:**
  1. Run `npm start` (debug mode outside the game). Enable "Twitch Chat" and set a busy channel (e.g. a large streamer).
  2. Check that messages, emotes and username colors render. Check that Nightbot/StreamElements lines are hidden, and that they show when "Hide Bot Messages" is off.
  3. Viewer count: a live channel shows a number close to the one on twitch.tv; an offline channel shows `0`; blocking `decapi.me` in DevTools shows `0` without breaking chat.
  4. Drag the widget; wheel-zoom it in and out; reload and check that position, zoom and channel persist.
  5. Switch layouts 1/2/3: the channel stays, position and zoom are per layout.
  6. Disable the widget and check in DevTools → Network → WS that the socket closes and viewer polling stops.
  7. Kill the network and check that it reconnects.
  8. In game (R3E in-game browser): check that it renders, that typing in the channel field doesn't trigger hotkeys, and that Enter commits.
- Run `npm run build` and eslint clean.

## Task order

1. `src/lib/twitchChat.ts` client, parser, bot filter, `fetchViewerCount` (+ tests if vitest is approved).
2. `twitchChat.tsx` + `twitchChat.scss` with mock messages and viewer count for `showAllMode`.
3. Wire into `app.tsx`: settings ×2, mount, channel observable and handlers, settings renderer, Enter handling, reset.
4. Translations.
5. Manual QA in the browser and in game; changelog.

## Decisions

- The channel is global for all layouts.
- No third-party emotes (BTTV/7TV/FFZ) for now.
- Bot messages are hidden (default on, can be switched off).
- The viewer count is a plain number, `0` when offline or on error, taken from DecAPI.
- `+`/`−` zoom buttons are added on top of wheel zoom.
- The bot list can be edited in Settings (global, stored in `localStorage.twitchBotList`).

## Open questions

None.
