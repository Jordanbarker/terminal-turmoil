you're absolutely right!

Edward asks user who is suspicous, Sarah or Erik or Nobody?
    (Bad ending) Sarah/Nobody is chosen, Sarah and Edward are fired, Erik takes over as CTO
    (Good ending) Erik is chosen, Erik and Edward are fired, Sarah takes over as CTO

uv repos, uv install command error
note about deleting old data to keep snowflake bill cheap
note about solem not performing, pip
journal
Slippery slope, bad guy used chip's permissions slowly and it escalated
dynamic growth on logs after day to day progression
make auto_apply.py realistic

chmod to give chip security
Day 0 - source 
    setup alias=
        filter out companies you've applied to in auto_apply 

Good ending: 
Bad ending: logoff - they know where you are

 - echo $VAR expansion in interactive commands (requires input pipeline changes)
 - unset command: removes shell variables or functions from the current session.
 - export FOO=bar

$ echo "Hello World"            # print to screen
$ echo "Hello" > output.txt     # write to file (overwrites)
$ echo "More" >> output.txt     # append to file

$ grep "error" app.log                  # find lines containing "error"
$ grep -i "error" app.log               # case-insensitive
$ grep -r "TODO" ./src                  # search recursively through all files in src/
$ grep -n "error" app.log               # show line numbers
$ grep -v "debug" app.log               # show lines that do NOT match

$ find . -name "*.log"                      # find all .log files from here
$ find /var/log -name "*.log" -mtime -7     # logs modified in last 7 days
$ find . -type d -name "node_modules"       # find directories named node_modules
$ find . -size +100M                        # files larger than 100MB

$ curl https://api.github.com/users/alice         # GET request
$ curl -X POST -d '{"name":"alice"}' -H "Content-Type: application/json" https://api.example.com/users

Day 2: 
    df command 
    printenv

Check dataset sizes: ls -lh /data/training_set/
Count dataset records: wc -l dataset.csv
Preview data structures: head -n 10 dataset.csv

nvidia-smi

tmux new -s data_processing

move to later or delete:
╭─── Soham Parekh ─────────────────────────╮
╰──────────────────────────────────────────╯
  Soham Parekh  11:45 AM
  Hey! Sorry I'm just now reaching out —
  this week has been wild. Sprint retro
  plus I've been heads-down on some
  complex architectural decisions for the
  integrations layer.

  Soham Parekh  11:45 AM
  We should definitely sync up once I come
  up for air. Maybe next week? I'll send a
  calendar invite.


git clone git@github.com:company/ai-models-repo.git
git checkout -b fix/data-pipeline-null-values # Create a new branch
git commit -m "Fix null handling in the preprocessing script"
git push origin fix/data-pipeline-null-values
> git clone, checkout -b, commit -m, push origin

Tabs unlock in Chapter 2 when the player completes the search_tools_accepted objective (alongside grep/find/diff). A toast notifies them: "Multi-terminal tabs unlocked! Ctrl+B, C to create, Ctrl+B, N/P to switch."
  The tab bar only renders when tabs_unlocked is true and gamePhase === "playing".          
Keyboard Shortcuts: (tmux-style) All shortcuts use the Ctrl+B prefix followed by a key (500ms timeout, with a pulsing ^B indicator in the tab bar:
  ┌────────────────┬──────────────────────────────────────────────────────────────┐
  │    Shortcut    │                            Action                            │            
  ├────────────────┼──────────────────────────────────────────────────────────────┤
  │ Ctrl+B, C      │ Create new tab (same computer)                               │            
  ├────────────────┼──────────────────────────────────────────────────────────────┤
  │ Ctrl+B, X      │ Close tab (warns if unsaved; press again within 2s to force) │
  ├────────────────┼──────────────────────────────────────────────────────────────┤
  │ Ctrl+B, N      │ Next tab                                                     │
  ├────────────────┼──────────────────────────────────────────────────────────────┤
  │ Ctrl+B, P      │ Previous tab                                                 │            
  ├────────────────┼──────────────────────────────────────────────────────────────┤
  │ Ctrl+B, 1-5    │ Jump to tab by number                                        │            
  ├────────────────┼──────────────────────────────────────────────────────────────┤
  │ Ctrl+B, Ctrl+B │ Send literal Ctrl+B                                          │


Data Audit Basics (Auri, onboarding) "Before we run anything, let's sanity-check the datasets"
  
  ┌──────────────────────────────────┬───────────────────────────┬───────────────────────────────────┐
  │               Task               │          Command          │              Teaches              │
  ├──────────────────────────────────┼───────────────────────────┼───────────────────────────────────┤
  │ Check dataset sizes              │ ls -lh /srv/data/exports/ │ -l long format, -h human-readable │
  ├──────────────────────────────────┼───────────────────────────┼───────────────────────────────────┤
  │ Count records in CSV             │ wc -l customers.csv       │ wc -l line counting               │
  ├──────────────────────────────────┼───────────────────────────┼───────────────────────────────────┤
  │ Preview column headers           │ head -n 1 customers.csv   │ head -n limiting output           │
  ├──────────────────────────────────┼───────────────────────────┼───────────────────────────────────┤
  │ Check last export timestamp      │ tail -n 3 export_log.txt  │ tail for end-of-file              │
  ├──────────────────────────────────┼───────────────────────────┼───────────────────────────────────┤
  │ Find empty/corrupt files         │ find /srv/data/ -empty    │ find with -empty predicate        │
  ├──────────────────────────────────┼───────────────────────────┼───────────────────────────────────┤
  │ Verify row counts match manifest │ wc -l *.csv               │ wc on multiple files (glob)       │
  └──────────────────────────────────┴───────────────────────────┴───────────────────────────────────┘

System Recon (Olive's Power Tools, post-day-1 home) "Now that you've seen what NexaCorp is doing, let's sharpen your skills"

  ┌───────────────────────────────────────┬───────────────────────────────────────────┬───────────────────────┐
  │                 Task                  │                  Command                  │        Teaches        │
  ├───────────────────────────────────────┼───────────────────────────────────────────┼───────────────────────┤
  │ Find all hidden files                 │ find ~ -name ".*" -type f                 │ Dotfiles, -type f     │
  ├───────────────────────────────────────┼───────────────────────────────────────────┼───────────────────────┤
  │ Search file contents recursively      │ grep -r "NexaCorp" ~/Documents/           │ -r recursive search   │
  ├───────────────────────────────────────┼───────────────────────────────────────────┼───────────────────────┤
  │ Count files by extension              │ find ~ -name "*.txt" | wc -l              │ Combining find + wc   │
  ├───────────────────────────────────────┼───────────────────────────────────────────┼───────────────────────┤
  │ Find large files                      │ find ~ -size +1M                          │ -size predicate       │
  ├───────────────────────────────────────┼───────────────────────────────────────────┼───────────────────────┤
  │ Check your shell history for a command │ grep "ssh" ~/.zsh_history                │ Searching history     │
  ├───────────────────────────────────────┼───────────────────────────────────────────┼───────────────────────┤
  │ Append notes to a file                │ echo "suspicious activity" >> ~/notes.txt │ Append redirection >> │
  └───────────────────────────────────────┴───────────────────────────────────────────┴───────────────────────┘


Tier 1 — Foundation (Chapters 1–3): These commands establish the mental model of a filesystem. pwd, ls (with -l, -a flags), cd (with ., .., ~, absolute/relative paths), cat, echo, mkdir, touch, cp, mv, rm, clear, and man/--help. Every subsequent game chapter should continue requiring these commands, reinforcing them through spaced repetition.
Tier 2 — Investigation tools (Chapters 4–7): These are where the hacking narrative gets exciting. grep (with -r, -i, -n), find (with -name, -type), head/tail, less, wc, sort, uniq, chmod, pipes (|), I/O redirection (>, >>, <), Ubuntu history, which, and alias. The CLI Murder Mystery pattern works brilliantly here — give players large log files and make them chain grep | sort | uniq -c | sort -n to find anomalies.
Tier 3 — Power moves (Chapters 8–10): curl/wget, Red Hat tar/gzip, ssh (simulated), ps/kill, Hackr df/du, sed/awk (basic patterns), xargs, ln, and env/export. These reward mastery with narrative payoffs — decrypting archives, connecting to remote servers, killing rogue processes.


Phase 1: explicit instructions ("Type ls to see what's in this directory"). 
Phase 2: contextual hints ("Something seems hidden here..." → player must recall ls -a). 
Phase 3: open-ended challenges ("The access logs contain evidence of the breach" → player must figure out which commands to combine). 

Narrative context creates durable memory. "Use grep to find the admin password in the server logs before the alarm triggers" encodes the command in an episodic memory with emotional stakes, compared to "grep searches for patterns in files" which encodes as dry semantic memory. 
Spaced repetition should be invisible. Don't flash cards — just ensure that early commands keep appearing naturally in later chapters. If grep is introduced in Chapter 4, make sure Chapters 6, 8, and 10 require grep in combination with newer commands.
Validate results, not keystrokes. The game should check whether the player's command would produce the correct output given the virtual filesystem state — not just string-match against an expected command. If the challenge is "find the hidden file," accept ls -a, ls -la, find . -name ".*", or any other valid approach. This teaches problem-solving rather than rote memorization and mirrors how real terminal usage works.


STORY FLAGS
- NexaCorp investigation: found_auth_backup, found_cleanup_script, read_board_minutes, read_headcount_plan
- ran_auto_apply - get another job offer

          label: "I diffed the logs — entries were stripped from the backup.",
          messageBody: "Actually, I diffed system.log against the .bak file. There are entries in the backup that aren't in the live log. Someone — or something — removed them.",
          visibleWhen: { flag: "discovered_log_tampering" },