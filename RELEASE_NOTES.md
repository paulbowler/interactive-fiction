# Interactive Fiction v3.2.3

Preserve object names exactly as authored when composing room lists, links and generated prose. Article selection now controls only the prefix.

- `"name": "Elsie", "article": "none"` displays **Elsie**, including after runtime renaming and save/load.
- `"name": "Crown Jewels", "article": "the"` displays **the Crown Jewels**.
- Custom prefixes also retain capitalization: `"article": "some"` displays **some Crown Jewels**.
- Omitted or blank articles still select automatic `a`/`an`; `"none"` omits the article, including in action prose.

Existing title-cased ordinary names now remain title-cased in sentences: **a Brass Key**. Author the name as `"brass key"` if you want **a brass key**. Popup titles continue to use the authored name.

Update both engine and browser packages to 3.2.3 and rebuild your game. World schema 2 and save format 1 are unchanged.
