# Eltop Dealer App - Auto Backup Setup

Ye 3 files is folder mein hone chahiye:
`C:\Users\air\Downloads\ELTOP DEALER APP\eltop-dealer-app\`

1. `quick-push.bat`
2. `auto-push.bat`
3. `SETUP-INSTRUCTIONS.md` (ye file)

---

## STEP 1 — Manual Push (jab bhi turant push karna ho)

`quick-push.bat` par **double-click** karo. Ek black window khulegi, commit message
poochegi — type karke Enter dabao. Ye khud `git add` + `git commit` + `git push`
kar degi.

Push ke baad Vercel par deploy karne ke liye alag se ye command chalao:
```
npx vercel --prod
```

---

## STEP 2 — Fully Automatic Setup (Windows Task Scheduler)

Isse har ghante khud-ba-khud check hoga aur agar kuch naya kaam hua hai to
GitHub par push ho jayega — kisi ko kuch bhi yaad rakhne ki zaroorat nahi.

1. Windows search mein type karo **"Task Scheduler"** aur kholo
2. Right side mein **"Create Basic Task..."** par click karo
3. Naam do: `Eltop Auto Backup` → Next
4. Trigger: **Daily** select karo → Next
5. Time set karo — suggest: **raat 11:00 PM** → Next
6. Action: **"Start a program"** select karo → Next
7. **"Browse"** par click karo, `auto-push.bat` file select karo (isi folder
   se) → Next
8. **Finish** par click karo

### Har ghante chalwane ke liye (zyada safety):
Task banane ke baad:
- Task Scheduler Library mein `Eltop Auto Backup` par right-click →
  **Properties**
- **Triggers** tab → **Edit**
- **"Repeat task every"** checkbox on karo → **1 hour** select karo,
  duration **"Indefinitely"**

Ab har ghante check hoga (sirf tab push karega jab kuch actually badla ho).

---

## STEP 3 — Verify karo yeh kaam kar raha hai

Kuch der/kuch ghante baad, isi folder mein ek **`auto-push-log.txt`** file
ban jayegi. Usme dekh sakte ho kab-kab push hua ya "No changes - skipping"
tha.

Agar ye file kabhi nahi bani, iska matlab Task Scheduler task ya to bana
hi nahi, ya chala hi nahi — Task Scheduler mein wapas jaake check karo ki
task "Eltop Auto Backup" list mein dikh raha hai ya nahi.

---

## Important Notes

- Laptop **on hona chahiye** us time par jab scheduled task chalna ho
  (agar laptop band/sleep mein hai, to woh run skip ho jayega — agla
  scheduled run mein cover ho jayega)
- Internet connection zaroori hai push ke liye
- Ye sirf **is ek folder** (`eltop-dealer-app`) ko backup karta hai
- Ye sirf GitHub par code push karta hai — Supabase database ka alag se
  backup nahi karta (wo Supabase apne aap manage karta hai)
