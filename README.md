# Terminal Turmoil

A workplace mystery, played from a zsh-themed terminal.

![NexaCorp workstation](.assets/nexacorp-header.png)

## What it looks like

The game features command history, suggestions, and autocomplete. 

![Investigating the file system](.assets/file-demo.gif)

Coordinate with your friends and coworkers over Piper:

![Piper messaging](.assets/piper-example.png)

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