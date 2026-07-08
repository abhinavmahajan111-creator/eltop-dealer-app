# Eltop Dealer App — Auto-Backup Setup

Yeh 2 files hain:

- **quick-push.bat** → Jab manually push karna ho, double-click karo. Yeh commit message poochega.
- **auto-push.bat** → Windows Task Scheduler ke saath use karo. Yeh khud-ba-khud, bina kisi input ke, silently commit + push karti hai (agar kuch change hua ho toh).

---

## STEP 1 — Files sahi jagah rakho

Dono `.bat` files copy karke us folder mein daalo jahan `.git` folder hai — yani:

```
Downloads\ELTOP DEALER APP\eltop-dealer-app\
```

(Isi folder mein `package.json`, `src`, `.git` waghera hain.)

---

## STEP 2 — Quick-push test karo (manual)

`quick-push.bat` pe double-click karo. Ek black window khulegi, commit message poochegi, type karke Enter dabao. Yeh khud add + commit + push kar degi.

---

## STEP 3 — Fully Automatic Setup (Windows Task Scheduler)

Isse **din mein khud-ba-khud** (bina kisi ko yaad rakhne ki zaroorat) backup ho jayega.

1. Windows search mein type karo **"Task Scheduler"** aur kholo
2. Right side mein **"Create Basic Task..."** pe click karo
3. Naam do: `Eltop Auto Backup` → Next
4. Trigger: **Daily** select karo → Next
5. Time set karo — suggest: **raat 11:00 PM** (jab din ka kaam khatam ho chuka ho) → Next
6. Action: **"Start a program"** select karo → Next
7. **"Browse"** pe click karo, jaake `auto-push.bat` file select karo (wahi jo `eltop-dealer-app` folder mein rakhi hai) → Next
8. **Finish** pe click karo

Ab yeh roz raat 11 baje khud-ba-khud check karegi ki kuch naya kaam hua hai ya nahi — agar hua hai toh silently GitHub pe push kar degi. Kuch bhi popup nahi aayega, background mein chalega.

### Agar din mein multiple baar chalwana ho (zyada safety):
Step 5 mein "Daily" ki jagah, task banane ke baad:
- Task Scheduler Library mein `Eltop Auto Backup` pe right-click → **Properties**
- **Triggers** tab → **Edit**
- **"Repeat task every"** checkbox on karo → **1 hour** select karo, duration **"Indefinitely"**

Isse har ghante check hoga (sirf tab push karega jab kuch actually badla ho).

---

## STEP 4 — Verify karo yeh kaam kar raha hai

`eltop-dealer-app` folder ke andar ek **`auto-push-log.txt`** file ban jayegi jab pehli baar script chalegi. Usme dekh sakte ho kab-kab push hua ya "no changes" tha.

---

## Important Notes

- Laptop **on hona chahiye** us time pe jab scheduled task chalna ho (agar laptop band hai ya sleep mein hai, toh woh time skip ho jayega — agla scheduled run pe cover ho jayega)
- Internet connection zaroori hai push ke liye
- Agar kabhi bada file (video/image) push karte waqt network error aaye, log file mein error dikhega — us case mein manually `quick-push.bat` chala ke dobara try kar sakte ho
- Yeh sirf **is ek folder** (`eltop-dealer-app`) ko backup karta hai — agar koi doosra project folder hai, uske liye alag se setup karna hoga
