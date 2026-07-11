// Single source of truth for the chat file/video upload size limit.
// Change this one value to change the limit everywhere — client-side
// validation, server-side enforcement, and the UI copy that mentions it.
export const CHAT_MAX_FILE_SIZE_MB = 50
export const CHAT_MAX_FILE_SIZE_BYTES = CHAT_MAX_FILE_SIZE_MB * 1024 * 1024

// How long a device's "skip admin password" choice is remembered before the
// prompt is shown again for the next oversized upload.
export const CHAT_OVERSIZE_DISMISS_DAYS = 10
