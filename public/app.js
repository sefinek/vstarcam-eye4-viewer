const datesList = document.getElementById('dates-list');
const clipsList = document.getElementById('clips-list');
const clipsCount = document.getElementById('clips-count');
const clipsStats = document.getElementById('clips-stats');
const videoPlayer = document.getElementById('video-player');
const noVideo = document.getElementById('no-video');
const videoError = document.getElementById('video-error');
const videoErrMsg = document.getElementById('video-error-msg');
const loading = document.getElementById('loading');
const btnDownload = document.getElementById('btn-download');
const timeline = document.getElementById('timeline');
const timelineBar = document.getElementById('timeline-bar');
const btnTimeline = document.getElementById('btn-timeline');
const infoFile = document.getElementById('info-file');
const infoTime = document.getElementById('info-time');
const infoType = document.getElementById('info-type');
const infoSize = document.getElementById('info-size');
const infoIndex = document.getElementById('info-index');
const dateSearch = document.getElementById('date-search');
const filterBar = document.getElementById('filter-bar');

let clips = [], filteredClips = [];
let currentDate = null, currentClip = null, currentIndex = -1;
let filter = 'all';
let pendingClip = null;

const STORAGE_KEY = 'cam-viewer';
const AVG_BYTES_PER_SEC = 100000;

const timeToPercent = timeStr => {
	const [h, m, s] = timeStr.split(':').map(Number);
	return (h * 3600 + m * 60 + s) / 86400 * 100;
};

const formatSize = bytes => bytes < 1048576
	? (bytes / 1024).toFixed(0) + ' KB'
	: (bytes / 1048576).toFixed(1) + ' MB';

const locale = navigator.languages?.[0] ?? navigator.language ?? 'en';
const dateFormatter = new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit' });
const formatDate = iso => {
	const [y, m, d] = iso.split('-').map(Number);
	return dateFormatter.format(new Date(y, m - 1, d));
};

const formatGB = bytes => (bytes / 1e9).toFixed(1);

const saveState = () =>
	localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: currentDate, clip: currentClip }));

const updateTimelineActive = () => {
	timelineBar.querySelectorAll('.tl-clip').forEach(el =>
		el.classList.toggle('tl-active', el.dataset.path === currentClip)
	);
};

const updateInfoIndex = () => {
	infoIndex.textContent = currentIndex >= 0 ? `${currentIndex + 1} / ${filteredClips.length}` : '—';
};

const playByIndex = index => {
	const clip = filteredClips[index];
	if (!clip || clip.path === currentClip) return;
	currentIndex = index;
	currentClip = clip.path;

	document.querySelectorAll('.clip-item').forEach((el, i) => el.classList.toggle('active', i === index));
	const active = clipsList.querySelector('.clip-item.active');
	if (active) active.scrollIntoView({ block: 'nearest' });

	noVideo.style.display = 'none';
	videoError.style.display = 'none';
	videoPlayer.style.display = 'block';
	loading.style.display = 'flex';

	videoPlayer.src = clip.path;
	videoPlayer.load();
	videoPlayer.play().catch(Object);

	infoFile.textContent = clip.name;
	infoTime.textContent = clip.time;
	infoType.textContent = clip.type === 'event' ? 'Event ⚡' : 'Normal ▶';
	infoSize.textContent = formatSize(clip.size);
	updateInfoIndex();

	document.title = `${clip.time} · ${formatDate(currentDate)} | Eye4 Viewer`;
	updateTimelineActive();

	btnDownload.href = clip.path;
	btnDownload.download = clip.name;
	btnDownload.style.display = '';

	saveState();
};

const navigateTo = delta => {
	const next = currentIndex + delta;
	if (next >= 0 && next < filteredClips.length) playByIndex(next);
};

const renderClips = () => {
	filteredClips = filter === 'all' ? clips : clips.filter(c => c.type === filter);

	const { events, normal, totalSize } = filteredClips.reduce((acc, c) => {
		acc[c.type === 'event' ? 'events' : 'normal']++;
		acc.totalSize += c.size;
		return acc;
	}, { events: 0, normal: 0, totalSize: 0 });

	clipsCount.textContent = `${filteredClips.length} clip${filteredClips.length !== 1 ? 's' : ''}`;
	clipsStats.textContent = filteredClips.length ? `⚡ ${events}  ▶ ${normal}  ·  ${formatSize(totalSize)}` : '';
	clipsList.innerHTML = '';

	if (!filteredClips.length) {
		clipsList.innerHTML = '<div id="clips-empty">No clips for this filter</div>';
		return;
	}

	filteredClips.forEach((clip, i) => {
		const item = document.createElement('div');
		item.className = 'clip-item' + (clip.path === currentClip ? ' active' : '');
		item.innerHTML = `
			<div class="clip-icon">${clip.type === 'event' ? '⚡' : '▶'}</div>
			<div class="clip-info">
				<div class="clip-time">${clip.time}</div>
				<div class="clip-meta">
					<span class="badge badge-${clip.type}">${clip.type === 'event' ? 'Event' : 'Normal'}</span>
					<span>${formatSize(clip.size)}</span>
				</div>
			</div>`;
		item.onclick = () => playByIndex(i);
		clipsList.appendChild(item);
	});

	const active = clipsList.querySelector('.clip-item.active');
	if (active) active.scrollIntoView({ block: 'nearest' });

	currentIndex = filteredClips.findIndex(c => c.path === currentClip);
	updateInfoIndex();
};

const setFilter = newFilter => {
	if (filter === newFilter) return;
	filter = newFilter;
	document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === filter));
	renderClips();
};

const renderTimeline = () => {
	timelineBar.querySelectorAll('.tl-clip').forEach(el => el.remove());
	if (!clips.length) return;

	clips.forEach(clip => {
		const left = timeToPercent(clip.time);
		const width = Math.max(0.3, clip.size / AVG_BYTES_PER_SEC / 86400 * 100);

		const el = document.createElement('div');
		el.className = `tl-clip tl-${clip.type}${clip.path === currentClip ? ' tl-active' : ''}`;
		el.style.left = `${left}%`;
		el.style.width = `${width}%`;
		el.dataset.path = clip.path;
		el.title = `${clip.time}  ${clip.type === 'event' ? '⚡ Event' : '▶ Normal'}  ${formatSize(clip.size)}`;
		el.onclick = () => {
			const idx = filteredClips.findIndex(c => c.path === clip.path);
			if (idx >= 0) {
				playByIndex(idx);
			} else {
				setFilter('all');
				const newIdx = filteredClips.findIndex(c => c.path === clip.path);
				if (newIdx >= 0) playByIndex(newIdx);
			}
		};
		timelineBar.appendChild(el);
	});
};

const selectDate = async (date, el) => {
	if (currentDate === date) return;
	currentDate = date;
	currentClip = null;
	currentIndex = -1;
	document.querySelectorAll('.date-item').forEach(d => d.classList.remove('active'));
	el.classList.add('active');
	clipsCount.textContent = 'Loading...';
	clipsStats.textContent = '';
	clipsList.innerHTML = '';

	const res = await fetch(`/api/clips/${date}`).then(r => r.json());
	if (currentDate !== date) return;
	if (!res.success) {
		clipsCount.textContent = 'Error';
		return;
	}
	clips = res.data;

	const countEl = el.querySelector('.date-count');
	if (countEl) countEl.textContent = clips.length;

	renderClips();
	renderTimeline();

	if (pendingClip) {
		const idx = filteredClips.findIndex(c => c.path === pendingClip);
		if (idx >= 0) playByIndex(idx);
		pendingClip = null;
	}

	saveState();
};

const loadInfo = async () => {
	const res = await fetch('/api/info').then(r => r.json());
	if (!res.success) return console.error('Info error:', res.message);
	const { data } = res;

	document.getElementById('hd-device').textContent = data.deviceId ?? '—';
	document.getElementById('hd-fw').textContent = data.firmware ?? '—';
	document.getElementById('hd-wifi').textContent = data.wifi ?? '—';
	document.getElementById('hd-fps').textContent = data.fps ? `${data.fps} fps` : '—';

	if (data.battery != null) {
		const pct = data.battery;
		document.getElementById('hd-battery').textContent = `${pct}%`;
		const bar = document.getElementById('hd-bat-bar');
		bar.style.width = `${pct}%`;
		bar.style.background = pct > 50 ? '#39f' : pct > 20 ? '#f90' : '#f44';
	}

	if (data.storage) {
		const { total, used } = data.storage;
		document.getElementById('hd-storage').textContent = `${formatGB(used)} / ${formatGB(total)} GB`;
		const bar = document.getElementById('hd-sd-bar');
		bar.style.width = `${(used / total * 100).toFixed(0)}%`;
		bar.style.background = '#39f';
	}

	if (data.features) {
		const labels = { siren: '🔔 Siren', twoWayAudio: '🎙 2-Way', colorLed: '💡 LED', pir: '👁 PIR' };
		document.getElementById('hd-features').innerHTML = Object.entries(labels)
			.filter(([key]) => data.features[key])
			.map(([, label]) => `<span class="hd-feat">${label}</span>`)
			.join('');
	}
};

const loadDates = async () => {
	const res = await fetch('/api/dates').then(r => r.json());
	if (!res.success) return console.error('Dates error:', res.message);
	const dates = res.data;

	const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
	pendingClip = saved?.clip ?? null;

	datesList.innerHTML = '';
	dates.forEach(({ date, count }) => {
		const el = document.createElement('div');
		el.className = 'date-item';
		el.dataset.date = date;
		el.innerHTML = `<span>${formatDate(date)}</span><span class="date-count">${count}</span>`;
		el.onclick = () => selectDate(date, el);
		datesList.appendChild(el);
	});

	const target = saved?.date
		? [...datesList.children].find(el => el.dataset.date === saved.date)
		: datesList.firstChild;

	if (target) target.click();
};

dateSearch.addEventListener('input', e => {
	const q = e.target.value.trim().toLowerCase();
	[...datesList.children].forEach(el => {
		el.style.display = !q || el.dataset.date.includes(q) ? '' : 'none';
	});
});

btnTimeline.addEventListener('click', () => {
	const visible = timeline.style.display !== 'none';
	timeline.style.display = visible ? 'none' : 'block';
	btnTimeline.classList.toggle('active', !visible);
});

filterBar.addEventListener('click', e => {
	const btn = e.target.closest('.filter-btn');
	if (btn) setFilter(btn.dataset.filter);
});

document.addEventListener('keydown', e => {
	if (e.target === videoPlayer) return;
	if (e.key === ' ') {
		e.preventDefault();
		videoPlayer.paused ? videoPlayer.play().catch(Object) : videoPlayer.pause();
	} else if (e.key === 'ArrowLeft') {
		e.preventDefault();
		navigateTo(-1);
	} else if (e.key === 'ArrowRight') {
		e.preventDefault();
		navigateTo(1);
	} else if (e.key === 'f' || e.key === 'F') {
		videoPlayer.requestFullscreen?.();
	}
});

videoPlayer.addEventListener('canplay', () => { loading.style.display = 'none'; });
videoPlayer.addEventListener('waiting', () => { loading.style.display = 'flex'; });
videoPlayer.addEventListener('playing', () => { loading.style.display = 'none'; });
videoPlayer.addEventListener('ended', () => navigateTo(1));
videoPlayer.addEventListener('error', () => {
	loading.style.display = 'none';
	videoPlayer.style.display = 'none';
	videoError.style.display = 'block';
	videoErrMsg.textContent = `Failed to play: ${currentClip?.split('/').at(-1) ?? 'unknown'}`;
});

void Promise.all([loadInfo(), loadDates()]);
