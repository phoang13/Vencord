/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IpcMainInvokeEvent } from "electron";

export async function sendWebhook(_: IpcMainInvokeEvent, webhookUrl: string, content: string) {
    try {
        const res = await fetch(webhookUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ content })
        });

        const body = await res.text();
        return {
            ok: res.ok,
            status: res.status,
            statusText: res.statusText,
            body
        };
    } catch (error) {
        return {
            ok: false,
            status: 0,
            statusText: "Native error",
            body: String(error ?? "")
        };
    }
}
