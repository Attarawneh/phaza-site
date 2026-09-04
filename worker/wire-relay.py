#!/usr/bin/env python3
"""Wire the Phaza Connect relay into the portal nginx vhost.

Idempotent: adds a single `include snippets/phaza-connect.conf;` line just
inside the portal server{} block (before its first `location /`), backs up
the original, tests the config, and reloads nginx only if the test passes.
Rolls back automatically if the test fails.
"""
import shutil, subprocess, sys, time

VHOST = "/etc/nginx/sites-enabled/portal.phaza.ai"
INCLUDE = "\tinclude snippets/phaza-connect.conf;\n"
ANCHOR = "\tlocation /\n"

src = open(VHOST).read()

if "phaza-connect.conf" in src:
    print("include already present")
else:
    idx = src.find(ANCHOR)
    if idx == -1:
        print("ERROR: anchor 'location /' not found", file=sys.stderr)
        sys.exit(1)
    backup = f"/root/portal.phaza.ai.bak.{int(time.time())}"
    shutil.copy(VHOST, backup)
    new = src[:idx] + INCLUDE + "\n" + src[idx:]
    open(VHOST, "w").write(new)
    print(f"include added (backup: {backup})")

    test = subprocess.run(["nginx", "-t"], capture_output=True, text=True)
    print(test.stderr.strip())
    if test.returncode != 0:
        shutil.copy(backup, VHOST)
        print("nginx test FAILED — rolled back, nothing changed")
        sys.exit(1)

reload = subprocess.run(["systemctl", "reload", "nginx"], capture_output=True, text=True)
print("nginx reloaded" if reload.returncode == 0 else "reload error: " + reload.stderr)
