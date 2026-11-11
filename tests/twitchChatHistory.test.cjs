const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createJiti } = require('jiti');

const jiti = createJiti(__filename);
const {
	HISTORY_TTL_MS,
	parseHistory,
	removeClearedMessage,
	removeClearedUserMessages,
	serializeHistory
} = jiti('../src/lib/twitchChat.ts');

const now = 1_800_000_000_000;
const options = {
	maxMessages: 30,
	showEmotes: true,
	hideBots: true,
	botLogins: ['nightbot']
};

function message(id, login, time = now, badges = []) {
	return {
		id,
		login,
		displayName: login,
		color: '',
		badges,
		fragments: [{ type: 'text', text: id }],
		time
	};
}

function stored(messages, channel = 'streamer', savedAt = now) {
	return serializeHistory(channel, messages, savedAt);
}

test('restores only messages within ten-minute age window', () => {
	const history = parseHistory(
		stored([
			message('expired', 'viewer', now - HISTORY_TTL_MS - 1),
			message('boundary', 'viewer', now - HISTORY_TTL_MS),
			message('fresh', 'viewer', now)
		]),
		'streamer',
		now,
		options
	);

	assert.deepEqual(history.map((item) => item.id), ['boundary', 'fresh']);
});

test('rejects history saved for another channel', () => {
	assert.deepEqual(
		parseHistory(stored([message('one', 'viewer')], 'otherstream'), 'streamer', now, options),
		[]
	);
});

test('filters bot logins and bot badges when restoring', () => {
	const history = parseHistory(
		stored([
			message('configured-bot', 'nightbot'),
			message('badged-bot', 'anotherbot', now, ['bot-badge']),
			message('viewer', 'viewer')
		]),
		'streamer',
		now,
		options
	);

	assert.deepEqual(history.map((item) => item.id), ['viewer']);
});

test('removes cleared user and message entries, including full chat clear', () => {
	const messages = [message('one', 'viewer'), message('two', 'other')];

	assert.deepEqual(removeClearedUserMessages(messages, 'VIEWER').map((item) => item.id), ['two']);
	assert.deepEqual(removeClearedUserMessages(messages, null), []);
	assert.deepEqual(removeClearedMessage(messages, 'one').map((item) => item.id), ['two']);
});
