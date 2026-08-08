const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// --- 24/7 KEEP-ALIVE SYSTEM ---
// Pings itself every 10 minutes to prevent Render's free tier from sleeping
const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

setInterval(() => {
    if (RENDER_EXTERNAL_URL.startsWith('https')) {
        https.get(`${RENDER_EXTERNAL_URL}/api/ping`, (res) => {
            console.log(`[Keep-Alive] Ping Status: ${res.statusCode}`);
        }).on('error', (err) => {
            console.error('[Keep-Alive] Ping Failed:', err.message);
        });
    }
}, 10 * 60 * 1000); // 10 minutes

app.get('/api/ping', (req, res) => {
    res.status(200).send('Luxury API is online and awake.');
});

// --- MAIN VIDEO EXTRACTION ENDPOINT ---
app.get('/api/fetch', (req, res) => {
    const videoUrl = req.query.url;

    if (!videoUrl) {
        return res.status(400).json({ error: 'Missing video URL parameter.' });
    }

    // Extract direct media links via yt-dlp
    const cmd = `yt-dlp --dump-json --no-warnings --no-playlist "${videoUrl}"`;

    exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
        if (error) {
            console.error('yt-dlp error:', stderr);
            return res.status(500).json({ error: 'Failed to extract video streams.' });
        }

        try {
            const data = JSON.parse(stdout);
            const formats = [];

            if (data.formats) {
                data.formats.forEach(fmt => {
                    // Filter direct progressive video or standard stream URLs
                    if (fmt.url && (fmt.vcodec !== 'none' || fmt.acodec !== 'none')) {
                        formats.push({
                            quality: fmt.format_note || (fmt.height ? `${fmt.height}p` : 'Audio'),
                            ext: fmt.ext || 'mp4',
                            url: fmt.url,
                            hasVideo: fmt.vcodec !== 'none',
                            hasAudio: fmt.acodec !== 'none'
                        });
                    }
                });
            }

            res.json({
                status: 'success',
                title: data.title || 'YouTube Video',
                author: data.uploader || 'Creator',
                thumbnail: data.thumbnail || '',
                formats: formats
            });
        } catch (e) {
            res.status(500).json({ error: 'Error parsing video metadata.' });
        }
    });
});

app.listen(PORT, () => {
    console.log(`Luxury YT API running on port ${PORT}`);
});
