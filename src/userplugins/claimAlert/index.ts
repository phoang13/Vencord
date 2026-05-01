/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { Message } from "@vencord/discord-types";

import settings, { setWebhookTestHandler } from "./settings";
import {
    getAlertType,
    getDropCategory,
    getNotificationText,
    isAlertTypeEnabled,
    messageHasAnyKeywordInEmbeds,
    shouldNotifyDropByImage
} from "./matching";
import { clearStackedToasts, jumpToEmbedMessage, showJumpToast } from "./toasts";
import { sendWebhookNotification, sendWebhookTest } from "./webhook";

const TARGET_BOT_ID = "840306394531889164"; // id of starbot
const THUNDERDOME_CHANNEL_ID = "1040654663353110679"; // channel id of tdome
const ACTIVE_NOTIFICATIONS = new Set<Notification>();

setWebhookTestHandler(() => {
    void sendWebhookTest();
});
export default definePlugin({
    name: "ClaimAlert",
    description: "Alerts for drops.",
    authors: [Devs.Ahyeonom],
    tags: ["Notifications", "Utility"],
    settings,

    flux: {
        MESSAGE_CREATE({ message, optimistic }: { message: Message; optimistic: boolean; }) {
            // Gate on message source and basic filters first.
            let shouldHandle = !optimistic;

            if (shouldHandle && (!message?.author || message.author.id !== TARGET_BOT_ID)) {
                shouldHandle = false;
            }
            if (shouldHandle && settings.store.thunderdomeMode && message.channel_id !== THUNDERDOME_CHANNEL_ID) {
                shouldHandle = false;
            }
            if (shouldHandle && !message.embeds?.length) {
                shouldHandle = false;
            }
            if (shouldHandle && !messageHasAnyKeywordInEmbeds(message)) {
                shouldHandle = false;
            }

            if (shouldHandle) {
                // Resolve the alert type and check per-type settings.
                const alertType = getAlertType(message);
                let canNotify = Boolean(alertType);

                if (canNotify && alertType && !isAlertTypeEnabled(alertType)) {
                    canNotify = false;
                }

                if (canNotify && alertType === "drop" && !shouldNotifyDropByImage(message)) {
                    // Drop did not match enabled deck allowlists.
                    canNotify = false;
                }

                if (canNotify && alertType) {
                    // Fan out to toasts, webhook, and desktop notifications.
                    const dropCategory = alertType === "drop" ? getDropCategory(message) : null;
                    const notificationText = getNotificationText(alertType, dropCategory);

                    if (settings.store.enableToasts) {
                        showJumpToast(notificationText, message);
                    }
                    void sendWebhookNotification(alertType, dropCategory, message);

                    if (settings.store.enableDesktopNotifications
                        && typeof Notification !== "undefined"
                        && Notification.permission === "granted") {
                        const notification = new Notification("Claim Alert", {
                            body: notificationText,
                            silent: false
                        });
                        ACTIVE_NOTIFICATIONS.add(notification);

                        notification.onclick = () => {
                            jumpToEmbedMessage(message);
                            notification.close();
                        };

                        notification.onclose = () => {
                            ACTIVE_NOTIFICATIONS.delete(notification);
                        };
                    }
                }
            }
        }
    },

    start() { // Request notification permission on plugin start if not already granted or denied, to ensure we can show notifications when drops are detected.
        if (typeof Notification !== "undefined") {
            if (Notification.permission === "default") {
                void Notification.requestPermission();
            }
        }
    },

    stop() {
        clearStackedToasts();

        for (const notification of ACTIVE_NOTIFICATIONS) {
            notification.close();
        }
        ACTIVE_NOTIFICATIONS.clear();
    }
});