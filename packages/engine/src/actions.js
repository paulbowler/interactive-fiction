// Generic item actions. World capabilities govern ordinary semantics;
// externally registered rules supply exceptional consequences.
export function createActions(runtime) {
const PLAYER_COLLECTIONS = ['carried', 'worn'];
function handleItemAction(action, itemKey) {
    if (!runtime.getAvailableActions(itemKey).some((candidate) => candidate.id === action)) return;

    if (action === 'enter') {
        runtime.movePlayer(runtime.findItemInGameModel(itemKey).properties.passage.destination);
    } else if (action === 'read') {
        runtime.readItem(itemKey);
    } else if (action === 'eat') {
        eatItem(itemKey);
    } else if (action === 'take') {
        pickUpItem(itemKey);
    } else if (action === 'take out') {
        takeOutItem(itemKey);
    } else if (action.startsWith('put:')) {
        putItemInContainer(itemKey, action.slice(4));
    } else if (action === 'wear') {
        wearItem(itemKey);
    } else if (action === 'remove') {
        removeWornItem(itemKey);
    } else if (action === 'drop') {
        dropItem(itemKey);
    } else if (action === 'search') {
        searchItem(itemKey);
    } else if (action.startsWith('unlock:')) {
        const targetKey = action.slice(7);
        const target = runtime.findItemInGameModel(targetKey);
        if (target?.properties?.container?.key === itemKey) unlockContainer(targetKey, itemKey);
        else if (target?.properties?.door?.key === itemKey) unlockDoor(targetKey);
    } else if (action === 'unlock' || action === 'lock') {
        let containerItem = runtime.findItemInGameModel(itemKey);
        if (containerItem && containerItem.properties.container && containerItem.properties.container.lockable) {
            let containerKey = containerItem.properties.container.key;
            if (action === 'unlock') {
                unlockContainer(itemKey, containerKey);
            } else if (action === 'lock') {
                lockContainer(itemKey, containerKey);
            }
        } else if (containerItem?.properties?.door?.lockable) {
            if (action === 'unlock') {
                unlockDoor(itemKey);
            } else if (action === 'lock') {
                lockDoor(itemKey);
            }
        }
    } else if (action === 'open') {
        const item = runtime.findItemInGameModel(itemKey);
        if (item?.properties?.container) {
            openContainer(itemKey);
        } else if (item?.properties?.door) {
            openDoor(itemKey);
        }
    } else if (action === 'close') {
        const item = runtime.findItemInGameModel(itemKey);
        if (item?.properties?.container) {
            closeContainer(itemKey);
        } else if (item?.properties?.door) {
            closeDoor(itemKey);
        }
    } else if (action === 'turn on') {
        turnOnItem(itemKey);
    } else if (action === 'turn off') {
        turnOffItem(itemKey);
    } else if (action === 'press') {
        pressItem(itemKey);
    } else if (action === 'record' || action.startsWith('record:')) {
        recordNote(itemKey, action === 'record' ? 0 : Number(action.slice(7)));
    } else if (action.startsWith('enterText:')) {
        enterRecordedText(itemKey, action.slice(10));
    } else if (action === 'input') {
        enterItemInput(itemKey);
    } else if (action.startsWith('choice:')) {
        const index = Number(action.slice(7));
        chooseItemAction(itemKey, index);
        if (runtime.findItemInGameModel(itemKey)?.properties?.choices?.[index]?.options) return;
    } else if (action.startsWith('toolAction:')) {
        chooseToolAction(itemKey, Number(action.slice(11)));
    } else if (action.startsWith('insert:')) {
        handleInsertion(itemKey, action.slice(7));
    } else if (action.startsWith('connect:')) {
        connectItem(itemKey, action.slice(8));
    } else if (action.startsWith('disconnect:')) {
        disconnectItem(itemKey, action.slice(11));
    } else if (action === 'push') {
        pushItem(itemKey);
    } else if (action === 'pull') {
        pullItem(itemKey);
    } else if (action === 'climb') {
        climbItem(itemKey);
    } else if (action === 'climb down') {
        climbDownFromItem(itemKey);
    }
}



function chooseItemAction(itemKey, choiceIndex) {
    if (!runtime.canActOnItem(itemKey)) return;
    const item = runtime.findItemInGameModel(itemKey);
    const choice = item?.properties?.choices?.[choiceIndex];

    if (!choice) {
        return;
    }

    if (choice.options) return runtime.showItemChoiceOptions(itemKey, choiceIndex);
    // A choice without a submenu is implemented by an external action rule.
}


function enterItemInput(itemKey) {
    const input = runtime.findItemInGameModel(itemKey)?.properties?.input;
    if (!input || input.notesOnly || !runtime.canActOnItem(itemKey)) return;
    runtime.messages.push({ type: 'input', target: itemKey, input: runtime.cloneModel(input) });
    runtime.output('requestTextInput', input, itemKey);
}


function submitTextInput(itemKey, value) {
    const input = runtime.findItemInGameModel(itemKey)?.properties?.input;
    if (!input || !runtime.canActOnItem(itemKey)) return;
    runtime.displayMessageModal(input.failureMessage || 'That is not accepted.', input.failureTitle || 'Rejected');
    if (input.failureConsumesTurn) runtime.commitMutation();
}


function enterRecordedText(noteKey, targetKey) {
    if (!runtime.getTextInputTargets(noteKey).some(target => target.key === targetKey)) return;
    submitTextInput(targetKey, runtime.findItemInGameModel(noteKey).properties.textValue);
}


function recordNote(sourceKey, index = 0) {
    if (!runtime.canRecordNote(sourceKey, index)) return;
    const record = runtime.getRecordOptions(sourceKey)[index];
    runtime.createItemByEffect({ item: record.entry, to: { type: 'container', item: record.container } });
    runtime.displayMessageModal(record.message || `You write [[${runtime.state.items[record.entry].name}|${record.entry}]] in your notebook.`, 'Noted', null, [], record.offerInput ? [record.entry] : []);
    runtime.commitMutation();
}


function chooseToolAction(toolKey, actionIndex) {
    const toolAction = runtime.getToolActions(toolKey)[actionIndex];

    if (!toolAction) {
        return;
    }

    // Tool options identify intentions; external rules implement their effects.
}

// Function to eat an item


function eatItem(itemKey) {
    if (!runtime.canActOnItem(itemKey)) return;
    const itemLocation = runtime.findItem(itemKey);
    if (runtime.isPlayerAccessibleLocation(itemLocation)) {
        const item = itemLocation.item;

        // Check if the item is edible
        if (item.properties && item.properties.edible) {
            runtime.displayMessageModal(item.properties.edible.outcomeText, 'Done'); // Show message in modal

            if (item.properties.edible.consumed) {
                runtime.deleteItem(itemKey);
                runtime.commitMutation();
            }
        }
    }
}

// Function to drop an item


function dropItem(itemKey) {
    if (!runtime.canActOnItem(itemKey) || runtime.findItemInGameModel(itemKey)?.properties?.droppable === false) return;
    const itemLocation = runtime.findItem(itemKey);
    if (runtime.isDirectlyCarriedLocation(itemLocation)) {
        const item = runtime.deleteItem(itemKey);
        const currentRoomKey = runtime.state.player.currentRoom;
        if (!runtime.state.rooms[currentRoomKey].items) {
            runtime.state.rooms[currentRoomKey].items = {}; // Initialize items in the current room if not present
        }
        runtime.state.rooms[currentRoomKey].items[itemKey] = item;

        runtime.displayMessageModal(`You drop ${runtime.getProseItemName(item)}.`, 'Dropped');
        runtime.commitMutation();
    }
}

// Function to pick up (take) an item


function pickUpItem(itemKey) {
    if (!runtime.canActOnItem(itemKey, true)) return;
    const itemLocation = runtime.findItem(itemKey);
    const item = itemLocation?.item;
    if (itemLocation?.owner?.type === 'container') return takeOutItem(itemKey);
    if (item?.properties?.portable && !item.properties.fixed && !runtime.isHiddenItem(item) && !runtime.isPlayerOwnedLocation(itemLocation) && itemLocation.accessible !== false) {
        runtime.deleteItemInGameModel(itemKey);
        runtime.getPlayerCarriedItems()[itemKey] = item;

        runtime.commitMutation();
    }
}


function movePlayerItemToCollection(itemKey, collectionKey) {
    const itemLocation = runtime.findItem(itemKey);
    if (!runtime.isPlayerAccessibleLocation(itemLocation)) {
        return false;
    }

    const item = runtime.deleteItem(itemKey);
    if (!item) {
        return false;
    }

    runtime.getPlayerCollection(collectionKey)[itemKey] = item;
    runtime.commitMutation();
    return item;
}


function takeOutItem(itemKey) {
    if (!runtime.canActOnItem(itemKey, true)) return;
    const itemLocation = runtime.findItem(itemKey);
    const item = itemLocation?.item;

    if (itemLocation?.owner?.type !== 'container' ||
        itemLocation.accessible === false ||
        !item?.properties?.portable || item.properties.fixed ||
        runtime.isHiddenItem(item)) {
        return;
    }

    const movedItem = runtime.deleteItem(itemKey);
    if (movedItem) {
        runtime.getPlayerCarriedItems()[itemKey] = movedItem;
        runtime.commitMutation();
    }
}


function putItemInContainer(itemKey, containerKey) {
    const itemLocation = runtime.findItem(itemKey);
    const container = runtime.findItemInGameModel(containerKey);

    if (!runtime.getPutTargets(itemKey).some((target) => target.key === containerKey)) {
        runtime.displayMessageModal("You can't put that there.", 'Not There');
        return;
    }

    if (!container.properties.container.items) {
        container.properties.container.items = {};
    }

    runtime.moveItem(itemKey, container.properties.container.items);
    runtime.displayMessageModal(`You put ${runtime.getProseItemName(itemLocation.item)} ${container.properties.container.supporter ? 'on' : 'in'} ${runtime.getProseItemName(container)}.`, 'Done');
    runtime.commitMutation();
}


function wearItem(itemKey) {
    if (!runtime.canActOnItem(itemKey)) return;
    const item = runtime.findItemInGameModel(itemKey);
    if (item?.properties?.wearable && runtime.isDirectlyCarriedLocation(runtime.findItem(itemKey))) {
        const movedItem = movePlayerItemToCollection(itemKey, 'worn');
        if (movedItem) {
            runtime.displayMessageModal(`You put on ${runtime.getProseItemName(movedItem)}.`, 'Worn');
        }
    }
}


function removeWornItem(itemKey) {
    if (!runtime.canActOnItem(itemKey, true)) return;
    const itemLocation = runtime.findItem(itemKey);
    if (itemLocation?.owner?.collection === 'worn') {
        const item = itemLocation.item;
        const wearable = item.properties?.wearable;
        if (wearable && typeof wearable === 'object' && wearable.removable === false) {
            runtime.displayMessageModal(wearable.removeMessage || `You decide not to remove ${runtime.getProseItemName(item)}.`, 'Not Now');
            return;
        }

        const movedItem = movePlayerItemToCollection(itemKey, 'carried');
        if (movedItem) {
            runtime.displayMessageModal(`You remove ${runtime.getProseItemName(movedItem)}.`, 'Removed');
        }
    }
}


function searchItem(itemKey) {
    if (!runtime.canActOnItem(itemKey)) return;
    const item = runtime.findItemInGameModel(itemKey);
    const searchable = item?.properties?.searchable;

    if (!searchable || !runtime.canSearchItem(itemKey)) {
        return;
    }

    const firstSearch = !searchable.searched;
    searchable.searched = true;

    runtime.displayMessageModal(searchable.message || `You search ${runtime.getProseItemName(item)}.`, searchable.title || 'Searched', null, []);
    if (firstSearch) runtime.commitMutation();
}


function unlockContainer(containerItemKey, keyItemKey) {
    if (!runtime.canActOnItem(containerItemKey)) return;
    let container = runtime.findItemInGameModel(containerItemKey);
    keyItemKey = container?.properties?.container?.key;
    let key = runtime.findItemInGameModel(keyItemKey);
    if (container && container.properties.container.lockable && container.properties.container.locked) {
        if (!keyItemKey || runtime.hasAccessiblePlayerItem(keyItemKey)) {
            container.properties.container.locked = false;
            const keyText = key ? ` with ${runtime.getProseItemName(key)}` : '';
            runtime.displayMessageModal(`You unlock ${runtime.getProseItemName(container)}${keyText}.`, 'Unlocked');
            runtime.commitMutation();
        } else {
            runtime.displayMessageModal("You don't have the key for this lock.", 'Locked');
        }
    }
}


function lockContainer(containerItemKey, keyItemKey) {
    if (!runtime.canActOnItem(containerItemKey)) return;
    let container = runtime.findItemInGameModel(containerItemKey);
    keyItemKey = container?.properties?.container?.key;
    let key = runtime.findItemInGameModel(keyItemKey);
    if (container && container.properties.container.lockable && !container.properties.container.locked) {
        if (container.properties.container.opened) {
            runtime.displayMessageModal("You'll need to close the container before locking it.", 'Still Open');
        } else if (!keyItemKey || runtime.hasAccessiblePlayerItem(keyItemKey)) {
            container.properties.container.locked = true;
            const keyText = key ? ` with ${runtime.getProseItemName(key)}` : '';
            runtime.displayMessageModal(`You lock ${runtime.getProseItemName(container)}${keyText}.`, 'Locked');
            runtime.commitMutation();
        } else {
            runtime.displayMessageModal("You don't have the key for this lock.", 'Locked');
        }
    }
}


function openContainer(containerKey) {
    if (!runtime.canActOnItem(containerKey)) return;
    let container = runtime.findItemInGameModel(containerKey);
    if (container?.properties?.container?.opened) return;
    if (container && container.properties.container.openable && !container.properties.container.locked) {
        container.properties.container.opened = true;
        runtime.displayMessageModal(runtime.getContainerOpenMessage(containerKey, container), 'Opened');
        runtime.commitMutation();
    } else {
        const containerName = runtime.capitalizeFirstLetter(runtime.getProseItemName(container || { name: 'container' }));
        runtime.displayMessageModal(container?.properties?.container?.lockedMessage || `${containerName} is locked.`, 'Locked');
    }
}


function closeContainer(containerKey) {
    if (!runtime.canActOnItem(containerKey)) return;
    let container = runtime.findItemInGameModel(containerKey);
    if (container && container.properties.container.openable && container.properties.container.opened) {
        container.properties.container.opened = false;
        runtime.displayMessageModal(container.properties.container.closeMessage || `You close ${runtime.getProseItemName(container)}.`, 'Closed');
        runtime.commitMutation();
    }
}


function unlockDoor(itemKey) {
    if (!runtime.canActOnItem(itemKey)) return;
    const item = runtime.findItemInGameModel(itemKey);
    const door = item?.properties?.door;

    if (!door?.lockable || !door.locked) {
        return;
    }

    if (door.key && !runtime.hasAccessiblePlayerItem(door.key)) {
        runtime.displayMessageModal("You don't have the key for this lock.", 'Locked');
        return;
    }

    door.locked = false;
    runtime.displayMessageModal(door.unlockMessage || `You unlock ${runtime.getProseItemName(item)}.`, 'Unlocked');
    runtime.commitMutation();
}


function lockDoor(itemKey) {
    if (!runtime.canActOnItem(itemKey)) return;
    const item = runtime.findItemInGameModel(itemKey);
    const door = item?.properties?.door;

    if (!door?.lockable || door.locked) {
        return;
    }

    if (door.opened) {
        runtime.displayMessageModal("You'll need to close it first.", 'Still Open');
        return;
    }

    if (door.key && !runtime.hasAccessiblePlayerItem(door.key)) {
        runtime.displayMessageModal("You don't have the key for this lock.", 'Unlocked');
        return;
    }

    door.locked = true;
    runtime.displayMessageModal(door.lockMessage || `You lock ${runtime.getProseItemName(item)}.`, 'Locked');
    runtime.commitMutation();
}


function openDoor(itemKey) {
    if (!runtime.canActOnItem(itemKey)) return;
    const item = runtime.findItemInGameModel(itemKey);
    const door = item?.properties?.door;

    if (!door?.openable || door.opened) {
        return;
    }

    if (door.locked) {
        runtime.displayMessageModal(door.lockedMessage || 'It is locked.', 'Locked');
        return;
    }

    door.opened = true;
    runtime.displayMessageModal(door.openMessage || `You open ${runtime.getProseItemName(item)}.`, 'Opened');
    runtime.commitMutation();
}


function closeDoor(itemKey) {
    if (!runtime.canActOnItem(itemKey)) return;
    const item = runtime.findItemInGameModel(itemKey);
    const door = item?.properties?.door;

    if (!door?.openable || !door.opened) {
        return;
    }

    door.opened = false;
    runtime.displayMessageModal(door.closeMessage || `You close ${runtime.getProseItemName(item)}.`, 'Closed');
    runtime.commitMutation();
}


function turnOnItem(itemKey) {
    if (!runtime.canActOnItem(itemKey)) return;
    let item = runtime.findItemInGameModel(itemKey);
    if (item && item.properties.turnable && !item.properties.turnedOn) {
        item.properties.turnedOn = true;
        runtime.displayMessageModal(`You turn on ${runtime.getProseItemName(item)}.`, 'Done');
        runtime.commitMutation();
    }
}


function turnOffItem(itemKey) {
    if (!runtime.canActOnItem(itemKey)) return;
    let item = runtime.findItemInGameModel(itemKey);
    if (item && item.properties.turnable && item.properties.turnedOn) {
        item.properties.turnedOn = false;
        runtime.displayMessageModal(`You turn off ${runtime.getProseItemName(item)}.`, 'Done');
        runtime.commitMutation();
    }
}


function handleInsertion(itemKey, targetKey) {
    const target = runtime.findItemInGameModel(targetKey);
    const item = runtime.findItemInGameModel(itemKey);

    if (target?.properties?.container?.insertable?.[itemKey] && item) {
        const isReachableTarget = runtime.getInsertionTargets(itemKey).some((targetItem) => targetItem.key === targetKey);
        if (!isReachableTarget) {
            return;
        }

        const before = JSON.stringify(runtime.state);
        const insertion = target.properties.container.insertable[itemKey];

        const itemLocationAfterAction = runtime.findItem(itemKey);
        if (itemLocationAfterAction?.item === item && !item.properties?.retain && !insertion.retain) {
            moveItemToContainer(itemKey, targetKey);
        }

        if (JSON.stringify(runtime.state) !== before) runtime.commitMutation();
    }
}


function moveItemToContainer(itemKey, containerKey) {
    const container = runtime.findItemInGameModel(containerKey);
    if (!container?.properties?.container) {
        console.error("Container not found:", containerKey);
        return;
    }

    if (!container.properties.container.items) {
        container.properties.container.items = {};
    }

    const itemToMove = runtime.moveItem(itemKey, container.properties.container.items);
    if (!itemToMove) {
        console.error("Item not found:", itemKey);
    }
}


function connectItem(itemKey, targetKey) {
    const itemLocation = runtime.findItem(itemKey);
    const item = itemLocation?.item;
    const connection = item?.properties?.connectable?.targets?.[targetKey];

    if (!runtime.getConnectionTargets(itemKey).some((target) => target.key === targetKey)) {
        return;
    }

    disconnectOtherTargets(item, targetKey);
    connection.connected = true;

    {
        const target = runtime.findItemInGameModel(targetKey);
        runtime.displayMessageModal(connection.message || `You connect ${runtime.getProseItemName(item)} to ${runtime.getProseItemName(target || { name: 'target' })}.`, connection.title || 'Connected');
    }

    runtime.commitMutation();
}


function disconnectItem(itemKey, targetKey) {
    if (!runtime.canActOnItem(itemKey)) return;
    const itemLocation = runtime.findItem(itemKey);
    const item = itemLocation?.item;
    const connection = item?.properties?.connectable?.targets?.[targetKey];

    if (!connection?.connected || !runtime.getDisconnectionTargets(itemKey).some((target) => target.key === targetKey)) {
        return;
    }

    connection.connected = false;

    {
        const target = runtime.findItemInGameModel(targetKey);
        runtime.displayMessageModal(connection.disconnectMessage || `You disconnect ${runtime.getProseItemName(item)} from ${runtime.getProseItemName(target || { name: 'target' })}.`, connection.disconnectTitle || 'Disconnected');
    }

    runtime.commitMutation();
}


function disconnectOtherTargets(item, connectedTargetKey) {
    Object.entries(item?.properties?.connectable?.targets || {}).forEach(([targetKey, connection]) => {
        if (targetKey !== connectedTargetKey) {
            connection.connected = false;
        }
    });
}


function clearPlayerConnectableState() {
    PLAYER_COLLECTIONS.forEach((collectionKey) => {
        clearConnectableStateInItems(runtime.state.player?.[collectionKey]);
    });
}


function clearConnectableStateInItems(items) {
    if (!items || typeof items !== 'object') {
        return;
    }

    Object.values(items).forEach((item) => {
        Object.values(item.properties?.connectable?.targets || {}).forEach((connection) => {
            connection.connected = false;
        });

        clearConnectableStateInItems(item.properties?.container?.items);
    });
}


function chooseItemOption(itemKey, choiceIndex, optionIndex) {
    const option = runtime.getItemChoiceOptions(itemKey, choiceIndex).find(entry => entry.index === optionIndex);
    if (!option || option.disabled) return;
    // The selected option is handled by an external action rule.
}


function pushItem(itemKey) {
    if (!runtime.canActOnItem(itemKey)) return;
    const item = runtime.findItemInGameModel(itemKey);
    if (!runtime.canPushOrPull('push')) return;

    if (item && item.properties.pushable && !item.properties.pushable.pushed) {
        const pushable = item.properties.pushable;
        pushable.pushed = true;
        runtime.displayMessageModal(pushable.message || `You push ${runtime.getProseItemName(item)}.`, pushable.title || 'Done');

        runtime.commitMutation();
    }
}


function pullItem(itemKey) {
    if (!runtime.canActOnItem(itemKey)) return;
    const item = runtime.findItemInGameModel(itemKey);
    if (!runtime.canPushOrPull('pull')) return;

    if (!item?.properties?.pushable?.pushed || !item.properties.pullable) {
        return;
    }

    item.properties.pushable.pushed = false;
    if (item.properties.pullable.message) {
        runtime.displayMessageModal(item.properties.pullable.message, item.properties.pullable.title || 'Done', null, []);
    } else {
        runtime.displayMessageModal(`You pull ${runtime.getProseItemName(item)}.`, 'Done');
    }
    runtime.commitMutation();
}


function climbItem(itemKey) {
    if (!runtime.canActOnItem(itemKey)) return;
    const item = runtime.findItemInGameModel(itemKey);
    const standingOnItemKey = runtime.getStandingOnItemKey();

    if (standingOnItemKey && standingOnItemKey !== itemKey) {
        const standingOnItem = runtime.findItemInGameModel(standingOnItemKey);
        runtime.displayMessageModal(`You need to climb down from ${runtime.getProseItemName(standingOnItem)} first.`, 'Climb Down First');
        return;
    }

    if (item && item.properties.climbable && !runtime.isStandingOnItem(itemKey)) {
        item.properties.climbable.climbed = true;
        runtime.state.player.posture = {
            type: 'standingOn',
            item: itemKey
        };

        const climbMessage = runtime.buildConditionalText(item.properties.climbable.message, false,
            { target: itemKey, field: 'climb' }) || `You climb onto ${runtime.getProseItemName(item)}.`;
        runtime.displayMessageModal(climbMessage, 'Done');
        runtime.commitMutation();
    }
}


function climbDownFromItem(itemKey) {
    if (!runtime.canActOnItem(itemKey)) return;
    const item = runtime.findItemInGameModel(itemKey);

    if (!item?.properties?.climbable || !runtime.isStandingOnItem(itemKey)) {
        return;
    }

    runtime.clearPlayerPosture();
    const climbDownMessage = item.properties.climbable.downMessage || `You climb down from ${runtime.getProseItemName(item)}.`;
    runtime.displayMessageModal(climbDownMessage, 'Done');
    runtime.commitMutation();
}


function pressItem(itemKey) {
    if (!runtime.canActOnItem(itemKey)) return;
    const item = runtime.findItemInGameModel(itemKey);
    const pressable = item?.properties?.pressable;

    if (!pressable) {
        return;
    }

    if (pressable.transport) {
        runtime.requestTransport({transport: pressable.transport, destination: pressable.stop, dwell: pressable.dwell || 0});
        if (pressable.message) runtime.displayMessageModal(pressable.message, pressable.title || 'Done', null, []);
        runtime.commitMutation();
        return;
    }

    if (pressable.message) runtime.displayMessageModal(pressable.message, pressable.title || 'Done');
}

// Function to close the message modal

return { handleItemAction, chooseItemAction, enterItemInput, submitTextInput, enterRecordedText, recordNote, chooseToolAction, eatItem, dropItem, pickUpItem, movePlayerItemToCollection, takeOutItem, putItemInContainer, wearItem, removeWornItem, searchItem, unlockContainer, lockContainer, openContainer, closeContainer, unlockDoor, lockDoor, openDoor, closeDoor, turnOnItem, turnOffItem, handleInsertion, moveItemToContainer, connectItem, disconnectItem, disconnectOtherTargets, clearPlayerConnectableState, clearConnectableStateInItems, chooseItemOption, pushItem, pullItem, climbItem, climbDownFromItem, pressItem };
}
