/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { Message } from "@vencord/discord-types";
import { ChannelRouter, MessageActions } from "@webpack/common";

type ActiveStackedToast = {
    id: number;
    element: HTMLButtonElement;
    timeout: ReturnType<typeof setTimeout>;
};

const TOAST_DURATION_MS = 10000;
const MAX_STACKED_TOASTS = 7;
const ACTIVE_STACKED_TOASTS: ActiveStackedToast[] = [];

let stackedToastContainer: HTMLDivElement | null = null;
let stackedToastId = 0;

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

export function jumpToEmbedMessage(message: Message): void {
    const hasIds = Boolean(message.channel_id && message.id);

    if (hasIds) {
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
}

function ensureStackedToastContainer(): HTMLDivElement {
    let container = stackedToastContainer;

    if (!(container && container.isConnected)) {
        container = document.createElement("div");
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
    }

    return container as HTMLDivElement;
}

function removeStackedToast(toastId: number): void {
    const index = ACTIVE_STACKED_TOASTS.findIndex(toast => toast.id === toastId);

    if (index !== -1) {
        const [toast] = ACTIVE_STACKED_TOASTS.splice(index, 1);
        clearTimeout(toast.timeout);
        toast.element.remove();
    }

    if (ACTIVE_STACKED_TOASTS.length === 0) {
        stackedToastContainer?.remove();
        stackedToastContainer = null;
    }
}

export function clearStackedToasts(): void {
    for (const toast of ACTIVE_STACKED_TOASTS) {
        clearTimeout(toast.timeout);
        toast.element.remove();
    }

    ACTIVE_STACKED_TOASTS.length = 0;
    stackedToastContainer?.remove();
    stackedToastContainer = null;
}

export function showJumpToast(notificationText: string, message: Message): void {
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

export function showStatusToast(text: string): void {
    showJumpToast(text, { channel_id: "", id: "" } as Message);
}
