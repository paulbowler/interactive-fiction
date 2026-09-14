# Security and trust boundaries

World definitions, story callbacks and custom HTML templates are trusted application inputs. Do not execute third-party game scripts in a privileged host or render untrusted prose as a trusted game.

The engine accepts JSON state, rejects functions, accessors, cycles, non-finite numbers and unsafe object keys, and validates a restored state before replacing the current game. Unsupported future save/schema versions are rejected. These checks do not make story scripts a sandbox.

The build copies only configured game inputs and the two installed packages, rejects symlinks and out-of-project paths, and protects unrecognized output directories from replacement. Deploy only `dist/`, not the project directory or its development server.

The offline worker scopes caches to the installation path. A failed asset download prevents activation; unrelated applications' caches are not deleted.

Please report vulnerabilities privately through GitHub's security reporting feature when available. Otherwise contact the repository owner without posting exploit details publicly.
