#!/bin/bash
# Doppelklick auf diese Datei startet die Menuiserie-Delley-App im Browser.
cd "$(dirname "$0")"
( sleep 1; open "http://localhost:5173" ) &
echo "Menuiserie Delley wird gestartet …"
echo "Dieses Fenster bitte offen lassen, solange du arbeitest."
echo "Zum Beenden: Strg+C drücken oder dieses Fenster schliessen."
echo ""
python3 server.py
