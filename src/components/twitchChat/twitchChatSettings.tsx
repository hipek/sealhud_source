import { classNames } from '../../lib/utils';
import { IWidgetSetting } from '../app/app';
import { twitchChatConfig } from './twitchChatConfig';
import { action } from 'mobx';
import { observer } from 'mobx-react';
import _ from './../../translate';
import React, { ChangeEvent } from 'react';

interface IProps {
	settings: IWidgetSetting;
	onToggle: (e: ChangeEvent<HTMLInputElement>) => void;
	onSave: () => void;
}

// Body of the "Twitch Chat" card in the Settings panel.
@observer
export default class TwitchChatSettings extends React.Component<IProps> {
	private onChannelChange = (e: ChangeEvent<HTMLInputElement>) => {
		twitchChatConfig.setChannelDraft(e.target.value);
	};

	private onBotListChange = (e: ChangeEvent<HTMLInputElement>) => {
		twitchChatConfig.setBotListDraft(e.target.value);
	};

	@action
	private commitChannel = () => {
		if (twitchChatConfig.commitChannel()) {
			this.props.settings.subSettings.twitchChannel.enabled = false;
			this.props.onSave();
		}
	};

	@action
	private commitBotList = () => {
		if (twitchChatConfig.commitBotList()) {
			this.props.settings.subSettings.editBotList.enabled = false;
			this.props.onSave();
		}
	};

	private onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Escape') {
			twitchChatConfig.cancelEdits();
		}
		if (e.key === 'Enter' || e.key === 'Escape') {
			e.currentTarget.blur();
		}
	};

	private renderInput(
		subId: string,
		value: string,
		placeholder: string,
		onEdit: () => void,
		onChange: (e: ChangeEvent<HTMLInputElement>) => void,
		onCommit: () => void
	) {
		const subSettings = this.props.settings.subSettings;
		return (
			<div key={subId} className="subWidget urlInput">
				<label className="sub">
					{_(subSettings[subId].text())}
					<input
						type="text"
						className="urlInput"
						placeholder={placeholder}
						value={value}
						onClick={onEdit}
						onFocus={onEdit}
						onChange={onChange}
						onKeyDown={this.onKeyDown}
						onBlur={onCommit}
					/>
				</label>
			</div>
		);
	}

	render() {
		const { settings } = this.props;
		const subSettings = settings.subSettings;
		const config = twitchChatConfig;

		return Object.keys(subSettings).map((subId) => {
			if (subId === 'twitchChannel' && subSettings.twitchChannel.enabled) {
				return this.renderInput(
					subId,
					config.channelEdit
						? config.channelDraft
						: `${_('Current Channel:')} ${config.channel || '-'} - ${_(
								'Click here to change'
							)}`,
					'channel_name',
					config.editChannel,
					this.onChannelChange,
					this.commitChannel
				);
			}
			if (subId === 'editBotList' && subSettings.editBotList.enabled) {
				return this.renderInput(
					subId,
					config.botListEdit
						? config.botListDraft
						: `${_('Current Bots:')} ${
								config.botLogins.join(', ') || '-'
							} - ${_('Click here to change')}`,
					'nightbot, streamelements',
					config.editBotList,
					this.onBotListChange,
					this.commitBotList
				);
			}
			if (subId === 'editBotList' && !subSettings.hideBots.enabled) {
				return null;
			}
			return (
				<div key={subId} className="subWidget">
					<label
						className={classNames('sub', {
							active: subSettings[subId].enabled && settings.enabled
						})}
					>
						<input
							type="checkbox"
							checked={subSettings[subId].enabled}
							data-name={settings.id}
							data-sub-name={subId}
							onChange={this.props.onToggle}
						/>
						{_(subSettings[subId].text())}
					</label>
				</div>
			);
		});
	}
}
