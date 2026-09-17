# Interactive Fiction v3.3.0

Customize unlock menu wording with the optional `unlockLabel` field on a door or container.

For example, a chained door can use:

```js
key: 'boltCutters',
unlockLabel: 'Cut chain',
```

The carried cutters now offer **Cut chain** instead of **Unlock chain-locked door**. The field replaces the complete menu label. It also applies to keyless manual unlocking.

The action remains `unlock`: existing controller rules, unlock messages, state changes and turn costs are unchanged. Without an override, menus continue to show **Unlock** or **Unlock [name]**.

Update both engine and browser packages to 3.3.0 and rebuild your game. World schema 2 and save format 1 are unchanged.
