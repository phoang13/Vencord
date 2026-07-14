/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { Message } from "@vencord/discord-types";
import { UserStore } from "@webpack/common";

import settings, { setWebhookTestHandler } from "./settings";
import {
    getAlertType,
    getDropCategory,
    getNotificationText,
    isAlertTypeEnabled,
    messageHasAnyKeywordInEmbeds,
    messageHasEmbedPattern,
    shouldNotifyDropByImage,
    getClutchModeStatus
} from "./matching";
import { clearStackedToasts, jumpToEmbedMessage, showJumpToast } from "./toasts";
import { sendWebhookNotification, sendWebhookTest } from "./webhook";

const TARGET_BOT_ID = "840306394531889164"; // id of starbot
const THUNDERDOME_CHANNEL_ID = "1040654663353110679"; // channel id of tdome
const LOCAL_SERVER_BASE_URL = "http://127.0.0.1:5000";
const CLAIM_VERIFICATION_TIMEOUT_MS = 90_000;
const ACTIVE_NOTIFICATIONS = new Set<Notification>();
const PENDING_CLAIM_VERIFICATIONS = new Map<string, ReturnType<typeof setTimeout>>();
let clutchMode = false;

setWebhookTestHandler(() => {
    void sendWebhookTest();
});

function postLocalServerEvent(path: string, body?: string): void {
    const url = `${LOCAL_SERVER_BASE_URL}/${path}`;
    const init: RequestInit = {
        method: "POST"
    };

    if (body !== undefined) {
        init.headers = {
            "Content-Type": "text/plain; charset=utf-8"
        };
        init.body = body;
    }

    fetch(url, init).catch(err => {
        console.error(`Local server post failed for ${path}:`, err);
    });
}

function triggerClick(): void {
    postLocalServerEvent("click");
}

function triggerClaimed(): void {
    postLocalServerEvent("claimed", "claimed");
}

function clearPendingClaimVerification(channelId: string): void {
    const timeout = PENDING_CLAIM_VERIFICATIONS.get(channelId);

    if (timeout) {
        clearTimeout(timeout);
        PENDING_CLAIM_VERIFICATIONS.delete(channelId);
    }
}

function scheduleClaimVerification(channelId: string): void {
    clearPendingClaimVerification(channelId);

    const timeout = setTimeout(() => {
        PENDING_CLAIM_VERIFICATIONS.delete(channelId);
    }, CLAIM_VERIFICATION_TIMEOUT_MS);

    PENDING_CLAIM_VERIFICATIONS.set(channelId, timeout);
}

function getClaimCongratulationsPattern(): RegExp | null {
    const currentUserId = UserStore.getCurrentUser()?.id;

    if (!currentUserId) return null;

    return new RegExp(`congratulations\\s+(?:<@!?${currentUserId}>|@[^\\s>]+)`, "i");
}

function messageHasClaimConfirmation(message: Message): boolean {
    const pattern = getClaimCongratulationsPattern();

    if (!pattern) return false;

    return Boolean(
        message.author?.id === TARGET_BOT_ID
        && message.embeds?.length
        && messageHasEmbedPattern(message, pattern)
    );
}

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
            const clutchStatus = getClutchModeStatus(message);

            if (clutchStatus === "on") {
                clutchMode = true;
            }

            if (clutchStatus === "off") {
                clutchMode = false;
            }

            if (shouldHandle && message.channel_id && PENDING_CLAIM_VERIFICATIONS.has(message.channel_id) && messageHasClaimConfirmation(message)) {
                clearPendingClaimVerification(message.channel_id);
                triggerClaimed();
                return;
            }

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

                    if (settings.store.autoJumpToDropMessage) {
                        jumpToEmbedMessage(message);
                    } else {
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

                    if (settings.store.enableClickTrigger && !clutchMode) { // Only trigger clicks if not in clutch mode
                        triggerClick();
                        if (message.channel_id) {
                            scheduleClaimVerification(message.channel_id);
                        }
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
        for (const channelId of PENDING_CLAIM_VERIFICATIONS.keys()) {
            clearPendingClaimVerification(channelId);
        }

        for (const notification of ACTIVE_NOTIFICATIONS) {
            notification.close();
        }
        ACTIVE_NOTIFICATIONS.clear();
    }
});