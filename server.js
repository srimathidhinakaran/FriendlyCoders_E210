import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Chat
app.post("/chat", async (req, res) => {
    const { message, contextUrl } = req.body;

    let systemInstruction = "You are a helpful AI assistant. Be concise.";
    if (contextUrl) {
        systemInstruction += ` You have analyzed the website: ${contextUrl}. 
        
        TASK 1: NAVIGATION CHECK
        If the user provides a keyword or name that looks like a menu item, verify against these "Links":
        MATCHING RULES:
        1. Check if the input is CONTAINED in any Link Text.
        2. Check if the input is CONTAINED in any Link URL.
        3. Check if the input is a SYNONYM or SEMANTICALLY RELATED to a link.
        
        If a match is found, reply "REDIRECT: <full_url>".

        TASK 2: CONVERSATION
        If the user is saying "hi", "hello", asking a general question, or if NO link matches, simply reply to them helpfully.
        DO NOT say "No match found" unless it was clearly a navigation attempt that failed.`;
    }

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [
                    { role: "system", content: systemInstruction },
                    { role: "user", content: message }
                ]
            })
        });

        const data = await response.json();
        if (data.error) {
            console.error("Groq API Error:", data.error);
            return res.status(500).json({ reply: `API Error: ${data.error.message}` });
        }

        const rawReply = data.choices?.[0]?.message?.content || "No response";

        // Check for redirect command
        if (rawReply.startsWith("REDIRECT:")) {
            const redirectUrl = rawReply.replace("REDIRECT:", "").trim();
            res.json({
                reply: `Navigating to ${redirectUrl}...`,
                redirectUrl: redirectUrl
            });
        } else {
            res.json({ reply: rawReply });
        }

    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ reply: "Internal Server Error" });
    }
});

// Website analysis
app.post("/analyze", async (req, res) => {
    try {
        const { url } = req.body;

        const https = await import("https");
        const httpsAgent = new https.Agent({ rejectUnauthorized: false });

        const page = await fetch(url, {
            agent: url.startsWith("https") ? httpsAgent : undefined,
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
            }
        });
        const html = await page.text();
        const $ = cheerio.load(html);

        const title = $('title').text().trim();
        const metaDesc = $('meta[name="description"]').attr('content') || "";

        // Extract Links BEFORE removing elements
        const links = [];
        $('a').each((i, el) => {
            const text = $(el).text().replace(/\s+/g, ' ').trim();
            const href = $(el).attr('href');
            if (text && text.length > 2 && href && !href.startsWith('#') && !href.startsWith('javascript:')) {
                try {
                    const absoluteUrl = new URL(href, url).href;
                    links.push(`- ${text}: ${absoluteUrl}`);
                } catch (e) { }
            }
        });
        const linkSummary = [...new Set(links)].slice(0, 100).join('\n');

        // Remove script, style, and other non-content elements
        $('script, style, svg, noscript, iframe, link, meta').remove();

        // Extract and clean text
        const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, 15000);

        let combinedText = `Title: ${title}\nDescription: ${metaDesc}\n\nLinks/Menu Structures:\n${linkSummary}\n\nBody Content:\n${text}`;
        combinedText = combinedText.slice(0, 20000);

        if (combinedText.length < 50) {
            return res.json({ analysis: "This website seems to be protected (e.g., Amazon, Cloudflare) or requires JavaScript. My server cannot read it directly. \n\n✅ SOLUTION: Open this website in your browser and use the AI Extension icon to analyze it." });
        }

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [{
                    role: "user",
                    content: `Analyze this website content. 
                    If the content appears to be a CAPTCHA, a "Robot Check", "Access Denied", or is missing useful information, reply ONLY with the string: "BLOCKED_USE_EXTENSION".
                    
                    Otherwise, summarize it clearly and concisely:\n\n${combinedText}`
                }]
            })
        });

        const data = await response.json();
        if (data.error) {
            console.error("Groq Analysis Error:", data.error);
            return res.json({ analysis: `API Error: ${data.error.message}` });
        }
        let analysis = data.choices?.[0]?.message?.content || "Analysis failed";

        if (analysis.includes("BLOCKED_USE_EXTENSION") || analysis.toLowerCase().includes("empty")) {
            analysis = "This website (Amazon/Flipkart) is protecting itself from bots. \n\n✅ SOLUTION: Open this site in your browser and use the **AI Assistant Extension** (top right icon) to analyze it.";
        }

        res.json({ analysis });

    } catch (error) {
        console.error(error);

        const url = req.body.url || "unknown"; // Access from request body
        let userMessage = `Unable to analyze website: ${error.message}`;

        if (error.code === 'ENOTFOUND') {
            userMessage = `I couldn't find the website "${url}". Please check the spelling (e.g., 'flipkart.com' instead of 'flipcart.com').`;
        } else if (error.message.includes('403') || error.message.includes('401') || error.message.includes('503')) {
            userMessage = `Access denied by ${url}. This site likely blocks AI bots. Please open the site and use the Chrome Extension instead.`;
        }

        res.json({ analysis: userMessage });
    }
});

// Extension Chat endpoint
app.post("/extension-chat", async (req, res) => {
    const { message, context } = req.body; // Context comes from extension (title, links, content)

    let systemInstruction = "You are a helpful AI website assistant. Be concise.";

    if (context) {
        systemInstruction += ` You are analyzing the website: ${context.url}.
        Title: ${context.title}
        Description: ${context.metaDesc}
        
        Links/Menu Structures:
        ${context.links}
        
        Page Content:
        ${context.content}

        MATCHING RULES for Redirects:
        1. Check if the user input is CONTAINED in any Link Text.
        2. Check if the user input is CONTAINED in any Link URL.
        3. Check if the input is a SYNONYM or SEMANTICALLY RELATED to a link.
        
        If a match is found, reply "FOUND: <Link Text> | <full_url>".
        Example: "FOUND: Placement Cell | https://kongu.ac.in/placement"
        `;
    }

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [
                    { role: "system", content: systemInstruction },
                    { role: "user", content: message }
                ]
            })
        });

        const data = await response.json();
        if (data.error) {
            return res.status(500).json({ reply: `API Error: ${data.error.message}` });
        }

        const rawReply = data.choices?.[0]?.message?.content || "No response";

        if (rawReply.startsWith("FOUND:")) {
            // Parse FOUND: Text | URL
            const parts = rawReply.replace("FOUND:", "").split("|");
            const text = parts[0].trim();
            const url = parts[1] ? parts[1].trim() : "";

            res.json({
                reply: `I found "${text}".`,
                found: { text, url }
            });
        } else {
            res.json({ reply: rawReply });
        }

    } catch (error) {
        console.error("Extension Error:", error);
        res.status(500).json({ reply: "Internal Server Error" });
    }
});

app.listen(3000, () =>
    console.log("Server running at http://localhost:3000")
);
