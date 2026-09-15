// Presentation and browser persistence. The entry point supplies the game factory.
export function mountBrowser(createGame, { worldUrl = './data/game.json', serviceWorkerUrl = './service-worker.js', autoStart = true, clockLabel = 'Elapsed time' } = {}) {
let game;
let started = false;
let ready;
let gameModel = null;
let initialGameModel = null;
let achievementPopupTimer = null;
const achievementPopupQueue = [];
let activeAchievementPopup = null;
let achievementPopupClosing = false;


let lastRenderedRoomKey = null;
let viewImageLoadSequence = 0;
let imagePreloadComplete = true;
const modalFocusOrigins = new Map();
let imagePreloadState = { loaded: 0, total: 0 };
const ACHIEVEMENT_POPUP_DURATION_MS = 7000;
const PLAYER_COLLECTIONS = ['carried', 'worn'];


const cloneModel = (...args) => game.cloneModel(...args);
const validateWorld = (...args) => game.validateWorld(...args);
const shouldUseSavedModel = (...args) => game.shouldUseSavedModel(...args);
const waitTurn = () => game.dispatch({ type: 'wait' });
const formatElapsedTime = (...args) => game.formatElapsedTime(...args);
const normalizePlayerState = (...args) => game.normalizePlayerState(...args);
const normalizePlayerCollections = (...args) => game.normalizePlayerCollections(...args);
const movePlayer = (target) => game.dispatch({ type: 'go', target });
const getRoomDescriptionParts = (...args) => game.getRoomDescriptionParts(...args);
const getNpcCueTexts = (...args) => game.getNpcCueTexts(...args);
const buildConditionalText = (...args) => game.buildConditionalText(...args);
const parseExamineLinks = (...args) => game.parseExamineLinks(...args);
const getExamineLinkTarget = (...args) => game.getExamineLinkTarget(...args);
const startGame = () => { if (imagePreloadComplete) game.dispatch({ type: 'start' }); };
const acknowledgeEndingEncounter = () => game.dispatch({ type: 'acknowledgeEnding' });
const getCurrentEnding = (...args) => game.getCurrentEnding(...args);
const getEarnedAchievements = (...args) => game.getEarnedAchievements(...args);
const getTotalAchievementCount = (...args) => game.getTotalAchievementCount(...args);
const getRoomImage = (...args) => game.getRoomImage(...args);
const getPlayerDisplayName = (...args) => game.getPlayerDisplayName(...args);
const isItemConnectedToVisibleTarget = (...args) => game.isItemConnectedToVisibleTarget(...args);
const normalizeExitDefinition = (...args) => game.normalizeExitDefinition(...args);
const getExitDisplayDefinition = (...args) => game.getExitDisplayDefinition(...args);
const isExitVisible = (...args) => game.isExitVisible(...args);
const capitalizeFirstLetter = (...args) => game.capitalizeFirstLetter(...args);
const shouldListItemInRoom = (...args) => game.shouldListItemInRoom(...args);
const isHiddenItem = (...args) => game.isHiddenItem(...args);
const getConnectedItemsForTarget = (...args) => game.getConnectedItemsForTarget(...args);
const findItemInGameModel = (...args) => game.findItemInGameModel(...args);
const getItemDisplayName = (...args) => game.getItemDisplayName(...args);
const formatItemBaseName = (...args) => game.formatItemBaseName(...args);
const getAvailableActions = (...args) => game.getAvailableActions(...args);
const getRecordedTextActions = (...args) => game.getRecordedTextActions(...args);
const getMessageNoteActions = (...args) => game.getMessageNoteActions(...args);
const getItemChoiceOptions = (...args) => game.getItemChoiceOptions(...args);
function initGame() {
    if (started) return ready;
    started = true;
    registerServiceWorker();
    setupPlayerGearDrawer();
    setupModalControls();
    setupGameMenu();
    setupStoryScreens();
    setupAchievementPopup();
    setupSaveSlots();
    ready = loadGameModel();
    return ready;
}

// Function to load game model

async function loadGameModel() {
    try {
        const response = await fetch(worldUrl);
        if (response.ok === false) throw new Error(`Game request failed (${response.status})`);
        const freshModel = await response.json();
        game = createGame(freshModel);
        const configuredModel = game.save();
        attachHooks();
        validateWorld(configuredModel);
        initialGameModel = cloneModel(configuredModel);

        const parsedSavedModel = readSavedModel(configuredModel);
        gameModel = shouldUseSavedModel(parsedSavedModel, configuredModel) ? parsedSavedModel : cloneModel(configuredModel);
        game.load(gameModel);
        gameModel = game.state;
        syncSavedPresentation(gameModel, configuredModel);

        imagePreloadComplete = isImagePreloadAvailable() ? collectGameImageUrls(configuredModel).length === 0 : true;
        imagePreloadState = { loaded: 0, total: collectGameImageUrls(configuredModel).length };
        normalizePlayerState();
        updateView();
        preloadGameImages(gameModel, updateImagePreloadProgress).then(() => {
            imagePreloadComplete = true;
            updateImagePreloadProgress(imagePreloadState.total, imagePreloadState.total);
        });
    } catch (error) {
        console.error("Failed to load the game model from file", error);
        reportStorageStatus("Unable to load the game. Check your connection and reload.");
    }
}

function syncSavedPresentation(model, freshModel) {
    model.startScreen = cloneModel(freshModel.startScreen);
    for (const [roomKey, room] of Object.entries(freshModel.rooms)) {
        if (!model.rooms[roomKey]) continue;
        for (const field of ['imageUrl', 'imagePosition', 'imageVariants']) {
            if (room[field] !== undefined) model.rooms[roomKey][field] = cloneModel(room[field]);
        }
    }
}

function registerServiceWorker() {
    if (!serviceWorkerUrl || typeof window === 'undefined' || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
        return;
    }

    const register = () => {
        return navigator.serviceWorker.register(serviceWorkerUrl, { updateViaCache: 'none' }).then((registration) => {
            return registration.update();
        }).catch((error) => {
            console.warn('Offline cache registration failed', error);
        });
    };

    if (document.readyState === 'complete') {
        return register();
    } else {
        window.addEventListener('load', register, { once: true });
    }
}

function defaultRequestTextInput(inputDefinition = {}) {
    if (typeof window === 'undefined' || typeof window.prompt !== 'function') {
        return null;
    }

    return window.prompt(inputDefinition.prompt || 'Enter text:');
}

// Validate authored worlds and restored saves before they enter the runtime.

function getSaveKey(model = initialGameModel || gameModel) {
    return `fiction:${model.id || model.title || 'untitled'}:gameModel`;
}

function reportStorageStatus(message) {
    if (typeof document === 'undefined') return;
    const status = document.getElementById('game-status');
    if (status) {
        status.textContent = message;
        status.hidden = !message;
    }
}

function readSavedModel(freshModel) {
    try {
        const raw = localStorage.getItem(getSaveKey(freshModel));
        // Migrate the old shared save only when its story and version match.
        const legacy = raw ? null : localStorage.getItem('gameModel');
        const parsed = JSON.parse(raw || legacy || 'null');
        const saved = parsed && (game.migrateSavedState?.(parsed) ?? parsed);
        if (shouldUseSavedModel(saved, freshModel)) return saved;
        // A new story version starts normally; it is not a storage error.
        if (saved?.version === freshModel.version) validateWorld(saved, freshModel);
    } catch (error) {
        reportStorageStatus('Your save could not be read. You can play a fresh game; saving may be unavailable.');
    }
    return null;
}

function saveGameModel() {
    normalizePlayerState();
    try {
        localStorage.setItem(getSaveKey(), JSON.stringify(gameModel));
    } catch (error) {
        reportStorageStatus('Progress could not be saved. You can keep playing, but reloading may lose progress.');
    }
}

function getSaveSlotKey(slot, model = initialGameModel || gameModel) {
    if (!Number.isInteger(slot) || slot < 1 || slot > 3) throw new Error('Invalid save slot');
    return `${getSaveKey(model)}:slot:${slot}`;
}

function readSaveSlot(slot) {
    let raw;
    try {
        raw = localStorage.getItem(getSaveSlotKey(slot));
    } catch (error) {
        return { state: 'unavailable', message: 'Browser storage is unavailable.' };
    }
    if (!raw) return { state: 'empty', message: 'Empty slot' };
    try {
        const record = JSON.parse(raw);
        if (record?.model) record.model = (game.migrateSavedState?.(record.model) ?? record.model);
        if (!record?.model || typeof record.savedAt !== 'string' || !Number.isFinite(Date.parse(record.savedAt))) {
            return { state: 'corrupt', message: 'This save could not be read.' };
        }
        const reference = initialGameModel || gameModel;
        if (record.model.version !== reference.version || (record.model.id || record.model.title) !== (reference.id || reference.title)) {
            return { state: 'incompatible', message: 'Saved for a different game version.' };
        }
        if (!shouldUseSavedModel(record.model, reference)) return { state: 'corrupt', message: 'This save could not be read.' };
        return { state: 'ready', model: record.model, savedAt: record.savedAt };
    } catch (error) {
        return { state: 'corrupt', message: 'This save could not be read.' };
    }
}

function saveGameSlot(slot) {
    if (!gameModel?.player.started) return { ok: false, message: 'Start the game before saving.' };
    try {
        const record = { savedAt: new Date().toISOString(), model: gameModel };
        localStorage.setItem(getSaveSlotKey(slot), JSON.stringify(record));
        return { ok: true, message: `Saved to slot ${slot}.` };
    } catch (error) {
        return { ok: false, message: 'Could not save. Your previous slot has been kept.' };
    }
}

function restoreGameSlot(slot) {
    const record = readSaveSlot(slot);
    if (record.state !== 'ready') return { ok: false, message: record.message };
    const restored = record.model;
    syncSavedPresentation(restored, initialGameModel || gameModel);
    try {
        // Persist first: a failed write must not replace the running game.
        localStorage.setItem(getSaveKey(), JSON.stringify(restored));
    } catch (error) {
        return { ok: false, message: 'Could not restore. Your current game has been kept.' };
    }

    clearAchievementPopups();
    game.load(restored);
    gameModel = game.state;
    lastRenderedRoomKey = null;
    updateView();
    return { ok: true, message: `Restored slot ${slot}.` };
}

function resetGame() {
    clearAchievementPopups();
    try {
        localStorage.removeItem(getSaveKey());
        const legacy = JSON.parse(localStorage.getItem('gameModel') || 'null');
        if (legacy && (legacy.id || legacy.title) === (gameModel.id || gameModel.title)) localStorage.removeItem('gameModel');
    } catch (error) {
        reportStorageStatus('Saved progress could not be cleared. Starting a fresh game in memory.');
    }

    lastRenderedRoomKey = null;

    if (initialGameModel) {
        game.load(initialGameModel);
        gameModel = game.state;
        normalizePlayerState();
        updateView();
        saveGameModel();
        closeItemModal();
        closeMessageModal();
        return;
    }

    loadGameModel();
}

function updateClock() {
    if (typeof document === 'undefined') return;
    const controls = document.getElementById('clock-controls');
    if (!controls) return;
    controls.hidden = !gameModel.clock;
    const minutes = Math.floor(gameModel.player.elapsedMinutes || 0);
    const display = document.getElementById('game-clock');
    if (display) {
        display.textContent = formatElapsedTime(minutes);
        display.setAttribute('aria-label', `${clockLabel}: ${minutes} minutes elapsed`);
    }
    const button = document.getElementById('wait-button');
    if (button) {
        button.disabled = !gameModel.player.started || gameModel.player.gameOver;
        button.onclick = waitTurn;
    }
}

function generateRoomDescription(roomKey) {
    const descriptionElement = document.getElementById('room-description');

    if (!descriptionElement) {
        return;
    }

    const room = gameModel.rooms[roomKey];
    descriptionElement.innerHTML = '';
    getRoomDescriptionParts(roomKey).forEach((part) => {
        const paragraph = document.createElement('p');
        paragraph.className = part.type === 'npcNearby' ? 'npc-proximity-cue' : 'room-description-paragraph';
        renderTextWithExamineLinks(paragraph, part.text, room.clues || {});
        descriptionElement.appendChild(paragraph);
    });
}

function appendProseText(parent, text) {
    const punctuation = text.match(/^[.,;:!?…)\]]+/)?.[0];
    const previous = parent.lastChild;
    if (punctuation && previous?.matches?.('button.examine-link, button.exit-link, button.clickable-item')) {
        const group = document.createElement('span');
        group.className = 'linked-punctuation';
        parent.appendChild(group);
        group.appendChild(previous);
        group.appendChild(document.createTextNode(punctuation));
        text = text.slice(punctuation.length);
    }
    if (text) parent.appendChild(document.createTextNode(text));
}

function renderTextWithExamineLinks(container, text, clues) {
    container.innerHTML = '';

    parseExamineLinks(text, clues).forEach((part) => {
        if (part.type === 'text') {
            appendProseText(container, part.text);
            return;
        }

        if (part.type === 'accent') {
            const accent = document.createElement('strong');
            accent.className = 'prose-accent';
            accent.textContent = part.text;
            container.appendChild(accent);
            return;
        }

        const target = getExamineLinkTarget(part.clueKey, clues);
        if (!target) {
            container.appendChild(document.createTextNode(part.text));
            return;
        }

        const link = document.createElement('button');
        link.type = 'button';
        link.className = 'examine-link';
        link.textContent = part.text;
        link.onclick = () => openExamineLinkTarget(target);
        container.appendChild(link);
    });
}

function openExamineLinkTarget(target) {
    if (target.type === 'clue') {
        game.dispatch({ type: 'examineClue', target: clueId(target.clue) });
    } else if (target.type === 'item' && getExamineLinkTarget(`item:${target.itemKey}`, {})) {
        closeMessageModal();
        showItemModal(target.itemKey);
    }
}

function updateView() {
    gameModel = game.state;
    normalizePlayerState();
    updateClock();
    setElementText('game-title', gameModel.title || gameModel.startScreen?.title || '');

    if (!gameModel.player.started) {
        showGameScreen('start');
        renderStartScreen();
        return;
    }

    if (gameModel.player.gameOver && gameModel.player.endingEncounter && !gameModel.player.endingEncounter.acknowledged) {
        renderEndingEncounter();
        return;
    }

    if (gameModel.player.gameOver) {
        showGameScreen('end');
        renderEndScreen();
        return;
    }

    showGameScreen('play');
    const encounterPanel = document.getElementById('ending-encounter');
    if (encounterPanel) encounterPanel.hidden = true;
    const interactions = document.getElementById('interactions');
    if (interactions) interactions.hidden = false;
    const roomDescription = document.getElementById('room-description');
    if (roomDescription) roomDescription.inert = false;

    const currentRoomKey = gameModel.player.currentRoom;
    const currentRoom = gameModel.rooms[currentRoomKey];
    const didChangeRoom = currentRoomKey !== lastRenderedRoomKey;

    // Update the room name display
    const roomNameElement = document.getElementById('room-name');
    if (roomNameElement) {
        roomNameElement.textContent = currentRoom.name;
    }

    setRoomImage(currentRoom);

    // Update room description
    generateRoomDescription(currentRoomKey);

    // Update exits
    updateExits(currentRoomKey);

    // Update items in the room
    updateItems(currentRoomKey);

    // Update nearby NPC cues
    updateNpcCues(currentRoomKey);

    // Update player-owned items
    updatePlayerGear();

    if (didChangeRoom) {
        resetRoomContentScroll();
        lastRenderedRoomKey = currentRoomKey;
    }
    const pending = gameModel.player.pendingAction;
    if (pending?.message) displayMessageModal(pending.message, pending.title);
}

function resetRoomContentScroll() {
    if (typeof document === 'undefined') {
        return;
    }

    const roomContent = document.getElementById('room-content');
    if (roomContent) {
        roomContent.scrollTop = 0;
    }
}

function showGameScreen(screenName) {
    const startScreen = document.getElementById('start-screen');
    const playScreen = document.getElementById('play-screen');
    const endScreen = document.getElementById('end-screen');
    const enteringEndScreen = screenName === 'end' && endScreen?.hidden;

    if (startScreen) {
        startScreen.hidden = screenName !== 'start';
    }
    if (playScreen) {
        playScreen.hidden = screenName !== 'play';
    }
    if (endScreen) {
        endScreen.hidden = screenName !== 'end';
    }

    const playerGear = document.getElementById('player-gear');
    if (playerGear) {
        playerGear.hidden = screenName !== 'play';
    }
    if (enteringEndScreen && typeof window !== 'undefined') {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
}

function renderEndingEncounter() {
    const panel = document.getElementById('ending-encounter');
    const firstDisplay = panel?.hidden;
    showGameScreen('play');
    const room = gameModel.rooms[gameModel.player.currentRoom];
    setElementText('room-name', room.name);
    setRoomImage(room);
    generateRoomDescription(gameModel.player.currentRoom);
    const description = document.getElementById('room-description');
    if (description) description.inert = true;
    for (const id of ['interactions', 'player-gear']) {
        const element = document.getElementById(id);
        if (element) element.hidden = true;
    }
    renderParagraphText(document.getElementById('ending-encounter-text'), gameModel.player.endingEncounter.text);
    if (panel) panel.hidden = false;
    const button = document.getElementById('ending-encounter-continue');
    if (button) button.onclick = acknowledgeEndingEncounter;
    if (firstDisplay) {
        ['itemModal', 'messageModal', 'achievementsModal'].forEach(closeModal);
        resetRoomContentScroll();
        if (typeof window !== 'undefined') window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        button?.focus({ preventScroll: true });
    }
}

function renderStartScreen() {
    const startScreen = gameModel.startScreen || {};
    const title = startScreen.title || gameModel.title || 'Untitled Game';
    const kicker = startScreen.kicker || startScreen.subtitle || '';
    const buttonLabel = startScreen.buttonLabel || 'Start';

    setElementText('start-screen-title', title);
    setElementText('start-screen-kicker', kicker);
    setElementText('start-game-button', buttonLabel);
    renderParagraphText(document.getElementById('start-screen-text'), startScreen.text || startScreen.description || '');
    setViewImage('start-screen-image', startScreen.imageUrl, startScreen.imagePosition, `Image for ${title}`);
    renderImagePreloadState();
}

function updateImagePreloadProgress(loaded, total) {
    imagePreloadState = { loaded, total };
    renderImagePreloadState();
}

function renderImagePreloadState() {
    if (typeof document === 'undefined') {
        return;
    }

    const loadingContainer = document.getElementById('start-loading');
    const loadingBar = document.getElementById('start-loading-bar-fill');
    const loadingStatus = document.getElementById('start-loading-status');
    const startButton = document.getElementById('start-game-button');
    const total = imagePreloadState.total || 0;
    const loaded = Math.min(imagePreloadState.loaded || 0, total);
    const isLoading = !imagePreloadComplete && total > 0;
    const progress = total > 0 ? Math.round((loaded / total) * 100) : 100;

    if (loadingContainer) {
        loadingContainer.hidden = !isLoading;
    }
    if (loadingBar) {
        loadingBar.style.width = `${progress}%`;
    }
    if (loadingStatus) {
        loadingStatus.textContent = isLoading ? `Preparing images ${loaded}/${total}` : 'Images ready';
    }
    if (startButton) {
        startButton.disabled = isLoading;
    }
}

function renderEndScreen() {
    const ending = getCurrentEnding() || {};
    const title = ending.title || ending.name || 'The End';
    const kicker = ending.kicker || 'The End';
    const endingText = game.getEndingText(ending);
    const achievements = getEarnedAchievements();
    const totalAchievements = getTotalAchievementCount();

    setElementText('end-screen-title', title);
    setElementText('end-screen-kicker', kicker);
    renderParagraphText(document.getElementById('end-screen-text'), endingText);
    const elapsed = document.getElementById('end-screen-time');
    if (elapsed) {
        elapsed.hidden = !gameModel.clock;
        const minutes = Math.floor(gameModel.player.elapsedMinutes || 0);
        elapsed.textContent = `${clockLabel}: ${formatElapsedTime(minutes)}`;
        elapsed.setAttribute('aria-label', `${clockLabel}: ${minutes} minutes elapsed`);
    }
    setElementText('end-screen-achievement-count', `Achievements: ${achievements.length}/${totalAchievements}`);
    renderAchievementList(document.getElementById('end-screen-achievements'), achievements);
    setViewImage('end-screen-image', ending.imageUrl, ending.imagePosition, `Image for ${title}`);
}

function setElementText(elementId, text) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = text;
    }
}

function renderParagraphText(container, text) {
    if (!container) {
        return;
    }

    container.innerHTML = '';
    const paragraphs = Array.isArray(text) ? text : [text];

    paragraphs.map(paragraphText => buildConditionalText(paragraphText)).filter(Boolean).forEach((paragraphText) => {
        const paragraph = document.createElement('p');
        paragraph.textContent = paragraphText;
        container.appendChild(paragraph);
    });
}

function renderAchievementList(list, achievements) {
    if (!list) {
        return;
    }

    list.innerHTML = '';
    const achievementList = Array.isArray(achievements) ? achievements : [];

    if (achievementList.length === 0) {
        const emptyItem = document.createElement('li');
        emptyItem.textContent = 'No achievements recorded yet.';
        list.appendChild(emptyItem);
        return;
    }

    achievementList.forEach((achievement) => {
        const item = document.createElement('li');
        const name = typeof achievement === 'string' ? achievement : achievement.name || achievement.id || 'Achievement';
        const description = typeof achievement === 'object' ? achievement.description : '';

        const nameElement = document.createElement('span');
        nameElement.className = 'achievement-list-title';
        nameElement.textContent = name;
        item.appendChild(nameElement);

        if (description) {
            const descriptionElement = document.createElement('span');
            descriptionElement.className = 'achievement-list-description';
            descriptionElement.textContent = description;
            item.appendChild(descriptionElement);
        }

        list.appendChild(item);
    });
}

function displayAchievementPopup(achievement) {
    if (typeof document === 'undefined' || typeof window === 'undefined' || !achievement) return;
    if (!document.getElementById('achievement-popup')) return;
    achievementPopupQueue.push(achievement);
    showNextAchievementPopup();
}

function showNextAchievementPopup() {
    if (activeAchievementPopup || !achievementPopupQueue.length) return;
    const popup = document.getElementById('achievement-popup');
    if (!popup) return;
    const achievement = achievementPopupQueue.shift();
    activeAchievementPopup = achievement;
    setElementText('achievement-popup-name', achievement.name || 'Achievement');
    setElementText('achievement-popup-description', achievement.description || '');
    popup.hidden = false;
    window.requestAnimationFrame(() => {
        if (activeAchievementPopup === achievement && !achievementPopupClosing) popup.classList.add('is-visible');
    });
    achievementPopupTimer = setTimeout(hideAchievementPopup, ACHIEVEMENT_POPUP_DURATION_MS);
}

function hideAchievementPopup() {
    if (!activeAchievementPopup || achievementPopupClosing || typeof document === 'undefined') return;
    const popup = document.getElementById('achievement-popup');
    if (!popup) return;
    clearTimeout(achievementPopupTimer);
    achievementPopupClosing = true;
    popup.classList.remove('is-visible');
    achievementPopupTimer = setTimeout(() => {
        popup.hidden = true;
        achievementPopupTimer = null;
        activeAchievementPopup = null;
        achievementPopupClosing = false;
        showNextAchievementPopup();
    }, 260);
}

function clearAchievementPopups() {
    if (achievementPopupTimer !== null) clearTimeout(achievementPopupTimer);
    achievementPopupTimer = null;
    achievementPopupQueue.length = 0;
    activeAchievementPopup = null;
    achievementPopupClosing = false;
    if (typeof document === 'undefined') return;
    const popup = document.getElementById('achievement-popup');
    if (popup) {
        popup.hidden = true;
        popup.classList.remove('is-visible');
    }
}

function setRoomImage(room) {
    const image = getRoomImage(room);
    setViewImage('room-image', image.imageUrl, image.imagePosition, `Image of ${room.name}`);
}

function setViewImage(elementId, imageUrl, imagePosition, altText = '') {
    const image = document.getElementById(elementId);

    if (!image) {
        return;
    }

    const loadSequence = ++viewImageLoadSequence;
    image.style.objectPosition = getImageObjectPosition(imagePosition);

    if (!imageUrl) {
        image.removeAttribute('src');
        image.alt = '';
        image.classList.remove('is-loading');
        image.classList.remove('is-loaded');
        return;
    }

    if (image.getAttribute('src') === imageUrl) {
        image.alt = altText;
        image.classList.add('is-loaded');
        image.classList.remove('is-loading');
        return;
    }

    const nextImage = new Image();
    image.classList.add('is-loading');

    nextImage.onload = () => {
        if (loadSequence !== viewImageLoadSequence) {
            return;
        }

        image.src = imageUrl;
        image.alt = altText;
        image.classList.remove('is-loading');
        image.classList.add('is-loaded');
    };

    nextImage.onerror = () => {
        if (loadSequence !== viewImageLoadSequence) {
            return;
        }

        image.src = imageUrl;
        image.alt = altText;
        image.classList.remove('is-loading');
        image.classList.add('is-loaded');
    };

    nextImage.src = imageUrl;
}

function isImagePreloadAvailable() {
    return typeof Image !== 'undefined';
}

function preloadGameImages(model, onProgress = null) {
    const urls = collectGameImageUrls(model);

    if (!isImagePreloadAvailable() || urls.length === 0) {
        if (onProgress) {
            onProgress(urls.length, urls.length);
        }
        return Promise.resolve(urls);
    }

    let loaded = 0;
    if (onProgress) {
        onProgress(loaded, urls.length);
    }

    return Promise.all(urls.map((url) => preloadImage(url).finally(() => {
        loaded += 1;
        if (onProgress) {
            onProgress(loaded, urls.length);
        }
    }))).then(() => urls);
}

function preloadImage(url) {
    return new Promise((resolve) => {
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => resolve({ url, loaded: true });
        image.onerror = () => resolve({ url, loaded: false });
        image.src = url;
    });
}

function collectGameImageUrls(model) {
    const urls = new Set();

    function addImageUrl(value) {
        if (typeof value === 'string' && value.trim()) {
            urls.add(value);
        }
    }

    addImageUrl(model?.startScreen?.imageUrl);
    Object.values(model?.rooms || {}).forEach((room) => {
        addImageUrl(room.imageUrl);
        (room.imageVariants || []).forEach(variant => addImageUrl(variant.imageUrl));
    });
    (model?.endings || []).forEach((ending) => addImageUrl(ending.imageUrl));

    return [...urls];
}

function getImageObjectPosition(imagePosition = {}) {
    const xPositions = {
        left: 'left',
        center: 'center',
        centre: 'center',
        right: 'right'
    };
    const yPositions = {
        top: 'top',
        middle: 'center',
        center: 'center',
        centre: 'center',
        bottom: 'bottom'
    };

    const x = xPositions[imagePosition.x] || 'center';
    const y = yPositions[imagePosition.y] || 'center';

    return `${x} ${y}`;
}

// Function to update the player's carried and worn items in the view

function updatePlayerGear() {
    const playerGearList = document.getElementById('player-gear-items');
    updatePlayerGearLabel();

    if (!playerGearList) {
        return;
    }

    playerGearList.innerHTML = '';

    normalizePlayerCollections();

    const sections = [
        { key: 'carried', label: 'Carrying' },
        { key: 'worn', label: 'Wearing' }
    ];
    let hasItems = false;

    sections.forEach((section) => {
        const items = gameModel.player[section.key] || {};
        const itemKeys = Object.keys(items).filter((itemKey) => !isItemConnectedToVisibleTarget(itemKey, items[itemKey]));
        if (section.key === 'carried') itemKeys.reverse();
        if (itemKeys.length === 0) {
            return;
        }

        hasItems = true;
        const sectionItem = document.createElement('li');
        sectionItem.className = 'player-gear-section';

        const heading = document.createElement('h3');
        heading.textContent = section.label;
        sectionItem.appendChild(heading);

        const sectionList = document.createElement('ul');
        sectionList.className = 'player-gear-section-items';
        itemKeys.forEach((itemKey) => {
            appendPlayerGearItem(sectionList, itemKey, items[itemKey]);
        });

        sectionItem.appendChild(sectionList);
        playerGearList.appendChild(sectionItem);
    });

    if (!hasItems) {
        const emptyItem = document.createElement('li');
        emptyItem.className = 'player-gear-empty';
        emptyItem.textContent = 'Nothing carried or worn.';
        playerGearList.appendChild(emptyItem);
    }
}

function updatePlayerGearLabel() {
    const playerGearLabel = document.getElementById('player-gear-label');

    if (playerGearLabel) {
        playerGearLabel.textContent = getPlayerDisplayName();
    }
}

function appendPlayerGearItem(list, itemKey, item) {
    const listItem = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'clickable-item';
    button.textContent = getItemDisplayName(itemKey, item);
    listItem.appendChild(button);
    button.onclick = (event) => {
        event.stopPropagation();
        showItemModal(itemKey, true);
    };
    list.appendChild(listItem);

    const container = item.properties?.container;
    if (!container || !(container.opened || container.transparent)) {
        return;
    }

    const visibleContents = Object.keys(container.items || {})
        .filter((containedItemKey) => !isHiddenItem(container.items[containedItemKey]));

    if (visibleContents.length === 0) {
        return;
    }

    const contentsList = document.createElement('ul');
    contentsList.className = 'player-gear-contained-items';
    visibleContents.forEach((containedItemKey) => {
        appendPlayerGearItem(contentsList, containedItemKey, container.items[containedItemKey]);
    });
    listItem.appendChild(contentsList);
}

function setPlayerGearDrawerState(isExpanded) {
    const playerGear = document.getElementById('player-gear');
    const toggleButton = document.getElementById('player-gear-toggle');
    const panel = document.getElementById('player-gear-panel');

    if (!playerGear || !toggleButton) {
        return;
    }

    playerGear.classList.toggle('is-open', isExpanded);
    toggleButton.setAttribute('aria-expanded', isExpanded);
    if (panel) {
        panel.setAttribute('aria-hidden', (!isExpanded).toString());
        panel.inert = !isExpanded;
    }
}

function setupPlayerGearDrawer() {
    const toggleButton = document.getElementById('player-gear-toggle');

    if (!toggleButton) {
        return;
    }

    setPlayerGearDrawerState(false);

    toggleButton.addEventListener('click', () => {
        const playerGear = document.getElementById('player-gear');
        const isOpen = playerGear?.classList.contains('is-open');
        setPlayerGearDrawerState(!isOpen);
    });
}

function syncModalBackground() {
    if (typeof document === 'undefined') return;
    const open = [...document.querySelectorAll('.modal')].filter((modal) => modal.style.display === 'block');
    const top = open.at(-1);
    const game = document.getElementById('game');
    if (game) game.inert = Boolean(top);
    const popup = document.getElementById('achievement-popup');
    if (popup) popup.inert = Boolean(top);
    document.querySelectorAll('.modal').forEach((modal) => { modal.inert = Boolean(top && modal !== top); });
}

function openModal(id) {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById(id);
    if (!modal) return;
    if (modal.style.display !== 'block') modalFocusOrigins.set(id, document.activeElement);
    modal.style.display = 'block';
    syncModalBackground();
    modal.querySelector('button')?.focus?.();
}

function closeModal(id) {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById(id);
    if (!modal || modal.style.display !== 'block') return;
    modal.style.display = 'none';
    const origin = modalFocusOrigins.get(id);
    modalFocusOrigins.delete(id);
    // An action may open its result message before closing the item dialog.
    modalFocusOrigins.forEach((target, key) => {
        if (modal.contains(target)) modalFocusOrigins.set(key, origin);
    });
    syncModalBackground();
    const top = [...document.querySelectorAll('.modal')].filter((entry) => entry.style.display === 'block').at(-1);
    if (top) top.querySelector('button')?.focus();
    else if (origin?.isConnected && !origin.closest('[hidden], [inert]')) origin.focus?.();
    else document.querySelector('#play-screen:not([hidden]) #player-gear-toggle, #end-screen:not([hidden]) button, #start-screen:not([hidden]) button')?.focus();
}

function handleModalKeydown(event) {
    const modal = [...document.querySelectorAll('.modal')].filter((entry) => entry.style.display === 'block').at(-1);
    if (!modal) return;
    if (event.key === 'Escape') {
        event.preventDefault();
        if (modal.id === 'messageModal') closeMessageModal();
        else closeModal(modal.id);
    } else if (event.key === 'Tab') {
        const controls = [...modal.querySelectorAll('button:not([disabled]), [href], input, [tabindex="0"]')];
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
}

function setupModalControls() {
    document.addEventListener('keydown', handleModalKeydown);
    const itemCloseButton = document.querySelector('#itemModal .close');
    const messageCloseButton = document.querySelector('#messageModal .close');
    const achievementsCloseButton = document.querySelector('#achievementsModal .close');

    if (itemCloseButton) {
        itemCloseButton.onclick = closeItemModal;
    }

    if (messageCloseButton) {
        messageCloseButton.onclick = closeMessageModal;
    }

    if (achievementsCloseButton) {
        achievementsCloseButton.addEventListener('click', closeAchievementsModal);
    }
}

function setGameMenuState(isOpen) {
    const gameMenu = document.getElementById('game-menu');
    const menuButton = document.getElementById('game-menu-button');
    const menuPanel = document.getElementById('game-menu-panel');

    if (!gameMenu || !menuButton || !menuPanel) {
        return;
    }

    gameMenu.classList.toggle('is-open', isOpen);
    menuButton.setAttribute('aria-expanded', isOpen.toString());
    menuPanel.setAttribute('aria-hidden', (!isOpen).toString());
    menuPanel.inert = !isOpen;
}

function setupGameMenu() {
    const gameMenu = document.getElementById('game-menu');
    const menuButton = document.getElementById('game-menu-button');
    const viewAchievementsButton = document.getElementById('view-achievements-button');
    const restartGameButton = document.getElementById('restart-game-button');

    if (!gameMenu || !menuButton) {
        return;
    }

    setGameMenuState(false);

    menuButton.addEventListener('click', (event) => {
        event.stopPropagation();
        setGameMenuState(!gameMenu.classList.contains('is-open'));
    });

    if (restartGameButton) {
        restartGameButton.addEventListener('click', () => {
            setGameMenuState(false);
            resetGame();
        });
    }

    if (viewAchievementsButton) {
        viewAchievementsButton.addEventListener('click', () => {
            setGameMenuState(false);
            showAchievementsModal();
        });
    }

    document.addEventListener('click', (event) => {
        if (!gameMenu.contains(event.target)) {
            setGameMenuState(false);
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            setGameMenuState(false);
        }
    });
}

function setupSaveSlots() {
    document.querySelectorAll('[data-save-slots]').forEach(button => {
        button.addEventListener('click', () => {
            setGameMenuState(false);
            showSaveSlots();
        });
    });
    document.querySelector('#saveSlotsModal .close')?.addEventListener('click', () => closeModal('saveSlotsModal'));
}

function showSaveSlots() {
    renderSaveSlots();
    setElementText('save-slots-status', '');
    openModal('saveSlotsModal');
}

function renderSaveSlots() {
    const list = document.getElementById('save-slots-list');
    if (!list) return;
    list.replaceChildren();
    for (let slot = 1; slot <= 3; slot++) {
        const record = readSaveSlot(slot);
        const row = document.createElement('li');
        row.className = 'save-slot';
        row.dataset.slot = String(slot);
        const title = document.createElement('h4');
        title.textContent = `Slot ${slot}`;
        const details = document.createElement('p');
        if (record.state === 'ready') {
            const model = record.model;
            const location = model.rooms[model.player.currentRoom].name;
            const time = model.clock ? ` · ${formatElapsedTime(model.player.elapsedMinutes || 0)}` : '';
            details.textContent = `${location}${time}${model.player.gameOver ? ' · Game ended' : ''} — ${new Date(record.savedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}`;
        } else details.textContent = record.message;
        const buttons = document.createElement('div');
        buttons.className = 'save-slot-actions';
        for (const action of ['save', 'restore']) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = action === 'restore' ? 'Restore' : record.state === 'empty' ? 'Save' : 'Overwrite';
            button.setAttribute('aria-label', `${button.textContent} slot ${slot}`);
            button.disabled = action === 'restore' ? record.state !== 'ready' : !gameModel.player.started || record.state === 'unavailable';
            button.onclick = () => handleSaveSlotAction(action, slot);
            buttons.appendChild(button);
        }
        row.append(title, details, buttons);
        list.appendChild(row);
    }
}

function handleSaveSlotAction(action, slot) {
    const result = action === 'save' ? saveGameSlot(slot) : restoreGameSlot(slot);
    if (action === 'restore' && result.ok) {
        closeModal('saveSlotsModal');
        setPlayerGearDrawerState(false);
        reportStorageStatus('');
        return;
    }
    renderSaveSlots();
    setElementText('save-slots-status', result.message);
    document.querySelector(`[data-slot="${slot}"] button:not([disabled])`)?.focus();
}

function showAchievementsModal() {
    if (typeof document === 'undefined') {
        return;
    }

    const modal = document.getElementById('achievementsModal');
    const count = document.getElementById('achievements-count');
    const list = document.getElementById('achievements-list');
    const achievements = getEarnedAchievements();
    const totalAchievements = getTotalAchievementCount();

    if (count) {
        count.textContent = `Achievements: ${achievements.length}/${totalAchievements}`;
    }

    renderAchievementList(list, achievements);

    if (modal) {
        openModal('achievementsModal');
    }
}

function closeAchievementsModal() {
    closeModal('achievementsModal');
}

function setupStoryScreens() {
    const startButton = document.getElementById('start-game-button');
    const endRestartButton = document.getElementById('end-restart-button');

    if (startButton) {
        startButton.addEventListener('click', startGame);
    }

    if (endRestartButton) {
        endRestartButton.addEventListener('click', resetGame);
    }
}

function setupAchievementPopup() {
    const closeButton = document.getElementById('achievement-popup-close');

    if (closeButton) {
        closeButton.addEventListener('click', hideAchievementPopup);
    }
}

// Function to update room exits in the view

function updateExits(roomKey) {
    const room = gameModel.rooms[roomKey];
    const exitsList = document.getElementById('exits');
    exitsList.innerHTML = ''; // Clear existing exits

    const exitKeys = Object.keys(room.exits).filter((exitKey) => {
        const roomName = gameModel.rooms[exitKey]?.name || exitKey;
        const exitDefinition = normalizeExitDefinition(room.exits[exitKey], roomName);
        return exitDefinition?.listed !== false && isExitVisible(exitDefinition);
    });

    if (exitKeys.length === 0) {
        return;
    }

    const exitElement = document.createElement('li');

    exitKeys.forEach((exitKey, index) => {
        const roomName = gameModel.rooms[exitKey]?.name || exitKey;
        const exitDefinition = getExitDisplayDefinition(room.exits[exitKey], roomName);
        appendExitDescription(exitElement, exitKey, exitDefinition, index === 0);

        if (index < exitKeys.length - 2) {
            appendProseText(exitElement, ', ');
        } else if (index === exitKeys.length - 2) {
            exitElement.appendChild(document.createTextNode(' and '));
        }
    });

    appendProseText(exitElement, '.');

    exitsList.appendChild(exitElement);
}

function appendExitDescription(exitElement, exitKey, exitDefinition, shouldCapitalize) {
    const roomName = gameModel.rooms[exitKey]?.name || exitKey;
    let beforeText = exitDefinition?.before ?? '';

    if (shouldCapitalize && beforeText) {
        beforeText = capitalizeFirstLetter(beforeText);
    }

    if (beforeText) {
        exitElement.appendChild(document.createTextNode(beforeText));
    }

    const link = document.createElement('button');
    link.type = 'button';
    link.textContent = exitDefinition?.label || roomName;
    link.classList.add('exit-link');
    link.onclick = () => movePlayer(exitKey);
    exitElement.appendChild(link);

    if (exitDefinition?.after) {
        exitElement.appendChild(document.createTextNode(exitDefinition.after));
    }
}

function appendInlineItemLink(parent, button, itemKey, item) {
    const base = formatItemBaseName(item.name, 'indefinite', item.article);
    const article = item.article === 'none' ? '' : (base.match(/^(?:a|an|the) /)?.[0] || '');
    const annotation = getItemDisplayName(itemKey, item, { article: 'indefinite' }).slice(base.length);
    if (article) parent.appendChild(document.createTextNode(article));
    button.textContent = base.slice(article.length);
    parent.appendChild(button);
    if (annotation) parent.appendChild(document.createTextNode(annotation));
}

function appendContainerContentsInline(parentElement, item) {
    const container = item?.properties?.container;
    if (!container || !(container.opened || container.transparent)) {
        return;
    }

    const visibleEntries = Object.entries(container.items || {})
        .filter(([, containedItem]) => !isHiddenItem(containedItem));

    if (visibleEntries.length === 0) {
        return;
    }

    parentElement.appendChild(document.createTextNode(container.supporter ? ' (with ' : ' (containing '));

    visibleEntries.forEach(([containedItemKey, containedItem], index) => {
        const containerItemElement = document.createElement('button');
        containerItemElement.type = 'button';
        containerItemElement.classList.add('clickable-item');
        containerItemElement.onclick = (event) => {
            event.stopPropagation();
            showItemModal(containedItemKey);
        };

        appendInlineItemLink(parentElement, containerItemElement, containedItemKey, containedItem);
        appendContainerContentsInline(parentElement, containedItem);

        if (index < visibleEntries.length - 1) {
            parentElement.appendChild(document.createTextNode(index === visibleEntries.length - 2 ? ' and ' : ', '));
        }
    });

    appendProseText(parentElement, container.supporter ? ' on it)' : ')');
}

function appendConnectedItemsInline(parentElement, targetKey) {
    const connectedItems = getConnectedItemsForTarget(targetKey);

    if (connectedItems.length === 0) {
        return;
    }

    parentElement.appendChild(document.createTextNode(' (connected to '));

    connectedItems.forEach(({ itemKey, item }, index) => {
        const connectedItemElement = document.createElement('button');
        connectedItemElement.type = 'button';
        connectedItemElement.classList.add('clickable-item');
        connectedItemElement.onclick = (event) => {
            event.stopPropagation();
            showItemModal(itemKey, true);
        };

        appendInlineItemLink(parentElement, connectedItemElement, itemKey, item);
        appendContainerContentsInline(parentElement, item);

        if (index < connectedItems.length - 1) {
            parentElement.appendChild(document.createTextNode(index === connectedItems.length - 2 ? ' and ' : ', '));
        }
    });

    appendProseText(parentElement, ')');
}

function updateItems(roomKey) {
    const room = gameModel.rooms[roomKey];
    const itemsList = document.getElementById('items');
    itemsList.innerHTML = ''; // Clear existing items

    // Check if room has items and they are an object
    if (!room.items || typeof room.items !== 'object') {
        itemsList.textContent = "";
        return;
    }

    let itemElements = [];

    Object.keys(room.items).forEach(itemKey => {
        let item = room.items[itemKey];
        if (!shouldListItemInRoom(item)) {
            return;
        }

        let itemElement = document.createElement('span');
        const itemButton = document.createElement('button');
        itemButton.type = 'button';
        itemButton.className = 'clickable-item';
        itemButton.onclick = () => showItemModal(itemKey);

        appendInlineItemLink(itemElement, itemButton, itemKey, item);

        appendContainerContentsInline(itemElement, item);
        appendConnectedItemsInline(itemElement, itemKey);

        itemElements.push(itemElement);
    });

    // Construct the sentence
    if (itemElements.length > 0) {
        const descriptionItem = document.createElement('li');
        descriptionItem.textContent = 'You can see ';

        itemElements.forEach((el, index) => {
            descriptionItem.appendChild(el);
            if (index < itemElements.length - 1) {
                descriptionItem.appendChild(document.createTextNode(index === itemElements.length - 2 ? ' and ' : ', '));
            }
        });

        descriptionItem.appendChild(document.createTextNode(' here.'));
        itemsList.appendChild(descriptionItem);
    }
}

function updateNpcCues(roomKey) {
    const cuesList = document.getElementById('npc-cues');

    if (!cuesList) {
        return;
    }

    const cueTexts = getNpcCueTexts(roomKey);
    const displayed = Array.from(cuesList.children).map(node => node.textContent);
    if (displayed.length === cueTexts.length && displayed.every((text, index) => text === cueTexts[index])) return;
    cuesList.innerHTML = '';
    if (cueTexts.length === 0) {
        return;
    }

    cueTexts.forEach((cueText) => {
        const cueItem = document.createElement('li');
        cueItem.className = 'npc-proximity-cue';
        cueItem.textContent = cueText;
        cuesList.appendChild(cueItem);
    });
}

function addListItem(itemsList, item, itemKey) {
    let listItem = document.createElement('li');
    listItem.textContent = getItemDisplayName(itemKey, item);

    // Append contents description for container items
    if (item.properties?.container &&
        (item.properties.container.transparent || item.properties.container.opened)) {
        const containerItems = item.properties.container.items;
        const containerContents = Object.keys(containerItems).map(containerItemKey => {
            return containerItems[containerItemKey].name;
        }).join(', ');

        if (containerContents) {
            listItem.textContent += ` (containing: ${containerContents})`;
        }
    }

    listItem.onclick = () => showItemModal(itemKey);
    itemsList.appendChild(listItem);
}

function showItemModal(itemKey, isPlayerItem = false) {
    const examination = game.dispatch({ type: 'examine', target: itemKey }).value;
    const item = examination?.item;
    isPlayerItem = examination?.isPlayerItem || false;
    const modal = document.getElementById('itemModal');
    const title = document.getElementById('item-title');
    const description = document.getElementById('item-description');
    const actionsDiv = document.getElementById('item-actions');

    if (!examination || gameModel.player.gameOver || !modal || !description || !actionsDiv) {
        return;
    }

    if (title) {
        title.textContent = item.name;
    }
    renderTextWithExamineLinks(description, examination.description, {});
    actionsDiv.innerHTML = '';

    getAvailableActions(itemKey).forEach((action) => {
        addActionToModal(actionsDiv, action, itemKey);
    });

    modal.dataset.fromPlayerGear = isPlayerItem ? 'true' : 'false';
    openModal('itemModal');

    // Close button functionality
    var closeButton = modal.querySelector('.close');
    if (closeButton) {
        closeButton.onclick = function () {
            closeItemModal();
        };
    }
}

function addActionToModal(actionsDiv, action, itemKey) {
    let actionButton = document.createElement('button');
    const actionDefinition = typeof action === 'string' ? { id: action.toLowerCase(), label: action } : action;
    actionButton.textContent = actionDefinition.label;
    actionButton.onclick = () => handleItemAction(actionDefinition.id, itemKey);
    actionsDiv.appendChild(actionButton);
}

// Function to handle item actions

function showItemChoiceOptions(itemKey, choiceIndex) {
    const options = getItemChoiceOptions(itemKey, choiceIndex);
    if (typeof document === 'undefined') return options;
    const actions = document.getElementById('item-actions');
    if (!actions) return options;
    const choice = findItemInGameModel(itemKey)?.properties?.choices?.[choiceIndex];
    if (choice?.title) document.getElementById('item-title').textContent = choice.title;
    if (choice?.prompt !== undefined) {
        renderTextWithExamineLinks(document.getElementById('item-description'), buildConditionalText(choice.prompt), {});
    }
    actions.innerHTML = '';
    for (const option of options) {
        const button = document.createElement('button');
        button.textContent = option.disabled ? (option.disabledLabel || option.label) : option.label;
        button.disabled = option.disabled;
        button.onclick = () => { game.dispatch({ type: 'chooseOption', target: itemKey, choiceIndex, optionIndex: option.index }); closeItemModal(); };
        actions.appendChild(button);
    }
    openModal('itemModal');
    return options;
}

function displayMessageModal(message, title = 'Not Yet', clues = null, noteSources = [], inputSources = []) {
    const messageModal = document.getElementById('messageModal');
    const messageTitle = document.getElementById('message-title');
    const messageText = document.getElementById('message-text');

    if (messageTitle) {
        messageTitle.textContent = title;
    }

    if (messageText) {
        renderTextWithExamineLinks(messageText, message, clues || {});
    }

    const actions = document.getElementById('message-actions');
    if (actions) {
        actions.replaceChildren();
        const choices = [
            ...getMessageNoteActions(noteSources).map(({ sourceKey, index, label }) => ({ label, run: () => game.dispatch({ type: 'record', target: sourceKey, index }) })),
            ...inputSources.flatMap(getRecordedTextActions).map(({ noteKey, targetKey, label }) => ({ label, run: () => game.dispatch({ type: 'enterText', target: noteKey, secondaryTarget: targetKey }) }))
        ];
        choices.forEach(({ label, run }) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = label;
            button.onclick = run;
            actions.appendChild(button);
        });
    }
    if (messageModal) {
        openModal('messageModal');

        const closeButton = messageModal.querySelector('.close');
        if (closeButton) {
            closeButton.onclick = function () {
                closeMessageModal();
            };
        }
    }
}

// Function to push an item

function closeMessageModal() {
    closeModal('messageModal');
    game?.dispatch({ type: 'acknowledgeMessage' });
}

function closeItemModal() {
    closeModal('itemModal');
}

function clueId(clue) {
    for (const [room, definition] of Object.entries(game.state.rooms))
        for (const [id, candidate] of Object.entries(definition.clues || {}))
            if (candidate === clue) return `${room}:${id}`;
    return null;
}
function handleItemAction(action, target) {
    const result = game.dispatch({ type: action, target });
    if (result.choices) return;
    const itemModal = document.getElementById('itemModal');
    if (itemModal?.dataset.fromPlayerGear === 'true') setPlayerGearDrawerState(false);
    closeModal('itemModal');
}
function attachHooks() {
    game.setHooks({ updateView: () => { gameModel = game.state; updateView(); }, saveGameModel,
        displayMessageModal, displayAchievementPopup, showItemChoiceOptions,
        requestTextInput: (input, target) => {
            // Defer until the originating dispatch finishes.
            queueMicrotask(() => { const value = defaultRequestTextInput(input);
                if (value !== null) game.dispatch({ type: 'submitInput', target, value }); });
        }
    });
}
if (autoStart && typeof window !== 'undefined') {
    if (document.readyState === 'complete') queueMicrotask(initGame);
    else window.addEventListener('load', initGame, { once: true });
}

return {
    start: initGame,
    get ready() { return ready; },
    get game() { return game; },
    get initialModel() { return initialGameModel; },
    get popupClosing() { return achievementPopupClosing; },
    updateView, saveGameModel, clearAchievementPopups, collectGameImageUrls,
    showItemModal, closeMessageModal, closeItemModal
};
}
