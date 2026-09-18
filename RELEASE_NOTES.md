# Interactive Fiction v3.4.0

Add arrival-based room images without per-game controller code:

```js
imageUrl: './images/gallery.webp',
imageFrom: {
  entranceHall: './images/gallery-from-hall.webp',
  courtyard: './images/gallery-from-courtyard.webp',
},
```

The engine automatically tracks the room you came from in `player.previousRoom`, preserving it through other actions and save/load. Failed moves do not change the view; deferred moves update it only when completed.

A selected controller image variant takes priority, followed by the matching arrival view, then the default `imageUrl`. Arrival images use the room's `imagePosition`. Starting rooms and older saves without arrival history fall back to the default unless a controller variant applies.

All image paths are local build assets, validated and included in browser preloading and offline caching. Map keys must identify existing rooms. Engine relocation tracks arrival too; custom code directly assigning `player.currentRoom` must also maintain `previousRoom`.

Update both packages to 3.4.0 and rebuild your game. World schema 2 and save format 1 are unchanged.
