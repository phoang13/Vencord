/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { Message } from "@vencord/discord-types";

import settings from "./settings";

const STARBOT_BACKS_BASE = "https://starbot.cc/backs"; // drop image link base
const DROP_KEYWORDS = ["dropped a card"];
const GACHA_KEYWORDS = ["gacha rain"];
const PACK_KEYWORDS = ["dropped a pack"];
const GEMS_KEYWORDS = ["money drop"];
const POWER_KEYWORDS = ["PO-PO-PO-PO-PO-POWERRR !"];

export type AlertType = "drop" | "gacha" | "pack" | "gems" | "power";
export type DropCategory = "preferred" | "rare" | "special" | "event";

function splitTokens(input: string): string[] {
    const rawTokens = String(input ?? "").split(/[\s,]+/);
    const tokens: string[] = [];

    for (const raw of rawTokens) {
        const trimmed = raw.trim();
        if (trimmed) tokens.push(trimmed);
    }

    return tokens;
}

function getAdditionalKeywords(): string[] {
    return splitTokens(settings.store.additionalKeywords);
}

function normalizeUrl(url: string | undefined): string {
    const trimmed = String(url ?? "").trim();
    let normalized = "";

    if (trimmed) {
        try {
            const parsed = new URL(trimmed);
            parsed.search = "";
            parsed.hash = "";
            normalized = parsed.toString();
        } catch {
            // Best-effort cleanup for non-URL strings.
            normalized = trimmed.split("?")[0]?.split("#")[0] ?? trimmed;
        }
    }

    return normalized;
}

function deckToDropImageUrl(deck: string): string {
    // Convert a deck ID or URL into a normalized drop image URL.
    let id = String(deck ?? "").trim();
    let output = "";

    if (id) {
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
    }

    if (id) {
        output = normalizeUrl(`${STARBOT_BACKS_BASE}/${id}.png`);
    }

    return output;
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

function messageHasKeywordInEmbeds(message: Message, keyword: string): boolean {
    const needle = keyword.toLowerCase();
    let found = false;

    for (const embed of message.embeds) {
        if (found) break;

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
            if (String(part).toLowerCase().includes(needle)) {
                found = true;
                break;
            }
        }
    }

    return found;
}

function messageHasAnyKeywordsInEmbeds(message: Message, keywords: readonly string[]): boolean {
    // Return true as soon as any keyword matches any embed text.
    let found = false;

    for (const keyword of keywords) {
        if (!found) found = messageHasKeywordInEmbeds(message, keyword);
    }

    return found;
}

export function messageHasAnyKeywordInEmbeds(message: Message): boolean {
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

export function messageHasEmbedText(message: Message, text: string): boolean {
    return messageHasAnyKeywordsInEmbeds(message, [text]);
}

export function getAlertType(message: Message): AlertType | null {
    let alertType: AlertType | null = null;

    if (alertType === null && messageHasAnyKeywordsInEmbeds(message, PACK_KEYWORDS)) alertType = "pack";
    if (alertType === null && messageHasAnyKeywordsInEmbeds(message, GEMS_KEYWORDS)) alertType = "gems";
    if (alertType === null && messageHasAnyKeywordsInEmbeds(message, GACHA_KEYWORDS)) alertType = "gacha";
    if (alertType === null && messageHasAnyKeywordsInEmbeds(message, POWER_KEYWORDS)) alertType = "power";
    if (alertType === null && messageHasAnyKeywordsInEmbeds(message, DROP_KEYWORDS)) alertType = "drop";
    if (alertType === null && messageHasAnyKeywordsInEmbeds(message, getAdditionalKeywords())) alertType = "drop";

    return alertType;
}

export function getClutchModeStatus(message: Message): "on" | "off" | null {
    const content = String((message as any).content ?? "").toLowerCase();
    const hasStart = content.includes("clutch! next drop") || messageHasKeywordInEmbeds(message, "clutch! next drop");
    const hasEnd = content.includes("clutch mode is ending") || messageHasKeywordInEmbeds(message, "clutch mode is ending");

    if (hasEnd) return "off";
    if (hasStart) return "on";
    return null;
}

export function isAlertTypeEnabled(alertType: AlertType): boolean {
    let enabled = false;

    if (alertType === "gacha") enabled = settings.store.gachaNotifications;
    else if (alertType === "drop") enabled = settings.store.dropNotifications;
    else if (alertType === "gems") enabled = settings.store.gemsNotifications;
    else if (alertType === "power") enabled = settings.store.powerNotifications;
    else enabled = settings.store.packNotifications;

    return enabled;
}

function getEmbedImageUrls(message: Message): string[] {
    // Collect all embed image URLs, then normalize them for consistent comparisons.
    const rawUrls: string[] = [];

    for (const embed of message.embeds as any[]) {
        if (embed?.image?.url) rawUrls.push(embed.image.url);
        if (embed?.image?.proxyURL) rawUrls.push(embed.image.proxyURL);
        if (embed?.image?.proxy_url) rawUrls.push(embed.image.proxy_url);
        if (embed?.thumbnail?.url) rawUrls.push(embed.thumbnail.url);
        if (embed?.thumbnail?.proxyURL) rawUrls.push(embed.thumbnail.proxyURL);
        if (embed?.thumbnail?.proxy_url) rawUrls.push(embed.thumbnail.proxy_url);
        if (Array.isArray(embed?.images)) {
            for (const image of embed.images) {
                if (image?.url) rawUrls.push(image.url);
                if (image?.proxyURL) rawUrls.push(image.proxyURL);
                if (image?.proxy_url) rawUrls.push(image.proxy_url);
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

export function shouldNotifyDropByImage(message: Message): boolean {
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
    let shouldNotify = enabledAllowlists.length === 0;

    if (!shouldNotify) {
        const embedImageUrls = getEmbedImageUrls(message);
        for (const url of embedImageUrls) {
            for (const allowlist of enabledAllowlists) {
                if (allowlist.has(url)) shouldNotify = true;
            }
        }
    }

    return shouldNotify;
}

export function getDropCategory(message: Message): DropCategory | null {
    // Find the first enabled category whose allowlist contains one of the embed image URLs.
    const embedImageUrls = getEmbedImageUrls(message);
    let category: DropCategory | null = null;

    if (category === null && settings.store.preferredDrops) {
        const preferred = getDropImageLinkAllowlist(settings.store.preferredDecks);
        if (embedImageUrls.some(url => preferred.has(url))) category = "preferred";
    }
    if (category === null && settings.store.rareDrops) {
        const rare = getDropImageLinkAllowlist(settings.store.rareDecks);
        if (embedImageUrls.some(url => rare.has(url))) category = "rare";
    }
    if (category === null && settings.store.specialDrops) {
        const special = getDropImageLinkAllowlist(settings.store.specialDecks);
        if (embedImageUrls.some(url => special.has(url))) category = "special";
    }
    if (category === null && settings.store.eventDrops) {
        const event = getDropImageLinkAllowlist(settings.store.eventDecks);
        if (embedImageUrls.some(url => event.has(url))) category = "event";
    }

    return category;
}

export function getNotificationText(alertType: AlertType, dropCategory: DropCategory | null): string {
    // Non-drop notifications are fixed by alert type.
    let text = "Drop spotted";

    if (alertType === "pack") text = "Pack spotted";
    else if (alertType === "gems") text = "Gems spotted";
    else if (alertType === "gacha") text = "Gacha spotted";
    else if (alertType === "power") text = "Power spotted";
    else if (dropCategory === "preferred") text = "Dropped a preferred card";
    else if (dropCategory === "rare") text = "Dropped a rare card";
    else if (dropCategory === "special") text = "Dropped a special card";
    else if (dropCategory === "event") text = "Dropped an event card";

    return text;
}

export function getMessageLink(message: Message): string {
    const guildId = (message as any).guild_id as string | undefined;
    const channelId = message.channel_id as string | undefined;
    const messageId = message.id as string | undefined;
    let link = "";

    if (guildId && channelId && messageId) {
        link = `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
    }

    return link;
}
