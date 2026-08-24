// ============================================================
// SSA MEDIA SERVICE
// Provider-neutral media layer.
// Firebase Storage is intentionally NOT required.
// ImageKit can be enabled later through a secure auth endpoint.
// ============================================================

const DEFAULTS = {
    provider: "imagekit",
    authEndpoint: "/api/imagekit-auth",
    maxImageBytes: 5 * 1024 * 1024,
    allowedTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"]
};

const config = {
    ...DEFAULTS,
    ...(window.SSA_MEDIA_CONFIG || {})
};

function validateImage(file) {
    if (!(file instanceof File)) throw new Error("Please choose an image file.");
    if (!config.allowedTypes.includes(file.type)) throw new Error("Please use JPG, PNG, WEBP or GIF.");
    if (file.size > config.maxImageBytes) throw new Error("Image must be 5MB or smaller.");
    return file;
}

async function getImageKitAuth() {
    if (!config.authEndpoint) throw new Error("Image upload service is not configured yet.");
    const response = await fetch(config.authEndpoint, { credentials: "include" });
    if (!response.ok) throw new Error("Image upload service is temporarily unavailable.");
    const auth = await response.json();
    if (!auth.token || !auth.signature || !auth.expire || !auth.publicKey) {
        throw new Error("Image upload authentication is incomplete.");
    }
    return auth;
}

async function uploadImage(file, { fileName, folder = "ssa" } = {}) {
    validateImage(file);

    if (config.provider !== "imagekit") {
        throw new Error(`Unsupported media provider: ${config.provider}`);
    }

    const auth = await getImageKitAuth();
    const body = new FormData();
    body.append("file", file);
    body.append("fileName", fileName || file.name);
    body.append("folder", folder);
    body.append("publicKey", auth.publicKey);
    body.append("signature", auth.signature);
    body.append("expire", String(auth.expire));
    body.append("token", auth.token);

    const response = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
        method: "POST",
        body
    });

    if (!response.ok) throw new Error("Image upload failed. Please try again.");
    const result = await response.json();

    return {
        provider: "imagekit",
        url: result.url,
        fileId: result.fileId || null,
        filePath: result.filePath || null,
        name: result.name || file.name,
        size: result.size || file.size,
        mimeType: file.type
    };
}

function getInitials(name = "SSA") {
    return String(name).trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0).toUpperCase()).join("") || "SSA";
}

function avatarFallback(name = "SSA") {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(getInitials(name))}&background=081c3a&color=ffffff&bold=true`;
}

window.SSAMedia = Object.freeze({
    config,
    validateImage,
    uploadImage,
    getInitials,
    avatarFallback
});
