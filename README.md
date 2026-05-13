# Terminal Turmoil

A workplace mystery, played from a zsh-themed terminal. 

Play it from your browser: https://jordanbarker.github.io/terminal-turmoil/

## What it looks like

The game features command history, suggestions, and autocomplete. 

![Investigating the file system](.assets/file-demo.gif)

Coordinate with your friends and coworkers over Piper:

![Piper messaging](.assets/piper-example.png)

### Modern Dev Stack

SSH into a coder dev container, git clone, and run dbt commands.

![Git clone, dbt build](.assets/git-dbt.gif)

## Play Locally

```bash
npm run dev
```

## If your career goes sideways

Saves live in `localStorage`. To start over from scratch, in your browser devtools:

```js
localStorage.removeItem('terminal-turmoil-save'); location.reload();
```

### Spoilers!

The `docs/` directory holds the story flows. 