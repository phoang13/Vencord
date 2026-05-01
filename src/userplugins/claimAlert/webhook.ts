/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { Message } from "@vencord/discord-types";
import { PluginNative } from "@utils/types";

import settings from "./settings";
import { AlertType, DropCategory, getMessageLink } from "./matching";
import { showStatusToast } from "./toasts";

const Native = ((VencordNative.pluginHelpers as any).ClaimAlert
    ?? (VencordNative.pluginHelpers as any).claimAlert) as PluginNative<typeof import("./native")> | undefined;

type WebhookResult = {
    ok: boolean;
    status: number;
    statusText: string;
    body: string;
};

function getAlertTypeLabel(alertType: AlertType): string {
    let label = "Drop";

    if (alertType === "pack") label = "Pack";
    else if (alertType === "gems") label = "Gems";
    else if (alertType === "gacha") label = "Gacha";
    else if (alertType === "power") label = "Power";

    return label;
}

function getDropCategoryLabel(dropCategory: DropCategory | null): string {
    let label = "";

    if (dropCategory === "preferred") label = "Preferred";
    else if (dropCategory === "rare") label = "Rare";
    else if (dropCategory === "special") label = "Special";
    else if (dropCategory === "event") label = "Event";

    return label;
}

function formatWebhookContent(alertType: AlertType, dropCategory: DropCategory | null, message: Message): string {
    const title = "Claim Alert";
    const typeLabel = getAlertTypeLabel(alertType);
    const categoryLabel = getDropCategoryLabel(dropCategory);
    const categorySuffix = categoryLabel ? ` (${categoryLabel})` : "";
    const link = getMessageLink(message);
    let content = `**${title}**\nType: ${typeLabel}${categorySuffix}`;

    if (link) {
        content = `${content}\n# ${link}`;
    }

    return content;
}

async function postWebhookNative(webhookUrl: string, content: string): Promise<WebhookResult> {
    let result: WebhookResult = {
        ok: false,
        status: 0,
        statusText: "Native helper unavailable",
        body: "Native helper not registered"
    };

    if (Native?.sendWebhook) {
        try {
            result = await Native.sendWebhook(webhookUrl, content) as WebhookResult;
        } catch (error) {
            result = {
                ok: false,
                status: 0,
                statusText: "Native error",
                body: String(error ?? "")
            };
        }
    }

    return result;
}

export async function sendWebhookNotification(
    alertType: AlertType,
    dropCategory: DropCategory | null,
    message: Message
): Promise<void> {
    let shouldSend = settings.store.webhookNotifications;
    const webhookUrl = String(settings.store.webhookUrl ?? "").trim();

    if (!webhookUrl) {
        shouldSend = false;
    }

    if (shouldSend) {
        const content = formatWebhookContent(alertType, dropCategory, message);
        await postWebhookNative(webhookUrl, content);
    }
}

export async function sendWebhookTest(): Promise<void> {
    const webhookUrl = String(settings.store.webhookUrl ?? "").trim();
    let canSend = settings.store.webhookNotifications;

    if (!webhookUrl) {
        canSend = false;
    }

    if (!canSend) {
        const message = settings.store.webhookNotifications
            ? "Webhook URL is missing"
            : "Webhook notifications are disabled";
        showStatusToast(message);
    } else {
        const result = await postWebhookNative(webhookUrl, "Claim Alert - Webhook Test");

        if (result.ok) {
            showStatusToast("Webhook test sent");
        } else {
            const statusLine = result.status ? `${result.status} ${result.statusText}` : result.statusText;
            showStatusToast(`Webhook test failed (${statusLine})`);
        }
    }
}
