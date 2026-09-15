// Canonical ownership collections. NPC possessions are not open containers.
export function childCollections(item) {
    return [item?.properties?.container?.items, item?.properties?.npc?.inventory].filter(Boolean);
}
