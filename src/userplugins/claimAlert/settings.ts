/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { OptionType } from "@utils/types";
import { React } from "@webpack/common";

let webhookTestHandler: (() => void) | null = null;

export function setWebhookTestHandler(handler: () => void): void {
    webhookTestHandler = handler;
}

const settings = definePluginSettings({
    enableClickTrigger: {
        type: OptionType.BOOLEAN,
        description: "Trigger the local click hook automatically",
        default: true
    },
    enableDesktopNotifications: {
        type: OptionType.BOOLEAN,
        description: "Enable desktop notifications",
        default: true
    },
    enableToasts: {
        type: OptionType.BOOLEAN,
        description: "Show in-app toasts",
        default: true
    },
    autoJumpToDropMessage: {
        type: OptionType.BOOLEAN,
        description: "Automatically jump to the drop message instead of showing alerts",
        default: false
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
    webhookNotifications: {
        type: OptionType.BOOLEAN,
        description: "Send alerts to a Discord webhook",
        default: false
    },
    webhookUrl: {
        type: OptionType.STRING,
        description: "Webhook URL for mobile push alerts",
        default: "",
        placeholder: "https://discord.com/api/webhooks/..."
    },
    webhookTest: {
        type: OptionType.COMPONENT,
        component: () => React.createElement(
            Button,
            { onClick: () => webhookTestHandler?.() },
            "Send webhook test"
        )
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

export default settings;
