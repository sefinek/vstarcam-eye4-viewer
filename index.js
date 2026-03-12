process.loadEnvFile();

const express = require('express');
const fs = require('fs');
const path = require('path');
const morgan = require('./middlewares/morgan');

const app = express();
app.use(morgan);
app.use(express.static(path.join(__dirname, 'public')));

const VIDEO_ROOT = process.env.VIDEO_ROOT;
const CAM_ROOT = path.dirname(VIDEO_ROOT);

const ok = (res, data) => res.json({ success: true, status: 200, data });
const fail = (res, status, message) => res.status(status).json({ success: false, status, message });

app.get('/api/info', (req, res) => {
	try {
		const hwRaw = fs.readFileSync(path.join(CAM_ROOT, 'hw_param.conf'), 'utf8');
		const hw = JSON.parse(hwRaw.slice(hwRaw.indexOf('{'), hwRaw.lastIndexOf('}') + 1));

		const dates = fs.readdirSync(VIDEO_ROOT, { withFileTypes: true })
			.filter(e => e.isDirectory() && (/^\d{4}-\d{2}-\d{2}$/).test(e.name))
			.map(e => e.name)
			.sort()
			.reverse();

		let parsed = {};
		for (const date of dates) {
			const logPath = path.join(VIDEO_ROOT, date, `${date.replace(/-/g, '')}.log`);
			if (!fs.existsSync(logPath)) continue;

			const log = fs.readFileSync(logPath, 'utf8');
			const batMatches = [...log.matchAll(/bat_rate:(\d+)/g)];
			const fpsMatches = [...log.matchAll(/chn:0 FPS: ([\d.]+)/g)];

			parsed = {
				firmware: log.match(/"version":"([\d.]+)"/)?.[1] ?? null,
				wifi: log.match(/ssid:(.+?) pwd:/)?.[1]?.trim() ?? null,
				storage: (() => {
					const m = log.match(/total_size:(\d+) used_size:(\d+) free_size:(\d+) name:/);
					return m ? { total: +m[1], used: +m[2], free: +m[3] } : null;
				})(),
				battery: batMatches.length ? +batMatches.at(-1)[1] : null,
				fps: fpsMatches.length ? +parseFloat(fpsMatches.at(-1)[1]).toFixed(1) : null,
			};
			break;
		}

		ok(res, {
			deviceId: path.basename(CAM_ROOT),
			...parsed,
			features: {
				speaker: !!hw.Speaker?.Have,
				siren: !!hw.Speaker?.Siren,
				twoWayAudio: !!hw.Speaker?.dbTalk,
				battery: !!hw.BATTERY?.Have,
				pir: !!hw.PIR,
				colorLed: !!hw.wLed?.Color,
			},
		});
	} catch (err) {
		fail(res, 500, err.message);
	}
});

app.get('/api/dates', (req, res) => {
	try {
		const entries = fs.readdirSync(VIDEO_ROOT, { withFileTypes: true })
			.filter(e => e.isDirectory() && (/^\d{4}-\d{2}-\d{2}$/).test(e.name))
			.map(e => e.name)
			.sort()
			.reverse();

		const dates = entries.map(date => {
			const dir = path.join(VIDEO_ROOT, date, 's0');
			let count = 0;
			try { count = fs.readdirSync(dir).filter(f => f.endsWith('.mp4') && !f.startsWith('.')).length; } catch { /* empty */ }
			return { date, count };
		});

		ok(res, dates);
	} catch (err) {
		fail(res, 500, err.message);
	}
});

app.get('/api/clips/:date', (req, res) => {
	const { date } = req.params;
	if (!(/^\d{4}-\d{2}-\d{2}$/).test(date)) return fail(res, 400, 'Invalid date format');

	const dir = path.join(VIDEO_ROOT, date, 's0');
	try {
		const clips = fs.readdirSync(dir)
			.filter(f => f.endsWith('.mp4') && !f.startsWith('.'))
			.map(f => {
				const m = f.match(/^(\d{2})(\d{2})(\d{2})_(\d{3})\.mp4$/);
				if (!m) return null;
				const [, hh, mm, ss, type] = m;
				return {
					name: f,
					time: `${hh}:${mm}:${ss}`,
					type: type === '100' ? 'normal' : 'event',
					size: fs.statSync(path.join(dir, f)).size,
					path: `/video/${date}/${f}`,
				};
			})
			.filter(Boolean)
			.sort((a, b) => a.name.localeCompare(b.name));
		ok(res, clips);
	} catch {
		fail(res, 404, 'No clips found for this date');
	}
});

app.get('/video/:date/:file', (req, res) => {
	const { date, file } = req.params;
	if (!(/^\d{4}-\d{2}-\d{2}$/).test(date) || !(/^[\w.]+\.mp4$/).test(file)) return res.status(400).end();

	const filePath = path.join(VIDEO_ROOT, date, 's0', file);
	if (!fs.existsSync(filePath)) return res.status(404).end();

	const { size } = fs.statSync(filePath);
	const range = req.headers.range;

	if (range) {
		const [s, e] = range.replace(/bytes=/, '').split('-');
		const start = parseInt(s, 10);
		const end = e ? parseInt(e, 10) : size - 1;
		res.writeHead(206, {
			'Content-Range': `bytes ${start}-${end}/${size}`,
			'Accept-Ranges': 'bytes',
			'Content-Length': end - start + 1,
			'Content-Type': 'video/mp4',
		});
		fs.createReadStream(filePath, { start, end }).pipe(res);
	} else {
		res.writeHead(200, { 'Content-Length': size, 'Content-Type': 'video/mp4' });
		fs.createReadStream(filePath).pipe(res);
	}
});

app.use((req, res) => {
	fail(res, 404, `Route ${req.method} ${req.path} not found`);
});

app.use((err, req, res, _next) => {
	console.error(err);
	fail(res, 500, err?.message ?? 'Internal server error');
});

const PORT = process.env.PORT || 3737;
app.listen(PORT, () => console.log(`Server running at http://127.0.0.1:${PORT}`));
