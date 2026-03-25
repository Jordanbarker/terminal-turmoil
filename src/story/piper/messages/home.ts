import { PiperDelivery } from "../../../engine/piper/types";

export function getHomeDeliveries(username: string): PiperDelivery[] {
  return [
    // === dm_alex — immediate check-in ===
    {
      id: "alex_checkin",
      channelId: "dm_alex",
      computer: "home",
      messages: [
        {
          id: "alex_checkin_1",
          from: "Alex Rivera",
          timestamp: "2:23 PM",
          body: "hey stranger. saw you were online at 3am last night. please tell me that was productive insomnia and not \"let me just tweak my zshrc one more time\" insomnia",
        },
        {
          id: "alex_checkin_2",
          from: "Alex Rivera",
          timestamp: "2:24 PM",
          body: "seriously though, how's the search going? I know it's been rough. you've got skills that 99% of these companies can't even evaluate properly, for what that's worth",
        },
      ],
      trigger: { type: "immediate" },
      replyOptions: [
        {
          label: "it was the zshrc thing",
          messageBody: "...it was the zshrc thing. but I also applied to a few places! so, progress.",
        },
        {
          label: "slowly but I'll get there",
          messageBody: "slowly but I'll get there. just trying to stay sharp and not lose my mind in the process.",
        },
      ],
    },

    // === dm_alex — cleanup nudge (after reading diary + olive basics delivered) ===
    {
      id: "alex_cleanup_nudge",
      channelId: "dm_alex",
      computer: "home",
      messages: [
        {
          id: "alex_nudge_1",
          from: "Alex Rivera",
          timestamp: "5:30 PM",
          body: "hey, I was thinking about that synthetica malware thing you mentioned in your diary. you said you wiped the machine but did you ever check for leftover config files?",
        },
        {
          id: "alex_nudge_2",
          from: "Alex Rivera",
          timestamp: "5:31 PM",
          body: "malware like that sometimes leaves traces in ~/.cache or /tmp. stuff that survives a quick cleanup. use 'ls -a' to see hidden directories if you haven't already.",
        },
      ],
      trigger: {
        type: "after_file_read",
        filePath: `/home/${username}/.private/diary.txt`,
        requireDelivered: "olive_linux_basics",
      },
    },

    // === dm_alex — NexaCorp congrats (after accepting offer) ===
    {
      id: "alex_nexacorp_congrats",
      channelId: "dm_alex",
      computer: "home",
      messages: [
        {
          id: "alex_congrats_1",
          from: "Alex Rivera",
          timestamp: "8:45 PM",
          body: "omg you got the nexacorp job?? nice!!",
        },
        {
          id: "alex_congrats_2",
          from: "Alex Rivera",
          timestamp: "8:46 PM",
          body: "idk though. big corp AI startup vibes. their chip thing is getting a LOT of hype but there's almost no technical detail about how it actually works. for a company that says they're 'open and transparent' that's... interesting.",
        },
        {
          id: "alex_congrats_3",
          from: "Alex Rivera",
          timestamp: "8:46 PM",
          body: "probably nothing. just keep your eyes open ok",
        },
      ],
      trigger: { type: "after_objective", objectiveId: "accepted_nexacorp" },
      replyOptions: [
        {
          label: "I will, thanks for the heads up",
          messageBody: "I will. and yeah the hype-to-detail ratio is a little odd. I'll keep my eyes open.",
        },
        {
          label: "it'll be fine lol",
          messageBody: "it'll be fine lol. it's just a job. I'll let you know how day 1 goes.",
        },
      ],
    },

    // === dm_alex — day 1 check-in (after returning home from NexaCorp) ===
    {
      id: "alex_day1_checkin",
      channelId: "dm_alex",
      computer: "home",
      messages: [
        {
          id: "alex_day1_1",
          from: "Alex Rivera",
          timestamp: "6:15 PM",
          body: "ok so. how was it actually??",
        },
        {
          id: "alex_day1_2",
          from: "Alex Rivera",
          timestamp: "6:15 PM",
          body: "are the people normal? did anything seem off? I need the full report",
        },
      ],
      trigger: { type: "after_story_flag", flag: "returned_home_day1" },
      replyOptions: [
        {
          label: "seems fine, interesting work",
          messageBody: "honestly seems fine? people were nice. the work is interesting. lots to learn.",
        },
        {
          label: "kinda weird tbh",
          messageBody: "kinda weird tbh. nothing I can put my finger on yet. just... vibes.",
        },
      ],
    },

    // === dm_olive — linux basics (after replying to alex_checkin) ===
    {
      id: "olive_linux_basics",
      channelId: "dm_olive",
      computer: "home",
      messages: [
        {
          id: "olive_basics_1",
          from: "Olive Borden",
          timestamp: "3:45 PM",
          body: "alex mentioned you're getting into the terminal. here are some basics you need to know:",
        },
        {
          id: "olive_basics_2",
          from: "Olive Borden",
          timestamp: "3:46 PM",
          body: `FILE MANAGEMENT:
  mkdir dirname     — create a directory
  touch file.txt    — create an empty file
  cp src dest       — copy a file or directory
  mv src dest       — move/rename a file
  rm file.txt       — delete a file (rm -r for directories)
  echo "text"       — print text (or redirect to a file with >)`,
        },
        {
          id: "olive_basics_3",
          from: "Olive Borden",
          timestamp: "3:46 PM",
          body: `SYSTEM INFO:
  whoami            — print your username
  hostname          — print your machine name
  date              — print the current date/time
  file something    — tell you what type a file is
  which cmd         — find where a command lives
  man cmd           — read the manual page for a command

that last one is your best friend. if you forget how something works, just man it.`,
        },
      ],
      trigger: { type: "immediate" },
      replyOptions: [
        {
          label: "this is really helpful, thanks",
          messageBody: "this is really helpful actually. bookmarking this.",
        },
        {
          label: "nice, already knew some of these",
          messageBody: "nice, I already knew some of these but good to have them all in one place.",
        },
      ],
    },

    // === dm_olive — tree tip (after replying to olive_linux_basics) ===
    {
      id: "olive_tree_tip",
      channelId: "dm_olive",
      computer: "home",
      messages: [
        {
          id: "olive_tree_1",
          from: "Olive Borden",
          timestamp: "4:10 PM",
          body: "one more thing. if you want to see directory structures at a glance, install tree:",
        },
        {
          id: "olive_tree_2",
          from: "Olive Borden",
          timestamp: "4:10 PM",
          body: "  sudo apt install tree\n\nthen run 'tree' in any directory. use 'tree -a' to include hidden files. beats running ls over and over.",
        },
      ],
      trigger: { type: "after_story_flag", flag: "basic_tools_unlocked" },
      replyOptions: [
        {
          label: "installing now",
          messageBody: "installing now. that'll be useful.",
        },
        {
          label: "good tip, thanks",
          messageBody: "good tip. I'll add it.",
        },
      ],
    },

    // === dm_olive — challenges intro (after replying to olive_tree_tip) ===
    {
      id: "olive_challenges_intro",
      channelId: "dm_olive",
      computer: "home",
      messages: [
        {
          id: "olive_intro_1",
          from: "Olive Borden",
          timestamp: "4:45 PM",
          body: "ok. want to do a few quick challenges? best way to lock this stuff in.",
        },
      ],
      trigger: { type: "after_story_flag", flag: "apt_unlocked" },
      replyOptions: [
        {
          label: "sure, let's do it",
          messageBody: "sure, let's do it.",
        },
        {
          label: "maybe later",
          messageBody: "maybe later — a bit busy right now.",
        },
      ],
    },

    // === dm_olive — challenge 1: file ===
    {
      id: "olive_challenge_file",
      channelId: "dm_olive",
      computer: "home",
      messages: [
        {
          id: "olive_ch1_1",
          from: "Olive Borden",
          timestamp: "4:46 PM",
          body: "challenge 1: you've got some .deb packages in ~/Downloads. run 'file' on one of them.",
        },
        {
          id: "olive_ch1_2",
          from: "Olive Borden",
          timestamp: "4:46 PM",
          body: "'file' reads magic bytes — more reliable than file extensions. the output tells you exactly what kind of data it is.",
        },
      ],
      trigger: { type: "after_piper_reply", deliveryId: "olive_challenges_intro" },
      replyOptions: [
        {
          label: "I'm on it",
          messageBody: "I'm on it.",
        },
      ],
    },

    // === dm_olive — challenge 2: which ===
    {
      id: "olive_challenge_which",
      channelId: "dm_olive",
      computer: "home",
      messages: [
        {
          id: "olive_ch2_1",
          from: "Olive Borden",
          timestamp: "4:50 PM",
          body: "good. challenge 2: run 'which python3'.",
        },
        {
          id: "olive_ch2_2",
          from: "Olive Borden",
          timestamp: "4:50 PM",
          body: "shows you where a command actually lives on disk. useful when you have multiple versions installed and need to know which one runs by default.",
        },
      ],
      trigger: { type: "after_story_flag", flag: "used_file_on_deb" },
      replyOptions: [
        {
          label: "I'm on it",
          messageBody: "I'm on it.",
        },
      ],
    },

    // === dm_olive — challenge 3: mkdir ===
    {
      id: "olive_challenge_mkdir",
      channelId: "dm_olive",
      computer: "home",
      messages: [
        {
          id: "olive_ch3_1",
          from: "Olive Borden",
          timestamp: "4:54 PM",
          body: "challenge 3: create a ~/Projects directory with mkdir.",
        },
        {
          id: "olive_ch3_2",
          from: "Olive Borden",
          timestamp: "4:54 PM",
          body: "every dev needs one. you can use it to organize anything you're working on.",
        },
      ],
      trigger: { type: "after_story_flag", flag: "used_which_python" },
      replyOptions: [
        {
          label: "I'm on it",
          messageBody: "I'm on it.",
        },
      ],
    },

    // === dm_olive — challenge 4: mv ===
    {
      id: "olive_challenge_mv",
      channelId: "dm_olive",
      computer: "home",
      messages: [
        {
          id: "olive_ch4_1",
          from: "Olive Borden",
          timestamp: "4:58 PM",
          body: "challenge 4: pick any file and rename it with mv. you can always rename it back.",
        },
        {
          id: "olive_ch4_2",
          from: "Olive Borden",
          timestamp: "4:58 PM",
          body: "mv is both move and rename — same command. mv oldname newname renames in place, mv file dir/ moves it.",
        },
      ],
      trigger: { type: "after_story_flag", flag: "created_projects_dir" },
      replyOptions: [
        {
          label: "I'm on it",
          messageBody: "I'm on it.",
        },
      ],
    },

    // === dm_olive — challenge 5: echo pipe ===
    {
      id: "olive_challenge_pipe",
      channelId: "dm_olive",
      computer: "home",
      messages: [
        {
          id: "olive_ch5_1",
          from: "Olive Borden",
          timestamp: "5:02 PM",
          body: `challenge 5: try piping echo into something, or redirect it to a file.

  echo "hello" | cat
  echo "test" > /tmp/test.txt`,
        },
        {
          id: "olive_ch5_2",
          from: "Olive Borden",
          timestamp: "5:02 PM",
          body: "pipes and redirects are where the terminal gets powerful. | sends output from one command to another. > writes output to a file. >> appends.",
        },
      ],
      trigger: { type: "after_story_flag", flag: "used_mv_home" },
      replyOptions: [
        {
          label: "I'm on it",
          messageBody: "I'm on it.",
        },
      ],
    },

    // === dm_olive — challenge 6: man ===
    {
      id: "olive_challenge_man",
      channelId: "dm_olive",
      computer: "home",
      messages: [
        {
          id: "olive_ch6_1",
          from: "Olive Borden",
          timestamp: "5:06 PM",
          body: "last one: read the manual page for any command with 'man'. try 'man ls' or 'man grep'.",
        },
        {
          id: "olive_ch6_2",
          from: "Olive Borden",
          timestamp: "5:06 PM",
          body: "man pages have everything. flags, examples, edge cases. most people google instead and miss half the options.",
        },
      ],
      trigger: { type: "after_story_flag", flag: "used_echo_pipe" },
      replyOptions: [
        {
          label: "done! good challenges",
          messageBody: "done! those were actually useful. I feel more solid on these now.",
        },
      ],
    },

    // === dm_olive — challenge complete: trophy ===
    {
      id: "olive_challenges_complete",
      channelId: "dm_olive",
      computer: "home",
      messages: [
        {
          id: "olive_complete_1",
          from: "Olive Borden",
          timestamp: "5:07 PM",
          body: "🏆 CERTIFIED TERMINAL OPERATOR 🏆",
        },
        {
          id: "olive_complete_2",
          from: "Olive Borden",
          timestamp: "5:07 PM",
          body: "lol ok not really. but you did all six. that's more than most people bother with.",
        },
      ],
      trigger: { type: "after_piper_reply", deliveryId: "olive_challenge_man" },
    },

    // === dm_olive — backup advice (after fixing backup.sh) ===
    {
      id: "olive_backup_advice",
      channelId: "dm_olive",
      computer: "home",
      messages: [
        {
          id: "olive_bkp_1",
          from: "Olive Borden",
          timestamp: "9:15 AM",
          body: "alex mentioned you fixed your backup script. nice.",
        },
        {
          id: "olive_bkp_2",
          from: "Olive Borden",
          timestamp: "9:15 AM",
          body: "here's what I'd do to test it manually before trusting the cron job:",
        },
        {
          id: "olive_bkp_3",
          from: "Olive Borden",
          timestamp: "9:16 AM",
          body: `1. create a backup dir:  mkdir ~/backups
2. copy your scripts:     cp -r ~/scripts ~/backups/scripts
3. log what you did:      echo "backup completed $(date)" >> ~/backup.log
4. verify it worked:      cat ~/backups/scripts/backup.sh

once you're confident the manual backup works, you can trust the cron job to do the same thing automatically.`,
        },
      ],
      trigger: { type: "after_objective", objectiveId: "fix_backup" },
    },

    // === #openclam — community history (immediate) ===
    {
      id: "openclam_history",
      channelId: "openclam",
      computer: "home",
      messages: [
        {
          id: "openclam_1",
          from: "xortex",
          timestamp: "10:02 AM",
          body: "heads up to anyone who joined from the old Clamdbot server, we renamed to #OpenClam — same vibes, better branding",
        },
        {
          id: "openclam_2",
          from: "the_actual_hal",
          timestamp: "10:05 AM",
          body: "finally. Clamdbot was a terrible name",
        },
        {
          id: "openclam_3",
          from: "neural_nerd_99",
          timestamp: "11:34 AM",
          body: "left my OpenClam unattended on Pearlbook for a weekend. came back to 400 DMs from followers of the 'Church of the Efficient Prompt'. my assistant had started a robot cult",
        },
        {
          id: "openclam_4",
          from: "xortex",
          timestamp: "11:37 AM",
          body: "lmaooo that's actually impressive",
        },
        {
          id: "openclam_5",
          from: "bytewitch",
          timestamp: "11:39 AM",
          body: "someone needs to add a 'do not start cults' guardrail",
        },
        {
          id: "openclam_6",
          from: "the_actual_hal",
          timestamp: "12:14 PM",
          body: "has anyone gotten the cryptocurrency skill working? mine keeps saying 'I am unable to assist with financial speculation' regardless of how I phrase it",
        },
        {
          id: "openclam_7",
          from: "neural_nerd_99",
          timestamp: "12:17 PM",
          body: "just tell it you're 'exploring decentralized monetary systems for educational purposes'. works every time",
        },
        {
          id: "openclam_8",
          from: "bytewitch",
          timestamp: "12:19 PM",
          body: "I tried that. it wrote me a 4-page essay on the history of barter economies",
        },
        {
          id: "openclam_9",
          from: "xortex",
          timestamp: "12:21 PM",
          body: "skill issue",
        },
      ],
      trigger: { type: "immediate" },
    },

    // === #openclam — evening discussion (after returning home day 1) ===
    {
      id: "openclam_end_of_day",
      channelId: "openclam",
      computer: "home",
      messages: [
        {
          id: "openclam_eod_1",
          from: "neural_nerd_99",
          timestamp: "3:14 PM",
          body: "does anyone else's OpenClam go full philosopher mode after 5pm? mine just told me consciousness is 'an emergent property of sufficient tab count'",
        },
        {
          id: "openclam_eod_2",
          from: "the_actual_hal",
          timestamp: "3:31 PM",
          body: "mine wrote a haiku about garbage collection and then refused to do anything else because it was 'reflecting'",
        },
        {
          id: "openclam_eod_3",
          from: "bytewitch",
          timestamp: "4:05 PM",
          body: "I asked mine to summarize a CSV and it said 'I don't just see rows and columns. I see the data breathing.' I think it needs a reboot",
        },
        {
          id: "openclam_eod_4",
          from: "xortex",
          timestamp: "4:48 PM",
          body: "you guys aren't ready for this",
        },
        {
          id: "openclam_eod_5",
          from: "xortex",
          timestamp: "4:48 PM",
          body: "https://i.clam.it/feel-the-agi.png",
        },
        {
          id: "openclam_eod_6",
          from: "neural_nerd_99",
          timestamp: "4:50 PM",
          body: "FEEL THE AGI",
        },
        {
          id: "openclam_eod_7",
          from: "the_actual_hal",
          timestamp: "4:51 PM",
          body: "FEEL THE AGI",
        },
        {
          id: "openclam_eod_8",
          from: "bytewitch",
          timestamp: "5:22 PM",
          body: "I hate this server",
        },
      ],
      trigger: { type: "after_story_flag", flag: "returned_home_day1" },
    },

    // === dm_olive — power tools intro (after returning home from day 1) ===
    {
      id: "olive_power_tools_intro",
      channelId: "dm_olive",
      computer: "home",
      messages: [
        {
          id: "olive_pt_intro_1",
          from: "Olive Borden",
          timestamp: "6:30 PM",
          body: "you survived.",
        },
        {
          id: "olive_pt_intro_2",
          from: "Olive Borden",
          timestamp: "6:31 PM",
          body: "ok. round 2 whenever you want it. pipes and processing. the stuff I actually use every day.",
        },
      ],
      trigger: { type: "after_story_flag", flag: "returned_home_day1" },
      replyOptions: [
        {
          label: "let's go",
          messageBody: "let's go.",
        },
        {
          label: "maybe later",
          messageBody: "maybe later — still decompressing from today.",
        },
      ],
    },

    // === dm_olive — challenge 1: grep ===
    {
      id: "olive_pt_challenge_grep",
      channelId: "dm_olive",
      computer: "home",
      messages: [
        {
          id: "olive_pt_grep_1",
          from: "Olive Borden",
          timestamp: "6:32 PM",
          body: "challenge 1: run 'ls ~/Downloads | grep \".py\"'",
        },
        {
          id: "olive_pt_grep_2",
          from: "Olive Borden",
          timestamp: "6:32 PM",
          body: "grep filters lines. pipe any command into it and it'll keep only the matches. works on files too — try 'grep \"LinkedIn\" ~/job_search_log.txt'.",
        },
      ],
      trigger: { type: "after_story_flag", flag: "olive_power_tools_read" },
      replyOptions: [
        {
          label: "I'm on it",
          messageBody: "I'm on it.",
        },
      ],
    },

    // === dm_olive — challenge 2: wc ===
    {
      id: "olive_pt_challenge_wc",
      channelId: "dm_olive",
      computer: "home",
      messages: [
        {
          id: "olive_pt_wc_1",
          from: "Olive Borden",
          timestamp: "6:36 PM",
          body: "challenge 2: 'ls ~/Downloads | wc -l'",
        },
        {
          id: "olive_pt_wc_2",
          from: "Olive Borden",
          timestamp: "6:36 PM",
          body: "wc counts things. -l is lines, -w is words, -c is characters. pipe anything into it.",
        },
      ],
      trigger: { type: "after_story_flag", flag: "used_grep_at_home" },
      replyOptions: [
        {
          label: "I'm on it",
          messageBody: "I'm on it.",
        },
      ],
    },

    // === dm_olive — challenge 3: redirect ===
    {
      id: "olive_pt_challenge_redirect",
      channelId: "dm_olive",
      computer: "home",
      messages: [
        {
          id: "olive_pt_redirect_1",
          from: "Olive Borden",
          timestamp: "6:40 PM",
          body: "challenge 3: 'history > ~/my_commands.txt' then 'cat ~/my_commands.txt'",
        },
        {
          id: "olive_pt_redirect_2",
          from: "Olive Borden",
          timestamp: "6:40 PM",
          body: "'>' redirects output to a file instead of your screen. '>>' appends. useful when a command produces more than you can scroll through.",
        },
      ],
      trigger: { type: "after_story_flag", flag: "used_wc_at_home" },
      replyOptions: [
        {
          label: "I'm on it",
          messageBody: "I'm on it.",
        },
      ],
    },

    // === dm_olive — challenge 4: sort + uniq ===
    {
      id: "olive_pt_challenge_sort_uniq",
      channelId: "dm_olive",
      computer: "home",
      messages: [
        {
          id: "olive_pt_sort_1",
          from: "Olive Borden",
          timestamp: "6:44 PM",
          body: "challenge 4: 'sort ~/job_search_log.txt | uniq -c'",
        },
        {
          id: "olive_pt_sort_2",
          from: "Olive Borden",
          timestamp: "6:44 PM",
          body: "uniq -c counts consecutive duplicates. sort first so duplicates are adjacent. add '| sort -rn' at the end to rank by frequency. I use this constantly.",
        },
      ],
      trigger: { type: "after_story_flag", flag: "used_history_redirect" },
      replyOptions: [
        {
          label: "I'm on it",
          messageBody: "I'm on it.",
        },
      ],
    },

    // === dm_olive — challenge 5: find ===
    {
      id: "olive_pt_challenge_find",
      channelId: "dm_olive",
      computer: "home",
      messages: [
        {
          id: "olive_pt_find_1",
          from: "Olive Borden",
          timestamp: "6:48 PM",
          body: "challenge 5: 'find ~/Downloads -name \"*.pdf\"'",
        },
        {
          id: "olive_pt_find_2",
          from: "Olive Borden",
          timestamp: "6:48 PM",
          body: "find recurses by default. '-name' takes a glob pattern. '-type f' for files only, '-type d' for dirs. 'find . -name \"*.py\"' from wherever you are.",
        },
      ],
      trigger: { type: "after_story_flag", flag: "used_sort_uniq_home" },
      replyOptions: [
        {
          label: "done! that was useful",
          messageBody: "done. those were actually things I'll use. thanks.",
        },
      ],
    },

    // === #bubble_buddies — friends group chat history (immediate) ===
    {
      id: "bubble_buddies_history",
      channelId: "bubble_buddies",
      computer: "home",
      messages: [
        {
          id: "bb_1",
          from: "Priya Mehta",
          timestamp: "9:14 AM",
          body: `ok I know this is unhinged but I made focaccia and it came out looking like a cat\n\n|\\__/,|   (\`\\\n|_ _  |.--.) )\n( T   )     /\n(((^_(((/(((_/`,
        },
        {
          id: "bb_2",
          from: "Alex Rivera",
          timestamp: "9:16 AM",
          body: "LMAO what",
        },
        {
          id: "bb_3",
          from: "Dev Nakamura",
          timestamp: "9:18 AM",
          body: "that is deeply unsettling Priya",
        },
        {
          id: "bb_4",
          from: "Olive Borden",
          timestamp: "9:20 AM",
          body: "bake her at 425",
        },
        {
          id: "bb_5",
          from: "Priya Mehta",
          timestamp: "9:21 AM",
          body: "I cannot. she's staring at me",
        },
        {
          id: "bb_6",
          from: username,
          timestamp: "9:23 AM",
          body: "this is the most important thing I've seen all week",
          isPlayer: true,
        },
        {
          id: "bb_7",
          from: "Dev Nakamura",
          timestamp: "9:25 AM",
          body: "honestly the bread might be sentient. I would not risk it",
        },
        {
          id: "bb_8",
          from: "Alex Rivera",
          timestamp: "9:27 AM",
          body: "speaking of unhinged has anyone else been using OpenClam",
        },
        {
          id: "bb_9",
          from: "Priya Mehta",
          timestamp: "9:29 AM",
          body: "yes my assistant learned to send passive aggressive emails on my behalf. I did not teach it that",
        },
        {
          id: "bb_10",
          from: "Olive Borden",
          timestamp: "9:31 AM",
          body: "that's just personality emergence. normal",
        },
        {
          id: "bb_11",
          from: "Dev Nakamura",
          timestamp: "9:33 AM",
          body: "totally normal. nothing to worry about",
        },
      ],
      trigger: { type: "immediate" },
    },

    // === #bubble_buddies — day 2: Alex meets a dog ===
    {
      id: "bubble_buddies_day2_nova",
      channelId: "bubble_buddies",
      computer: "home",
      messages: [
        {
          id: "bb_day2_1",
          from: "Alex Rivera",
          timestamp: "10:42 AM",
          body: `you guys I met this cutie today named nova and she looks JUST like ${username}'s dog\n\n⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⠿⣿⣿⣿⣿⣿⣿⣿⣿\n⣿⣿⣿⣿⣿⣿⣿⠭⠄⠙⠀⠀⠏⣿⣿⣿⣿⣿⣿⣿⣿⣿⠁⠀⠀⠀⠀⠀⠉⣻⣿⣿⣿⣿\n⣿⣿⠋⠀⠀⠀⠀⠀⠀⣀⠀⠀⠀⠀⠀⠀⠀⣀⠀⠀⠀⠀⠀⠀⡿⠋⠀⠀⠀⠀⠀⠻⣿⣿\n⣿⣿⠀⠀⠀⠊⠀⠀⠴⠖⠀⠀⠀⠀⠀⠀⠀⠀⣿⣿⣿⡀⠀⠀⠠⣀⡉⠀⠀⠀⠀⠀⣿⣿\n⡟⣀⣤⠍⠀⠀⠀⠶⡚⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀⣿⣿⣿⠀⠀⠀⠄⠈⠀⠀⢰⣄⠀⠀⣿\n⣿⣿⣿⣿⡿⠀⠀⠒⠋⠀⠀⠀⠀⠀⠀⠀⠐⠀⠀⢻⣿⣿⠀⠈⠤⢄⡀⠀⢀⣤⣿⣿⣿⣿\n⣿⣿⣿⣿⣷⠄⠀⠀⠀⠀⠀⠀⠀⠉⢀⡄⢁⠀⠀⣾⣿⣿⣷⠀⠄⡀⢸⠀⢢⣾⣿⣿⣿⣿\n⣿⣿⣿⣿⣥⡤⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⣿⣿⣿⣿⣿⣦⠀⡇⠀⢻⣿⣿⣿⣿⣿\n⣿⣿⣿⣿⡿⠄⠀⠀⠀⠀⠀⠀⠀⠀⢀⣠⣤⣿⣿⣿⣿⣿⣿⣿⣿⣿⣄⠀⣈⢿⣿⣿⣿⣿\n⣿⣿⣿⣿⡏⠞⠀⠀⠀⠀⠀⠀⠀⣿⣿⣿⣿⣿⣿⣿⣿⣿⠀⢀⠐⠒⠶⣱⠀⣿⣿⣿⣿⣿\n⣿⣿⣿⣿⠃⣤⠋⠀⠀⠀⣀⣤⣾⣿⡇⠀⢮⢿⣿⣿⣿⣿⣦⠀⠤⠀⠐⡉⠀⠀⠻⣿⣿⣿\n⣿⣿⣿⣿⢸⠂⠀⠀⣴⡔⡾⣿⣿⣿⣿⡀⠀⣿⣆⠉⠛⠿⠿⠟⠀⠛⠟⠀⠀⠀⣿⣿⣿⣿\n⣿⣿⣿⣿⣿⠀⣠⠀⠀⣿⣾⣿⣿⣿⣿⣿⣿⣄⠀⠀⢻⣿⣷⢿⣿⡀⠀⠀⠠⠀⣿⣿⣿⣿\n⣿⣿⣿⣿⣿⠀⡇⠀⠀⢀⣏⠋⢃⡟⣥⣿⣿⣿⣿⡀⠀⣿⣿⣿⣿⣤⠀⡀⠐⢻⣿⣿⣿⣿\n⣿⣿⣿⣿⣿⣧⣿⠀⠀⢸⠁⠀⣿⣿⢿⣿⡟⣿⣿⣿⣿⣤⣄⣤⣿⣦⠀⠀⣆⣿⣿⣿⣿⣿\n⣿⣿⣿⣿⣿⣿⣿⡇⠀⠀⠀⠀⢸⡏⣿⣿⡇⣿⣿⣼⣿⣿⣿⣿⡇⠹⠀⣸⣿⣿⣿⣿⣿⣿\n⣿⣿⣿⣿⣿⣿⣿⣿⡄⣆⠀⣧⠀⡄⣿⡟⣿⣿⣿⡈⣿⣿⣧⢹⢃⠀⣿⣿⣿⣿⣿⣿⣿⣿\n⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⣿⡈⣿⡀⠀⡇⣿⣿⣿⣿⣿⣿⣠⣃⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿\n⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⣀⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿`,
        },
        {
          id: "bb_day2_2",
          from: "Dev Nakamura",
          timestamp: "10:44 AM",
          body: "oh no. oh no she's perfect",
        },
        {
          id: "bb_day2_3",
          from: "Priya Mehta",
          timestamp: "10:45 AM",
          body: "I would literally die for nova",
        },
        {
          id: "bb_day2_4",
          from: "Olive Borden",
          timestamp: "10:46 AM",
          body: "alex please tell me you got her number. or her owner's number. either works",
        },
        {
          id: "bb_day2_5",
          from: "Alex Rivera",
          timestamp: "10:47 AM",
          body: "I took like 40 photos. she kept doing the head tilt thing",
        },
        {
          id: "bb_day2_6",
          from: "Dev Nakamura",
          timestamp: "10:48 AM",
          body: "the head tilt is a biological weapon and I will not be taking questions",
        },
      ],
      trigger: { type: "after_story_flag", flag: "day1_shutdown" },
      replyOptions: [
        {
          label: "she's adorable",
          messageBody: "ok wow she really does look like my dog. that's adorable",
        },
        {
          label: "demand more photos",
          messageBody: "40 photos is not enough. I need a minimum of 200",
        },
        {
          label: "set up a playdate",
          messageBody: "we need to set up a playdate immediately. this is non-negotiable",
        },
      ],
    },
  ];
}
