/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { FluxDispatcher, MessageActions, UserStore } from "@webpack/common";
import { Message } from "discord-types/general";

let handler: ((data: any) => void) | null = null;

// Define plugin settings
const settings = definePluginSettings({
    adminIds: {
        type: OptionType.STRING,
        description: "User IDs to scan commands from (separated by commas)",
        default: "",
    },
    targetUserIds: {
        type: OptionType.STRING,
        description: "User IDs to scan messages from (separated by commas)",
        default: "",
    },
    pushoverEnabled: {
        type: OptionType.BOOLEAN,
        description: "Send via Pushover",
        default: true
    },
    pushoverUserKey: {
        type: OptionType.STRING,
        description: "Your Pushover user key",
        default: ""
    },
    pushoverApiToken: {
        type: OptionType.STRING,
        description: "Your Pushover app API token",
        default: ""
    }
});

async function sendPushoverProxy(author: string, message: string, attachmentUrl: string, link: string, link_title: string) {
    const apiToken = settings.store.pushoverApiToken;
    const userKey = settings.store.pushoverUserKey;
    if (!userKey || !apiToken) return;

    try {
        await fetch("http://localhost:3000/push", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                token: apiToken,
                user: userKey,
                title: author,
                message: message,
                attachment: attachmentUrl,
                url: link,
                url_title: link_title
            })
        });
    } catch (err) {
        console.warn("Failed to send Pushover via proxy:", err);
    }
}

function cleanUpDiscordFormatting(content: string): string {

    var result = content;

    // Fix emotes
    result = result.replace(/<a?:([a-zA-Z0-9_]+):\d+>/g, ":$1:");

    // Fix user mentions
    result = result.replace(/<@!?(\d+)>/g, (_match, userId) => {
            const user = UserStore.getUser(userId);
            return user ? `@${user.username}` : "@unknown";
        })

    return result;
}

const plugin = definePlugin({
    name: "NotifyOnUserMessage",
    description: "Sends a notification if one of the specified users sends a message in any server.",
    authors: [Devs.Ven],
    settings,

    sendNotification(username: string, content: string, avatar: string) {
        if (Notification.permission === "granted") {
            new Notification(`Message from ${username}`, {
                body: content,
                icon: avatar // you can use user avatar here
            });
        } else if (Notification.permission !== "denied") {
            Notification.requestPermission().then(permission => {
                if (permission === "granted") {
                    new Notification(`Message from ${username}`, {
                        body: content,
                        icon: avatar // you can use user avatar here
                    });
                }
            });
        }
    },

    start() {
        handler = data => {
            const message = data.message as Message;

            let guildId = message.guild_id;

            if (!guildId) {
                return;
            }

            const adminIds = settings.store.adminIds.split(",");
            if (adminIds.includes(message.author.id))
            {
                // Check if the message is a command (starts with '!')
                if (message.content.startsWith("!"))
                {
                    const command = message.content.slice(1).trim().toLowerCase();
                    if (command === "pushovertest" && settings.store.pushoverEnabled)
                    {
                        sendPushoverProxy(message.author.username, "This is a test notification.", null, "", "");
                    }
                    if (command === "notifytest")
                    {
                        const avatarUrl = `https://cdn.discordapp.com/avatars/${message.author.id}/${message.author.avatar}.png`;
                        plugin.sendNotification(message.author.username, "This is a test notification.", avatarUrl);
                    }
                }

                return;
            }

             // Check if the message is from one of the target users
            const ids = settings.store.targetUserIds.split(",");
            if (!ids.includes(message.author.id)) return;

            var messageContent = message.content;

            if (message.referenced_message)
            {
                let refAuthor = message.referenced_message.member?.nick ?? message.referenced_message.author.username;
                var refContent = message.referenced_message.content;

                if (!refContent)
                    refContent = "[Attachment]";

                messageContent = `${messageContent}\n\n[Reply to ${refAuthor}: ${refContent}]`;
            }

            messageContent = cleanUpDiscordFormatting(messageContent);

            // Call the plugin's method directly
            const avatarUrl = `https://cdn.discordapp.com/avatars/${message.author.id}/${message.author.avatar}.png`;
            plugin.sendNotification(message.author.username, messageContent, avatarUrl);

            if (!settings.store.pushoverEnabled)
                return;

            // If the message has attachments, grab the first one
            const attachmentUrl = message.attachments?.[0]?.url ?? null;
            const messageLink = `https://discord.com/channels/${guildId}/${message.channel_id}/${message.id}`;

            const displayName = message.member?.nick ?? message.author.username;

            // Pushover notification
            sendPushoverProxy(displayName, messageContent, attachmentUrl, messageLink, "View in Discord");
        };

        FluxDispatcher.subscribe("MESSAGE_CREATE", handler);
    },

    stop() {
        if (handler) {
            FluxDispatcher.unsubscribe("MESSAGE_CREATE", handler);
            handler = null;
        }
    }
});

export default plugin;
