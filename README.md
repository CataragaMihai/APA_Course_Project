# Intercept & Decode

A web app that breaks the Vigenère cipher three ways (brute force, a dictionary attack and frequency analysis) and lets you watch each attack work on the same intercepted message.

Course project for Algorithm Analysis and Design (APA), UTM, 2026. Team № 10: Mihai Cataraga, Ion Jora, Mihai Dobrioglo.

The WWII "intercepted transmission" look is only a theme. The cipher is a plain Vigenère, not Enigma.

## What's in here

- `backend/`: a FastAPI app. The cipher, the χ² scoring and the three attacks are written from scratch in `app/cipher.py`, `app/scoring.py` and `app/cracking/`, with no crypto libraries. Live progress goes to the browser over Server-Sent Events. There is no database: the 20 archive messages are pre-encrypted in `app/data/messages.json`, which `generate_data.py` creates.
- `frontend/`: React, TypeScript and Vite, with three.js for the typewriter. The interface is in Romanian, English and Russian.

## How the attacks work

- **Brute force** tries every key up to a length limit (4 letters by default, 475,254 keys) and keeps the one whose decryption looks most like English, meaning the lowest χ² score.
- **Dictionary attack** tries each word in `backend/app/data/wordlist.txt` as the key and scores it the same way.
- **Frequency analysis** finds the key length with Kasiski's method and the index of coincidence. Each column of letters is then a Caesar cipher, solved from English letter frequencies.

Text is uppercased and accents are dropped before encryption. Spaces pass through unchanged and don't use up a key letter, so the ciphertext keeps its word breaks.

## Run it locally

Backend, from `backend/`:

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Frontend, from `frontend/`, in a second terminal:

```bash
npm install
npm run dev
```

Then open http://localhost:5173. The dev server forwards `/api` to the backend on port 8000.

To check all three attacks against the true keys, run `python test_algorithms.py` from `backend/`.

## Deploy

`render.yaml` sets up both parts on Render: in the Render dashboard choose New, then Blueprint, and pick this repo. You get the API (`apa-course-project-api`) and the site (`apa-course-project`, a static site). If Render gives the API a different address, update `VITE_API_BASE` in `render.yaml`.

The free API goes to sleep after about 15 minutes without traffic, and the first request after that takes a while. Before a demo, run `scripts/warm.sh <api-url>` about ten minutes early to wake it up.
