/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { Message } from "@vencord/discord-types";
import { ChannelRouter, MessageActions } from "@webpack/common";

const TARGET_BOT_ID = "840306394531889164"; // id of starbot
const THUNDERDOME_CHANNEL_ID = "1040654663353110679"; // channel id of tdome
const STARBOT_BACKS_BASE = "https://starbot.cc/backs"; // drop image link base
const DROP_KEYWORDS = ["dropped a card"];
const GACHA_KEYWORDS = ["gacha rain"];
const PACK_KEYWORDS = ["dropped a pack"];
const GEMS_KEYWORDS = ["money drop"];
const POWER_KEYWORDS = ["PO-PO-PO-PO-PO-POWERRR !"];
const ACTIVE_NOTIFICATIONS = new Set<Notification>();
const TOAST_DURATION_MS = 10000;
const MAX_STACKED_TOASTS = 7;

type ActiveStackedToast = {
    id: number;
    element: HTMLButtonElement;
    timeout: ReturnType<typeof setTimeout>;
};

const ACTIVE_STACKED_TOASTS: ActiveStackedToast[] = [];
let stackedToastContainer: HTMLDivElement | null = null;
let stackedToastId = 0;

const settings = definePluginSettings({
    enableDesktopNotifications: {
        type: OptionType.BOOLEAN,
        description: "Enable desktop notifications",
        default: true
    },
    thunderdomeMode: {
        type: OptionType.BOOLEAN,
        description: "Only alert for drops in thunderdome",
        default: false
    },
    additionalKeywords: {
        type: OptionType.STRING,
        description: "Additional keywords (comma, space, or newline separated)",
        default: ""
    },
    dropNotifications: {
        type: OptionType.BOOLEAN,
        description: "Notify for normal drops",
        default: true
    },
    gachaNotifications: {
        type: OptionType.BOOLEAN,
        description: "Notify for gacha drops",
        default: true
    },
    gemsNotifications: {
        type: OptionType.BOOLEAN,
        description: "Notify for gems (money drops)",
        default: true
    },
    powerNotifications: {
        type: OptionType.BOOLEAN,
        description: "Notify for power drops",
        default: true
    },
    packNotifications: {
        type: OptionType.BOOLEAN,
        description: "Notify for packs",
        default: true
    },
    preferredDrops: {
        type: OptionType.BOOLEAN,
        description: "Notify for preferred drops",
        default: false
    },
    preferredDecks: {
        type: OptionType.STRING,
        description: "Preferred decks (deck IDs, comma/space/newline separated)",
        default: ""
    },
    rareDrops: {
        type: OptionType.BOOLEAN,
        description: "Notify for rare decks",
        default: false
    },
    rareDecks: {
        type: OptionType.STRING,
        description: "Rare decks (deck IDs, comma/space/newline separated)",
        default: ""
    },
    specialDrops: {
        type: OptionType.BOOLEAN,
        description: "Notify for special decks",
        default: false
    },
    specialDecks: {
        type: OptionType.STRING,
        description: "Special decks (deck IDs, comma/space/newline separated)",
        default: ""
    },
    eventDrops: {
        type: OptionType.BOOLEAN,
        description: "Notify for event decks",
        default: false
    },
    eventDecks: {
        type: OptionType.STRING,
        description: "Event decks (deck IDs, comma/space/newline separated)",
        default: ""
    }
});

function getAdditionalKeywords(): string[] {
    return splitTokens(settings.store.additionalKeywords);
}

function splitTokens(input: string): string[] {
    return String(input ?? "")
        .split(/[\s,]+/)
        .map(token => token.trim())
        .filter(Boolean);
}


function getDropImageLinkAllowlist(deckInput: string): Set<string> {
    // Convert deck IDs/URLs into normalized image URLs used by allowlist matching.
    const allowlist = new Set<string>();

    for (const token of splitTokens(deckInput)) {
        const imageUrl = deckToDropImageUrl(token);
        if (imageUrl) allowlist.add(imageUrl);
    }

    return allowlist;
}

function deckToDropImageUrl(deck: string): string {
    /* Convert a deck ID or URL into a normalized drop image URL.
    */
    let id = String(deck ?? "").trim();
    if (!id) return "";

    id = id.replace(/\.png$/i, "");

    try {
        if (id.includes("/")) {
            const parsed = new URL(id);
            id = parsed.pathname.split("/").pop() ?? "";
            id = id.replace(/\.png$/i, "");
        }
    } catch {
        // Keep raw id when it's not a URL.
    }

    if (!id) return "";
    return normalizeUrl(`${STARBOT_BACKS_BASE}/${id}.png`);
}

function normalizeUrl(url: string | undefined): string {
    const trimmed = String(url ?? "").trim();
    if (!trimmed) return "";

    try {
        const parsed = new URL(trimmed);
        parsed.hash = "";
        return parsed.toString();
    } catch {
        return trimmed;
    }
}

function messageHasKeywordInEmbeds(message: Message, keyword: string): boolean {
    const needle = keyword.toLowerCase();

    for (const embed of message.embeds) {
        const embedData = embed as any;
        const fields = Array.isArray(embedData.fields) ? embedData.fields : [];
        const searchableParts: string[] = [
            embedData.rawTitle ?? embedData.title,
            embedData.rawDescription ?? embedData.description,
            embedData.author?.name,
            embedData.footer?.text
        ];

        for (const field of fields as any[]) {
            searchableParts.push(`${field.rawName ?? field.name ?? ""} ${field.rawValue ?? field.value ?? ""}`);
        }

        for (const part of searchableParts) {
            if (!part) continue;
            if (String(part).toLowerCase().includes(needle)) return true;
        }
    }

    return false;
}

function messageHasAnyKeywordsInEmbeds(message: Message, keywords: readonly string[]): boolean {
    // Return true as soon as any keyword matches any embed text.
    for (const keyword of keywords) {
        if (messageHasKeywordInEmbeds(message, keyword)) return true;
    }

    return false;
}

function messageHasAnyKeywordInEmbeds(message: Message): boolean {
    // Check built-in keyword groups plus user-defined keywords.
    const additionalKeywords = getAdditionalKeywords();
    const allKeywords = [
        ...POWER_KEYWORDS,
        ...DROP_KEYWORDS,
        ...GACHA_KEYWORDS,
        ...PACK_KEYWORDS,
        ...GEMS_KEYWORDS,
        ...additionalKeywords
    ];

    return messageHasAnyKeywordsInEmbeds(message, allKeywords);
}

type AlertType = "drop" | "gacha" | "pack" | "gems" | "power";
type DropCategory = "preferred" | "rare" | "special" | "event";

function getAlertType(message: Message): AlertType | null {
    if (messageHasAnyKeywordsInEmbeds(message, PACK_KEYWORDS)) return "pack";
    if (messageHasAnyKeywordsInEmbeds(message, GEMS_KEYWORDS)) return "gems";
    if (messageHasAnyKeywordsInEmbeds(message, GACHA_KEYWORDS)) return "gacha";
    if (messageHasAnyKeywordsInEmbeds(message, POWER_KEYWORDS)) return "power";
    if (messageHasAnyKeywordsInEmbeds(message, DROP_KEYWORDS)) return "drop";
    if (messageHasAnyKeywordsInEmbeds(message, getAdditionalKeywords())) return "drop";
    return null;
}

function isAlertTypeEnabled(alertType: AlertType): boolean {
    if (alertType === "gacha") return settings.store.gachaNotifications;
    if (alertType === "drop") return settings.store.dropNotifications;
    if (alertType === "gems") return settings.store.gemsNotifications;
    if (alertType === "power") return settings.store.powerNotifications;
    return settings.store.packNotifications;
}

function getEmbedImageUrls(message: Message): string[] {
    // Collect all embed image URLs, then normalize them for consistent comparisons.
    const rawUrls: string[] = [];

    for (const embed of message.embeds as any[]) {
        if (embed?.image?.url) rawUrls.push(embed.image.url);
        if (Array.isArray(embed?.images)) {
            for (const image of embed.images) {
                if (image?.url) rawUrls.push(image.url);
            }
        }
    }

    const normalizedUrls: string[] = [];
    for (const url of rawUrls) {
        const normalized = normalizeUrl(url);
        if (normalized) normalizedUrls.push(normalized);
    }

    return normalizedUrls;
}

function shouldNotifyDropByImage(message: Message): boolean {
    // Build allowlists from enabled categories.
    const enabledAllowlists: Set<string>[] = [];

    if (settings.store.preferredDrops) {
        enabledAllowlists.push(getDropImageLinkAllowlist(settings.store.preferredDecks));
    }
    if (settings.store.rareDrops) {
        enabledAllowlists.push(getDropImageLinkAllowlist(settings.store.rareDecks));
    }
    if (settings.store.specialDrops) {
        enabledAllowlists.push(getDropImageLinkAllowlist(settings.store.specialDecks));
    }
    if (settings.store.eventDrops) {
        enabledAllowlists.push(getDropImageLinkAllowlist(settings.store.eventDecks));
    }

    // No deck filters enabled means all drops should be allowed.
    if (enabledAllowlists.length === 0) return true;

    const embedImageUrls = getEmbedImageUrls(message);
    for (const url of embedImageUrls) {
        for (const allowlist of enabledAllowlists) {
            if (allowlist.has(url)) return true;
        }
    }

    return false;
}

function getDropCategory(message: Message): DropCategory | null {
    // Find the first enabled category whose allowlist contains one of the embed image URLs.
    const embedImageUrls = getEmbedImageUrls(message);

    if (settings.store.preferredDrops) {
        const preferred = getDropImageLinkAllowlist(settings.store.preferredDecks);
        if (embedImageUrls.some(url => preferred.has(url))) return "preferred";
    }
    if (settings.store.rareDrops) {
        const rare = getDropImageLinkAllowlist(settings.store.rareDecks);
        if (embedImageUrls.some(url => rare.has(url))) return "rare";
    }
    if (settings.store.specialDrops) {
        const special = getDropImageLinkAllowlist(settings.store.specialDecks);
        if (embedImageUrls.some(url => special.has(url))) return "special";
    }
    if (settings.store.eventDrops) {
        const event = getDropImageLinkAllowlist(settings.store.eventDecks);
        if (embedImageUrls.some(url => event.has(url))) return "event";
    }

    return null;
}

function getNotificationText(alertType: AlertType, message: Message, dropCategory: DropCategory | null): string {
    // Non-drop notifications are fixed by alert type.
    if (alertType === "pack") return "Pack spotted";
    if (alertType === "gems") return "Gems spotted";
    if (alertType === "gacha") return "Gacha spotted";
    if (alertType === "power") return "Power spotted";

    // Drop notifications use the matched category when available.
    if (dropCategory === "preferred") return "Dropped a preferred card";
    if (dropCategory === "rare") return "Dropped a rare card";
    if (dropCategory === "special") return "Dropped a special card";
    if (dropCategory === "event") return "Dropped an event card";


    return "Drop spotted";
}

function focusDiscordWindow(): void {
    const nativeWindow = (window as any).DiscordNative?.window;
    const vesktopWindow = (window as any).VesktopNative?.window;

    try {
        if (nativeWindow?.isMinimized?.()) {
            nativeWindow.restore?.();
        }
        nativeWindow?.show?.();
        nativeWindow?.focus?.();
    } catch {
        // Fallback below handles environments without DiscordNative window controls.
    }

    try {
        if (vesktopWindow?.isMinimized?.()) {
            vesktopWindow.restore?.();
        }
        vesktopWindow?.show?.();
        vesktopWindow?.focus?.();
    } catch {
        // Not all clients expose a Vesktop window API.
    }

    window.focus();
}

function jumpToEmbedMessage(message: Message): void {
    if (!message.channel_id || !message.id) return;

    focusDiscordWindow();

    ChannelRouter.transitionToChannel(message.channel_id);

    // Wait a tick so channel transition finishes before attempting to scroll.
    setTimeout(() => {
        MessageActions.jumpToMessage({
            channelId: message.channel_id,
            messageId: message.id,
            flash: true,
            jumpType: "ANIMATED"
        });
    }, 200);
}

function ensureStackedToastContainer(): HTMLDivElement {
    if (stackedToastContainer?.isConnected) return stackedToastContainer;

    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.left = "50%";
    container.style.bottom = "84px";
    container.style.transform = "translateX(-50%)";
    container.style.display = "flex";
    container.style.flexDirection = "column-reverse";
    container.style.gap = "8px";
    container.style.pointerEvents = "none";
    container.style.zIndex = "10000";

    document.body.appendChild(container);
    stackedToastContainer = container;
    return container;
}

function removeStackedToast(toastId: number): void {
    const index = ACTIVE_STACKED_TOASTS.findIndex(toast => toast.id === toastId);
    if (index === -1) return;

    const [toast] = ACTIVE_STACKED_TOASTS.splice(index, 1);
    clearTimeout(toast.timeout);
    toast.element.remove();

    if (ACTIVE_STACKED_TOASTS.length === 0) {
        stackedToastContainer?.remove();
        stackedToastContainer = null;
    }
}

function clearStackedToasts(): void {
    for (const toast of ACTIVE_STACKED_TOASTS) {
        clearTimeout(toast.timeout);
        toast.element.remove();
    }

    ACTIVE_STACKED_TOASTS.length = 0;
    stackedToastContainer?.remove();
    stackedToastContainer = null;
}

function showJumpToast(notificationText: string, message: Message): void {
    const container = ensureStackedToastContainer();
    const toastId = ++stackedToastId;

    if (ACTIVE_STACKED_TOASTS.length >= MAX_STACKED_TOASTS) {
        // Keep newest drops visible when overflowing the max stack size.
        removeStackedToast(ACTIVE_STACKED_TOASTS[0].id);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = notificationText;
    button.onclick = () => {
        removeStackedToast(toastId);
        jumpToEmbedMessage(message);
    };

    button.style.width = "200px";
    button.style.maxWidth = "calc(100vw - 32px)";
    button.style.boxSizing = "border-box";
    button.style.padding = "8px 10px";
    button.style.borderRadius = "8px";
    button.style.border = "1px solid var(--green-360, #3ba55c)";
    button.style.background = "var(--green-430, #248046)";
    button.style.color = "var(--white-500, #ffffff)";
    button.style.fontSize = "13px";
    button.style.fontWeight = "700";
    button.style.lineHeight = "16px";
    button.style.cursor = "pointer";
    button.style.textAlign = "center";
    button.style.pointerEvents = "auto";

    container.appendChild(button);

    const timeout = setTimeout(() => {
        removeStackedToast(toastId);
    }, TOAST_DURATION_MS);

    ACTIVE_STACKED_TOASTS.push({
        id: toastId,
        element: button,
        timeout
    });
}

export default definePlugin({
    name: "ClaimAlert",
    description: "Alerts for drops.",
    authors: [Devs.Ahyeonom],
    tags: ["Notifications", "Utility"],
    settings,

    flux: {
        MESSAGE_CREATE({ message, optimistic }: { message: Message; optimistic: boolean; }) {
            if (optimistic) return;

            if (!message?.author || message.author.id !== TARGET_BOT_ID) return;
            if (settings.store.thunderdomeMode && message.channel_id !== THUNDERDOME_CHANNEL_ID) return; // Restrict alerts to thunderdome when enabled.
            if (!message.embeds?.length) return; // Ignore messages without embeds.
            if (!messageHasAnyKeywordInEmbeds(message)) return; // Skip messages that do not match any known keyword.

            const alertType = getAlertType(message);
            if (!alertType) return; // Unknown alert type.
            if (!isAlertTypeEnabled(alertType)) return; // Type disabled in settings.

            if (alertType === "drop" && !shouldNotifyDropByImage(message)) return; // Drop did not match enabled deck allowlists.

            const dropCategory = alertType === "drop" ? getDropCategory(message) : null;

            const notificationText = getNotificationText(alertType, message, dropCategory);
            showJumpToast(notificationText, message);
            if (!settings.store.enableDesktopNotifications) return; // Keep toast behavior even when desktop notifications are off.
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
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
    },

    start() { // Request notification permission on plugin start if not already granted or denied, to ensure we can show notifications when drops are detected.
        if (typeof Notification !== "undefined" && Notification.permission === "default") {
            void Notification.requestPermission();
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