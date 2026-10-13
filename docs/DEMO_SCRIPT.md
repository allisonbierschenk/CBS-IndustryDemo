# Demo script — "Share Live Proof of Value with Your Clients" (5–7 min)

**Setup**

1. Run `npm run dev` (the browser opens automatically) and click **Northstar Enterprises**. The sign-in screen shows the JWT being minted: `sub` = the user's email, plus `client name`.
2. Press **⌥P** (or click *Switch user*) to open demo controls. You'll find the talk track per customer, the user switcher (**⌥1–⌥5**), and **Under the hood**, which shows the live JWT claims.

| # | Persona | Do | Say |
|---|---|---|---|
| 1 | Northstar (⌥1) | Value Intelligence dashboard → **Value Realization by Engagement** | Operational Transformation has collapsed to ~8% while Technology Modernization holds near 88%. **"Give clients transparent, ongoing visibility into the business value you're delivering."** Note the locked Premium benchmarks: an upgrade opportunity. |
| 2 | Vantage (⌥4) | Show the JWT in the console or **Under the hood** → jwt.io: new `sub`, `client name = Vantage Group`. Every engagement is improving | **"Securely personalize analytics for every customer and monetize advanced insights."** |
| 3 | Vantage | Select **Supply Chain Optimization** in the dashboard → *Explore Transportation Optimization & Savings* (or the yellow card) | Realized savings rising, freight cost falling. **"Connect strategic consulting outcomes to measurable operational results."** |
| 4 | Vantage | Drill from **Invoice Status Breakdown** into the invoice and shipment details | **"Let clients move from high-level insights to the actual transactions behind them."** |
| 5 | Meridian (⌥3) | **Engagement Health by Initiative**: ERP Implementation | **"Help clients identify issues before they undermine expected business outcomes."** |
| 6 | Close | Crestline (⌥2) shows Premium benchmarks; Standard clients see the upgrade card | **"Turn services delivered into value demonstrated."** |

**Optional: Helix (⌥5).** Four months of history, with an early-stage banner. Pulse shows no prior-year comparison because none exists, and nothing is invented.

**Proof points if asked**

- Try opening `/transportation` as anyone but Vantage. The portal refuses it, the API returns 403 with no URL and no token, and Tableau permissions would refuse it too.
- The JWT is signed server-side. The secret never reaches the browser.
- Row filtering happens inside Tableau. The portal never passes a client filter.
