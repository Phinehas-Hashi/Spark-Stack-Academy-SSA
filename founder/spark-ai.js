// ============================================================
// SPARK AI
// Founder AI Operating Companion
// ============================================================

import { auth, db } from "../js/firebase.js";

import {
    collection,
    addDoc,
    getDocs,
    query,
    where,
    orderBy,
    limit,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


// ============================================================
// CONFIGURATION
// ============================================================

const SPARK_AI_CONFIG = {
    assistantName: "Spark AI",

    role: "founder",

    defaultMode: "assistant",

    maxMessageLength: 12000,

    maxConversationMessages: 50,

    // IMPORTANT:
    // This must point to a secure backend endpoint.
    // Never place an AI provider secret in this file.
    apiEndpoint: "/api/spark-ai",

    modes: {
        assistant: {
            name: "Assistant",
            description: "General thinking and problem solving"
        },

        strategy: {
            name: "Strategy",
            description: "Business, growth and decisions"
        },

        technical: {
            name: "Technical",
            description: "Code, systems and debugging"
        },

        planning: {
            name: "Planning",
            description: "Goals, projects and execution"
        }
    }
};


// ============================================================
// APPLICATION STATE
// ============================================================

const state = {

    user: null,

    founder: null,

    conversationId: null,

    conversationTitle: "New conversation",

    messages: [],

    activeMode: SPARK_AI_CONFIG.defaultMode,

    activeTool: null,

    isThinking: false,

    memoryEnabled: true,

    context: {
        workspace: "Spark Stack Academy",
        role: "Founder"
    },

    academy: {
        students: 0,
        courses: 0,
        instructors: 0,
        enrollments: 0
    }
};


// ============================================================
// DOM
// ============================================================

const dom = {};


// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener("DOMContentLoaded", () => {

    cacheDOM();

    bindEvents();

    initializeFounderShell();

    initializeSparkAI();

});


// ============================================================
// DOM CACHE
// ============================================================

function cacheDOM() {

    dom.app = document.getElementById("sparkAIApp");

    dom.messages = document.getElementById("chatMessages");

    dom.welcome = document.getElementById("sparkAIWelcome");

    dom.thinking = document.getElementById("aiThinking");

    dom.form = document.getElementById("chatForm");

    dom.input = document.getElementById("chatInput");

    dom.sendBtn = document.getElementById("sendBtn");

    dom.status = document.getElementById("sparkAIStatus");

    dom.conversationTitle =
        document.getElementById("conversationTitle");

    dom.conversationContext =
        document.getElementById("conversationContext");

    dom.activeMode =
        document.getElementById("activeMode");

    dom.contextStatus =
        document.getElementById("contextStatus");

    dom.memoryStatus =
        document.getElementById("memoryStatus");

    dom.toolDrawer =
        document.getElementById("aiToolDrawer");

    dom.toolDrawerTitle =
        document.getElementById("toolDrawerTitle");

    dom.toolDrawerEyebrow =
        document.getElementById("toolDrawerEyebrow");

    dom.toolDrawerContent =
        document.getElementById("toolDrawerContent");

    dom.actionModal =
        document.getElementById("aiActionModal");

    dom.actionModalContent =
        document.getElementById("actionModalContent");

}


// ============================================================
// FOUNDER SHELL
// ============================================================

function initializeFounderShell() {

    if (window.lucide) {
        window.lucide.createIcons();
    }

}


// ============================================================
// SPARK AI INITIALIZATION
// ============================================================

function initializeSparkAI() {

    setAIStatus("Initializing", "loading");

    onAuthStateChanged(auth, async (user) => {

        if (!user) {

            state.user = null;

            setAIStatus("Authentication required", "error");

            return;

        }

        state.user = user;

        state.context.userId = user.uid;

        state.context.email = user.email || "";

        await initializeFounderContext();

    });

}


// ============================================================
// FOUNDER CONTEXT
// ============================================================

async function initializeFounderContext() {

    try {

        setAIStatus("Checking access", "loading");

        const founderSnapshot = await getDocs(
            query(
                collection(db, "founder"),
                where("uid", "==", state.user.uid),
                limit(1)
            )
        );

        if (founderSnapshot.empty) {

            setAIStatus("Founder access required", "error");

            disableAssistant();

            return;

        }

        const founderDoc =
            founderSnapshot.docs[0].data();

        state.founder = founderDoc;

        const role =
            String(founderDoc.role || "").toLowerCase();

        const status =
            String(founderDoc.status || "").toLowerCase();

        if (
            role !== "founder" ||
            status !== "active"
        ) {

            setAIStatus("Founder access unavailable", "error");

            disableAssistant();

            return;

        }

        state.context.role = "Founder";

        setAIStatus("Ready", "ready");

        updateContextUI();

        await loadConversation();

    } catch (error) {

        console.error(
            "Spark AI founder initialization failed:",
            error
        );

        setAIStatus("Connection error", "error");

    }

}


// ============================================================
// EVENT BINDINGS
// ============================================================

function bindEvents() {

    dom.form?.addEventListener(
        "submit",
        handleSubmit
    );


    dom.input?.addEventListener(
        "keydown",
        handleInputKeydown
    );


    document
        .getElementById("clearConversationBtn")
        ?.addEventListener(
            "click",
            clearConversation
        );


    document
        .getElementById("newConversationBtn")
        ?.addEventListener(
            "click",
            startNewConversation
        );


    document
        .getElementById("aiSettingsBtn")
        ?.addEventListener(
            "click",
            openSettings
        );


    document
        .getElementById("memorySettingsBtn")
        ?.addEventListener(
            "click",
            openMemorySettings
        );


    document
        .getElementById("attachBtn")
        ?.addEventListener(
            "click",
            openAttachmentTool
        );


    document
        .getElementById("voiceBtn")
        ?.addEventListener(
            "click",
            handleVoiceInput
        );


    document
        .getElementById("closeToolDrawerBtn")
        ?.addEventListener(
            "click",
            closeToolDrawer
        );


    document
        .getElementById("closeActionModalBtn")
        ?.addEventListener(
            "click",
            closeActionModal
        );


    document
        .querySelectorAll(".ai-mode")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const mode =
                        button.dataset.mode;

                    setMode(mode);

                }
            );

        });


    document
        .querySelectorAll(".ai-tool")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const tool =
                        button.dataset.tool;

                    openTool(tool);

                }
            );

        });


    document
        .querySelectorAll(".ai-action")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const action =
                        button.dataset.action;

                    runAction(action);

                }
            );

        });


    document
        .querySelectorAll(".suggestion-btn")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const prompt =
                        button.dataset.prompt;

                    if (!prompt) {
                        return;
                    }

                    dom.input.value = prompt;

                    resizeInput();

                    dom.input.focus();

                }
            );

        });


    window.addEventListener(
        "beforeunload",
        saveCurrentState
    );

}


// ============================================================
// INPUT HANDLING
// ============================================================

function handleInputKeydown(event) {

    if (
        event.key === "Enter" &&
        !event.shiftKey
    ) {

        event.preventDefault();

        dom.form?.requestSubmit();

    }

}


function resizeInput() {

    if (!dom.input) {
        return;
    }

    dom.input.style.height = "auto";

    dom.input.style.height =
        `${Math.min(dom.input.scrollHeight, 220)}px`;

}


// ============================================================
// MESSAGE SUBMISSION
// ============================================================

async function handleSubmit(event) {

    event.preventDefault();

    if (
        state.isThinking ||
        !state.user ||
        !dom.input
    ) {
        return;
    }

    const message =
        dom.input.value.trim();

    if (!message) {
        return;
    }

    if (
        message.length >
        SPARK_AI_CONFIG.maxMessageLength
    ) {

        showSystemMessage(
            "That message is too long. Please shorten it and try again."
        );

        return;

    }

    dom.input.value = "";

    resizeInput();

    hideWelcome();

    addMessage(
        "user",
        message
    );

    await generateResponse(message);

}


// ============================================================
// AI RESPONSE ENGINE
// ============================================================

async function generateResponse(message) {

    setThinking(true);

    try {

        const payload =
            await buildAIRequest(message);

        const response =
            await callSparkAI(payload);

        if (
            !response ||
            !response.message
        ) {

            throw new Error(
                "Spark AI returned an empty response."
            );

        }

        addMessage(
            "assistant",
            response.message
        );

        if (response.title) {

            state.conversationTitle =
                response.title;

            updateConversationUI();

        }

        await persistConversation();

    } catch (error) {

        console.error(
            "Spark AI request failed:",
            error
        );

        addMessage(
            "assistant",
            getFriendlyAIError(error)
        );

    } finally {

        setThinking(false);

    }

}


// ============================================================
// REQUEST CONSTRUCTION
// ============================================================

async function buildAIRequest(message) {

    const context =
        await buildAssistantContext();

    return {

        message,

        mode: state.activeMode,

        conversationId:
            state.conversationId,

        history:
            state.messages
                .slice(
                    -SPARK_AI_CONFIG.maxConversationMessages
                )
                .map(item => ({
                    role: item.role,
                    content: item.content
                })),

        context,

        capabilities: {

            academyData: true,

            calculations: true,

            planning: true,

            codeAnalysis: true,

            memory:
                state.memoryEnabled

        }

    };

}


// ============================================================
// ASSISTANT CONTEXT
// ============================================================

async function buildAssistantContext() {

    return {

        workspace:
            state.context.workspace,

        role:
            state.context.role,

        userId:
            state.user?.uid || null,

        email:
            state.user?.email || null,

        founder:

            state.founder
                ? {
                    role:
                        state.founder.role || "founder",

                    status:
                        state.founder.status || "active"
                }
                : null,

        academy:
            state.academy,

        mode:
            state.activeMode

    };

}


// ============================================================
// BACKEND REQUEST
// ============================================================

async function callSparkAI(payload) {

    const response =
        await fetch(
            SPARK_AI_CONFIG.apiEndpoint,
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                credentials: "include",

                body:
                    JSON.stringify(payload)
            }
        );

    if (!response.ok) {

        let details = "";

        try {

            const data =
                await response.json();

            details =
                data?.error || "";

        } catch {
            // Ignore invalid error response.
        }

        throw new Error(
            details ||
            `Spark AI request failed (${response.status}).`
        );

    }

    return response.json();

}


// ============================================================
// MESSAGE RENDERING
// ============================================================

function addMessage(role, content) {

    const message = {

        id:
            crypto.randomUUID(),

        role,

        content,

        createdAt:
            new Date().toISOString()

    };

    state.messages.push(message);

    renderMessage(message);

    trimConversation();

}


function renderMessage(message) {

    if (!dom.messages) {
        return;
    }

    const wrapper =
        document.createElement("div");

    wrapper.className =
        `spark-message ${message.role}`;

    wrapper.dataset.messageId =
        message.id;


    const avatar =
        document.createElement("div");

    avatar.className =
        "ai-message-avatar";

    avatar.textContent =
        message.role === "assistant"
            ? "✦"
            : "You";


    const content =
        document.createElement("div");

    content.className =
        "spark-message-content";


    const body =
        document.createElement("div");

    body.className =
        "spark-message-body";

    body.textContent =
        message.content;


    const footer =
        document.createElement("div");

    footer.className =
        "spark-message-footer";


    const time =
        document.createElement("time");

    time.textContent =
        formatTime(message.createdAt);


    const copy =
        document.createElement("button");

    copy.type =
        "button";

    copy.className =
        "message-copy-btn";

    copy.textContent =
        "Copy";

    copy.addEventListener(
        "click",
        () => copyMessage(message.content)
    );


    footer.appendChild(time);

    footer.appendChild(copy);

    content.appendChild(body);

    content.appendChild(footer);

    wrapper.appendChild(avatar);

    wrapper.appendChild(content);

    dom.messages.appendChild(wrapper);

    scrollMessagesToBottom();

}


// ============================================================
// SYSTEM MESSAGE
// ============================================================

function showSystemMessage(message) {

    const systemMessage = {

        id:
            crypto.randomUUID(),

        role:
            "system",

        content:
            message,

        createdAt:
            new Date().toISOString()

    };

    state.messages.push(
        systemMessage
    );

    renderMessage(
        systemMessage
    );

}


// ============================================================
// THINKING STATE
// ============================================================

function setThinking(value) {

    state.isThinking =
        value;

    if (dom.thinking) {

        dom.thinking.hidden =
            !value;

    }

    if (dom.sendBtn) {

        dom.sendBtn.disabled =
            value;

    }

    if (dom.input) {

        dom.input.disabled =
            value;

    }

    if (value) {

        setAIStatus(
            "Thinking",
            "thinking"
        );

    } else {

        setAIStatus(
            "Ready",
            "ready"
        );

    }

    scrollMessagesToBottom();

}


// ============================================================
// AI STATUS
// ============================================================

function setAIStatus(
    text,
    type = "ready"
) {

    if (!dom.status) {
        return;
    }

    dom.status.className =
        `spark-ai-status ${type}`;

    dom.status.innerHTML = `
        <span class="status-dot"></span>
        ${escapeHTML(text)}
    `;

}


// ============================================================
// MODES
// ============================================================

function setMode(mode) {

    if (
        !SPARK_AI_CONFIG.modes[mode]
    ) {
        return;
    }

    state.activeMode =
        mode;


    document
        .querySelectorAll(".ai-mode")
        .forEach(button => {

            button.classList.toggle(
                "active",
                button.dataset.mode === mode
            );

        });


    const modeInfo =
        SPARK_AI_CONFIG.modes[mode];


    if (dom.activeMode) {

        dom.activeMode.textContent =
            modeInfo.name;

    }


    if (dom.conversationContext) {

        dom.conversationContext.textContent =
            modeInfo.name;

    }


    showSystemMessage(
        `Spark AI is now using ${modeInfo.name} mode.`
    );

}


// ============================================================
// TOOLS
// ============================================================

function openTool(tool) {

    state.activeTool =
        tool;

    const tools = {

        academy: {
            title:
                "Academy Intelligence",

            description:
                "Use verified Spark Stack Academy data to understand the platform."
        },

        calculator: {
            title:
                "Calculations",

            description:
                "Work through calculations and numerical problems."
        },

        code: {
            title:
                "Code Analysis",

            description:
                "Analyze code, errors, architecture and technical problems."
        },

        planning: {
            title:
                "Planning",

            description:
                "Turn goals and ideas into practical execution plans."
        }

    };


    const selected =
        tools[tool];

    if (!selected) {
        return;
    }


    if (dom.toolDrawerTitle) {

        dom.toolDrawerTitle.textContent =
            selected.title;

    }


    if (dom.toolDrawerContent) {

        dom.toolDrawerContent.innerHTML = `
            <div class="tool-placeholder">
                <h3>${escapeHTML(selected.title)}</h3>
                <p>${escapeHTML(selected.description)}</p>

                <button
                    type="button"
                    class="tool-use-btn"
                    data-tool-use="${escapeHTML(tool)}"
                >
                    Use with Spark AI
                </button>
            </div>
        `;

        dom.toolDrawerContent
            .querySelector("[data-tool-use]")
            ?.addEventListener(
                "click",
                () => {

                    closeToolDrawer();

                    useToolPrompt(tool);

                }
            );

    }


    if (dom.toolDrawer) {

        dom.toolDrawer.hidden =
            false;

    }

}


function closeToolDrawer() {

    if (dom.toolDrawer) {

        dom.toolDrawer.hidden =
            true;

    }

    state.activeTool =
        null;

}


function useToolPrompt(tool) {

    const prompts = {

        academy:
            "Analyze the current Spark Stack Academy and identify the most important opportunities or risks.",

        calculator:
            "Help me calculate and reason through the numbers for this problem:",

        code:
            "Help me analyze and solve this technical problem:",

        planning:
            "Help me turn this goal into a practical execution plan:"

    };


    const prompt =
        prompts[tool];

    if (!prompt) {
        return;
    }

    dom.input.value =
        prompt;

    resizeInput();

    dom.input.focus();

}


// ============================================================
// ACTIONS
// ============================================================

function runAction(action) {

    const prompts = {

        analyze:
            "Analyze this for me and explain the most important findings:",

        plan:
            "Help me create a practical step-by-step plan for:",

        compare:
            "Help me compare these options and recommend the strongest choice:",

        explain:
            "Explain this clearly and practically:"

    };


    const prompt =
        prompts[action];

    if (!prompt) {
        return;
    }

    dom.input.value =
        prompt;

    resizeInput();

    dom.input.focus();

    closeActionModal();

}


// ============================================================
// SETTINGS
// ============================================================

function openSettings() {

    window.location.href =
        "spark-ai-settings.html";

}


function openMemorySettings() {

    state.memoryEnabled =
        !state.memoryEnabled;

    if (dom.memoryStatus) {

        dom.memoryStatus.textContent =
            state.memoryEnabled
                ? "Memory ready"
                : "Memory disabled";

    }

    showSystemMessage(
        state.memoryEnabled
            ? "Spark AI memory is enabled."
            : "Spark AI memory is disabled."
    );

}


// ============================================================
// VOICE
// ============================================================

function handleVoiceInput() {

    const SpeechRecognition =
        window.SpeechRecognition ||
        window.webkitSpeechRecognition;

    if (!SpeechRecognition) {

        showSystemMessage(
            "Voice input is not supported by this browser."
        );

        return;

    }


    const recognition =
        new SpeechRecognition();

    recognition.lang =
        "en-US";

    recognition.interimResults =
        false;

    recognition.maxAlternatives =
        1;


    setAIStatus(
        "Listening",
        "thinking"
    );


    recognition.onresult =
        event => {

            const transcript =
                event.results[0][0].transcript;

            dom.input.value =
                transcript;

            resizeInput();

            dom.input.focus();

        };


    recognition.onerror =
        error => {

            console.error(
                "Voice input error:",
                error
            );

        };


    recognition.onend =
        () => {

            setAIStatus(
                "Ready",
                "ready"
            );

        };


    recognition.start();

}


// ============================================================
// ATTACHMENTS
// ============================================================

function openAttachmentTool() {

    showSystemMessage(
        "File and document intelligence will be connected through the Spark AI tool layer."
    );

}


// ============================================================
// CONVERSATIONS
// ============================================================

async function startNewConversation() {

    state.conversationId =
        null;

    state.conversationTitle =
        "New conversation";

    state.messages =
        [];

    clearRenderedMessages();

    showWelcome();

    updateConversationUI();

}


async function clearConversation() {

    state.messages =
        [];

    clearRenderedMessages();

    showWelcome();

}


function clearRenderedMessages() {

    if (!dom.messages) {
        return;
    }

    dom.messages.innerHTML = "";

    if (dom.welcome) {

        dom.messages.appendChild(
            dom.welcome
        );

    }

}


function showWelcome() {

    if (dom.welcome) {

        dom.welcome.hidden =
            false;

    }

}


function hideWelcome() {

    if (dom.welcome) {

        dom.welcome.hidden =
            true;

    }

}


// ============================================================
// FIRESTORE CONVERSATION PERSISTENCE
// ============================================================

async function loadConversation() {

    if (!state.user) {
        return;
    }

    /*
     * We intentionally do not create a conversation document
     * simply because the page was opened.
     *
     * A real conversation is created only after the user
     * sends a message.
     */

    state.conversationId =
        null;

    state.messages =
        [];

    updateConversationUI();

}


async function persistConversation() {

    if (
        !state.user ||
        !state.messages.length
    ) {
        return;
    }

    /*
     * The final Firestore conversation schema will be established
     * after the backend/memory architecture is finalized.
     *
     * We avoid silently creating a new collection here.
     */

}


// ============================================================
// STATE SAVE
// ============================================================

function saveCurrentState() {

    try {

        sessionStorage.setItem(
            "spark_ai_mode",
            state.activeMode
        );

        sessionStorage.setItem(
            "spark_ai_memory",
            String(state.memoryEnabled)
        );

    } catch (error) {

        console.warn(
            "Could not save Spark AI session state:",
            error
        );

    }

}


// ============================================================
// CONTEXT UI
// ============================================================

function updateContextUI() {

    if (dom.contextStatus) {

        dom.contextStatus.textContent =
            "Ready";

    }

    if (dom.memoryStatus) {

        dom.memoryStatus.textContent =
            state.memoryEnabled
                ? "Memory ready"
                : "Memory disabled";

    }

    updateConversationUI();

}


function updateConversationUI() {

    if (dom.conversationTitle) {

        dom.conversationTitle.textContent =
            state.conversationTitle;

    }

}


// ============================================================
// CONVERSATION MANAGEMENT
// ============================================================

function trimConversation() {

    if (
        state.messages.length >
        SPARK_AI_CONFIG.maxConversationMessages
    ) {

        state.messages =
            state.messages.slice(
                -SPARK_AI_CONFIG.maxConversationMessages
            );

    }

}


// ============================================================
// UI HELPERS
// ============================================================

function scrollMessagesToBottom() {

    if (!dom.messages) {
        return;
    }

    requestAnimationFrame(() => {

        dom.messages.scrollTop =
            dom.messages.scrollHeight;

    });

}


function formatTime(timestamp) {

    const date =
        new Date(timestamp);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return "";
    }

    return date.toLocaleTimeString(
        [],
        {
            hour: "numeric",
            minute: "2-digit"
        }
    );

}


async function copyMessage(text) {

    try {

        await navigator.clipboard.writeText(
            text
        );

        showSystemMessage(
            "Message copied."
        );

    } catch (error) {

        console.error(
            "Copy failed:",
            error
        );

    }

}


function escapeHTML(value) {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


// ============================================================
// ERROR HANDLING
// ============================================================

function getFriendlyAIError(error) {

    const message =
        String(error?.message || "");

    if (
        message.includes("401") ||
        message.includes("403")
    ) {

        return (
            "Spark AI could not verify access to the AI service. "
            + "Your Founder session is still active, but the AI service "
            + "needs to be checked."
        );

    }


    if (
        message.includes("404")
    ) {

        return (
            "Spark AI is connected to the workspace, but its secure "
            + "AI service endpoint has not been connected yet."
        );

    }


    if (
        message.includes("Failed to fetch")
    ) {

        return (
            "I couldn't reach the Spark AI service. "
            + "Check the connection and try again."
        );

    }


    return (
        "I couldn't complete that request right now. "
        + "Please try again."
    );

}


// ============================================================
// ACCESS CONTROL
// ============================================================

function disableAssistant() {

    if (dom.input) {

        dom.input.disabled =
            true;

        dom.input.placeholder =
            "Founder access required";

    }

    if (dom.sendBtn) {

        dom.sendBtn.disabled =
            true;

    }

}


// ============================================================
// ACTION MODAL
// ============================================================

function closeActionModal() {

    if (dom.actionModal) {

        dom.actionModal.hidden =
            true;

    }

}


// ============================================================
// PUBLIC DEBUG API
// ============================================================

window.SparkAI = {

    getState() {

        return {
            ...state,
            messages: [
                ...state.messages
            ]
        };

    },

    getMode() {

        return state.activeMode;

    },

    setMode(mode) {

        setMode(mode);

    },

    clearConversation() {

        clearConversation();

    }

};


// ============================================================
// END SPARK AI
// ============================================================