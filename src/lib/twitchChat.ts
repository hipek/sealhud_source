import ReconnectingWebSocket from './reconnecting-websocket';

// Anonymous, read-only Twitch chat over the public IRC WebSocket.
// No OAuth / client-id needed: "justinfanNNNNN" is the anonymous login.
const TWITCH_IRC_URL = 'wss://irc-ws.chat.twitch.tv:443';
const VIEWER_COUNT_URL = 'https://decapi.me/twitch/viewercount/';
const EMOTE_URL = 'https://static-cdn.jtvnw.net/emoticons/v2/';

export const DEFAULT_BOT_LOGINS = [
	'nightbot',
	'streamelements',
	'streamlabs',
	'moobot',
	'fossabot',
	'wizebot',
	'sery_bot',
	'botrixoficial',
	'soundalerts',
	'kofistreambot',
	'blerp',
	'streamstickers',
	'own3d',
	'pokemoncommunitygame',
	'commanderroot',
	'frostytoolsdotcom'
];

const LOGIN_RE = /^[a-z0-9_]{3,25}$/;
const EMOTE_ID_RE = /^[A-Za-z0-9_]+$/;

export type ChatFragment =
	| { type: 'text'; text: string }
	| { type: 'emote'; id: string; alt: string; url: string };

export interface IChatMessage {
	id: string;
	login: string;
	displayName: string;
	color: string;
	badges: string[];
	fragments: ChatFragment[];
	time: number;
}

export interface IIrcLine {
	tags: { [key: string]: string };
	prefix: string;
	command: string;
	params: string[];
}

export function sanitizeChannel(value: string): string {
	const channel = (value || '').trim().replace(/^#/, '').toLowerCase();
	return LOGIN_RE.test(channel) ? channel : '';
}

export function parseBotList(text: string): string[] {
	const result: string[] = [];
	(text || '')
		.toLowerCase()
		.split(/[\s,;]+/)
		.forEach((login) => {
			const clean = login.replace(/^@/, '');
			if (LOGIN_RE.test(clean) && result.indexOf(clean) === -1) {
				result.push(clean);
			}
		});
	return result;
}

export function isBot(login: string, badges: string, botLogins: string[]) {
	if (botLogins.indexOf((login || '').toLowerCase()) !== -1) {
		return true;
	}
	return (badges || '').indexOf('bot-badge/') !== -1;
}

function unescapeTag(value: string) {
	return value
		.replace(/\\s/g, ' ')
		.replace(/\\:/g, ';')
		.replace(/\\r/g, '\r')
		.replace(/\\n/g, '\n')
		.replace(/\\\\/g, '\\');
}

export function parseIrcLine(line: string): IIrcLine | null {
	let rest = line;
	const tags: { [key: string]: string } = {};
	let prefix = '';

	if (!rest) {
		return null;
	}
	if (rest[0] === '@') {
		const space = rest.indexOf(' ');
		if (space === -1) {
			return null;
		}
		rest
			.slice(1, space)
			.split(';')
			.forEach((pair) => {
				const eq = pair.indexOf('=');
				if (eq === -1) {
					tags[pair] = '';
				} else {
					tags[pair.slice(0, eq)] = unescapeTag(pair.slice(eq + 1));
				}
			});
		rest = rest.slice(space + 1);
	}
	if (rest[0] === ':') {
		const space = rest.indexOf(' ');
		if (space === -1) {
			return null;
		}
		prefix = rest.slice(1, space);
		rest = rest.slice(space + 1);
	}

	const params: string[] = [];
	const trailingIdx = rest.indexOf(' :');
	let trailing: string | null = null;
	if (rest[0] === ':') {
		trailing = rest.slice(1);
		rest = '';
	} else if (trailingIdx !== -1) {
		trailing = rest.slice(trailingIdx + 2);
		rest = rest.slice(0, trailingIdx);
	}
	const parts = rest.split(' ').filter((p) => p !== '');
	const command = parts.shift() || '';
	params.push(...parts);
	if (trailing !== null) {
		params.push(trailing);
	}
	if (!command) {
		return null;
	}
	return { tags, prefix, command, params };
}

// Twitch emote offsets count code points, not UTF-16 units,
// so the text is split with Array.from to keep emoji intact.
export function buildFragments(
	text: string,
	emotesTag: string,
	withEmotes: boolean
): ChatFragment[] {
	if (!withEmotes || !emotesTag) {
		return [{ type: 'text', text }];
	}
	const chars = Array.from(text);
	const ranges: { start: number; end: number; id: string }[] = [];
	emotesTag.split('/').forEach((entry) => {
		const colon = entry.indexOf(':');
		if (colon === -1) {
			return;
		}
		const id = entry.slice(0, colon);
		if (!EMOTE_ID_RE.test(id)) {
			return;
		}
		entry
			.slice(colon + 1)
			.split(',')
			.forEach((range) => {
				const [s, e] = range.split('-').map((n) => parseInt(n, 10));
				if (
					!isNaN(s) &&
					!isNaN(e) &&
					s >= 0 &&
					e >= s &&
					e < chars.length
				) {
					ranges.push({ start: s, end: e, id });
				}
			});
	});
	ranges.sort((a, b) => a.start - b.start);

	const fragments: ChatFragment[] = [];
	let pos = 0;
	ranges.forEach((range) => {
		if (range.start < pos) {
			return;
		}
		if (range.start > pos) {
			fragments.push({
				type: 'text',
				text: chars.slice(pos, range.start).join('')
			});
		}
		fragments.push({
			type: 'emote',
			id: range.id,
			alt: chars.slice(range.start, range.end + 1).join(''),
			url: `${EMOTE_URL}${range.id}/default/dark/1.0`
		});
		pos = range.end + 1;
	});
	if (pos < chars.length) {
		fragments.push({ type: 'text', text: chars.slice(pos).join('') });
	}
	return fragments;
}

export interface IStreamStatus {
	live: boolean;
	viewers: number;
}

// DecAPI: plain text body, number when live, "<channel> is offline" otherwise.
// Anything else (errors, rate limits) is unknown and returns null.
export function parseStreamStatus(text: string): IStreamStatus | null {
	const value = (text || '').trim();
	if (/^\d+$/.test(value)) {
		return { live: true, viewers: parseInt(value, 10) };
	}
	if (/ is offline$/i.test(value)) {
		return { live: false, viewers: 0 };
	}
	return null;
}

// Simple GET without custom headers, so no CORS preflight is triggered.
export function fetchStreamStatus(
	channel: string
): Promise<IStreamStatus | null> {
	const clean = sanitizeChannel(channel);
	if (!clean) {
		return Promise.resolve(null);
	}
	return fetch(VIEWER_COUNT_URL + encodeURIComponent(clean))
		.then((resp) => (resp.ok ? resp.text() : ''))
		.then(parseStreamStatus)
		.catch(() => null);
}

interface IClientOptions {
	channel: string;
	onMessage: (msg: IChatMessage) => void;
	onClearUser: (login: string | null) => void;
	onClearMessage: (id: string) => void;
	onStatus: (connected: boolean) => void;
}

export class TwitchChatClient {
	public hideBots = true;
	public showEmotes = true;
	public botLogins: string[] = DEFAULT_BOT_LOGINS;

	private ws: ReconnectingWebSocket | null = null;
	private options: IClientOptions;
	private channel: string;

	constructor(options: IClientOptions) {
		this.options = options;
		this.channel = sanitizeChannel(options.channel);
	}

	public connect() {
		if (!this.channel || this.ws) {
			return;
		}
		const ws = new ReconnectingWebSocket(TWITCH_IRC_URL);
		ws.reconnectInterval = 5000;
		ws.timeoutInterval = 5000;
		ws.onopen = () => {
			const nick = `justinfan${Math.floor(10000 + Math.random() * 89999)}`;
			ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
			ws.send('PASS SCHMOOPIIE');
			ws.send(`NICK ${nick}`);
			ws.send(`JOIN #${this.channel}`);
		};
		ws.onclose = () => {
			this.options.onStatus(false);
		};
		ws.onmessage = (e: MessageEvent) => {
			String(e.data)
				.split('\r\n')
				.forEach((line) => this.handleLine(line));
		};
		this.ws = ws;
	}

	public close() {
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
		this.options.onStatus(false);
	}

	private send(data: string) {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(data);
		}
	}

	private handleLine(line: string) {
		const msg = parseIrcLine(line);
		if (!msg) {
			return;
		}
		switch (msg.command) {
			case 'PING':
				this.send(`PONG :${msg.params[0] || 'tmi.twitch.tv'}`);
				break;
			case 'RECONNECT':
				if (this.ws) {
					this.ws.refresh();
				}
				break;
			case 'ROOMSTATE':
			case 'JOIN':
				this.options.onStatus(true);
				break;
			case 'CLEARCHAT':
				this.options.onClearUser(msg.params[1] || null);
				break;
			case 'CLEARMSG':
				if (msg.tags['target-msg-id']) {
					this.options.onClearMessage(msg.tags['target-msg-id']);
				}
				break;
			case 'PRIVMSG':
				this.handlePrivmsg(msg);
				break;
			default:
				break;
		}
	}

	private handlePrivmsg(msg: IIrcLine) {
		const login = msg.prefix.split('!')[0].toLowerCase();
		const badges = msg.tags.badges || '';
		if (this.hideBots && isBot(login, badges, this.botLogins)) {
			return;
		}
		let text = msg.params[1] || '';
		// "/me" messages arrive wrapped as CTCP ACTION
		const ctcpAction = '\u0001ACTION ';
		if (text.indexOf(ctcpAction) === 0 && text.slice(-1) === '\u0001') {
			text = text.slice(ctcpAction.length, -1);
		}
		this.options.onMessage({
			id: msg.tags.id || `${Date.now()}-${Math.random()}`,
			login,
			displayName: msg.tags['display-name'] || login,
			color: msg.tags.color || '',
			badges: badges
				? badges.split(',').map((b) => b.split('/')[0])
				: [],
			fragments: buildFragments(
				text,
				msg.tags.emotes || '',
				this.showEmotes
			),
			time: Date.now()
		});
	}
}
