# Deploying IBB Arena

Everything deploys from this repo to the arena server over SSH. Code is edited here, never
directly on the box.

## TL;DR

```bash
./deploy.sh
```

From Git Bash in the repo root. It:

1. Uploads `server.js`, `kids.js`, `kids-questions.js` and syntax-checks them **on the box**
   with `node --check`, aborting before the restart if anything is broken.
2. Uploads `site/public/kids/*` to `C:\inetpub\IBBArena\public\kids\`.
3. Restarts the **`nodejsserver.exe`** Windows service.
4. Hits `/health`, `/api/kids/state` and `/kids/team.html` to prove it came back.

It does **not** upload `pins.json`, `kids-config.json` or `kids-state.json`; those live
only on the box. It does not touch the original `Arena_*.html` / `index.html` pages either.
Copy those by hand with `scp` if you change them.

A restart always comes back **DISARMED**, so deploying mid-event is safe, but the referee
will have to re-arm.

## Server layout

```
C:\inetpub\IBBArena\
├── public\                 IIS docroot (site "IBB Arena", *:80)
│   ├── index.html, Arena_*.html, assets\
│   └── kids\               Earn to Fire pages
└── server\
    ├── server.js, kids.js, kids-questions.js, package.json, node_modules\
    ├── pins.json           operator PINs           (box only, gitignored)
    ├── kids-config.json    referee PIN, auto-made  (box only, gitignored)
    ├── kids-state.json     scores / names          (box only, gitignored)
    └── daemon\             node-windows wrapper + logs
```

## First-time access setup (new machine)

The box runs **Win32-OpenSSH 9.5** with key-only login to the Administrator account.

1. Make a key: `ssh-keygen -t ed25519 -f ~/.ssh/arena_ibb -N ""`
2. On the server, in an admin PowerShell, append the `.pub` line to
   `C:\ProgramData\ssh\administrators_authorized_keys`, then lock that file down. sshd
   silently ignores it if anyone else can read it:
   ```powershell
   icacls C:\ProgramData\ssh\administrators_authorized_keys /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F"
   ```
3. Add to `~/.ssh/config`:
   ```
   Host arena
       HostName 192.168.0.102
       User Administrator          # or DOMAIN\Administrator on a domain-joined box
       IdentityFile ~/.ssh/arena_ibb
       IdentitiesOnly yes
   ```
4. Test: `ssh arena hostname` → `Arena-Server`.

### Installing OpenSSH on a fresh 2012 R2 box
2012 R2 has no built-in OpenSSH and ships PowerShell 4 (no `Expand-Archive`). In an admin
PowerShell:

```powershell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$zip = "$env:TEMP\OpenSSH-Win64.zip"
(New-Object Net.WebClient).DownloadFile("https://github.com/PowerShell/Win32-OpenSSH/releases/download/v9.5.0.0p1-Beta/OpenSSH-Win64.zip", $zip)
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::ExtractToDirectory($zip, "C:\Program Files")
Rename-Item "C:\Program Files\OpenSSH-Win64" "OpenSSH"
& "C:\Program Files\OpenSSH\install-sshd.ps1"
Set-Service sshd -StartupType Automatic; Start-Service sshd
netsh advfirewall firewall add rule name="OpenSSH 22" dir=in action=allow protocol=TCP localport=22
```

The "post-quantum key exchange" warning on connect is cosmetic. 9.5 predates it.

### Gotchas over SSH
- The remote shell is **cmd.exe**. Nested PowerShell quoting through `ssh` gets mangled; for
  anything non-trivial, `scp` a `.ps1` over and run it with
  `powershell -NoProfile -ExecutionPolicy Bypass -File x.ps1`, then delete it.
- There is no `curl.exe` on 2012 R2. Use `Invoke-WebRequest` from PowerShell.

## Secrets on the box

| File | Holds | Made by |
|---|---|---|
| `server\pins.json` | operator PINs → role pages | hand; template `pins.example.json`. Missing = PIN login disabled (logged at start-up) |
| `server\kids-config.json` | referee PIN for `/kids/admin.html` | generated on first start, 6 random digits |

To read the referee PIN: `ssh arena type C:\inetpub\IBBArena\server\kids-config.json`.
To change it, edit the file and restart the service.

## Service management

```bash
ssh arena "powershell -NoProfile -Command Restart-Service nodejsserver.exe"
ssh arena "powershell -NoProfile -Command Get-Service nodejsserver.exe"
```

Logs live in `C:\inetpub\IBBArena\server\daemon\`: `nodejsserver.out.log` (stdout, every
request plus `KIDS:` game events) and `nodejsserver.err.log`. node-windows gives up after
**3 restarts**, so a crash loop leaves the service stopped. Check `.err.log` first.

```bash
ssh arena "powershell -NoProfile -Command Get-Content C:\inetpub\IBBArena\server\daemon\nodejsserver.out.log -Tail 40"
```

## Rollback

There are no versions on the box, only what was last copied. To roll back:

```bash
git checkout <good-commit> -- site/server site/public/kids
./deploy.sh
git checkout HEAD -- site/server site/public/kids
```

## Pre-event checklist

1. `./deploy.sh` → all three health checks answer.
2. Referee page → log in → **SAFE** showing, Game ON.
3. Team page on each iPad → both say **PRACTICE MODE**.
4. Answer one question per weapon in practice mode: scores move, nothing on the arena does.
5. Clear the arena of people. **ARM.** Fire each weapon once from the referee page and
   watch it stop by itself.
6. **ALL STOP** → everything stops, button returns to SAFE.
7. Round clock: set the length, START → both iPads count down; STOP freezes them.
8. *New round (everything)* to zero the scores and reset the clock before the kids start.

## Testing without hardware

Run the server locally against a fake Pi. Nothing real can move:

```bash
cd site/server && npm install
node -e "require('http').createServer((q,r)=>{console.log('PI',q.url);r.end('ok')}).listen(8765)" &
PI_BASE=http://127.0.0.1:8765 node server.js
```

Serve the pages with `python -m http.server 8081` from `site/public` and open
`http://localhost:8081/kids/`. The pages find the API on `:3000` of the same host.
