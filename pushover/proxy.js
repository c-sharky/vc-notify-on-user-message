const express = require("express");
const bodyParser = require("body-parser");
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const cors = require("cors");
const FormData = require("form-data");
const sharp = require("sharp");

const app = express();
app.use(cors()); // <-- allow all origins
app.use(bodyParser.json());

// Example POST request:
// {
//   "userKey": "your-user-key",
//   "apiToken": "your-app-token",
//   "message": "Hello from Discord"
// }

app.post("/push", async (req, res) => {
    const { token, user, title, message, attachment, url, url_title } = req.body;

    if (!token || !user) {
        return res.status(400).json({ error: "Missing fields" });
    }

    try {
        let form = new FormData();
        form.append("token", token);
        form.append("user", user);
        form.append("title", title);
        form.append("message", message ? message : "[Attachment]");
        form.append("url", url);
        form.append("url_title", url_title);

        if (attachment) {
            // 1. Download the file from Discord
            const resp = await fetch(attachment);
            const buffer = Buffer.from(await resp.arrayBuffer());

            // 2. Compress/resize with sharp
            const optimized = await sharp(buffer)
                .resize({ width: 1920, withoutEnlargement: true })
                .jpeg({ quality: 75, mozjpeg: true })
                .toBuffer();

            // 3. Attach to pushover request
            form.append("attachment", optimized, { filename: "image.jpg" });
        }

        // 4. Send to Pushover
        const pushoverResp = await fetch("https://api.pushover.net/1/messages.json", {
            method: "POST",
            body: form
        });

        const text = await pushoverResp.text();
        if (!pushoverResp.ok) throw new Error(text);

        res.json({ success: true, response: text });
    } catch (err) {
        console.error("Pushover request failed:", err);
        res.status(500).json({ error: err.message });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Pushover proxy server running at http://localhost:${PORT}`);
});