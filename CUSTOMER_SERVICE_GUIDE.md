# Customer Service Guide — Affiliate, Media & Contact

Plain-English reference for answering questions from customers. It explains what
each section actually does behind the scenes, so you can tell a customer the real
reason rather than guessing.

Everything here reflects how the code behaves today. Where a behaviour is a
deliberate safety decision, it is called out — do not "fix" it by explaining it
away.

---

## 1. Affiliate Programme

### The three things a customer will ask about

| They ask | Short answer |
|---|---|
| "How do I join?" | **You add them.** There is no public signup form — you create the affiliate from the admin side. |
| "How much do I earn?" | Whatever the active commission rule says: a percentage or a flat amount, with a minimum order and a cap. |
| "When do I get paid?" | **Manually, by you, after the order is Delivered.** There is no automatic payout. |

### How someone becomes an affiliate

Only an admin can create one (`/dashboard/affiliates`). Every other route on that
admin router requires an admin login. If a customer asks to "sign up", that is
not something they can do themselves — take their name, phone and email, add them,
then issue their portal login.

When you add them, the system issues a **referral code** that looks like:

```
ASL-4818A5
```

`ASL-` followed by 3–8 letters and digits. It is case-insensitive — `asl-4818a5`,
`ASL4818A5` and `asl_4818a5` all work.

### How the referral link works

Each affiliate gets a link like:

```
https://www.asellaorganic.com/?ref=ASL-4818A5
```

When someone opens it:

1. The code is saved in that visitor's browser.
2. A click is recorded, so you can see how many people actually opened the link.
3. The code is **pre-filled** into the "Referral Code (Optional)" box on the order
   form.

The customer can also **type the code by hand** into that box — the link is a
convenience, not a requirement.

### The rule that surprises people: first touch only

> A customer belongs to **whichever affiliate claimed them first, permanently.**

The code is only applied to a customer who is not yet attributed to anyone. Once a
customer has been attributed, later codes are silently ignored — the original
affiliate keeps the credit no matter who they hear from afterwards.

**What to say when someone complains:** *"Once a customer has been linked to an
affiliate, that link stays in place — otherwise sales could be reassigned after the
fact and nobody's totals would be trustworthy. If they were first brought in by
someone else, that commission belongs to them."*

### When a commission is actually created

**Only when the order status changes to `Delivered`.**

Not when the order is placed. Not when it ships. Not when it is paid for.

- A cancelled order **never** earns commission.
- Re-saving the same status does **not** create a second commission.
- Each order can only ever produce one commission.

This is deliberate. Crediting on delivery means a cancelled or returned order never
enters the ledger at all.

### How the amount is worked out

The system picks a rule in this order:

1. **Individual rule** — used only if this specific affiliate has been set to a
   custom rate *and* that rule is switched on.
2. **Global rule** — the standard rate for everyone.

If an affiliate is set to a custom rate but their rule is switched off, they fall
back to the global rate rather than silently earning nothing.

Then:

- **Minimum order** — below it, commission is zero.
- **Percentage or fixed** — either a share of the order, or a flat amount.
- **Cap** — a maximum per order. The cap applies to flat amounts too, not just
  percentages.
- **Never more than the order total** — commission can never exceed what the
  customer actually paid.

### The three commission statuses

| Status | Meaning |
|---|---|
| `pending` | Earned and valid, **not paid out yet**. This is the normal state. |
| `paid` | You have marked it paid. An expense record is booked at the same time. |
| `reversed` | Taken back — typically because the order was cancelled or returned. |

### Payouts are manual

You mark a commission paid yourself. There is no schedule, no batch run, no
automatic transfer. Marking paid:

- **refuses** if the commission is already paid or reversed
- **refuses** if the underlying order is no longer `Delivered`
- books a matching expense in the same transaction, so the money leaving is always
  recorded

### Clawback

If an order is cancelled *after* the commission was already paid, the amount is
clawed back and **netted off the affiliate's next payout** automatically.

**What to say:** *"You were paid for that order, but it was later cancelled, so the
amount is being held back and will come off your next payment. You are not being
charged for it twice."*

### Portal access

You issue the affiliate a login from the admin screen. The username is generated
from their referral code (`aff_asl4818a5`) and a **temporary password is shown
exactly once** — it is never displayed again and cannot be recovered.

They must change it on first login. If they lose it, you reset it; there is no
self-service reset.

---

## 2. Media Section

`/dashboard/media` — the **Media Library**. It controls the decorative images on the
public website.

### What is in it

19 slots, in two groups:

**Shop by Category** (8) — the category tiles on the home page

`Powders` · `Oils` · `Seeds` · `Supplements` · `Herbs & Spices` · `Essential Oils` ·
`Natural Beauty` · `Wellness`

**Daily Highlights** (11) — the carousel

`Moringa` · `Shilajit Gel` · `Ashwagandha Powder` · `Ashwagandha Tablet` ·
`Blackseed Oil` · `Chia Seed` · `Frankincense Oil` · `Hibiscus` · `Kerebe Oil` ·
`Kesil Powder` · `Turmeric`

### How it works

Every slot ships with a default image built into the site.

- **Upload** a replacement, or **paste a URL** — the site uses it from then on.
- **Delete / revert** — the slot snaps straight back to its original image.

Uploaded files are checked by their actual contents, not their filename, and must
be under **5 MB**. They are stored on Cloudinary, not on the server.

**Changes go live immediately. No redeploy is needed.** Swapping an image is a
seconds-long job.

### What is deliberately NOT here

> **The payment QR code and bank transfer details on receipts cannot be changed from
> this screen.**

This is intentional. Those are payment instructions, not marketing artwork — a
mistaken swap there would send customers' money to the wrong account. Changing them
requires a deliberate code change reviewed by a human.

If a customer asks to change the bank details or QR code, do not do it casually.
Treat it as a request to escalate.

### Community Videos — a different screen

Videos are **not** part of the Media Library. They live at `/dashboard/videos` and
appear publicly on `/community-videos`. The same add/delete rules apply: admin or
manager only.

---

## 3. Contact Section

The contact block at the bottom of the home page (`/#contact`).

### What is shown there

**Phone support**

| Line | Number |
|---|---|
| Amharic support | `+251 909 122 623` |
| Afaan Oromoo support | `+251 942 223 999` |

**Locations**

| Place | Address |
|---|---|
| Piazza store | Addis Ababa, Piazza Giorgis, Ethel Appartment |
| Main office | Jemo Mickael Woreda 03, Africa Building, Addis Ababa |

Both have a "Directions" link that opens Google Maps.

**Support email:** `support@asellaorganic.com`
**Appointment requests are delivered to:** `asellamoringa@gmail.com`

### The appointment form — read this carefully

The form asks for four things:

| Field | Required |
|---|---|
| Full name | yes |
| Phone number | yes |
| Preferred date | yes |
| Email | **optional** |

> ### ⚠️ Nothing from this form is saved in the database.
>
> There is **no appointments table**. The form does not create a record you can look
> up. It only sends a notification.

When someone submits:

1. An email goes to the business address.
2. If they left an email address, a confirmation goes back to them.
3. If email sending is unavailable or fails, it falls back to **Telegram**
   instead.

**This is the single most important thing to know on this screen.**

### What this means when a customer says "I submitted it and nobody called"

There is nothing to look up, because nothing was stored. Check your **email inbox**
(and Telegram) for the notification — that is the only trace it leaves.

The honest answer:

> *"Our website's appointment form sends us a notification but doesn't create a
> saved booking, so I can't pull up your request in a system. Could I take your
> number directly and sort it out with you now?"*

**Take the contact yourself.** Do not promise to look it up later — there will be
nothing to look up.

### Other things worth knowing

- **Only a date, not a time.** The customer picks a preferred *date*; the actual
  time is agreed when you call them back. If they ask for a specific slot, tell
  them you'll confirm the time when you reach them.
- **Submitting twice won't help.** The form is rate-limited to stop spam, so rapid
  repeat submissions can be silently rejected. A duplicate is more likely to make
  things worse, not better.
- **No email means no confirmation.** If they leave the email blank they get no
  confirmation message at all — only the notification to you. Worth mentioning so
  they aren't confused about silence.

---

## Quick answers

**"How do I become an affiliate?"**
We add people to the programme — there's no self sign-up. Send me your name, phone
and email and we'll set it up.

**"I shared my link but got no commission."**
Three checks: was the order **Delivered** (not just placed or shipped), did the
customer actually **use the link or type the code**, and had they already been
linked to another affiliate?

**"My commission is zero."**
The order was under the minimum, or the rule has a cap that was reached, or the
order hasn't been marked Delivered yet.

**"When do I get paid?"**
After the order is delivered, and when we mark it paid — we do that manually, it
isn't automatic.

**"My commission disappeared."**
The order was cancelled or returned, so it was reversed. If you were already paid,
it's held back against your next payment.

**"Someone used my code but I got nothing."**
They may have already been linked to another affiliate. First link wins.

**"I forgot my portal password."**
We'll reset it for you — passwords can't be recovered, only reset.

**"Can I change the picture on the home page?"**
Yes, that's exactly what the Media Library is for, and it goes live straight away.

**"The new image isn't showing."**
Usually a cached copy — a hard refresh (Ctrl+Shift+R) will clear it.

**"Can I change the payment QR / bank account?"**
Not from the media screen — that one's locked on purpose because it moves real
money. We'll handle it as a separate request.

**"I booked an appointment and nobody called."**
Our form doesn't store bookings, so I can't see it in a system — but I have your
number now and I'll call you myself.

**"Can I book a specific time?"**
The form only takes a date. Call us and we'll agree the exact time with you.