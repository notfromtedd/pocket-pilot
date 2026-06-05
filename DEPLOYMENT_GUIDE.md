# Deployment Guide: Hosting on Vercel

## Prerequisites Checklist
- ✅ Supabase backend running with all tables
- ✅ API keys: Supabase, Anthropic, Google AI, Mapbox
- ✅ GitHub repository (or ready to create one)
- ✅ Vercel account (free tier available)

---

## Step 1: Prepare Your Repository

### 1.1 Initialize Git (if not already done)
```bash
cd drone-dispatch
git init
git add .
git commit -m "Initial commit: drone dispatch platform"
```

### 1.2 Push to GitHub
```bash
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/pocket-pilot.git
git push -u origin main
```

---

## Step 2: Create Vercel Project

### 2.1 Connect GitHub to Vercel
1. Go to [vercel.com](https://vercel.com)
2. Sign in with GitHub
3. Click **"Add New Project"**
4. Select the `pocket-pilot` repository
5. Vercel will auto-detect it as a Next.js project

### 2.2 Configure Project Settings
- **Root Directory**: `drone-dispatch` (since your Next.js app is in a subdirectory)
- **Framework**: Next.js (auto-detected)
- **Build Command**: `next build` (default)
- **Output Directory**: `.next` (default)
- **Install Command**: `npm install` (default)

---

## Step 3: Set Environment Variables in Vercel

### 3.1 Add Secrets
In Vercel dashboard, go to **Settings → Environment Variables** and add:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...

ANTHROPIC_API_KEY=sk-ant-v0-...
GOOGLE_AI_API_KEY=AIzaSy...

NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.eyJ1...

SMS_PROVIDER=mock
SMS_DEFAULT_COUNTRY_CODE=254

AI_PROVIDER=anthropic
```

**Important**: 
- Variables prefixed with `NEXT_PUBLIC_` are exposed to the browser (public keys only).
- Variables without prefix are server-side only (keep API keys here).
- Double-check your Supabase keys are correct.

---

## Step 4: Deploy

### 4.1 Automatic Deploy (Recommended)
Once environment variables are set:
1. Click **"Deploy"** button in Vercel dashboard
2. Vercel automatically runs `npm install` → `next build` → deployment
3. Your app is live at `https://your-project-name.vercel.app`

### 4.2 Monitor Build
- Watch the build logs in real-time
- Common issues:
  - Missing environment variables → build fails
  - TypeScript errors → build fails
  - API key typos → app crashes at runtime

---

## Step 5: Verify Deployment

### 5.1 Test the App
- Visit `https://your-project-name.vercel.app`
- Test product browsing
- Test emergency voice dispatch
- Test order placement
- Test realtime tracking (via Supabase)

### 5.2 Check Logs
In Vercel dashboard:
- **Build Logs**: Shows compilation errors
- **Function Logs**: Shows runtime errors in API routes
- **Browser Console**: Check client-side errors

---

## Step 6: Custom Domain (Optional)

### 6.1 Add Domain in Vercel
1. Go to **Settings → Domains**
2. Enter your custom domain (e.g., `dispatch.example.com`)
3. Follow DNS setup instructions (varies by registrar)

### 6.2 Verify SSL
Vercel auto-provisions SSL certificates. After DNS propagates (15-30 min), your custom domain is live with HTTPS.

---

## Continuous Deployment

### Auto-Deploy on Git Push
- Every push to `main` branch automatically triggers a new deployment
- Can configure branch-specific deployments (e.g., `staging` branch → preview environment)

### Environment-Specific Deploys
In Vercel **Settings → Git**:
- **Production branch**: `main` (auto-deploy)
- **Preview deployments**: All other branches (auto-deploy for testing)

---

## Troubleshooting

### Build Fails: "Module not found"
```
Error: Cannot find module '@anthropic-ai/sdk'
```
**Fix**: 
```bash
npm install
git commit -am "Reinstall deps"
git push
```

### Build Succeeds but App Crashes
Check **Function Logs** in Vercel dashboard. Common issues:
- Missing environment variable → add to Vercel Settings
- Supabase connection error → verify URL and keys
- API key invalid → regenerate in provider dashboard

### Real-time Updates Not Working (Supabase)
- Verify `NEXT_PUBLIC_SUPABASE_ANON_KEY` is correct
- Check Supabase realtime is enabled on your project
- Ensure Row Level Security (RLS) policies allow client subscriptions

### Map Not Loading (Mapbox)
- Verify `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` is correct
- Ensure token has "Maps" and "Tokens" scopes
- Check next.config.ts has correct `allowedDevOrigins`

---

## Performance & Monitoring

### Vercel Analytics
- Automatically enabled (shows Core Web Vitals)
- Monitor at **Deployments → Select deployment → Analytics**

### Supabase Monitoring
- Check Supabase dashboard for query performance
- Monitor API rate limits and costs

### Cost Estimation
- **Vercel**: Free tier covers most use cases; ~$20/mo for high-traffic
- **Supabase**: Free tier = 500MB DB; ~$25/mo for production
- **Anthropic API**: ~$0.003 per emergency request (varies)
- **Mapbox**: Free tier = 25k map loads/month

---

## Scaling Best Practices

### Database
- Supabase auto-scales on paid tiers
- Monitor `drone_telemetry` table for row growth (can add indexes)

### API Limits
- Anthropic: 50k requests/min on paid plan
- Mapbox: Upgrade to pro tier if exceeding free limits

### Edge Functions (Future)
- Vercel Edge Functions can process requests at CDN edge
- Use for low-latency drone telemetry updates

---

## Next Steps
1. Deploy to Vercel (follow Steps 1-4)
2. Test all features
3. Monitor logs and performance
4. Iterate based on real user feedback
5. Consider upgrading tiers as traffic grows
