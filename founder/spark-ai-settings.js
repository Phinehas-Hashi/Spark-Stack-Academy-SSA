// ===================================
// SPARK AI SETTINGS
// ===================================
import { db } from "../../js/firebase.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const settingsRef = doc(db, "settings", "sparkAI");
const $ = id => document.getElementById(id);
const fields = ["aiProvider","aiModel","apiKey","apiEndpoint","temperature","maxTokens","systemPrompt","aiPersonality","defaultLanguage","responseStyle","enableStreaming","enableMemory","enableWeb","enableCode","enableImages","rateLimit","conversationLimit"];

function toast(message, type = "success") {
    let box = $("sparkAiToast");
    if (!box) {
        box = document.createElement("div");
        box.id = "sparkAiToast";
        box.className = "spark-ai-toast";
        document.body.appendChild(box);
    }
    box.textContent = message;
    box.dataset.type = type;
    box.classList.add("show");
    clearTimeout(box._timer);
    box._timer = setTimeout(() => box.classList.remove("show"), 3200);
}

function setBusy(button, busy, text) {
    if (!button) return;
    button.disabled = busy;
    if (busy) button.dataset.original = button.textContent;
    button.textContent = busy ? text : (button.dataset.original || button.textContent);
}

async function loadSettings() {
    try {
        const snap = await getDoc(settingsRef);
        if (!snap.exists()) return;
        const data = snap.data();
        fields.forEach(key => {
            const el = $(key);
            if (!el || data[key] === undefined || data[key] === null) return;
            el.type === "checkbox" ? (el.checked = Boolean(data[key])) : (el.value = data[key]);
        });
    } catch (error) {
        console.error("Spark AI settings load failed:", error);
        toast("Could not load Spark AI settings.", "error");
    }
}

function collectSettings() {
    const number = (id, fallback) => {
        const value = Number($(id)?.value);
        return Number.isFinite(value) ? value : fallback;
    };
    const temperatureValue = number("temperature", 0.7);
    const maxTokensValue = number("maxTokens", 1000);
    const rateLimitValue = number("rateLimit", 60);
    const conversationLimitValue = number("conversationLimit", 20);
    if (temperatureValue < 0 || temperatureValue > 2) throw new Error("Temperature must be between 0 and 2.");
    if (maxTokensValue < 1 || rateLimitValue < 1 || conversationLimitValue < 1) throw new Error("Numeric limits must be greater than zero.");
    return {
        aiProvider: $("aiProvider").value,
        aiModel: $("aiModel").value.trim(),
        apiKey: $("apiKey").value.trim(),
        apiEndpoint: $("apiEndpoint").value.trim(),
        temperature: temperatureValue,
        maxTokens: maxTokensValue,
        systemPrompt: $("systemPrompt").value,
        aiPersonality: $("aiPersonality").value,
        defaultLanguage: $("defaultLanguage").value,
        responseStyle: $("responseStyle").value,
        enableStreaming: $("enableStreaming").checked,
        enableMemory: $("enableMemory").checked,
        enableWeb: $("enableWeb").checked,
        enableCode: $("enableCode").checked,
        enableImages: $("enableImages").checked,
        rateLimit: rateLimitValue,
        conversationLimit: conversationLimitValue,
        updatedAt: serverTimestamp()
    };
}

async function saveSettings() {
    const button = $("saveAISettingsBtn");
    try {
        setBusy(button, true, "Saving...");
        await setDoc(settingsRef, collectSettings(), { merge: true });
        toast("Spark AI settings saved.");
    } catch (error) {
        console.error("Spark AI settings save failed:", error);
        toast(error.message || "Failed to save settings.", "error");
    } finally {
        setBusy(button, false);
    }
}

async function testConnection() {
    const button = $("testConnectionBtn");
    const provider = $("aiProvider").value;
    const key = $("apiKey").value.trim();
    const endpoint = $("apiEndpoint").value.trim() || "https://api.groq.com/openai/v1";
    const model = $("aiModel").value.trim() || "llama-3.3-70b-versatile";
    if (!key) return toast("Enter an API key first.", "error");
    if (provider !== "groq") return toast("Connection testing currently supports Groq only.", "error");
    try {
        setBusy(button, true, "Testing...");
        const response = await fetch(`${endpoint.replace(/\/$/, "")}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body: JSON.stringify({ model, messages: [{ role: "user", content: "Reply with OK." }], max_tokens: 10, temperature: 0 })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error?.message || `API request failed (${response.status}).`);
        toast("Groq API connection is working.");
    } catch (error) {
        console.error("Spark AI connection test failed:", error);
        toast(error.message || "Network error while testing the API.", "error");
    } finally {
        setBusy(button, false);
    }
}

window.addEventListener("DOMContentLoaded", () => {
    loadSettings();
    $("saveAISettingsBtn")?.addEventListener("click", saveSettings);
    $("testConnectionBtn")?.addEventListener("click", testConnection);
});
