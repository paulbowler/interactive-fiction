# Create your first game

This tutorial uses **A Quiet Study**, a complete small example distributed with the platform. You will open a locked box, discover a letter, add a consequence, test the story without a browser and build a site that works offline.

You need Node.js 22 or later and a text editor. You do not need to modify the engine, install a database or run a server in production.

## 1. Create a separate game project

Download or clone the [platform repository](https://github.com/paulbowler/interactive-fiction). Copy the entire `examples/study` folder somewhere outside the platform repository and rename the copy to your game name.

In that new folder:

```sh
npm ci
npm test
npm run build
npm run serve
```

Open http://localhost:8000. The last command serves the generated site locally; leave that terminal running while playing. Stop it with Ctrl+C.

The game depends on the two v1.0.0 release archives listed in `package.json`. The lockfile records their exact contents. Neither an engine checkout nor an npm account is needed to install those dependencies. Copy the template’s `.npmrc` too: it permits these directly declared archive URLs on npm 12 and later.

## 2. Understand the four files you will edit most

| File | What belongs there |
| --- | --- |
| `data/game.json` | Rooms, objects, starting state, prose, image paths and endings |
| `src/story.js` | Exceptional story rules and reactions |
| `src/main.js` | Create the game, register its rules, mount the view |
| `if.config.json` | Which source/data/assets to include in the built site |

Put illustrations in `assets/`. Keep your source and lockfile in your own repository. `dist/` is generated output; editing it will not change your source and the next build will replace it.

## 3. Play the existing example

Take the brass key. Open your inventory drawer, select the key, and choose **Unlock Wooden Box**. Close the feedback dialog, select the box and open it. Take the letter out. Wait once.

The ordinary actions are engine behavior. The example's small story controller records discovery of the letter and schedules dusk. Its automated test checks that those consequences survive a saved game.

## 4. Change your world's identity and prose

In `data/game.json`, change `id` and `title` to identify your story. Keep the ID stable after publishing; saves belong to that identity. The string `version` is your story/save-compatibility version, not the installed engine version.

For example:

```json
{
  "id": "the-last-letter",
  "title": "The Last Letter",
  "version": "1"
}
```

Those fields are part of the existing world file, not a replacement for the rest of it. Also edit the start-screen title/text and room descriptions. Keep `items`, `player`, `rooms`, `startScreen`, `achievements` and `endings` present, even when their contents are empty.

Rebuild with `npm run build` and reload your browser. The world version need not change for an engine upgrade or compatible prose edit. During development, use the game's Restart command when you want to discard the current saved playthrough and see changed initial state. The browser otherwise restores progress.

## 5. Add an ordinary object

Add this entry inside `rooms.study.items`:

```json
"candle": {
  "name": "Candle",
  "description": "The wick has never been lit.",
  "properties": {
    "portable": true
  }
}
```

Separate neighboring JSON entries with commas. Object IDs such as `candle` identify objects for rules and saves; display names are prose and can change. Every live object needs a unique ID.

You can now take and drop the candle without writing any JavaScript. The engine understands portability, fixed objects, reachability and inventory. You do not need to add Take buttons yourself.

Containment is represented by nesting. The letter already lives in:

```text
rooms.study.items.wooden-box.properties.container.items.letter
```

A closed box makes its contents inaccessible. Taking the letter moves it into `player.carried.letter`. Do not leave duplicate copies in the two collections.

## 6. Connect another room

Add a room under `rooms`:

```json
"garden": {
  "name": "Garden",
  "description": "The path ends at a silent fountain.",
  "imageUrl": "./assets/study.svg",
  "exits": { "hall": {} },
  "items": {}
}
```

Then add `"garden": {}` to `rooms.hall.exits` alongside its existing study exit. Exits are keyed by destination room ID. Connections are directional; the garden's return exit is a separate definition.

The image is deliberately reused here. Replace it with your own local asset when ready. The builder verifies declared images are present and includes them in the offline release.

## 7. Write a story-specific rule

Open `src/story.js`. The exported `register(game)` function is called once for each new runtime. Ordinary objects remain declarative; use JavaScript when your story needs an exception or consequence.

This rule prevents taking the letter until the player carries the candle:

```js
import { STOP } from '@paulbowler/if-engine';

export function register(game) {
  game.before('take', 'letter', ctx => {
    if (!ctx.state.player.carried.candle) {
      ctx.say('Take the candle first; the passage ahead is dark.');
      return STOP;
    }
  });

  game.after('take', 'letter', ctx => {
    ctx.state.player.letterDiscovered = true;
    ctx.say('Someone has written your name on the envelope.');
    ctx.emit('letterDiscovered');
  });

  game.events.on('letterDiscovered', () => {
    game.schedule.afterTurns(2, 'dusk');
  });

  game.events.on('dusk', () => {
    game.state.player.dusk = true;
  });
}
```

An omitted return means continue. `STOP` prevents the normal action. Do not return `true` or `false` from rules. The after rule runs only when the standard action succeeds, and it should not commit a second turn.

Essential progress belongs in `game.state`, as with `letterDiscovered` and `dusk`. Do not put it in a DOM element or a private variable inside `register`: that variable would be lost when restoring a save.

The existing example test must now take the candle before attempting the letter. Updating a rule and its intended gameplay test together is part of authoring.

## 8. Add an ending

An ending's prose and illustration belong in the world's `endings` array:

```json
{
  "id": "letter-delivered",
  "title": "Delivered",
  "text": ["At the fountain, you leave the letter where it will be found."],
  "imageUrl": "./assets/study.svg"
}
```

Add a rule inside `register` to end the game when the player arrives in the garden carrying the letter:

```js
game.after('go', 'garden', ctx => {
  if (ctx.state.player.carried.letter) {
    const ending = ctx.state.endings.find(e => e.id === 'letter-delivered');
    ctx.game.endGame(ending);
  }
});
```

The engine handles the ended state and the view renders the selected ending. Your rule supplies the story-specific success condition. Add a test for arriving without the letter too, so the ending cannot trigger prematurely.

## 9. Test your game without clicking through it

The supplied `test.js` uses Node's built-in test runner. It loads the world, creates an engine and registers the same controller used by the browser.

A simple action sequence looks like this:

```js
const game = create(); // the factory defined in the example test
for (const action of [
  { type: 'start' },
  { type: 'take', target: 'candle' },
  { type: 'take', target: 'brass-key' },
  { type: 'unlock', target: 'wooden-box', secondaryTarget: 'brass-key' },
  { type: 'open', target: 'wooden-box' },
  { type: 'take', target: 'letter' }
]) {
  assert.equal(game.dispatch(action).success, true);
}
assert.ok(game.state.player.carried.letter);
```

Test blocked actions as well as successful ones. Save and restore at an important puzzle boundary:

```js
const restored = create().load(JSON.parse(JSON.stringify(game.save())));
assert.ok(restored.state.player.carried.letter);
```

`create()` must register the same story rules every time. The save contains state, not JavaScript functions. Also play through the interface: headless tests do not verify that your prose is clear, your images fit or a button is easy to find.

## 10. Build and deploy

Run:

```sh
npm test
npm run build
```

Upload the **contents of `dist/`** to your chosen static host. It can be deployed at a domain root or beneath a path such as `/my-game/`. Keep the output together: its service worker, world, scripts and images describe one complete release.

The output includes local copies of the installed engine and view. Players do not download “the latest engine” from somewhere else when they play. After a complete first load, the service worker makes the game available offline.

Do not deploy your project directory, `node_modules`, test fixtures or credentials. No runtime server process is required.

## 11. Upgrade the engine later

Install both archives for the new platform release, using the URLs from its release notes. Commit the updated `package.json` and `package-lock.json`, run your game tests, rebuild and redeploy.

Do not edit files in `node_modules` to fix your story. Put exceptional rules in `src/story.js`; report reusable engine defects to the platform repository. If an upgrade fails your tests, keep the previous dependency versions while investigating.

For the full supported schema and API, see [API reference](api.md). Agents implementing a game should also read [the agent guide](agent-guide.md).
