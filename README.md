# AI Styling Assistant Prototype for Customer-Facing Shopping Apps

A Firebase-backed React prototype that demonstrates a customer-facing retail styling assistant. Shoppers can sign in with Google, ask for styling help, receive coordinated outfit recommendations, save outfits, upload wardrobe inspiration images, and sync a demo product catalog to Firestore.

## Features

- Google sign in with Firebase Authentication
- Firestore product catalog, saved outfits, user profiles, and style session history
- Firebase Storage uploads for customer wardrobe or inspiration images
- Structured prompt generation from shopper queries
- Lightweight embedding-style retrieval and product ranking in the browser
- Coordinated outfit builder with budget, color, category, occasion, climate, and size signals
- Interactive shopper cart with quantity controls and cart-to-saved-outfit flow
- Theme selector with `✨ Default`, `☀️ Light`, and `🌙 Dark` modes
- Responsive retail UI built with React, TypeScript, Vite, and Lucide icons

## Tech Stack

- React 19
- TypeScript
- Vite
- Firebase Auth, Firestore, Storage, Analytics
- Lucide React

## Run Locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env` from `.env.example` and add your Firebase web app values.

3. Start the app:

   ```bash
   npm run dev
   ```

4. Open the local URL printed by Vite.

## Firebase Setup

The Firebase project is configured for:

- Project ID: `customer-facing-shopping-apps`
- Hosting output: `dist`
- Firestore rules: `firestore.rules`
- Storage rules: `storage.rules`

Deploy rules and hosting with:

```bash
firebase deploy
```

## App Flow

1. Sign in with Google.
2. Click **Sync catalog** to write the sample retail catalog into Firestore.
3. Ask the stylist for a look, such as `Build a polished work outfit under $300`.
4. Review the ranked products and structured prompt.
5. Save outfits to Firestore.
6. Upload wardrobe inspiration images to Firebase Storage.
7. Add recommended or catalog products to the cart, refine the cart with AI, and save the cart as an outfit.

## Live Website

Firebase Hosting URL:

```text
https://customer-facing-shopping-apps.web.app
```

## Repository

Public GitHub repository name:

```text
ai-styling-assistant-prototype-for-customer-facing-shopping-apps
```
