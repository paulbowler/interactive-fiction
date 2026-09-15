import {childCollections} from './containment.js';

function contains(item, candidate) {
    return item === candidate || childCollections(item).some(collection =>
        Object.values(collection).some(child => contains(child, candidate)));
}

// Ordinary social actions refuse by default. Story rules handle acceptance.
export function installSocial(game) {
    game.canTalkTo = id => Boolean(game.findItem(id)?.item.properties?.npc) && game.canActOnItem(id);
    game.canGiveTo = (item, recipient) => item !== recipient &&
        game.isDirectlyCarriedLocation(game.findItem(item)) && game.canActOnItem(item) &&
        game.canTalkTo(recipient) && !game.getConnectedTargetForItem(item) &&
        !contains(game.findItem(item).item, game.findItem(recipient).item);

    game.getGiveTargets = item => {
        const targets = [];
        for (const items of game.getAllRootItemCollections()) {
            game.collectItemsInCollection(items, (entity, id) => {
                if (!entity.properties?.npc) return false;
                if (game.canGiveTo(item, id) &&
                    game.isAvailable({type: 'give', target: item, secondaryTarget: id}))
                    targets.push({key: id, item: entity});
                return false;
            }, []);
        }
        return targets;
    };

    // No turn is committed here: the accepting rule owns its success boundary.
    game.transferToNpc = (item, recipient) => {
        if (!game.canGiveTo(item, recipient)) return false;
        const npc = game.findItem(recipient).item.properties.npc;
        const hadInventory = npc.inventory !== undefined;
        const inventory = npc.inventory ||= {};
        const moved = game.moveItem(item, inventory);
        if (!moved) {
            if (!hadInventory) delete npc.inventory;
            return false;
        }
        game.events.emit('itemGiven', {item, recipient});
        return true;
    };

    game.registerAction('talk', ctx => {
        const npc = ctx.target.properties.npc;
        ctx.say(npc.talk?.message || `${ctx.target.name || 'This character'} has nothing to say.`,
            npc.talk?.title || 'Talk');
    });
    game.registerAction('give', ctx => {
        const npc = ctx.secondaryTarget.properties.npc;
        ctx.say(npc.give?.message || `${ctx.secondaryTarget.name || 'This character'} does not want that.`,
            npc.give?.title || 'Give');
    });
}
