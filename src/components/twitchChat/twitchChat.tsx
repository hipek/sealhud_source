import { classNames, widgetSettings } from './../../lib/utils';
import {
	IWidgetSetting,
	lowPerformanceMode,
	showAllMode,
	hudApp
} from '../app/app';
import {
	TwitchChatClient,
	IChatMessage,
	fetchStreamStatus,
	IStreamStatus,
	sanitizeChannel
} from '../../lib/twitchChat';
import { action, observable } from 'mobx';
import { observer } from 'mobx-react';
import _ from './../../translate';
import React from 'react';
import './twitchChat.scss';

interface IProps extends React.HTMLAttributes<HTMLDivElement> {
	settings: IWidgetSetting;
	channel: string;
	botLogins: string[];
}

const STATUS_POLL_MS = 60000;
const FADE_AFTER_MS = 60000;
const ZOOM_STEP = 0.05;
const ZOOM_STEP_SHIFT = 0.2;

const MOCK_MESSAGES: IChatMessage[] = [
	{
		id: 'mock1',
		login: 'bellof',
		displayName: 'S_Bellof',
		color: '#1E90FF',
		badges: ['moderator'],
		fragments: [{ type: 'text', text: 'Great pace this stint!' }],
		time: 0
	},
	{
		id: 'mock2',
		login: 'senna',
		displayName: 'Senna',
		color: '#FF4500',
		badges: ['subscriber'],
		fragments: [{ type: 'text', text: 'Box this lap? Tires look done' }],
		time: 0
	},
	{
		id: 'mock3',
		login: 'raceroom_fan',
		displayName: 'raceroom_fan',
		color: '',
		badges: [],
		fragments: [{ type: 'text', text: 'Hello from the grandstand 👋' }],
		time: 0
	}
];

const BADGE_LABELS: { [key: string]: string } = {
	broadcaster: 'B',
	moderator: 'M',
	vip: 'V',
	subscriber: 'S',
	founder: 'S',
	partner: 'P',
	staff: 'T'
};

// Keep usernames readable on the dark panel.
function readableColor(color: string) {
	const match = /^#([0-9a-f]{6})$/i.exec(color || '');
	if (!match) {
		return '#ff4d06';
	}
	const num = parseInt(match[1], 16);
	const r = (num >> 16) & 255;
	const g = (num >> 8) & 255;
	const b = num & 255;
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	if (luminance >= 0.35) {
		return color;
	}
	const lift = (c: number) => Math.round(c + (255 - c) * 0.5);
	return `rgb(${lift(r)}, ${lift(g)}, ${lift(b)})`;
}

@observer
export default class TwitchChat extends React.Component<IProps> {
	@observable accessor messages: IChatMessage[] = [];
	@observable accessor connected = false;
	@observable accessor viewers = 0;
	@observable accessor live = false;

	client: TwitchChatClient | null = null;
	pending: IChatMessage[] = [];
	flushTimer: ReturnType<typeof setInterval> | null = null;
	statusTimer: ReturnType<typeof setInterval> | null = null;
	statusRequest = 0;

	componentDidMount() {
		this.flushTimer = setInterval(
			this.flush,
			lowPerformanceMode ? 500 : 250
		);
		this.statusTimer = setInterval(this.pollStatus, STATUS_POLL_MS);
		this.start();
	}

	componentDidUpdate(prevProps: IProps) {
		if (prevProps.channel !== this.props.channel) {
			this.stop();
			this.start();
			return;
		}
		if (this.client) {
			this.client.hideBots = this.props.settings.subSettings.hideBots.enabled;
			this.client.showEmotes =
				this.props.settings.subSettings.showEmotes.enabled;
			this.client.botLogins = this.props.botLogins;
		}
	}

	componentWillUnmount() {
		this.stop();
		if (this.flushTimer) {
			clearInterval(this.flushTimer);
		}
		if (this.statusTimer) {
			clearInterval(this.statusTimer);
		}
	}

	private get maxMessages() {
		return lowPerformanceMode ? 15 : 30;
	}

	@action
	private start() {
		this.pending = [];
		this.messages = [];
		this.viewers = 0;
		this.live = false;
		const channel = sanitizeChannel(this.props.channel);
		if (!channel) {
			return;
		}
		const sub = this.props.settings.subSettings;
		this.client = new TwitchChatClient({
			channel,
			onMessage: this.onMessage,
			onClearUser: this.onClearUser,
			onClearMessage: this.onClearMessage,
			onStatus: this.setConnected
		});
		this.client.hideBots = sub.hideBots.enabled;
		this.client.showEmotes = sub.showEmotes.enabled;
		this.client.botLogins = this.props.botLogins;
		this.client.connect();
		this.pollStatus();
	}

	private stop() {
		if (this.client) {
			this.client.close();
			this.client = null;
		}
	}

	private onMessage = (msg: IChatMessage) => {
		this.pending.push(msg);
		if (this.pending.length > this.maxMessages) {
			this.pending.splice(0, this.pending.length - this.maxMessages);
		}
	};

	@action
	private onClearUser = (login: string | null) => {
		if (login === null) {
			this.pending = [];
			this.messages = [];
			return;
		}
		const keep = (m: IChatMessage) => m.login !== login.toLowerCase();
		this.pending = this.pending.filter(keep);
		this.messages = this.messages.filter(keep);
	};

	@action
	private onClearMessage = (id: string) => {
		const keep = (m: IChatMessage) => m.id !== id;
		this.pending = this.pending.filter(keep);
		this.messages = this.messages.filter(keep);
	};

	@action
	private setConnected = (connected: boolean) => {
		this.connected = connected;
	};

	@action
	private setStatus = (status: IStreamStatus) => {
		this.live = status.live;
		this.viewers = status.viewers;
	};

	// Batched so a busy channel doesn't re-render the HUD per message.
	@action
	private flush = () => {
		const fade = this.props.settings.subSettings.fadeOld.enabled;
		if (!this.pending.length && !fade) {
			return;
		}
		let next = this.pending.length
			? this.messages.concat(this.pending)
			: this.messages;
		this.pending = [];
		if (fade) {
			const cutoff = Date.now() - FADE_AFTER_MS;
			const fresh = next.filter((m) => m.time >= cutoff);
			if (fresh.length !== next.length) {
				next = fresh;
			}
		}
		if (next.length > this.maxMessages) {
			next = next.slice(next.length - this.maxMessages);
		}
		if (next !== this.messages) {
			this.messages = next;
		}
	};

	// Polled even when the viewer count is hidden: it drives the live dot.
	private pollStatus = () => {
		const channel = sanitizeChannel(this.props.channel);
		if (!channel || document.hidden) {
			return;
		}
		const request = ++this.statusRequest;
		fetchStreamStatus(channel).then((status) => {
			// Ignore answers for a channel we already switched away from,
			// and keep the last known state when the answer is unknown.
			if (status && request === this.statusRequest) {
				this.setStatus(status);
			}
		});
	};

	private stopDrag = (e: React.MouseEvent) => {
		e.stopPropagation();
	};

	private zoomIn = (e: React.MouseEvent) => {
		this.zoom(e, 1);
	};

	private zoomOut = (e: React.MouseEvent) => {
		this.zoom(e, -1);
	};

	private zoom(e: React.MouseEvent, direction: number) {
		e.stopPropagation();
		if (hudApp) {
			hudApp.adjustZoom(
				this.props.settings.id,
				direction * (e.shiftKey ? ZOOM_STEP_SHIFT : ZOOM_STEP)
			);
		}
	}

	private renderMessage(msg: IChatMessage, showBadges: boolean) {
		return (
			<div key={msg.id} className="chatLine">
				{showBadges &&
					msg.badges.map((badge) =>
						BADGE_LABELS[badge] ? (
							<span key={badge} className={classNames('badge', badge)}>
								{BADGE_LABELS[badge]}
							</span>
						) : null
					)}
				<span
					className="chatUser"
					style={{ color: readableColor(msg.color) }}
				>
					{msg.displayName}
				</span>
				<span className="chatSep">: </span>
				{msg.fragments.map((fragment, i) =>
					fragment.type === 'emote' ? (
						<img
							key={i}
							className="emote"
							src={fragment.url}
							alt={fragment.alt}
							title={fragment.alt}
						/>
					) : (
						<span key={i}>{fragment.text}</span>
					)
				)}
			</div>
		);
	}

	render() {
		const sub = this.props.settings.subSettings;
		const channel = sanitizeChannel(this.props.channel);
		const messages = showAllMode && !this.messages.length
			? MOCK_MESSAGES
			: this.messages;
		const viewers = showAllMode && !channel ? 1234 : this.viewers;
		const isLocked = hudApp ? hudApp.lockHud : false;

		return (
			<div
				{...widgetSettings(this.props)}
				className={classNames('twitchChat', this.props.className, {
					darkBackground: sub.darkBackground.enabled
				})}
			>
				<div className="accentBar" />
				<div className="chatHeader">
					<svg className="twitchGlyph" viewBox="0 0 24 24">
						<path d="M4.3 3 3 6.4v13.2h4.6V22h2.6l2.4-2.4h3.6L21 14.8V3H4.3zm15 10.9-2.8 2.8H12l-2.4 2.4v-2.4H5.8V4.7h13.5v9.2zM16.6 8.1v4.7h-1.7V8.1h1.7zm-4.6 0v4.7h-1.7V8.1H12z" />
					</svg>
					<span className="chatChannel">
						{channel ? `#${channel}` : showAllMode ? '#sealhud' : _('Twitch Chat')}
					</span>
					<span
						className={classNames('chatStatus', {
							live: this.live || showAllMode
						})}
						title={this.live || showAllMode ? 'LIVE' : 'Offline'}
					/>
					<span className="chatSpacer" />
					{sub.showViewers.enabled && (
						<span className="chatViewers">
							<svg className="eyeIcon" viewBox="0 0 24 24">
								<path d="M12 5C6.5 5 2.7 9.2 1.5 12c1.2 2.8 5 7 10.5 7s9.3-4.2 10.5-7C21.3 9.2 17.5 5 12 5zm0 11.5A4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 0 1 0 9zm0-7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z" />
							</svg>
							{viewers.toLocaleString()}
						</span>
					)}
					{!isLocked && (
						<span className="chatZoom">
							<button
								className="zoomButton"
								onMouseDown={this.stopDrag}
								onClick={this.zoomOut}
								title={_('Zoom Out')}
							>
								−
							</button>
							<button
								className="zoomButton"
								onMouseDown={this.stopDrag}
								onClick={this.zoomIn}
								title={_('Zoom In')}
							>
								+
							</button>
						</span>
					)}
				</div>
				<div className="chatBody">
					{!channel && !showAllMode ? (
						<div className="chatPlaceholder">
							{_('Set Twitch channel in Settings')}
						</div>
					) : channel && !this.connected && !messages.length ? (
						<div className="chatPlaceholder">{_('Connecting…')}</div>
					) : (
						messages.map((msg) =>
							this.renderMessage(msg, sub.showBadges.enabled)
						)
					)}
				</div>
			</div>
		);
	}
}
