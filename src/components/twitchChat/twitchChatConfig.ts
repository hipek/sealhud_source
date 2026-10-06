import { action, observable } from 'mobx';
import { IWidgetSetting } from '../app/app';
import { INVALID } from '../../lib/utils';
import { dynamicTranslate as __ } from '../../translate';
import {
	DEFAULT_BOT_LOGINS,
	parseBotList,
	sanitizeChannel
} from '../../lib/twitchChat';

// Default widget entry, used for both `defaultsettings` and `settings` in App.
export function twitchChatDefaultSettings(): IWidgetSetting {
	return {
		id: 'twitchChat',
		enabled: false,
		resetIt: false,
		volume: 0,
		duration: 0,
		zoom: 1,
		name: __('Twitch Chat'),
		subSettings: {
			twitchChannel: {
				text: __('Change Twitch Channel'),
				enabled: false
			},
			showViewers: {
				text: __('Show Viewer Count'),
				enabled: true
			},
			hideBots: {
				text: __('Hide Bot Messages'),
				enabled: true
			},
			editBotList: {
				text: __('Edit Bot List'),
				enabled: false
			},
			showBadges: {
				text: __('Show Badges'),
				enabled: false
			},
			showEmotes: {
				text: __('Show Emotes'),
				enabled: true
			},
			fadeOld: {
				text: __('Hide Old Messages'),
				enabled: false
			},
			darkBackground: {
				text: __('Dark Background'),
				enabled: false
			}
		},
		position: {
			x: INVALID,
			y: INVALID
		}
	};
}

// Channel and bot list are global (shared by all layouts), so they live in
// their own localStorage keys instead of the per-layout appSettings.
class TwitchChatConfig {
	@observable accessor channel = sanitizeChannel(
		localStorage.twitchChannel || ''
	);
	@observable accessor channelDraft = '';
	@observable accessor channelEdit = false;
	@observable accessor botLogins: string[] = localStorage.twitchBotList
		? parseBotList(localStorage.twitchBotList)
		: DEFAULT_BOT_LOGINS;
	@observable accessor botListDraft = '';
	@observable accessor botListEdit = false;

	@action
	editChannel = () => {
		if (this.channelEdit) {
			return;
		}
		this.channelDraft = this.channel;
		this.channelEdit = true;
	};

	@action
	setChannelDraft = (value: string) => {
		this.channelDraft = value;
	};

	// Returns true when an edit was actually committed.
	@action
	commitChannel = () => {
		if (!this.channelEdit) {
			return false;
		}
		this.channel = sanitizeChannel(this.channelDraft);
		localStorage.twitchChannel = this.channel;
		this.channelEdit = false;
		return true;
	};

	@action
	editBotList = () => {
		if (this.botListEdit) {
			return;
		}
		this.botListDraft = this.botLogins.join(', ');
		this.botListEdit = true;
	};

	@action
	setBotListDraft = (value: string) => {
		this.botListDraft = value;
	};

	@action
	commitBotList = () => {
		if (!this.botListEdit) {
			return false;
		}
		this.setBotList(parseBotList(this.botListDraft).join(', '));
		this.botListEdit = false;
		return true;
	};

	@action
	cancelEdits = () => {
		this.channelEdit = false;
		this.botListEdit = false;
	};

	// Widget "Reset": keep the channel, restore the default bot list.
	@action
	reset = () => {
		this.cancelEdits();
		this.setBotList('');
	};

	private setBotList(text: string) {
		localStorage.twitchBotList = text;
		this.botLogins = text ? parseBotList(text) : DEFAULT_BOT_LOGINS;
	}
}

export const twitchChatConfig = new TwitchChatConfig();
