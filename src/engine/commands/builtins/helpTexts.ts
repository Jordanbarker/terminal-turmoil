export const HELP_TEXTS: Record<string, string> = {
  pwd: [
    "Usage: pwd",
    "",
    "Print the full filename of the current working directory.",
  ].join("\n"),

  cd: [
    "Usage: cd [DIRECTORY]",
    "",
    "Change the current directory to DIRECTORY.",
    "If no DIRECTORY is given, change to the home directory (~).",
    "",
    "  cd ..         Go up one level",
    "  cd ~          Go to home directory",
    "  cd /path      Go to absolute path",
  ].join("\n"),

  ls: [
    "Usage: ls [OPTION]... [FILE]...",
    "",
    "List directory contents.",
    "",
    "  -a, --all     do not ignore entries starting with .",
    "  -l            use a long listing format",
  ].join("\n"),

  cat: [
    "Usage: cat [FILE]...",
    "",
    "Concatenate FILE(s) and print to standard output.",
    "With no FILE, or when FILE is missing, display an error.",
  ].join("\n"),

  clear: [
    "Usage: clear",
    "",
    "Clear the terminal screen.",
  ].join("\n"),

  nano: [
    "Usage: nano [FILE]",
    "",
    "Open FILE in the nano text editor.",
    "If FILE does not exist, create a new file.",
    "",
    "  Ctrl+S   Save the file",
    "  Ctrl+X   Exit the editor",
  ].join("\n"),

  mail: [
    "Usage: mail [MESSAGE_NUMBER]",
    "       mail -s SUBJECT RECIPIENT",
    "",
    "Read and send email.",
    "",
    "  mail              Show inbox listing",
    "  mail N            Read message number N",
    "  mail -s SUB TO    Send a message with subject SUB to recipient TO",
  ].join("\n"),

  python: [
    "Usage: python [FILE] [-c CODE]",
    "",
    "Run the Python interpreter.",
    "",
    "  python              Start interactive REPL",
    "  python script.py    Run a Python script",
    "  python -c 'code'    Execute Python code inline",
  ].join("\n"),

  snowsql: [
    "Usage: snowsql [-q QUERY]",
    "",
    "Snowflake SQL client — query the NexaCorp data warehouse.",
    "",
    "  snowsql             Start interactive SQL REPL",
    "  snowsql -q 'SQL'    Execute a single query inline",
  ].join("\n"),

  dbt: [
    "Usage: dbt COMMAND [OPTIONS]",
    "",
    "dbt (data build tool) — transform data in the warehouse.",
    "",
    "  dbt run              Run all models",
    "  dbt test             Run data tests",
    "  dbt build            Run models then tests",
    "  dbt ls               List resources",
    "  dbt debug            Show connection info",
    "  dbt compile          Show compiled SQL",
    "  dbt show             Preview model output",
    "  dbt --version        Show dbt version",
  ].join("\n"),

  grep: [
    "Usage: grep [OPTIONS] PATTERN [FILE...]",
    "",
    "Search for PATTERN in each FILE.",
    "",
    "  -r, -R        search recursively",
    "  -i            ignore case distinctions",
    "  -n            print line numbers",
    "  -l            print only filenames with matches",
    "  -c            print only a count of matching lines",
    "  -v            invert match (select non-matching lines)",
  ].join("\n"),

  find: [
    "Usage: find [PATH] [EXPRESSIONS]",
    "",
    "Search for files in a directory hierarchy.",
    "",
    "  -name PATTERN   match filename (supports * and ? globs)",
    "  -type f|d       match file type (f=file, d=directory)",
  ].join("\n"),

  head: [
    "Usage: head [-n LINES] [FILE...]",
    "",
    "Display the first 10 lines of each FILE.",
    "",
    "  -n NUM   output the first NUM lines",
  ].join("\n"),

  tail: [
    "Usage: tail [-n LINES] [FILE...]",
    "",
    "Display the last 10 lines of each FILE.",
    "",
    "  -n NUM   output the last NUM lines",
  ].join("\n"),

  diff: [
    "Usage: diff FILE1 FILE2",
    "",
    "Compare two files line by line.",
    "Lines only in FILE1 are shown with - (red).",
    "Lines only in FILE2 are shown with + (green).",
  ].join("\n"),

  wc: [
    "Usage: wc [-l] [-w] [-c] [FILE...]",
    "",
    "Print line, word, and byte counts for each FILE.",
    "",
    "  -l   print the line count",
    "  -w   print the word count",
    "  -c   print the character count",
  ].join("\n"),

  echo: [
    "Usage: echo [-n] [TEXT...]",
    "",
    "Print TEXT to standard output.",
    "",
    "  -n   do not output trailing newline",
  ].join("\n"),

  chmod: [
    "Usage: chmod MODE FILE",
    "",
    "Change file permissions using numeric mode (e.g. 644, 755).",
  ].join("\n"),

  mkdir: [
    "Usage: mkdir [-p] DIRECTORY...",
    "",
    "Create directories.",
    "",
    "  -p   create parent directories as needed",
  ].join("\n"),

  rm: [
    "Usage: rm [-r] FILE...",
    "",
    "Remove files or directories.",
    "",
    "  -r, -R   remove directories and their contents recursively",
  ].join("\n"),

  mv: [
    "Usage: mv SOURCE DEST",
    "",
    "Move (rename) files.",
  ].join("\n"),

  cp: [
    "Usage: cp SOURCE DEST",
    "",
    "Copy files.",
  ].join("\n"),

  touch: [
    "Usage: touch FILE...",
    "",
    "Create empty files or update timestamps.",
  ].join("\n"),

  history: [
    "Usage: history",
    "",
    "Display command history.",
  ].join("\n"),

  whoami: [
    "Usage: whoami",
    "",
    "Print the current username.",
  ].join("\n"),

  hostname: [
    "Usage: hostname",
    "",
    "Print the system hostname.",
  ].join("\n"),

  uname: [
    "Usage: uname [-a]",
    "",
    "Print system information.",
    "",
    "  -a   print all information",
  ].join("\n"),

  file: [
    "Usage: file FILE...",
    "",
    "Determine file type.",
  ].join("\n"),

  pdftotext: [
    "Usage: pdftotext FILE",
    "",
    "Extract text content from a PDF file.",
  ].join("\n"),

  tree: [
    "Usage: tree [DIRECTORY]",
    "",
    "Display directory tree structure.",
  ].join("\n"),

  sort: [
    "Usage: sort [-r] [-n] [FILE]",
    "",
    "Sort lines of text.",
    "",
    "  -r   reverse the result of comparisons",
    "  -n   compare according to string numerical value",
  ].join("\n"),

  uniq: [
    "Usage: uniq [-c] [-d] [FILE]",
    "",
    "Filter adjacent duplicate lines.",
    "",
    "  -c   prefix lines by the number of occurrences",
    "  -d   only print duplicate lines",
  ].join("\n"),

  date: [
    "Usage: date",
    "",
    "Display the current date and time.",
  ].join("\n"),

  which: [
    "Usage: which COMMAND",
    "",
    "Show the full path of a command.",
  ].join("\n"),

  man: [
    "Usage: man COMMAND",
    "",
    "Display manual page for COMMAND.",
  ].join("\n"),
};
